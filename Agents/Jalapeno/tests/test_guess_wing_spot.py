"""Focused, isolated generator contracts. No live fixtures or mutation RPCs."""
from __future__ import annotations

import copy
import io
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch
from uuid import UUID

import pytest
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from guess_wing_spot.captions import caption
from guess_wing_spot.eligibility import attribution, eligible_photos, verdict
from guess_wing_spot.geography import discover, locate
from guess_wing_spot.pipeline import generate
from guess_wing_spot.selection import select
from guess_wing_spot.sources import ReadOnlySources, Snapshot, SourceError, TABLES
from guess_wing_spot.tracking import publication_slots, read_history, write_private

NOW = datetime(2026, 10, 29, tzinfo=timezone.utc)


def uid(n):
    return str(UUID(int=n))


def snapshot(locations=3, *, city="Springfield", state="MA", first=1):
    states = {"1": {"state_id": 1, "state_code": state, "state_name": {"MA": "Massachusetts", "CA": "California", "CT": "Connecticut", "NY": "New York"}.get(state, state)}}
    photos, votes, destinations, users = [], {}, {}, {}
    for n in range(first, first + locations):
        pid, did, owner = uid(n), uid(n + 100), uid(n + 200)
        photos.append({"id": pid, "destination_id": did, "user_id": owner, "media_type": "photo", "status": "approved",
                       "owner_deleted_at": None, "withdrawn_at": None, "consent_version": "wing-shots-v1",
                       "consented_at": "2026-01-01T00:00:00+00:00", "attribution_preference": "anonymous",
                       "processed_storage_path": f"processed/{pid}/primary", "moderation_status": "overridden",
                       "wing_verification_status": "overridden", "rejected_at": None,
                       "approved_at": "2026-01-02T00:00:00+00:00", "approved_by": uid(999),
                       "featured_at": None, "duplicate_group": None, "updated_at": "2026-01-02T00:00:00+00:00"})
        votes[pid] = {"submission_id": pid, "like_count": 2, "dislike_count": 1, "neutral_count": 50}
        destinations[did] = {"id": did, "name": f"Restaurant Answer {n}", "address": f"{n} Main Street, {city}, {state} 01234",
                             "city": city, "state_id": 1, "lat": None, "lng": None}
        users[owner] = {"user_id": owner, "username": "creator", "display_name": "Creator Name", "social_opt_out": False,
                        "allow_social_tagging": False}
    return Snapshot(photos, votes, destinations, states, users, set())


class FakeRepository:
    def __init__(self, data):
        self.data = data
        self.loads = 0
        self.read_requests = 0
        self.downloads = []

    def load(self):
        self.loads += 1
        return copy.deepcopy(self.data)

    def asset_available(self, photo_id):
        return True

    def photo_bytes(self, photo_id):
        self.downloads.append(photo_id)
        image = Image.new("RGB", (1200, 1500), "orange")  # abstract test graphic, never a real-source preview
        data = io.BytesIO()
        image.save(data, format="JPEG")
        return data.getvalue()

    def __getattr__(self, name):
        if any(term in name for term in ("write", "update", "insert", "rpc", "claim", "publish", "upload", "settle", "cleanup")):
            pytest.fail(f"Forbidden source side effect: {name}")
        raise AttributeError(name)


def photos(data):
    return eligible_photos(data, lambda _: True, now=NOW)[0]


@pytest.mark.parametrize("likes,dislikes,neutral,qualifies", [
    (1, 1, 0, False), (501, 499, 0, True), (499, 501, 0, False),
    (0, 0, 0, False), (0, 0, 7, False), (1, 0, 999, True), (2, 1, 50, True),
])
def test_exact_vote_threshold_and_neutral_exclusion(likes, dislikes, neutral, qualifies):
    data = snapshot(1)
    data.votes[uid(1)].update(like_count=likes, dislike_count=dislikes, neutral_count=neutral)
    assert bool(photos(data)) is qualifies


@pytest.mark.parametrize("field,value,reason", [
    ("withdrawn_at", "2026-02-01T00:00:00Z", "withdrawn"),
    ("status", "rejected", "unsafe_lifecycle_status"), ("status", "failed", "unsafe_lifecycle_status"),
    ("approved_at", None, "verifiable_approval_required"), ("approved_by", None, "verifiable_approval_required"),
    ("approved_at", "2099-01-01T00:00:00Z", "verifiable_approval_required"),
    ("consent_version", " ", "valid_recorded_consent_required"), ("consented_at", None, "valid_recorded_consent_required"),
    ("consented_at", "2099-01-01T00:00:00Z", "valid_recorded_consent_required"),
    ("owner_deleted_at", "2026-02-01T00:00:00Z", "owner_missing_or_deleted"),
    ("user_id", None, "owner_missing_or_deleted"), ("moderation_status", "pending", "moderation_not_acceptable"),
    ("wing_verification_status", "not_wings", "wing_verification_not_acceptable"),
    ("processed_storage_path", "original/private", "canonical_processed_asset_required"),
    ("attribution_preference", "unknown", "unsupported_attribution"),
    ("rejected_at", "2026-01-03T00:00:00Z", "unsafe_lifecycle_status"),
])
def test_safety_protections(field, value, reason):
    data = snapshot(1)
    data.photos[0][field] = value
    _, exclusions = eligible_photos(data, lambda _: True, now=NOW)
    assert exclusions[reason] == 1


def test_missing_votes_owner_abuse_and_unavailable_asset():
    data = snapshot(1)
    assert not eligible_photos(data, lambda _: False, now=NOW)[0]
    data.unsafe.add(uid(1))
    assert not photos(data)
    data.unsafe.clear()
    data.users.clear()
    assert not photos(data)
    data = snapshot(1)
    data.votes.clear()
    assert not photos(data)


@pytest.mark.parametrize("status", ["approved", "posted", "posting", "scheduled", "generation_pending", "ready_to_post"])
def test_prior_publication_and_duplicate_classification_are_not_exclusions(status):
    data = snapshot(1)
    data.photos[0].update(status=status, featured_at="2026-03-01T00:00:00Z", duplicate_group=uid(555))
    assert len(photos(data)) == 1
    data.photos[0]["approved_at"] = None
    assert not photos(data)


def test_authoritative_counts_only_not_restaurant_or_submission_counts():
    data = snapshot(1)
    data.photos[0].update(like_count=1_000_000, dislike_count=0)
    data.votes[uid(1)].update(like_count=1, dislike_count=1)
    assert not photos(data)
    assert "wing_media_photo_votes" not in TABLES
    assert "wing_jury_votes" not in TABLES  # use canonical aggregate once


def test_votes_are_per_photo_not_combined_by_restaurant():
    data = snapshot(2)
    data.photos[1]["destination_id"] = data.photos[0]["destination_id"]
    data.votes[uid(1)].update(like_count=100, dislike_count=0)
    data.votes[uid(2)].update(like_count=1, dislike_count=2)
    assert [p.id for p in photos(data)] == [uid(1)]


def test_three_distinct_physical_locations_and_chain_branches():
    data = snapshot(3)
    for d in data.destinations.values():
        d["name"] = "Same Chain"
    assert len(discover(photos(data))[0]) == 2
    data.destinations[uid(103)]["address"] = "1 Main St., Springfield, MA 01234"
    assert not discover(photos(data))[0]  # destination IDs are different; address is same


def merge(a, b):
    # Use a new state relation ID, retaining separate town keys.
    b = copy.deepcopy(b)
    for d in b.destinations.values():
        d["state_id"] = 2
    b.states = {"2": {**b.states["1"], "state_id": 2}}
    return Snapshot(a.photos + b.photos, a.votes | b.votes, a.destinations | b.destinations,
                    a.states | b.states, a.users | b.users, a.unsafe | b.unsafe)


def test_dynamic_california_discovery_and_same_town_in_two_states():
    before = snapshot(3)
    old = {g.key for g in discover(photos(before))[0]}
    after = merge(before, snapshot(3, state="CA", first=10))
    keys = {g.key for g in discover(photos(after))[0]}
    assert "town:CA:springfield" in keys - old
    assert "town:MA:springfield" in keys
    assert len(keys) == 4


def test_city_normalization_conflict_and_state_conflict():
    data = snapshot(3)
    for d in data.destinations.values():
        d["city"] = "Springfield, MA"
    assert "town:MA:springfield" in {g.key for g in discover(photos(data))[0]}
    data.destinations[uid(103)]["city"] = "Other Town"
    groups, _ = discover(photos(data))
    assert [g.level for g in groups] == ["state"]
    data.destinations[uid(103)]["address"] = "3 Main St, Springfield, CA 01234"
    assert not discover(photos(data))[0]


def test_missing_address_and_county_mapping():
    data = snapshot(3)
    groups, summary = discover(photos(data))
    assert summary["county_support"] == "unavailable_skipped"
    mapping = [{"canonical_address_identity": locate(p).evidence["canonical_address_identity"],
                "state_code": "MA", "county": "Verified County", "verified": True,
                "verified_at": "2026-10-01", "evidence": "Reviewed authoritative address mapping"} for p in photos(data)]
    assert any(g.level == "county" for g in discover(photos(data), mapping)[0])
    for m in mapping:
        m["verified"] = False
    assert not any(g.level == "county" for g in discover(photos(data), mapping)[0])
    data.destinations[uid(101)]["address"] = "Springfield"
    assert not discover(photos(data))[0]


def test_county_is_preferred_to_state_but_town_is_preferred_to_county():
    data = snapshot()
    ps = photos(data)
    mapping = [{"canonical_address_identity": locate(p).evidence["canonical_address_identity"], "state_code": "MA",
                "county": "Example County", "verified": True, "verified_at": "2026-10-29", "evidence": "Reviewed boundary"} for p in ps]
    groups, _ = discover(ps, mapping)
    assert select(groups, [], "tier")[0].level == "town"
    for d in data.destinations.values():
        d["city"] = "Conflicting Town"
    groups, _ = discover(photos(data), mapping)
    assert select(groups, [], "tier")[0].level == "county"


def test_coordinate_deduplication_requires_same_street_and_preserves_units():
    data = snapshot(3)
    data.destinations[uid(101)].update(lat=42, lng=-72)
    data.destinations[uid(102)].update(address="1 Main Street, Springfield, MA 99999", lat=42, lng=-72)
    assert not discover(photos(data))[0]
    data.destinations[uid(102)]["address"] = "1 Main Street Unit 2, Springfield, MA 01234"
    assert discover(photos(data))[0]


def test_state_first_rotation_does_not_starve_statewide_options():
    data = merge(snapshot(3), snapshot(3, state="CA", first=10))
    # California has no town group but must still receive a turn.
    for d in data.destinations.values():
        if d["state_id"] == 2:
            d["city"] = "Conflicting Town"
    groups, _ = discover(photos(data))
    history = []
    seen = []
    for i in range(10):
        g, selected, _ = select(groups, history, "rotation")
        seen.append(g.state_code)
        history.append({"generation_status": "preview_generated", "run_time": f"2026-10-{i+1:02d}",
                        "geography": {"state_code": g.state_code, "key": g.key},
                        "sources": [{"photo_id": p.photo.id} for p in selected]})
    assert set(seen) == {"MA", "CA"}
    assert all(seen[i] != seen[i + 1] for i in range(len(seen) - 1))


def test_seeded_small_pool_reuse_and_no_largest_state_bias():
    groups, _ = discover(photos(snapshot()))
    a = select(groups, [], "same")
    b = select(groups, [], "same")
    assert [p.photo.id for p in a[1]] == [p.photo.id for p in b[1]]
    history = [{"generation_status": "preview_generated", "run_time": "2026-01-01", "geography": {"state_code": "MA", "key": a[0].key},
                "sources": [{"photo_id": p.photo.id} for p in a[1]]}]
    assert len(select(groups, history, "same")[1]) == 3
    groups, _ = discover(photos(merge(snapshot(9), snapshot(3, state="CA", first=20))))
    assert {select(groups, [], str(s))[0].state_code for s in range(20)} == {"MA", "CA"}


def test_attribution_plain_text_and_answer_clues():
    data = snapshot()
    row, user = data.photos[0], data.users[uid(201)]
    row["attribution_preference"] = "username"
    user["username"] = "@creator"
    assert attribution(row, user) == "creator"
    group, selected, _ = select(discover(photos(data))[0], [], "credits")
    hook, body = caption(group, selected)
    assert "@" not in body and "Restaurant Answer" not in body and "#SpringfieldMAFood" in body
    user["username"] = "RestaurantAnswer1"
    assert len(photos(data)) == 2
    user["social_opt_out"] = True
    assert photos(data)[0].credit == "BuffaGo community"


@pytest.mark.parametrize("state", ["MA", "CA"])
def test_sharing_caption_preserves_guessing_credits_and_geography(state):
    from guess_wing_spot.captions import PHOTO_SHARING_CTA
    data = snapshot(state=state)
    data.photos[0]["attribution_preference"] = "username"
    group, selected, _ = select(discover(photos(data))[0], [], "sharing")
    hook, body = caption(group, selected)
    assert body.startswith(hook + "\nComment your restaurant guesses: 1, 2, 3.")
    assert body.count(PHOTO_SHARING_CTA) == 1
    assert body.index("Photo 3:") < body.index(PHOTO_SHARING_CTA) < body.index("#BuffaGo")
    assert "Link in bio" not in body and "@" not in body
    assert f"#Springfield{state}Food" in body
    for i, source in enumerate(selected, 1):
        assert f"Photo {i}: {source.photo.credit}" in body
        assert source.photo.destination["name"] not in body


def test_closing_cta_is_legible_with_three_visible_photos_and_safe_margins():
    from PIL import ImageChops
    from guess_wing_spot import rendering
    logo = Path(__file__).resolve().parents[3] / "crawl/assets/images/buffago-logo.png"
    # Abstract visual fixtures: retain enough of each aspect-preserved photo
    # for a useful second look, not just a colored border or a tiny thumbnail.
    images = [Image.new("RGB", (1536, 2048), color) for color in ("red", "lime", "blue")]
    with patch.object(rendering, "text", wraps=rendering.text) as draw_text:
        card = rendering.composite_card(images, ["Creator A", "Creator B", "Creator C"], logo)
    calls = {call.args[1]: call.kwargs for call in draw_text.call_args_list}
    assert {"Guess the spots:", "1, 2, 3", "Share your wing pics on BuffaGo", "Download on iOS & Android"} <= calls.keys()
    assert calls["Guess the spots:"]["size"] > calls["Share your wing pics on BuffaGo"]["size"] >= 46
    assert calls["Download on iOS & Android"]["size"] >= 46
    for channel in range(3):
        channels = card.split()
        mask = channels[channel].point(lambda v: 255 if v > 220 else 0)
        for other in range(3):
            if other != channel:
                mask = ImageChops.multiply(mask, channels[other].point(lambda v: 255 if v < 30 else 0))
        assert mask.histogram()[255] > 90_000
    content_bounds = ImageChops.difference(card, Image.new("RGB", card.size, "#151719")).getbbox()
    assert content_bounds[0] >= 80 and content_bounds[2] <= 1000
    assert content_bounds[1] >= 200 and content_bounds[3] <= 1660


class Response:
    def __init__(self, body=b"[]"):
        self.body = body

    def __enter__(self):
        return self

    def __exit__(self, *args):
        pass

    def read(self, maximum):
        return self.body


class GetOnlyOpener:
    def __init__(self):
        self.calls = []

    def open(self, request, timeout):
        assert request.method in {"GET", "HEAD"}, "Source mutation attempted"
        assert "/rpc/" not in request.full_url, "RPC attempted"
        assert "/functions/" not in request.full_url, "Function workflow attempted"
        self.calls.append(request)
        return Response()


def test_adapter_mutations_rpc_and_upload_fail_immediately():
    opener = GetOnlyOpener()
    repo = ReadOnlySources("https://example.supabase.co", "test-key", opener=opener)
    repo.rows("wing_jury_photo_vote_counts")
    for method in ("POST", "PATCH", "PUT", "DELETE"):
        with pytest.raises(SourceError):
            repo._request(method, "rest/v1/wing_media_submissions")
    for path in ("rest/v1/rpc/run_wing_nightly_selection", "functions/v1/worker", "storage/v1/object/wing-submissions/new"):
        with pytest.raises(SourceError):
            repo._request("GET", path)
    assert len(opener.calls) == 1


def test_plan_has_no_renderer_or_download_and_no_source_changes(tmp_path):
    data = snapshot()
    before = copy.deepcopy(data)
    repo = FakeRepository(data)
    with patch("guess_wing_spot.rendering.render", side_effect=AssertionError("Plan rendered")):
        manifest, output = generate(repo, mode="plan", seed="plan", output_root=tmp_path / "runs", history_dir=tmp_path / "history")
    assert repo.downloads == [] and data == before
    assert manifest["generation_status"] == "planned"
    assert manifest["source_revalidation"]["source_records_unchanged"]
    assert not (tmp_path / "history").exists()
    assert "Restaurant Answer" not in Path(manifest["outputs"]["caption"]).read_text()


def test_preview_is_isolated_from_legacy_publishers(tmp_path):
    repo = FakeRepository(snapshot())
    blocked = {name: None for name in ("supabase_client", "wing_shots.orchestrator", "wing_shots.repository",
                                       "wing_shots.generation_repository", "wing_shots.publishers", "instagram_publishing")}
    def local_render(data, selected, hook, output, logo, **kwargs):
        assert len(data) == 3 and len({p.physical_key for p in selected}) == 3
        return {"verification": {"test_double": True}}, []
    with patch.dict(sys.modules, blocked), patch("guess_wing_spot.rendering.render", side_effect=local_render):
        manifest, _ = generate(repo, mode="preview", seed="preview", output_root=tmp_path / "runs", history_dir=tmp_path / "history")
    assert len(repo.downloads) == 3
    assert manifest["generation_status"] == "preview_generated"
    assert all(p["status"] == "not_published" for p in manifest["publication"].values())
    assert len(read_history(tmp_path / "history")) == 1


def test_no_group_clean_skip(tmp_path):
    repo = FakeRepository(snapshot(2))
    manifest, _ = generate(repo, mode="preview", seed="skip", output_root=tmp_path / "runs", history_dir=tmp_path / "history")
    assert manifest["generation_status"] == "skipped_no_eligible_geography"
    assert not manifest["outputs"] and not repo.downloads


def test_revalidation_rejects_new_withdrawal(tmp_path):
    repo = FakeRepository(snapshot())
    initial = repo.load
    def changed():
        result = initial()
        if repo.loads >= 2:
            result.photos[0]["withdrawn_at"] = "2026-01-03T00:00:00Z"
        return result
    repo.load = changed
    with pytest.raises(ValueError, match="revalidation"):
        generate(repo, mode="preview", seed="changed", output_root=tmp_path / "runs", history_dir=tmp_path / "history")
    assert not repo.downloads


def test_unknown_mode_and_ledger_overwrite_refused(tmp_path):
    with pytest.raises(ValueError):
        generate(FakeRepository(snapshot()), mode="publish", seed="no", output_root=tmp_path, history_dir=tmp_path)
    path = tmp_path / "history.json"
    write_private(path, {"reel_id": "one"})
    with pytest.raises(FileExistsError):
        write_private(path, {"reel_id": "two"})
    slots = publication_slots("one")
    assert slots["instagram"]["idempotency_key"] == "one:instagram"
    assert slots["facebook"]["status"] == "not_published"


def test_external_source_timestamp_change_is_not_marked_success(tmp_path):
    repo = FakeRepository(snapshot())
    original = repo.load
    def changed():
        value = original()
        if repo.loads == 3:
            value.photos[0]["updated_at"] = "2026-10-28T00:00:00Z"
        return value
    repo.load = changed
    with patch("guess_wing_spot.rendering.render", return_value=({}, [])):
        manifest, _ = generate(repo, mode="preview", seed="change", output_root=tmp_path / "runs", history_dir=tmp_path / "history")
    assert manifest["generation_status"] == "source_changed_during_run"
    assert not manifest["source_revalidation"]["source_records_unchanged"]
    assert not (tmp_path / "history").exists()


def test_redirects_do_not_forward_credentials():
    from guess_wing_spot.sources import NoRedirect
    with pytest.raises(SourceError, match="Redirect"):
        NoRedirect().redirect_request(None, None, None, None, None, None)


def test_hash_bound_visual_review_excludes_without_source_mutations():
    import hashlib
    from guess_wing_spot.review import apply_review
    repo = FakeRepository(snapshot())
    original = copy.deepcopy(repo.data)
    finding = {"photo_id": uid(1), "processed_sha256": hashlib.sha256(repo.photo_bytes(uid(1))).hexdigest(),
               "decision": "exclude_answer_clue", "reason": "Visible restaurant logo on packaging", "reviewed_at": "2026-10-29"}
    retained, findings = apply_review(photos(repo.data), repo, [finding])
    assert len(retained) == 2 and findings[0]["decision"] == "excluded_known_answer_clue"
    finding["processed_sha256"] = "0" * 64
    assert apply_review(photos(repo.data), repo, [finding])[1][0]["decision"] == "excluded_stale_visual_review_requires_reinspection"
    assert repo.data == original
    with pytest.raises(ValueError):
        apply_review(photos(repo.data), repo, [{"photo_id": uid(1)}])


def test_real_render_contract_and_cut_boundaries(tmp_path):
    """Opt-in local FFmpeg test using abstract solid colors, not restaurant media."""
    ffmpeg, ffprobe = os.environ.get("GUESS_TEST_FFMPEG"), os.environ.get("GUESS_TEST_FFPROBE")
    if not ffmpeg or not ffprobe:
        pytest.skip("Set GUESS_TEST_FFMPEG/GUESS_TEST_FFPROBE for local media integration")
    from guess_wing_spot.rendering import render, probe, run
    group, selected, _ = select(discover(photos(snapshot()))[0], [], "render")
    graphic_data = []
    for color in ("red", "green", "blue"):
        stream = io.BytesIO()
        Image.new("RGB", (1200, 1500), color).save(stream, format="JPEG")
        graphic_data.append(stream.getvalue())
    logo = Path(__file__).resolve().parents[3] / "crawl/assets/images/buffago-logo.png"
    output = tmp_path / "render"
    output.mkdir()
    result, _ = render(graphic_data, selected, caption(group, selected)[0], output, logo, ffmpeg=ffmpeg, ffprobe=ffprobe)
    assert result["verification"] == {"codec": "h264", "width": 1080, "height": 1920, "fps": "30/1",
                                      "duration_seconds": 15.0, "frames": 450, "audio_streams": 0}
    # Read frames on both sides of each cut; color changes must occur at the
    # exact requested boundary, with no crossfade or timing drift.
    video = result["video"]
    for frame_number, channel in ((60, 0), (149, 0), (150, 1), (239, 1), (240, 2), (329, 2)):
        target = output / f"boundary-{frame_number}.png"
        run([ffmpeg, "-nostdin", "-loglevel", "error", "-y", "-i", video, "-vf", f"select=eq(n\\,{frame_number})", "-frames:v", "1", str(target)])
        pixel = Image.open(target).convert("RGB").getpixel((540, 850))
        assert pixel[channel] > max(pixel[c] for c in range(3) if c != channel) + 50
    metadata = json.dumps(probe(video, ffprobe))
    assert "Restaurant Answer" not in metadata
    assert len(list((output / "review-frames").glob("*.png"))) == 5
