from __future__ import annotations

from dataclasses import replace
from datetime import datetime, timezone
from io import StringIO
from pathlib import Path
import sys

PROJECT_DIR = Path(__file__).resolve().parents[1]
if str(PROJECT_DIR) not in sys.path:
    sys.path.insert(0, str(PROJECT_DIR))

import metrics_collector as metrics_module  # noqa: E402
import main as main_module  # noqa: E402
from config import load_configuration  # noqa: E402
from config import initialize_logging  # noqa: E402


POST_ID = "11111111-1111-1111-1111-111111111111"
RUN_ID = "22222222-2222-2222-2222-222222222222"


class _FakeSupabaseClient:
    def __init__(self, *, metric_rows: list[dict] | None = None) -> None:
        self.metric_rows = metric_rows or []
        row = {
            "id": POST_ID,
            "post_id": POST_ID,
            "run_id": RUN_ID,
            "generated_caption": "caption",
            "hashtags": ["buffago"],
            "post_type": "daily_wing_reel",
            "instagram_media_id": "18142131364537604",
            "instagram_permalink": "https://instagram.com/p/correct/",
            "published_at": "2026-07-01T03:17:00+00:00",
            "publish_status": "published",
            "metrics_status": None,
            "metrics_error_type": None,
            "metrics_disabled_at": None,
            "metrics_last_error": {},
            "image_url": "https://cdn.example.com/uploads/wing.jpg",
            "video_url": "https://cdn.example.com/uploads/wing.mp4",
            "storage_path": "posts/wing.mp4",
            "metadata": {"caption_type": "short", "video_style": "wing_closeup"},
            "caption": "caption",
            "hashtags": ["buffago"],
            "scheduled_post_type": "daily_wing_reel",
            "published_media_id": "18142131364537604",
            "status": "published",
            "permalink": "https://instagram.com/p/correct/",
        }
        self.post_rows = [row]
        self.instagram_post_rows = self.post_rows
        self.inserted_metrics: list[dict] = []
        self.inserted_errors: list[dict] = []

    def fetch_rows(self, table_name: str, *, filters: dict | None = None, select: str = "*") -> list[dict]:
        if table_name == "jalapeno_posts":
            return [dict(row) for row in self.post_rows]
        if table_name == "jalapeno_instagram_posts":
            return [dict(row) for row in self.instagram_post_rows]
        if table_name == "jalapeno_post_metrics":
            return list(self.metric_rows)
        return []

    def insert_row(self, table_name: str, payload: dict) -> list[dict]:
        if table_name == "jalapeno_post_metrics":
            self.inserted_metrics.append(payload)
        if table_name == "jalapeno_errors":
            self.inserted_errors.append(payload)
        return [payload]

    def update_rows(self, table_name: str, filters: dict, payload: dict) -> list[dict]:
        if table_name == "jalapeno_posts":
            post_id = str(filters.get("id", "")).removeprefix("eq.")
            for index, row in enumerate(self.post_rows):
                if str(row.get("id")) == post_id:
                    updated = dict(row)
                    updated.update(payload)
                    self.post_rows[index] = updated
                    return [updated]
        if table_name == "jalapeno_instagram_posts":
            post_id = str(filters.get("post_id", "")).removeprefix("eq.")
            for index, row in enumerate(self.instagram_post_rows):
                if str(row.get("post_id") or row.get("id")) == post_id:
                    updated = dict(row)
                    updated.update(payload)
                    self.instagram_post_rows[index] = updated
                    return [updated]
        return [payload]


class _FakeGraphClient:
    def __init__(self, **kwargs) -> None:
        self.kwargs = kwargs

    def get_media_metrics(self, media_id: str) -> dict:
        return {
            "id": media_id,
            "media_type": "REELS",
            "like_count": 10,
            "comments_count": 2,
            "saved": 3,
            "shares": 1,
            "reach": 100,
            "requested_insight_metrics": ["reach", "plays", "saved", "shares", "total_interactions"],
            "returned_insight_metrics": ["reach", "saved", "shares"],
            "missing_insight_metrics": ["plays", "total_interactions"],
            "media_details_endpoint": f"/{media_id}?fields=id,caption,media_type,media_product_type,permalink,timestamp,media_url,thumbnail_url,like_count,comments_count",
            "insights_endpoint": f"/{media_id}/insights",
        }

    def get_media_details_safe(self, media_id: str):
        return (
            {
                "id": media_id,
                "caption": "caption",
                "permalink": "https://instagram.com/p/correct/",
                "timestamp": "2026-07-01T03:17:00+00:00",
                "media_type": "REELS",
                "media_product_type": "REELS",
            },
            None,
        )

    def describe_media_details_endpoint(self, media_id: str) -> str:
        return f"/{media_id}?fields=id,caption,media_type,media_product_type,permalink,timestamp,media_url,thumbnail_url,like_count,comments_count"

    def describe_media_insights_endpoint(self, media_id: str, metric_name: str | None = None) -> str:
        return f"/{media_id}/insights?metric={metric_name}" if metric_name else f"/{media_id}/insights"

    def get_me(self, *, fields: str = "id,name") -> dict:
        return {"id": "me-1", "name": "Buffago"}

    def get_me_accounts(self, *, fields: str = "id,name,instagram_business_account{id,username}", limit: int = 100) -> dict:
        return {
            "data": [
                {
                    "id": "facebook-page-id",
                    "name": "Buffago",
                    "instagram_business_account": {"id": "instagram-business-account-id", "username": "buffago"},
                }
            ]
        }

    def get_recent_media(self, *, limit: int = 25) -> list[dict]:
        return [
            {
                "id": "18142131364537604",
                "caption": "caption",
                "permalink": "https://instagram.com/p/correct/",
                "timestamp": "2026-07-01T03:17:00+00:00",
                "media_type": "REELS",
                "media_product_type": "REELS",
                "media_url": "https://cdn.example.com/uploads/wing.mp4",
            }
        ]


def _config():
    config = load_configuration(env_path=PROJECT_DIR / ".missing-test-env", config_path=PROJECT_DIR / "config.yaml")
    return replace(config, log_directory=PROJECT_DIR / "tmp" / "pytest-metrics")


def test_backfill_uses_instagram_post_published_media_id_and_labels_window(monkeypatch) -> None:
    monkeypatch.setenv("META_LONG_LIVED_ACCESS_TOKEN", "test-token")
    monkeypatch.setenv("INSTAGRAM_BUSINESS_ACCOUNT_ID", "test-ig-user")
    monkeypatch.setattr(metrics_module, "InstagramGraphClient", _FakeGraphClient)
    client = _FakeSupabaseClient()

    result = metrics_module.collect_instagram_metrics(
        _config(),
        client,
        now=datetime(2026, 7, 5, 3, 17, tzinfo=timezone.utc),
        backfill=True,
    )

    assert result.checked_posts == 1
    assert result.candidate_count == 1
    assert result.snapshots_persisted == 1
    inserted = client.inserted_metrics[0]
    assert inserted["instagram_media_id"] == "18142131364537604"
    assert inserted["metadata"]["collection_window"] == "72h"
    assert inserted["metadata"]["backfill"] is True
    assert inserted["raw_metrics"]["missing_insight_metrics"] == ["plays", "total_interactions"]


def test_existing_window_skips_duplicate(monkeypatch) -> None:
    monkeypatch.setenv("META_LONG_LIVED_ACCESS_TOKEN", "test-token")
    monkeypatch.setenv("INSTAGRAM_BUSINESS_ACCOUNT_ID", "test-ig-user")
    monkeypatch.setattr(metrics_module, "InstagramGraphClient", _FakeGraphClient)
    client = _FakeSupabaseClient(metric_rows=[{"post_id": POST_ID, "post_age_hours": 73.0, "metadata": {}}])

    result = metrics_module.collect_instagram_metrics(
        _config(),
        client,
        now=datetime(2026, 7, 5, 3, 17, tzinfo=timezone.utc),
        backfill=True,
    )

    assert result.checked_posts == 0
    assert result.skipped_duplicates == 1
    assert client.inserted_metrics == []


def test_metrics_dry_run_does_not_require_meta_token(monkeypatch) -> None:
    monkeypatch.delenv("META_LONG_LIVED_ACCESS_TOKEN", raising=False)
    monkeypatch.setenv("INSTAGRAM_BUSINESS_ACCOUNT_ID", "test-ig-user")
    client = _FakeSupabaseClient()

    result = metrics_module.collect_instagram_metrics(
        _config(),
        client,
        now=datetime(2026, 7, 5, 3, 17, tzinfo=timezone.utc),
        backfill=True,
        dry_run=True,
    )

    assert result.checked_posts == 1
    assert result.dry_run is True
    assert result.snapshots_persisted == 0
    assert client.inserted_metrics == []


def test_metrics_disabled_at_row_is_excluded_from_candidate_selection(monkeypatch) -> None:
    monkeypatch.setenv("META_LONG_LIVED_ACCESS_TOKEN", "test-token")
    monkeypatch.setenv("INSTAGRAM_BUSINESS_ACCOUNT_ID", "test-ig-user")
    monkeypatch.setattr(metrics_module, "InstagramGraphClient", _FakeGraphClient)
    client = _FakeSupabaseClient()
    client.instagram_post_rows[0]["metrics_disabled_at"] = "2026-07-04T00:00:00+00:00"

    result = metrics_module.collect_instagram_metrics(
        _config(),
        client,
        now=datetime(2026, 7, 5, 3, 17, tzinfo=timezone.utc),
        backfill=True,
    )

    assert result.candidate_count == 0
    assert result.checked_posts == 0
    assert client.inserted_metrics == []


def test_media_unreadable_status_row_is_excluded_from_candidate_selection(monkeypatch) -> None:
    monkeypatch.setenv("META_LONG_LIVED_ACCESS_TOKEN", "test-token")
    monkeypatch.setenv("INSTAGRAM_BUSINESS_ACCOUNT_ID", "test-ig-user")
    monkeypatch.setattr(metrics_module, "InstagramGraphClient", _FakeGraphClient)
    client = _FakeSupabaseClient()
    client.instagram_post_rows[0]["metrics_status"] = "media_unreadable"

    result = metrics_module.collect_instagram_metrics(
        _config(),
        client,
        now=datetime(2026, 7, 5, 3, 17, tzinfo=timezone.utc),
        backfill=True,
    )

    assert result.candidate_count == 0
    assert result.checked_posts == 0
    assert client.inserted_metrics == []


def test_classify_code_100_subcode_33_is_not_token_expired() -> None:
    error = metrics_module.SupabaseError(
        'Instagram Graph API media details failed (400): {"error":{"message":"Unsupported get request","type":"GraphMethodException","code":100,"error_subcode":33}}'
    )

    assert metrics_module.classify_meta_error(error) == "meta_media_unreadable_or_missing_permission"


def test_classify_code_10_permission_denied_is_not_token_expired() -> None:
    error = metrics_module.SupabaseError(
        'Instagram Graph API insights failed (400): {"error":{"message":"Application does not have permission for this action","type":"OAuthException","code":10}}'
    )

    assert metrics_module.classify_meta_error(error) == "meta_permission_denied"


def test_diagnostics_detects_recent_media_mismatch(monkeypatch) -> None:
    monkeypatch.setenv("META_LONG_LIVED_ACCESS_TOKEN", "test-token")
    monkeypatch.setenv("INSTAGRAM_BUSINESS_ACCOUNT_ID", "instagram-business-account-id")
    monkeypatch.setenv("FACEBOOK_PAGE_ID", "facebook-page-id")

    class _MismatchGraphClient(_FakeGraphClient):
        def get_media_details_safe(self, media_id: str):
            if media_id == "18019561010853949":
                return None, {
                    "status_code": 400,
                    "error": {
                        "message": "Unsupported get request",
                        "type": "GraphMethodException",
                        "code": 100,
                        "error_subcode": 33,
                    },
                }
            return super().get_media_details_safe(media_id)

    monkeypatch.setattr(metrics_module, "InstagramGraphClient", _MismatchGraphClient)

    class _MismatchClient(_FakeSupabaseClient):
        def fetch_rows(self, table_name: str, *, filters: dict | None = None, select: str = "*") -> list[dict]:
            rows = super().fetch_rows(table_name, filters=filters, select=select)
            if table_name == "jalapeno_posts":
                rows[0]["instagram_media_id"] = "18019561010853949"
                rows[0]["instagram_permalink"] = "https://instagram.com/p/correct/"
            return rows

    diagnostics = metrics_module.run_metrics_diagnostics(_config(), _MismatchClient())

    assert diagnostics.me_ok is True
    assert diagnostics.configured_page_found is True
    assert diagnostics.configured_ig_account_found is True
    assert diagnostics.stored_ids_unreadable == 1
    assert diagnostics.mismatch_count == 1
    assert diagnostics.repair_candidates[0]["proposed_instagram_media_id"] == "18142131364537604"


def test_diagnostics_sanitizes_reserved_log_keys_in_mismatch(monkeypatch) -> None:
    monkeypatch.setenv("META_LONG_LIVED_ACCESS_TOKEN", "test-token")
    monkeypatch.setenv("INSTAGRAM_BUSINESS_ACCOUNT_ID", "instagram-business-account-id")
    monkeypatch.setenv("FACEBOOK_PAGE_ID", "facebook-page-id")

    class _MismatchGraphClient(_FakeGraphClient):
        def get_media_details_safe(self, media_id: str):
            if media_id == "18019561010853949":
                return None, {
                    "status_code": 400,
                    "error": {
                        "message": "Unsupported get request",
                        "type": "GraphMethodException",
                        "code": 100,
                        "error_subcode": 33,
                    },
                }
            return super().get_media_details_safe(media_id)

    monkeypatch.setattr(metrics_module, "InstagramGraphClient", _MismatchGraphClient)

    class _MismatchClient(_FakeSupabaseClient):
        def fetch_rows(self, table_name: str, *, filters: dict | None = None, select: str = "*") -> list[dict]:
            rows = super().fetch_rows(table_name, filters=filters, select=select)
            if table_name == "jalapeno_posts":
                rows[0]["instagram_media_id"] = "18019561010853949"
                rows[0]["instagram_permalink"] = "https://instagram.com/p/correct/"
            return rows

    stream = StringIO()
    logger = initialize_logging(replace(_config(), log_directory=PROJECT_DIR / "tmp" / "pytest-metrics" / "logs"), stream=stream)

    diagnostics = metrics_module.run_metrics_diagnostics(_config(), _MismatchClient(), logger=logger)

    assert diagnostics.mismatch_count == 1
    log_output = stream.getvalue()
    assert f"mismatch_run_id={RUN_ID}" in log_output
    assert "stored_instagram_media_id=18019561010853949" in log_output
    assert "proposed_instagram_media_id=18142131364537604" in log_output


def test_unreadable_media_failure_does_not_set_action_required(monkeypatch) -> None:
    monkeypatch.setenv("META_LONG_LIVED_ACCESS_TOKEN", "test-token")
    monkeypatch.setenv("INSTAGRAM_BUSINESS_ACCOUNT_ID", "test-ig-user")

    class _UnreadableGraphClient(_FakeGraphClient):
        def get_media_details_safe(self, media_id: str):
            return None, {
                "status_code": 400,
                "error": {
                    "message": "Unsupported get request",
                    "type": "GraphMethodException",
                    "code": 100,
                    "error_subcode": 33,
                },
            }

    monkeypatch.setattr(metrics_module, "InstagramGraphClient", _UnreadableGraphClient)
    client = _FakeSupabaseClient()

    result = metrics_module.collect_instagram_metrics(
        _config(),
        client,
        now=datetime(2026, 7, 5, 3, 17, tzinfo=timezone.utc),
        backfill=True,
    )

    assert result.failures == 0
    assert result.action_required is False
    assert result.unreadable_media_ids == 1
    assert result.media_ids_marked_unreadable == 1
    assert client.inserted_errors == []
    assert client.post_rows[0]["metrics_status"] == "media_unreadable"
    assert client.post_rows[0]["metrics_error_type"] == "instagram_media_deleted_or_inaccessible"
    assert client.post_rows[0]["metrics_last_error"]["action_taken"] == "marked_media_unreadable"
    assert client.instagram_post_rows[0]["metrics_disabled_at"] == "2026-07-05T03:17:00+00:00"
    assert client.inserted_metrics == []


def test_insights_permission_denied_sets_action_required(monkeypatch) -> None:
    monkeypatch.setenv("META_LONG_LIVED_ACCESS_TOKEN", "test-token")
    monkeypatch.setenv("INSTAGRAM_BUSINESS_ACCOUNT_ID", "test-ig-user")

    class _PermissionDeniedGraphClient(_FakeGraphClient):
        def get_media_details_safe(self, media_id: str):
            return super().get_media_details_safe(media_id)

        def get_media_metrics(self, media_id: str) -> dict:
            return {
                "id": media_id,
                "requested_insight_metrics": ["reach", "plays", "saved", "shares", "total_interactions"],
                "returned_insight_metrics": [],
                "missing_insight_metrics": ["reach", "plays", "saved", "shares", "total_interactions"],
                "insight_errors": {
                    "reach": 'Instagram Graph API insights failed (400): {"error":{"message":"Application does not have permission for this action","type":"OAuthException","code":10}}'
                },
                "media_details_endpoint": f"/{media_id}?fields=id,caption,media_type,media_product_type,permalink,timestamp,media_url,thumbnail_url,like_count,comments_count",
                "insights_endpoint": f"/{media_id}/insights",
            }

    monkeypatch.setattr(metrics_module, "InstagramGraphClient", _PermissionDeniedGraphClient)
    client = _FakeSupabaseClient()

    result = metrics_module.collect_instagram_metrics(
        _config(),
        client,
        now=datetime(2026, 7, 5, 3, 17, tzinfo=timezone.utc),
        backfill=True,
    )

    assert result.failures == 1
    assert result.action_required is True
    assert result.meta_permission_failures == 1
    assert result.token_expired_failures == 0
    assert client.inserted_errors[0]["error_type"] == "meta_permission_denied"
    assert client.inserted_errors[0]["raw_payload"]["meta_endpoint"].endswith("/18142131364537604/insights")


def test_repair_mode_updates_stored_media_id_when_match_found(monkeypatch) -> None:
    monkeypatch.setenv("META_LONG_LIVED_ACCESS_TOKEN", "test-token")
    monkeypatch.setenv("INSTAGRAM_BUSINESS_ACCOUNT_ID", "instagram-business-account-id")
    monkeypatch.setenv("FACEBOOK_PAGE_ID", "facebook-page-id")

    class _RepairGraphClient(_FakeGraphClient):
        def get_media_details_safe(self, media_id: str):
            if media_id == "18019561010853949":
                return None, {
                    "status_code": 400,
                    "error": {
                        "message": "Unsupported get request",
                        "type": "GraphMethodException",
                        "code": 100,
                        "error_subcode": 33,
                    },
                }
            return super().get_media_details_safe(media_id)

    monkeypatch.setattr(metrics_module, "InstagramGraphClient", _RepairGraphClient)

    class _RepairClient(_FakeSupabaseClient):
        def __init__(self) -> None:
            super().__init__()
            self.post_rows[0]["instagram_media_id"] = "18019561010853949"
            self.post_rows[0]["instagram_permalink"] = "https://instagram.com/p/correct/"
            self.instagram_post_rows[0]["published_media_id"] = "18019561010853949"
            self.instagram_post_rows[0]["metrics_status"] = "media_unreadable"
            self.instagram_post_rows[0]["metrics_disabled_at"] = "2026-07-04T00:00:00+00:00"

    client = _RepairClient()

    result = metrics_module.collect_instagram_metrics(
        _config(),
        client,
        now=datetime(2026, 7, 5, 3, 17, tzinfo=timezone.utc),
        backfill=True,
        repair_media_ids=True,
    )

    assert result.repair_candidates == 1
    assert result.repaired_media_ids == 1
    assert result.candidate_count == 1
    assert client.post_rows[0]["instagram_media_id"] == "18142131364537604"
    assert client.inserted_metrics[0]["instagram_media_id"] == "18142131364537604"


def test_run_metrics_returns_nonzero_when_failures_persist_zero_snapshots(monkeypatch) -> None:
    class _Result:
        candidate_count = 1
        checked_posts = 1
        snapshots_persisted = 0
        skipped_duplicates = 0
        failures = 1
        unreadable_media_ids = 1
        media_ids_marked_unreadable = 0
        meta_permission_failures = 0
        token_expired_failures = 1
        dry_run = False
        repair_candidates = 0
        repaired_media_ids = 0
        action_required = False
        diagnostics_result = None

    monkeypatch.setattr(main_module, "_load_live_client_and_config", lambda mode: (_config(), object(), object()))
    monkeypatch.setattr(main_module, "collect_instagram_metrics", lambda *args, **kwargs: _Result())

    exit_code = main_module.run_metrics()

    assert exit_code == 2


def test_run_metrics_exits_zero_when_only_unreadable_rows_are_marked(monkeypatch) -> None:
    class _Result:
        candidate_count = 1
        checked_posts = 1
        snapshots_persisted = 0
        skipped_duplicates = 0
        failures = 0
        unreadable_media_ids = 1
        media_ids_marked_unreadable = 1
        meta_permission_failures = 0
        token_expired_failures = 0
        dry_run = False
        repair_candidates = 0
        repaired_media_ids = 0
        action_required = False
        diagnostics_result = None

    monkeypatch.setattr(main_module, "_load_live_client_and_config", lambda mode: (_config(), object(), object()))
    monkeypatch.setattr(main_module, "collect_instagram_metrics", lambda *args, **kwargs: _Result())

    exit_code = main_module.run_metrics()

    assert exit_code == 0
