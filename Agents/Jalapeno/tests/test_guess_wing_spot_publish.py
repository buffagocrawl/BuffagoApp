"""No live provider calls. Publishing never reaches source write adapters."""
import copy
import hashlib
import io
import json
import os
import shutil
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

import pytest
import requests
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from guess_wing_spot.clock_gate import gate
from guess_wing_spot.durable import Busy, DurableError, PrivateLedger
from guess_wing_spot.meta_reels import Graph, MetaError, ReelPublisher
from guess_wing_spot.screening import Screener, clue, aliases
from guess_wing_spot.automatic import prepare, revalidate
from guess_wing_spot.actions_runtime import ActionsOwner, bind_run_date, run
from test_guess_wing_spot import FakeRepository, snapshot


@pytest.mark.parametrize("instant,cron,proceed,date,reason", [
    ("2026-07-01T23:30:00Z", "30 23 * * *", True, "2026-07-01", "within_publication_window"),
    ("2026-07-02T00:45:00Z", "30 23 * * *", True, "2026-07-01", "within_publication_window"),
    ("2026-07-02T00:30:00Z", "30 0 * * *", False, "2026-07-01", "other_dst_trigger"),
    ("2026-01-02T00:30:00Z", "30 0 * * *", True, "2026-01-01", "within_publication_window"),
    ("2026-01-01T23:30:00Z", "30 23 * * *", False, "2026-01-01", "other_dst_trigger"),
    ("2026-07-02T01:00:00Z", "30 23 * * *", False, "2026-07-01", "outside_18_21_eastern"),
    ("2026-07-01T23:29:00Z", "30 23 * * *", False, "2026-07-01", "before_1930_eastern"),
    ("2026-11-02T00:40:00Z", "30 0 * * *", True, "2026-11-01", "within_publication_window"),
    ("2026-03-09T00:30:00Z", "30 0 * * *", False, "2026-03-08", "other_dst_trigger"),
])
def test_eastern_dst_delays_dates_and_duplicate_cron(instant, cron, proceed, date, reason):
    value = gate(datetime.fromisoformat(instant.replace("Z", "+00:00")), event="schedule", cron=cron, mode="publish")
    assert value == {"date": date, "proceed": proceed, "reason": reason}


def test_manual_window_and_plan_preview_are_not_publication():
    noon = datetime(2026, 10, 29, 16, tzinfo=timezone.utc)
    assert not gate(noon, mode="publish")["proceed"]
    assert gate(noon, mode="plan")["proceed"]
    assert gate(noon, mode="preview")["proceed"]
    assert gate(datetime(2026, 10, 29, 22, tzinfo=timezone.utc), mode="publish")["proceed"]


class MemoryLedger(PrivateLedger):
    def __init__(self):
        self.data = {}
        self.lock = threading.Lock()

    def create(self, key, data, mime="application/json"):
        with self.lock:
            if key in self.data:
                return False
            self.data[key] = copy.deepcopy(data)
            return True

    def get(self, key):
        return copy.deepcopy(self.data.get(key))

    def names(self, prefix, reverse=False):
        return sorted([k[len(prefix):] for k in self.data if k.startswith(prefix) and "/" not in k[len(prefix):]], reverse=reverse)


def test_atomic_concurrent_claims_and_per_platform_scope():
    ledger = MemoryLedger()
    def attempt(owner):
        try:
            ledger.claim("2026-10-29", "run", owner, lambda _: False)
            return "won"
        except Busy:
            return "busy"
    with ThreadPoolExecutor(2) as pool:
        assert sorted(pool.map(attempt, ["1.1", "2.1"])) == ["busy", "won"]
    ledger.claim("2026-10-29", "instagram", "1.1", lambda _: False)
    ledger.claim("2026-10-29", "facebook", "1.1", lambda _: False)
    with pytest.raises(Busy):
        ledger.claim("2026-10-29", "instagram", "2.1", lambda _: False)
    ledger.claim("2026-10-29", "instagram", "2.1", lambda owner: owner == "1.1")


def test_immutable_state_revisions_survive_runner_and_conflicting_updates():
    ledger = MemoryLedger()
    state = {"revision": 0, "reel_id": "daily-one", "platforms": {"instagram": {"status": "published"}}}
    ledger.save("2026-10-29", state)
    resumed = ledger.latest("2026-10-29")
    assert resumed["reel_id"] == "daily-one"
    resumed["platforms"]["facebook"] = {"status": "failed"}
    ledger.save("2026-10-29", resumed)
    assert ledger.latest("2026-10-29")["revision"] == 2
    with pytest.raises(Busy):
        ledger.save("2026-10-29", state)


def test_rerun_on_later_eastern_date_cannot_become_an_extra_new_daily_post():
    ledger = MemoryLedger()
    assert bind_run_date(ledger, "123", "2026-10-29")
    assert bind_run_date(ledger, "123", "2026-10-29")
    assert not bind_run_date(ledger, "123", "2026-10-30")
    assert bind_run_date(ledger, "124", "2026-10-30")


def test_actions_claim_recovery_requires_completed_verified_attempt():
    env = {"GITHUB_ACTIONS": "true", "GITHUB_REPOSITORY": "owner/repo", "GITHUB_RUN_ID": "123", "GITHUB_RUN_ATTEMPT": "2",
           "GITHUB_REF": "refs/heads/main", "GITHUB_WORKFLOW_REF": "owner/repo/.github/workflows/guess-wing-spot.yml@refs/heads/main", "GITHUB_TOKEN": "test"}
    owner = ActionsOwner(env)
    response = type("Response", (), {"status_code": 200, "json": lambda _: {"status": "completed", "path": ".github/workflows/guess-wing-spot.yml"}})()
    with patch("requests.get", return_value=response):
        assert owner.previous_finished("123.1")
    with patch("requests.get", side_effect=requests.ConnectionError):
        assert not owner.previous_finished("123.1")
    with pytest.raises(DurableError):
        ActionsOwner({**env, "GITHUB_REF": "refs/heads/other"})


def state():
    return {"caption": "Guess 1, 2, 3", "reel_id": "daily-reel", "platforms": {p: {"status": "not_published", "pending": None, "attempts": 0} for p in ("instagram", "facebook")}}


class FakeGraph:
    version = "v25.0"

    def __init__(self):
        self.calls = []
        self.timeout_publish = False
        self.ig_status = "FINISHED"
        self.fb_status = {"publishing_phase": {"status": "complete"}}

    def call(self, method, path, **kwargs):
        self.calls.append((method, path, kwargs))
        if method == "GET":
            if path == "10": return {"status_code": self.ig_status}
            if path == "20": return {"status": self.fb_status}
            if path == "30": return {"permalink": "https://www.instagram.com/reel/example/"}
            if path.endswith("/media"): return {"data": []}
        if path.endswith("/media_publish") and self.timeout_publish:
            raise MetaError("provider_timeout_or_connection_failure", uncertain=True)
        if path.endswith("/media_publish"): return {"id": "30"}
        if path.endswith("/media"): return {"id": "10"}
        if path.endswith("/video_reels") and kwargs.get("data", {}).get("upload_phase") == "start": return {"video_id": "20"}
        return {"success": True}


def publisher(graph):
    return ReelPublisher(graph, "100", "200", "private-page-token", sleep=lambda _: None)


def publish(p, platform, value, persist=lambda: None, revalidate=lambda: None, window=lambda: True):
    p.publish(platform, value, persist, revalidate, lambda: "https://example/video.mp4?private-signature", lambda: b"generated-video", window)


def test_independent_reels_paths_and_partial_success_resume():
    graph, value = FakeGraph(), state()
    p = publisher(graph)
    publish(p, "instagram", value)
    graph.fb_status = {"publishing_phase": {"status": "not_started"}}
    publish(p, "facebook", value)
    assert value["platforms"]["instagram"]["status"] == "published"
    assert value["platforms"]["facebook"]["status"] == "uncertain"
    first_posts = len([c for c in graph.calls if c[1].endswith("/media_publish")])
    graph.fb_status = {"publishing_phase": {"status": "complete"}}
    publish(p, "instagram", value)
    publish(p, "facebook", value)
    assert all(v["status"] == "published" for v in value["platforms"].values())
    assert len([c for c in graph.calls if c[1].endswith("/media_publish")]) == first_posts == 1
    assert any(c[1] == "200/video_reels" and c[2].get("data", {}).get("video_state") == "PUBLISHED" for c in graph.calls)
    assert not any(c[1].endswith("/videos") for c in graph.calls)


def test_timeout_reconciles_container_without_duplicate_publish():
    graph, value = FakeGraph(), state()
    graph.timeout_publish = True
    p = publisher(graph)
    publish(p, "instagram", value)
    assert value["platforms"]["instagram"]["pending"] == "publish"
    publish(p, "instagram", value)
    assert len([c for c in graph.calls if c[1].endswith("/media_publish")]) == 1
    graph.ig_status = "PUBLISHED"
    publish(p, "instagram", value)
    assert value["platforms"]["instagram"]["status"] == "published"
    assert len([c for c in graph.calls if c[1].endswith("/media_publish")]) == 1


def test_missing_provider_id_and_uncertain_finish_never_republish():
    graph, value = FakeGraph(), state()
    value["platforms"]["facebook"].update(pending="create", status="uncertain")
    publish(publisher(graph), "facebook", value)
    assert not graph.calls


def test_durable_intent_and_fresh_sources_precede_publication():
    graph, value = FakeGraph(), state()
    events = []
    original = graph.call
    def observe(method, path, **kwargs):
        if method == "POST" and path.endswith("/media_publish"):
            assert events[-2:] == ["fresh_sources", "persist_publish"]
        return original(method, path, **kwargs)
    graph.call = observe
    publish(publisher(graph), "instagram", value,
            persist=lambda: events.append("persist_" + str(value["platforms"]["instagram"].get("pending"))),
            revalidate=lambda: events.append("fresh_sources"))


@pytest.mark.parametrize("platform", ["instagram", "facebook"])
def test_source_change_or_closed_window_stops_publish(platform):
    graph, value = FakeGraph(), state()
    def changed(): raise MetaError("source_votes_changed")
    publish(publisher(graph), platform, value, revalidate=changed)
    assert not any(c[1].endswith("/media_publish") or (c[2].get("data") or {}).get("upload_phase") == "finish" for c in graph.calls)
    assert value["platforms"][platform]["reason"] == "source_votes_changed"
    graph, value = FakeGraph(), state()
    publish(publisher(graph), platform, value, window=lambda: False)
    assert value["platforms"][platform]["reason"] == "publication_window_closed"


def test_storage_failure_before_intent_prevents_provider_mutation():
    graph, value = FakeGraph(), state()
    def fail(): raise DurableError("storage_unavailable")
    with pytest.raises(DurableError):
        publish(publisher(graph), "instagram", value, persist=fail)
    assert not graph.calls


def test_expired_credentials_are_redacted_and_no_automatic_post_retry():
    class Response:
        status_code = 400
        def json(self): return {"error": {"code": 190, "message": "SECRET MUST NEVER BE PRINTED"}}
    session = type("Session", (), {"request": lambda *a, **k: Response()})()
    with pytest.raises(MetaError, match="expired_or_invalid_credentials") as result:
        Graph("fake", "v25.0", session).call("GET", "me")
    assert "SECRET" not in str(result.value)


def test_provider_preflight_verifies_page_link_and_pinned_names():
    graph = Graph("fake", "v25.0", app_secret="fake-app-secret")
    def reply(method, path, **kwargs):
        if path == "app": return {"id": "300"}
        if path == "debug_token": return {"data": {"is_valid": True, "app_id": "300", "type": "USER", "expires_at": int(time.time()) + 60 * 86400}}
        if path == "200": return {"id": "200", "name": "BuffaGo", "access_token": "memory-only", "instagram_business_account": {"id": "100"}}
        if path == "100":
            assert kwargs["data"]["fields"] == "id,username"
            return {"id": "100", "username": "buffago"}
        if path == "me/permissions": return {"data": [{"permission": p, "status": "granted"} for p in ("instagram_basic", "instagram_content_publish", "pages_read_engagement", "pages_manage_posts")]}
        return {}
    graph.call = reply
    identities, token = graph.validate("100", "200", "buffago", "BuffaGo")
    assert identities["facebook"]["id"] == "200" and token == "memory-only"
    assert "memory-only" not in json.dumps(identities)
    with pytest.raises(MetaError, match="mismatch"):
        graph.validate("100", "200", "wrong-account", "BuffaGo")


def test_short_lived_user_token_cannot_activate_a_later_daily_post():
    graph = Graph("fake", "v25.0", app_secret="fake-app-secret")
    graph.call = lambda method, path, **kwargs: {"id": "300"} if path == "app" else {"data": {
        "is_valid": True, "app_id": "300", "type": "USER", "expires_at": int(time.time()) + 3600}}
    with pytest.raises(MetaError, match="expires_within_24_hours"):
        graph.validate("100", "200", "buffago", "BuffaGo")


@pytest.mark.parametrize("change,expected", [("vote", "votes_credit"), ("withdrawal", "record_changed"), ("asset", "asset_identity"), ("unavailable", "no_longer_eligible"), ("version", "screening_hash"), ("name", "votes_credit")])
def test_fresh_prepublication_checks_every_selected_source(change, expected):
    ledger = MemoryLedger()
    class Screening:
        def __init__(self): self.ledger, self.version = ledger, "v1"
        def inspect(self, photo, data):
            return {"decision": "passed", "asset_sha256": hashlib.sha256(data).hexdigest(), "binding": self.version}
    screen = Screening()
    repo = FakeRepository(snapshot())
    value = prepare(repo, ledger, screen, "2026-10-29", "1.1")
    assert value["status"] == "planned"
    revalidate(repo, value, screen)
    target = value["sources"][0]["photo_id"]
    if change == "vote": repo.data.votes[target]["like_count"] += 1
    if change == "withdrawal": next(p for p in repo.data.photos if p["id"] == target)["withdrawn_at"] = "2026-10-29T00:00:00Z"
    if change == "asset": repo.photo_bytes = lambda _: graphic()
    if change == "unavailable": repo.asset_available = lambda _: False
    if change == "version": screen.version = "v2"
    if change == "name": repo.data.destinations[value["sources"][0]["destination_id"]]["name"] += " "
    with pytest.raises(MetaError, match=expected): revalidate(repo, value, screen)


def test_actual_free_ocr_recognizes_obvious_restaurant_text_when_installed():
    executable = shutil.which("tesseract")
    if not executable:
        pytest.skip("Tesseract installed by Actions; mocked OCR tested locally")
    from guess_wing_spot.eligibility import eligible_photos
    from guess_wing_spot.rendering import font
    photo = eligible_photos(snapshot(1), lambda _: True)[0][0]
    photo.destination["name"] = "The Example Hearth"
    image = Image.new("RGB", (1000, 1000), "white")
    ImageDraw.Draw(image).text((70, 400), "EXAMPLE HEARTH", font=font(80), fill="black")
    data = io.BytesIO()
    image.save(data, format="JPEG")
    assert Screener(MemoryLedger(), executable).inspect(photo, data.getvalue())["decision"] == "suspicious"


def graphic():
    data = io.BytesIO()
    Image.new("RGB", (900, 1200), "orange").save(data, format="JPEG")
    return data.getvalue()


def ocr_tsv(words):
    return "level\tconf\ttext\n" + "\n".join("5\t95\t" + word for word in words)


def test_ocr_aliases_screen_hash_and_version_invalidation():
    from guess_wing_spot.eligibility import eligible_photos
    photo = eligible_photos(snapshot(1), lambda _: True)[0][0]
    photo.destination["name"] = "The Example Hearth - North"
    ledger = MemoryLedger()
    result = type("Result", (), {"stdout": "tesseract 5.3", "returncode": 0})()
    with patch("subprocess.run", return_value=result): s = Screener(ledger)
    result.stdout = ocr_tsv(["example", "hearth"])
    with patch("subprocess.run", return_value=result):
        rejected = s.inspect(photo, graphic())
    assert rejected["decision"] == "suspicious"
    assert rejected["asset_sha256"] == hashlib.sha256(graphic()).hexdigest()
    with patch("subprocess.run", side_effect=AssertionError("cached exact screening should be reused")):
        assert s.inspect(photo, graphic()) == rejected
    s.version += "-changed"
    result.stdout = ocr_tsv(["ordinary", "food"])
    with patch("subprocess.run", return_value=result): fresh = s.inspect(photo, graphic())
    assert fresh["binding"] != rejected["binding"] and fresh["decision"] == "passed"
    assert clue(["h3arth"], aliases("Example Hearth"))


def test_unscreenable_and_low_resolution_fail_closed():
    from guess_wing_spot.eligibility import eligible_photos
    photo = eligible_photos(snapshot(1), lambda _: True)[0][0]
    result = type("Result", (), {"stdout": "tesseract test", "returncode": 0})()
    with patch("subprocess.run", return_value=result): s = Screener(MemoryLedger())
    result.stdout = "not a tsv"
    with patch("subprocess.run", return_value=result):
        assert s.inspect(photo, graphic())["decision"] == "unreliable"
    stream = io.BytesIO()
    Image.new("RGB", (300, 300)).save(stream, format="JPEG")
    assert s.inspect(photo, stream.getvalue())["reason"] == "resolution_below_screening_floor"


def test_food_texture_ocr_is_not_equivalent_to_name_like_ambiguous_text():
    from guess_wing_spot.eligibility import eligible_photos
    photo = eligible_photos(snapshot(1), lambda _: True)[0][0]
    photo.destination["name"] = "Example Hearth"
    result = type("Result", (), {"stdout": "tesseract test", "returncode": 0})()
    with patch("subprocess.run", return_value=result): screener = Screener(MemoryLedger())
    result.stdout = "level\tconf\ttext\n5\t5\txqzxqz"
    with patch("subprocess.run", return_value=result):
        assert screener.inspect(photo, graphic())["decision"] == "passed"
    with patch("subprocess.run", return_value=type("Result", (), {"stdout": "tesseract test", "returncode": 0})()):
        screener = Screener(MemoryLedger())
    result.stdout = "level\tconf\ttext\n5\t5\theartx"
    with patch("subprocess.run", return_value=result):
        assert screener.inspect(photo, graphic())["decision"] == "unreliable"


def test_brand_anonymous_credit_is_not_mistaken_for_a_restaurant_alias():
    from guess_wing_spot.eligibility import eligible_photos
    photo = eligible_photos(snapshot(1), lambda _: True)[0][0]
    photo.destination["name"] = "Buffalo Test Kitchen"
    result = type("Result", (), {"stdout": "tesseract test", "returncode": 0})()
    with patch("subprocess.run", return_value=result): screener = Screener(MemoryLedger())
    result.stdout = ocr_tsv(["ordinary", "food"])
    with patch("subprocess.run", return_value=result):
        assert screener.inspect(photo, graphic())["decision"] == "passed"


def test_preparation_tries_another_source_and_clean_skip():
    class Screening:
        def inspect(self, photo, data):
            return {"decision": "suspicious", "asset_sha256": hashlib.sha256(data).hexdigest(), "binding": "test"}
    repo = FakeRepository(snapshot(6))
    original = copy.deepcopy(repo.data)
    value = prepare(repo, MemoryLedger(), Screening(), "2026-10-29", "1.1")
    assert value["status"] == "skipped_no_screened_trio"
    assert repo.data == original


def test_plan_preview_cannot_enter_publishing_runtime():
    with pytest.raises(ValueError): run("preview", env={})
    with pytest.raises(ValueError): run("plan", env={})
    main = (Path(__file__).resolve().parents[1] / "guess_wing_spot_main.py").read_text()
    assert 'choices=("plan", "preview")' in main
    assert "actions_runtime" not in main and "meta_reels" not in main and "durable" not in main


def test_storage_namespace_never_accepts_source_paths_or_unavailable_bucket():
    ledger = PrivateLedger("https://example.supabase.co", "test")
    for key in ("../wing-submissions/source", "/source", "x?token=secret"):
        with pytest.raises(DurableError): ledger.key(key)
    with patch.object(ledger, "request", side_effect=DurableError("unavailable")):
        with pytest.raises(DurableError): ledger.check_private()


def test_real_storage_missing_object_envelope_is_not_an_auth_failure():
    ledger = PrivateLedger("https://example.supabase.co", "test")
    class Missing:
        status_code = 400
        def json(self): return {"statusCode": "404", "error": "not_found"}
    with patch.object(ledger, "request", return_value=Missing()):
        assert ledger.get("screening/new-binding.json") is None
    class Forbidden:
        status_code = 400
        def json(self): return {"statusCode": "403", "error": "unauthorized"}
    with patch.object(ledger, "request", return_value=Forbidden()):
        with pytest.raises(DurableError): ledger.get("screening/new-binding.json")


def test_validate_reports_real_source_readiness_without_bypassing_bad_credentials():
    ledger = MemoryLedger()
    ledger.check_private = lambda: None
    env = {"SUPABASE_URL": "https://example.supabase.co", "SUPABASE_SERVICE_ROLE_KEY": "test", "META_LONG_LIVED_ACCESS_TOKEN": "bad-test-token",
           "META_GRAPH_API_VERSION": "v25.0", "INSTAGRAM_BUSINESS_ACCOUNT_ID": "100", "FACEBOOK_PAGE_ID": "200"}
    candidate = {"status": "planned", "reel_id": "test-reel", "geography": {"label": "Example geography"}}
    with patch("guess_wing_spot.actions_runtime.PrivateLedger", return_value=ledger), \
         patch("guess_wing_spot.actions_runtime.Graph.validate", side_effect=MetaError("expired_or_invalid_credentials")), \
         patch("guess_wing_spot.actions_runtime.Screener"), \
         patch("guess_wing_spot.actions_runtime.ReadOnlySources"), \
         patch("guess_wing_spot.actions_runtime.prepare", return_value=candidate), \
         patch("guess_wing_spot.actions_runtime.ReelPublisher", side_effect=AssertionError("Validation attempted publication")):
        result = run("validate", env=env)
    assert result["status"] == "blocked" and result["reason"] == "expired_or_invalid_credentials"
    assert result["source_screening"] == "passed" and result["accounts"] is None
    assert not any(key.startswith("claims/") or key.startswith("outputs/") for key in ledger.data)


def test_workflow_uses_new_gate_no_artifacts_or_old_enable_flag():
    text = (Path(__file__).resolve().parents[3] / ".github/workflows/guess-wing-spot.yml").read_text()
    assert "30 23 * * *" in text and "30 0 * * *" in text
    assert "cancel-in-progress: false" in text and "default: plan" in text
    assert "GUESS_WING_SPOT_ENABLED" in text
    assert "JALAPENO_AUTOMATION_ENABLED" not in text and "upload-artifact" not in text
    assert "wing_shots_main" not in text
