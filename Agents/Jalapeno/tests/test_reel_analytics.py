"""Analytics fixtures only; no real credentials, app writes or publishing calls."""
import ast
import copy
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import sys
import threading
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import Mock

import pytest
import requests
import yaml

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from reel_analytics.collector import collect, schedule_gate, snapshot_key, visibility
from reel_analytics.meta import MetaReadError, MetaReader, PERMISSIONS, normalize
from reel_analytics.reporting import build_report, engagement, markdown, snapshot_window
from reel_analytics.storage import ANALYTICS, PUBLICATIONS, Store, StorageError, discover

NOW = datetime(2026, 10, 30, 0, 30, tzinfo=timezone.utc)
REEL = "00000000-0000-0000-0000-000000000001"


def state(reel=REEL, *, platform_status="published"):
    return {"reel_id": reel, "date": "2026-10-29", "geography": {"label": "Massachusetts", "level": "state", "state_code": "MA"},
            "sources": [{"restaurant_answer": "PRIVATE ANSWER", "photo_id": "PRIVATE PHOTO"}], "caption": "PRIVATE CAPTION",
            "platforms": {"instagram": {"status": platform_status, "publication_id": "111"},
                          "facebook": {"status": "published", "publication_id": "222"}}}


class MemoryStore:
    def __init__(self, readonly=False):
        self.readonly = readonly
        self.data = {p + "days/2026-10-29/states/000001.json": state() for p in PUBLICATIONS}
        self.writes, self.lock = [], threading.Lock()

    def check_private(self):
        pass

    def names(self, prefix):
        return sorted({k[len(prefix):].split("/")[0] for k in self.data if k.startswith(prefix)})

    def read(self, key):
        return copy.deepcopy(self.data.get(key))

    def create(self, key, data):
        assert not self.readonly
        assert key.startswith(("snapshots/", "reports/"))
        with self.lock:
            key = ANALYTICS + key
            if key in self.data:
                return False
            self.data[key] = copy.deepcopy(data)
            self.writes.append(key)
            return True

    def verify_publications_unchanged(self):
        return {"publication_hashes_unchanged": True}


def all_metrics(platform):
    keys = ["views", "reach", "likes_reactions", "comments", "shares", "saves", "watch_time_ms", "avg_watch_time_ms"]
    return {k: {"value": None if platform == "facebook" and k == "saves" else 0, "reason": "unsupported" if platform == "facebook" and k == "saves" else None} for k in keys}


class FakeMeta:
    version = "v25.0"
    audit = [{"method": "GET"}]

    def __init__(self, *, age=25, fail=None):
        self.age, self.fail, self.calls = age, fail, 0

    def metadata(self, post):
        if post["platform"] == self.fail:
            raise MetaReadError("permission_denied")
        return {**post, "published_at": (NOW - timedelta(hours=self.age)).isoformat(),
                "post_url": "https://www.example.invalid/reel", "publication_time_source": "meta"}

    def insights(self, post):
        self.calls += 1
        return all_metrics(post["platform"]), {"test": {"data": []}}, {}


def test_discovery_both_ledgers_deduplicates_and_never_exports_sources():
    store = MemoryStore()
    # Live test has independent media identities. Later revision wins.
    store.data[PUBLICATIONS[1] + "days/2026-10-29/states/000002.json"] = state("00000000-0000-0000-0000-000000000002", platform_status="pending")
    store.data[PUBLICATIONS[1] + "days/2026-10-29/states/000002.json"]["platforms"]["facebook"]["publication_id"] = "333"
    before = copy.deepcopy(store.data)
    posts, errors = discover(store)
    assert len(posts) == 3 and not errors
    assert {p["platform"] for p in posts} == {"instagram", "facebook"}
    assert any(p["live_test"] for p in posts)
    assert not any(x in json.dumps(posts) for x in ("PRIVATE", "sources", "caption", "restaurant_answer"))
    assert store.data == before and store.writes == []


def insight(metric, value):
    return {"data": [{"name": metric, "period": "lifetime", "values": [{"value": value}]}]}


def test_null_zero_and_platform_specific_breakdowns():
    ig = normalize("instagram", {"views": insight("views", 0), "reach": {"data": []}}, {"saved": "permission_denied"})
    assert ig["views"] == {"value": 0, "reason": None}
    assert ig["reach"]["value"] is None and ig["reach"]["reason"]
    assert ig["saves"] == {"value": None, "reason": "permission_denied"}
    fb = normalize("facebook", {"post_video_social_actions": insight("post_video_social_actions", {"comment": 0, "share": 3}),
                               "post_video_likes_by_reaction_type": insight("post_video_likes_by_reaction_type", {"like": 2, "love": 1})}, {})
    assert fb["comments"]["value"] == 0 and fb["shares"]["value"] == 3
    assert fb["likes_reactions"]["value"] == 3 and fb["saves"]["value"] is None
    fb = normalize("facebook", {"post_video_social_actions": insight("post_video_social_actions", {"comment": 0})}, {})
    assert fb["shares"]["value"] is None  # absent keys are not zero


@pytest.mark.parametrize("age,expected", [(0, "current-2026-10-30"), (23.99, "current-2026-10-30"), (24, "24h"), (47.99, "24h"),
                                        (48, "current-2026-10-30"), (72, "72h"), (96, "current-2026-10-30"),
                                        (168, "7d"), (192, "current-2026-10-30")])
def test_actual_age_windows(age, expected):
    assert snapshot_window(age, NOW) == expected


def test_backfill_does_not_invent_24_or_72_hour_observations():
    store = MemoryStore()
    result = collect(store, FakeMeta(age=170), mode="backfill", now=NOW, clock=lambda: NOW, run_key="1.1")
    snapshots = [v for k, v in store.data.items() if k.startswith(ANALYTICS + "snapshots/")]
    assert len(snapshots) == 2
    assert all(s["window"] == "7d" and s["age_hours"] == 170 for s in snapshots)
    assert all(s["missed_historical_windows"] == ["24h", "72h"] for s in snapshots)
    assert all(s["captured_at"] == NOW.isoformat() for s in snapshots)
    assert result["health"]["snapshots_collected"] == 2
    other = MemoryStore()
    collect(other, FakeMeta(age=250), mode="backfill", now=NOW, clock=lambda: NOW, run_key="2.1")
    assert all(v["window"].startswith("current-") for k, v in other.data.items() if "/snapshots/" in k)


def test_young_posts_current_observations_readonly_diagnostic_and_partial_failure():
    store = MemoryStore(readonly=True)
    before = copy.deepcopy(store.data)
    result = collect(store, FakeMeta(age=2), mode="diagnostic", now=NOW, clock=lambda: NOW)
    assert result["status"] == "diagnostic_passed"
    assert result["health"]["too_young_for_milestones"] == 2 and store.data == before and not store.writes
    assert all(p["window_if_collected"].startswith("current-") for p in result["posts"])
    store = MemoryStore()
    result = collect(store, FakeMeta(fail="instagram"), mode="collect", now=NOW, clock=lambda: NOW, run_key="3.1")
    assert result["health"]["snapshots_collected"] == 1
    assert result["health"]["errors"][0]["platform"] == "instagram"
    assert all(k.startswith(ANALYTICS) for k in store.writes)


def test_repeat_runs_and_concurrency_are_idempotent_and_do_not_mutate_ledger():
    store, meta = MemoryStore(), FakeMeta()
    before = {k: copy.deepcopy(v) for k, v in store.data.items()}
    def run(i):
        return collect(store, meta, mode="collect", now=NOW, clock=lambda: NOW, run_key=f"{i}.1")
    with ThreadPoolExecutor(2) as pool:
        list(pool.map(run, [4, 5]))
    assert len([k for k in store.writes if "/snapshots/" in k]) == 2
    calls, writes = meta.calls, len(store.writes)
    run(4)
    assert meta.calls == calls and len(store.writes) == writes
    assert all(store.data[k] == v for k, v in before.items())
    third = run(6)
    assert third["health"]["duplicates_skipped"] == 2


def response(payload, status=200, headers=None):
    r = Mock(status_code=status, headers=headers or {})
    r.json.return_value = payload
    r.content = json.dumps(payload).encode()
    return r


def test_meta_get_only_retries_transient_errors_and_honors_rate_limits():
    session, sleep = Mock(), Mock()
    session.get.side_effect = [requests.Timeout(), response({"error": {"code": 2}}, 503), response({"id": "111"})]
    reader = MetaReader("user-token", "app-secret", "v25.0", session=session, sleep=sleep)
    assert reader.get("111")["id"] == "111"
    assert session.get.call_count == 3 and [x.args[0] for x in sleep.call_args_list] == [1, 2]
    assert all(r["method"] == "GET" for r in reader.audit)
    with pytest.raises(MetaReadError, match="forbidden"):
        reader.get("111/media_publish")
    session.get.side_effect = None
    session.get.return_value = response({"error": {"code": 613}}, 429, {"Retry-After": "120"})
    with pytest.raises(MetaReadError, match="rate_limited_deferred"):
        reader.get("111")
    assert reader.rate_limited


def test_insights_permissions_and_raw_responses_exclude_tokens():
    reader = MetaReader("user-token", "app-secret", "v25.0", session=Mock(), sleep=lambda _: None)
    post = {"platform": "instagram", "media_id": "111"}
    metrics, raw, errors = reader.insights(post)
    assert not raw and all(v["value"] is None for v in metrics.values())
    assert "instagram_manage_insights" in metrics["reach"]["reason"]
    reader.granted = PERMISSIONS["instagram"]
    reader.session.get.return_value = response({**insight("views", 0), "paging": {"next": "https://example?access_token=user-token"}})
    metrics, raw, errors = reader.insights(post)
    assert metrics["views"]["value"] == 0
    assert "paging" not in json.dumps(raw) and "user-token" not in json.dumps(raw)


def test_actual_metadata_times_are_used_not_ledger_intent_times():
    reader = MetaReader("user-token", "app-secret", "v25.0", session=Mock())
    reader.page_token = "page-token"
    for platform, field, urlfield, host in [("instagram", "timestamp", "permalink", "instagram.com"), ("facebook", "created_time", "permalink_url", "facebook.com")]:
        reader.session.get.return_value = response({"id": "111", field: NOW.isoformat(), urlfield: f"https://www.{host}/reel/ABC/"})
        post = reader.metadata({"platform": platform, "media_id": "111", "ledger_published_at": "2020-01-01T00:00:00Z"})
        assert post["published_at"] == NOW.isoformat()
    reader.session.get.return_value = response({"id": "111"})
    with pytest.raises(MetaReadError, match="actual_publication_time_unavailable"):
        reader.metadata({"platform": "instagram", "media_id": "111"})


def test_engagement_requires_reach_and_all_platform_components():
    for platform in ("instagram", "facebook"):
        m = all_metrics(platform)
        assert engagement(platform, m)["value"] is None  # zero reach
        m["reach"]["value"] = 100
        assert engagement(platform, m)["value"] == 0
        m["shares"]["value"] = 2
        assert engagement(platform, m)["value"] == .02
        m["comments"]["value"] = None
        assert engagement(platform, m)["value"] is None
    assert "saves" not in engagement("facebook", all_metrics("facebook"))["components"]


def test_report_geographic_sample_sizes_and_age_matched_period_comparisons():
    rows = []
    for period, value in [(0, 20), (1, 10)]:
        for i in range(3):
            published = NOW - timedelta(hours=48, days=2 + 7 * period, minutes=i)
            rows.append({"reel_id": REEL, "platform": "instagram", "media_id": str(period * 10 + i),
                         "window": "24h", "age_hours": 25, "live_test": False,
                         "published_at": published.isoformat(), "captured_at": (published + timedelta(hours=25)).isoformat(),
                         "post_url": "https://example.invalid", "geography": {"label": "Massachusetts"},
                         "metrics": {**all_metrics("instagram"), "reach": {"value": value, "reason": None}}})
    report = build_report([], rows, {}, NOW)
    reach = next(c for c in report["period_comparisons"] if c["metric"] == "reach")
    assert reach["current_n"] == 3 and reach["previous_n"] == 3 and reach["change_fraction"] == 1
    assert report["geography"][0]["n"] == 6 and report["geography"][0]["metrics"]["reach"]["mean"] == 15
    assert report["rankings"][0]["reels"][0]["value"] == 20
    assert "not directly comparable" in markdown(report)
    assert "Too little" in build_report([], [], {}, NOW)["takeaway"]


def test_storage_boundary_blocks_every_non_analytics_write_and_diagnostic_write():
    session = Mock(headers={})
    store = Store("https://example.supabase.co", "storage-key", session=session)
    forbidden = [("POST", "rest/v1/wing_media_submissions"), ("PATCH", "rest/v1/jalapeno_posts"),
                 ("POST", "object/jalapeno-assets/guess-wing-spot-v1/days/test.json"),
                 ("DELETE", "object/jalapeno-assets"), ("POST", "object/jalapeno-assets/guess-wing-spot-analytics-v1/../oops")]
    for method, path in forbidden:
        with pytest.raises(StorageError):
            store.request(method, path)
    with pytest.raises(StorageError):
        store.read("wing-shots/source.jpg")
    readonly = Store("https://example.supabase.co", "storage-key", session=session, readonly=True)
    with pytest.raises(StorageError):
        readonly.create("reports/1.1.json", {})
    session.request.assert_not_called()


def test_publication_hash_verification_detects_drift_and_reads_never_write():
    session = Mock(headers={})
    session.request.side_effect = [response(state()), response({"changed": True})]
    store = Store("https://example.supabase.co", "storage-key", session=session)
    store.read(PUBLICATIONS[0] + "days/2026-10-29/states/000001.json")
    with pytest.raises(StorageError, match="changed"):
        store.verify_publications_unchanged()
    assert all(x.args[0] == "GET" for x in session.request.call_args_list)


@pytest.mark.parametrize("instant,cron,expected", [("2026-10-30T00:30:00+00:00", "30 0 * * *", True),
    ("2026-10-30T01:30:00+00:00", "30 1 * * *", False),
    ("2026-11-03T01:30:00+00:00", "30 1 * * *", True),
    ("2026-11-03T00:30:00+00:00", "30 0 * * *", False)])
def test_schedule_dst(instant, cron, expected):
    assert schedule_gate(datetime.fromisoformat(instant), "schedule", cron) is expected


def test_workflow_and_imports_do_not_reach_legacy_writers_or_publisher():
    root = Path(__file__).resolve().parents[3]
    workflow = (root / ".github/workflows/jalapeno-metrics.yml").read_text()
    config = yaml.safe_load(workflow)
    assert config["permissions"] == {"contents": "read"}
    assert config["concurrency"] == {"group": "jalapeno-reel-analytics", "cancel-in-progress": False}
    assert "default: diagnostic" in workflow and "upload-artifact" not in workflow
    assert "main.py" not in workflow and "reel_metrics.py" in workflow
    package = root / "Agents/Jalapeno/reel_analytics"
    imports = []
    for path in package.glob("*.py"):
        tree = ast.parse(path.read_text())
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                imports += [a.name for a in node.names]
            elif isinstance(node, ast.ImportFrom):
                imports.append(node.module or "")
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
                assert node.func.attr not in {"publish", "patch", "delete", "put", "rpc", "execute_sql"}
    assert not any(any(banned in name for banned in ("guess_wing_spot", "jalapeno_db", "metrics_collector", "growth_loop", "sources", "supabase_client")) for name in imports)


def test_visibility_defaults_to_unverified_without_disclosure(monkeypatch):
    assert visibility({}) == "unverified"
    monkeypatch.setattr("reel_analytics.collector.requests.get", lambda *a, **k: response({"full_name": "owner/repo", "private": False}))
    assert visibility({"GITHUB_REPOSITORY": "owner/repo"}) == "public"


def test_public_actions_summary_never_contains_private_report(monkeypatch, tmp_path, capsys):
    from reel_analytics import collector
    result = {"health": {"discovered_posts": 2, "snapshots_collected": 0, "milestone_snapshots_collected": 0,
                         "current_age_snapshots_collected": 0, "too_young_for_milestones": 2,
                         "errors": [], "missing_metrics": {}},
              "protection": {}, "markdown": "PRIVATE METRICS AND GEOGRAPHY"}
    meta = Mock()
    meta.identity.return_value = {"permissions": {}}
    monkeypatch.setattr(collector, "MetaReader", lambda *a: meta)
    monkeypatch.setattr(collector, "Store", lambda *a, **k: Mock())
    monkeypatch.setattr(collector, "visibility", lambda env: "public")
    monkeypatch.setattr(collector, "collect", lambda *a, **k: result)
    path = tmp_path / "summary.md"
    env = {k: "test" for k in ("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "META_LONG_LIVED_ACCESS_TOKEN", "META_APP_SECRET",
                               "META_GRAPH_API_VERSION", "INSTAGRAM_BUSINESS_ACCOUNT_ID", "FACEBOOK_PAGE_ID",
                               "GUESS_EXPECTED_INSTAGRAM_USERNAME", "GUESS_EXPECTED_FACEBOOK_NAME")}
    env["GITHUB_STEP_SUMMARY"] = str(path)
    assert collector.main("diagnostic", env) == 0
    assert "PRIVATE" not in path.read_text() + capsys.readouterr().out


def test_storage_immutable_create_readback_and_duplicate():
    session = Mock(headers={})
    payload = {"value": 0, "missing": None}
    session.request.side_effect = [response({}, 200), response(payload), response({"error": "Duplicate"}, 409)]
    store = Store("https://example.supabase.co", "storage-key", session=session)
    assert store.create("snapshots/test.json", payload)
    assert not store.create("snapshots/test.json", {"value": 10})
    posts = [c for c in session.request.call_args_list if c.args[0] == "POST"]
    assert all(c.args[1].startswith(store.origin + "/storage/v1/object/jalapeno-assets/" + ANALYTICS) for c in posts)
    assert all(c.kwargs["headers"]["x-upsert"] == "false" for c in posts)


def test_one_failed_metric_does_not_block_other_supported_metrics():
    reader = MetaReader("user-token", "app-secret", "v25.0", session=Mock(), sleep=lambda _: None)
    reader.granted = PERMISSIONS["instagram"]
    def get(url, *, params, **kwargs):
        m = params["metric"]
        return response({"error": {"code": 100}}, 400) if m == "saved" else response(insight(m, 0))
    reader.session.get.side_effect = get
    metrics, raw, failures = reader.insights({"platform": "instagram", "media_id": "111"})
    assert metrics["views"]["value"] == 0 and metrics["shares"]["value"] == 0
    assert metrics["saves"]["value"] is None and failures == {"saved": "unsupported_or_unavailable"}
    assert "views" in raw and "saved" not in raw


def test_existing_earlier_snapshot_is_not_reported_as_missed():
    store = MemoryStore()
    collect(store, FakeMeta(age=25), mode="collect", now=NOW, clock=lambda: NOW, run_key="8.1")
    collect(store, FakeMeta(age=170), mode="collect", now=NOW, clock=lambda: NOW, run_key="9.1")
    seven = [v for k, v in store.data.items() if k.endswith("_7d.json")]
    assert all(s["missed_historical_windows"] == ["72h"] for s in seven)
