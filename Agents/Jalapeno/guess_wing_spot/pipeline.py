from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from . import RENDER_VERSION
from .captions import caption
from .eligibility import eligible_photos
from .geography import discover
from .selection import select
from .review import apply_review
from .tracking import publication_slots, read_history, write_private


def generate(repository, *, mode, seed, output_root: Path, history_dir: Path,
             county_mapping=None, review_findings=None, ffmpeg="ffmpeg", ffprobe="ffprobe", logo_path=None):
    if mode not in {"plan", "preview"}:
        raise ValueError("Only plan and preview modes exist")
    started = datetime.now(timezone.utc).isoformat()
    reel_id = str(uuid4())
    snapshot = repository.load()
    photos, exclusions = eligible_photos(snapshot, repository.asset_available)
    photos, reviewed_exclusions = apply_review(photos, repository, review_findings)
    groups, geography_summary = discover(photos, county_mapping)
    chosen = select(groups, read_history(history_dir), seed)
    manifest = {"reel_id": reel_id, "run_time": started, "seed": seed, "render_version": RENDER_VERSION,
                "mode": mode, "generation_status": "planned" if chosen else "skipped_no_eligible_geography",
                "eligibility": {"inventory_photos": len(snapshot.photos), "eligible_photos": len(photos),
                                "formula": "likes/(likes+dislikes)>0.5; likes+dislikes>0; neutrals excluded",
                                "authoritative_source": "wing_jury_photo_vote_counts (Jury aggregates only)",
                                "exclusions": exclusions, "visual_review_exclusions": reviewed_exclusions, **geography_summary},
                "warnings": ["Visual review REQUIRED before any future publication: automated signage, watermark, packaging and attribution clue detection is incomplete.",
                             "This private manifest and private-work contain restaurant answers. Never upload them as public assets.",
                             "Local generation history is not publication history; no publishing implementation exists."],
                "publication_review_required": True,
                "visual_review": {"status": "required", "automated_name_leak_check": "incomplete"},
                "publication": publication_slots(reel_id), "sources": [], "outputs": {}}
    output = output_root / reel_id
    output.mkdir(parents=True, exist_ok=False)
    if not chosen:
        manifest["skip_reason"] = "No verified geography contains three eligible distinct physical locations"
        write_private(output / "manifest.private.json", manifest)
        return manifest, output
    group, selected, rationale = chosen
    manifest["geography"] = {**group.summary(), "state_code": group.state_code}
    manifest["selection"] = rationale
    hook, body = caption(group, selected)
    answers = [p.photo.destination["name"] for p in selected]
    # Fail closed if generated public copy contains an answer. Creator-clue
    # checks are conservative and do not replace human inspection.
    if any(a.casefold() in body.casefold() for a in answers):
        raise ValueError("Restaurant answer detected in public caption")
    for i, p in enumerate(selected, 1):
        if not p.evidence["town_verified"]:
            manifest["warnings"].append(f"Photo {i}: city/address town disagreement or missing label; used only at independently corroborated broader geography.")
        manifest["sources"].append({"number": i, "photo_id": p.photo.id, "destination_id": p.photo.destination["id"],
                                    "physical_location_id": p.physical_key, "restaurant_answer": p.photo.destination["name"],
                                    "geography_evidence": p.evidence, "votes": {"likes": p.photo.likes, "dislikes": p.photo.dislikes,
                                    "neutral_excluded": p.photo.neutral}, "credit": p.photo.credit, "approval": p.photo.approval})
    ids = [p.photo.id for p in selected]
    before = snapshot.source_digest(ids)
    inventory_ids = [p["id"] for p in snapshot.photos]
    inventory_before = snapshot.source_digest(inventory_ids)
    # Fresh full safety read and HEAD check immediately before any rendering.
    fresh = repository.load()
    current, _ = eligible_photos(fresh, lambda photo_id: photo_id not in ids or repository.asset_available(photo_id))
    current_by_id = {p.id: p for p in current}
    if any(p.photo.id not in current_by_id or current_by_id[p.photo.id] != p.photo for p in selected):
        raise ValueError("Selected source changed during revalidation; rerun discovery")
    fresh_groups, _ = discover(current, county_mapping)
    fresh_group = next((g for g in fresh_groups if g.key == group.key), None)
    if not fresh_group or not set(ids).issubset({p.photo.id for p in fresh_group.photos}):
        raise ValueError("Selected geography changed during revalidation")
    manifest["source_revalidation"] = {"before_render": "passed", "source_digest_before": before}
    if mode == "preview":
        # Renderer import is local; it has no network, upload, or publisher path.
        from .rendering import render
        data = [repository.photo_bytes(p.photo.id) for p in selected]
        for source, content in zip(manifest["sources"], data):
            source["processed_sha256"] = hashlib.sha256(content).hexdigest()
        result, warnings = render(data, selected, hook, output, logo_path, ffmpeg=ffmpeg, ffprobe=ffprobe)
        manifest["outputs"].update(result)
        manifest["warnings"].extend(warnings)
        manifest["generation_status"] = "preview_generated"
    public = output / "public"
    public.mkdir(exist_ok=True)
    caption_path = public / "caption.txt"
    caption_path.write_text(body + "\n", encoding="utf-8")
    manifest["outputs"]["caption"] = str(caption_path.resolve())
    final_snapshot = repository.load()
    after = final_snapshot.source_digest(ids)
    inventory_after = final_snapshot.source_digest([p["id"] for p in final_snapshot.photos])
    unchanged = before == after and inventory_before == inventory_after
    manifest["source_revalidation"].update(source_digest_after=after, source_records_unchanged=unchanged,
                                          all_photo_rows_digest_before=inventory_before, all_photo_rows_digest_after=inventory_after)
    if not unchanged:
        # Cannot distinguish concurrent external activity from a data problem;
        # do not claim a safely completed preview or add rotation exposure.
        manifest["generation_status"] = "source_changed_during_run"
        manifest["warnings"].append("Source rows changed externally during this run; do not use this output")
    manifest["read_requests"] = getattr(repository, "read_requests", None)
    write_private(output / "manifest.private.json", manifest)
    if manifest["generation_status"] == "preview_generated":
        write_private(history_dir / (reel_id + ".json"), manifest)
    return manifest, output
