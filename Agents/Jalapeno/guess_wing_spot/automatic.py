"""Automatic preparation/revalidation; durable answers never enter public files."""
import hashlib
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from . import RENDER_VERSION
from .captions import caption
from .eligibility import eligible_photos
from .geography import discover
from .meta_reels import MetaError
from .rendering import render, validate_video
from .review import apply_review
from .selection import select


def prepare(repository, ledger, screener, date, owner):
    snapshot = repository.load()
    photos, excluded = eligible_photos(snapshot, repository.asset_available)
    photos, reviewed = apply_review(photos, repository, ledger.get("reviews.json") or [])
    history = ledger.history()
    county_mapping = ledger.get("county-map.json") or []
    screening, content = {}, {}
    for attempt in range(12):
        groups, summary = discover(photos, county_mapping)
        choice = select(groups, history, date)
        if not choice:
            return {"date": date, "run_id": owner, "revision": 0, "status": "skipped_no_screened_trio",
                    "eligibility_exclusions": excluded, "screening_results": screening}
        group, selected, rationale = choice
        rejected = set()
        for source in selected:
            photo = source.photo
            data = content.setdefault(photo.id, repository.photo_bytes(photo.id))
            result = screener.inspect(photo, data)
            screening[photo.id] = result
            if result["decision"] != "passed":
                rejected.add(photo.id)
        if rejected:
            photos = [p for p in photos if p.id not in rejected]
            continue
        hook, body = caption(group, selected)
        if any(s.photo.destination["name"].casefold() in body.casefold() for s in selected):
            raise MetaError("answer_in_generated_caption")
        sources = [{"number": n, "photo_id": s.photo.id, "destination_id": s.photo.destination["id"],
                    "physical_location_id": s.physical_key, "restaurant_answer": s.photo.destination["name"],
                    "geography_evidence": s.evidence, "votes": {"likes": s.photo.likes, "dislikes": s.photo.dislikes, "neutral_excluded": s.photo.neutral},
                    "credit": s.photo.credit, "approval": s.photo.approval, "processed_sha256": screening[s.photo.id]["asset_sha256"],
                    "screening": screening[s.photo.id]} for n, s in enumerate(selected, 1)]
        return {"date": date, "run_id": owner, "revision": 0, "status": "planned", "reel_id": str(uuid4()),
                "run_time": datetime.now(timezone.utc).isoformat(), "seed": date, "render_version": RENDER_VERSION,
                "geography": {**group.summary(), "state_code": group.state_code}, "sources": sources,
                "selection": rationale, "eligibility": {"exclusions": excluded, "known_visual_exclusions": reviewed, **summary},
                "source_digest": snapshot.source_digest([s.photo.id for s in selected]), "county_mapping": county_mapping,
                "hook": hook, "caption": body, "screening_results": screening,
                "platforms": {p: {"status": "not_published", "attempts": 0, "pending": None} for p in ("instagram", "facebook")}}
    return {"date": date, "run_id": owner, "revision": 0, "status": "skipped_screening_retry_limit", "screening_results": screening}


def revalidate(repository, state, screener):
    ids = [s["photo_id"] for s in state["sources"]]
    snapshot = repository.load()
    if snapshot.source_digest(ids) != state["source_digest"]:
        raise MetaError("source_record_changed_since_selection")
    eligible, _ = eligible_photos(snapshot, lambda photo_id: photo_id not in ids or repository.asset_available(photo_id))
    by_id = {p.id: p for p in eligible}
    if not set(ids).issubset(by_id):
        raise MetaError("source_no_longer_eligible")
    if (screener.ledger.get("county-map.json") or []) != state.get("county_mapping", []):
        raise MetaError("verified_county_mapping_changed")
    groups, _ = discover([by_id[i] for i in ids], state.get("county_mapping"))
    group = next((g for g in groups if g.key == state["geography"]["key"]), None)
    if group is None:
        raise MetaError("geography_no_longer_verified")
    placed = {p.photo.id: p for p in group.photos}
    data = []
    for saved in state["sources"]:
        current = by_id[saved["photo_id"]]
        if ({"likes": current.likes, "dislikes": current.dislikes, "neutral_excluded": current.neutral} != saved["votes"]
                or current.credit != saved["credit"] or current.approval != saved["approval"]
                or placed[current.id].physical_key != saved["physical_location_id"]
                or placed[current.id].evidence != saved["geography_evidence"]):
            raise MetaError("source_votes_credit_approval_or_geography_changed")
        body = repository.photo_bytes(current.id)
        if hashlib.sha256(body).hexdigest() != saved["processed_sha256"]:
            raise MetaError("processed_asset_identity_changed")
        result = screener.inspect(current, body)
        if result["decision"] != "passed" or result["binding"] != saved["screening"]["binding"]:
            raise MetaError("screening_hash_or_version_changed")
        data.append(body)
    return [placed[i] for i in ids], data


def render_daily(repository, ledger, screener, state, workspace, logo):
    selected, data = revalidate(repository, state, screener)
    output = Path(workspace) / state["reel_id"]
    output.mkdir(parents=True, exist_ok=False)
    results, warnings = render(data, selected, state["hook"], output, Path(logo))
    body = Path(results["video"]).read_bytes()
    # The only remote media is the generated video. Never upload private-work,
    # captions with metadata, source photos, review frames or local manifests.
    key = "outputs/" + state["reel_id"] + ".mp4"
    if not ledger.create(key, body, mime="video/mp4"):
        existing = ledger.get_bytes(key)
        if hashlib.sha256(existing).hexdigest() != hashlib.sha256(body).hexdigest():
            raise MetaError("daily_generated_media_conflict")
    state.update(status="ready", video_sha256=hashlib.sha256(body).hexdigest(), media_verification=results["verification"], warnings=warnings)
    return body
