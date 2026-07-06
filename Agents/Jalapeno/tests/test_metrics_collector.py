from __future__ import annotations

from dataclasses import replace
from datetime import datetime, timezone
from pathlib import Path
import sys

PROJECT_DIR = Path(__file__).resolve().parents[1]
if str(PROJECT_DIR) not in sys.path:
    sys.path.insert(0, str(PROJECT_DIR))

import metrics_collector as metrics_module  # noqa: E402
from config import load_configuration  # noqa: E402


POST_ID = "11111111-1111-1111-1111-111111111111"
RUN_ID = "22222222-2222-2222-2222-222222222222"


class _FakeSupabaseClient:
    def __init__(self, *, metric_rows: list[dict] | None = None) -> None:
        self.metric_rows = metric_rows or []
        self.inserted_metrics: list[dict] = []
        self.inserted_errors: list[dict] = []

    def fetch_rows(self, table_name: str, *, filters: dict | None = None, select: str = "*") -> list[dict]:
        if table_name == "jalapeno_posts":
            return [
                {
                    "id": POST_ID,
                    "run_id": RUN_ID,
                    "generated_caption": "caption",
                    "hashtags": ["buffago"],
                    "post_type": "daily_wing_reel",
                    "instagram_media_id": None,
                    "published_at": "2026-07-01T03:17:00+00:00",
                    "publish_status": "published",
                    "metadata": {"caption_type": "short", "video_style": "wing_closeup"},
                }
            ]
        if table_name == "jalapeno_instagram_posts":
            return [
                {
                    "post_id": POST_ID,
                    "run_id": RUN_ID,
                    "caption": "caption",
                    "hashtags": ["buffago"],
                    "scheduled_post_type": "daily_wing_reel",
                    "published_media_id": "18142131364537604",
                    "published_at": "2026-07-01T03:17:00+00:00",
                    "status": "published",
                    "metadata": {},
                }
            ]
        if table_name == "jalapeno_post_metrics":
            return list(self.metric_rows)
        return []

    def insert_row(self, table_name: str, payload: dict) -> list[dict]:
        if table_name == "jalapeno_post_metrics":
            self.inserted_metrics.append(payload)
        if table_name == "jalapeno_errors":
            self.inserted_errors.append(payload)
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
        }

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


def test_classify_code_100_subcode_33_is_not_token_expired() -> None:
    error = metrics_module.SupabaseError(
        'Instagram Graph API media details failed (400): {"error":{"message":"Unsupported get request","type":"GraphMethodException","code":100,"error_subcode":33}}'
    )

    assert metrics_module.classify_meta_error(error) == "meta_media_unreadable_or_missing_permission"


def test_diagnostics_detects_recent_media_mismatch(monkeypatch) -> None:
    monkeypatch.setenv("META_LONG_LIVED_ACCESS_TOKEN", "test-token")
    monkeypatch.setenv("INSTAGRAM_BUSINESS_ACCOUNT_ID", "instagram-business-account-id")
    monkeypatch.setenv("FACEBOOK_PAGE_ID", "facebook-page-id")
    monkeypatch.setattr(metrics_module, "InstagramGraphClient", _FakeGraphClient)

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
    assert diagnostics.mismatch_count == 1
    assert diagnostics.repair_candidates[0]["proposed_instagram_media_id"] == "18142131364537604"


def test_unreadable_media_failure_does_not_set_action_required(monkeypatch) -> None:
    monkeypatch.setenv("META_LONG_LIVED_ACCESS_TOKEN", "test-token")
    monkeypatch.setenv("INSTAGRAM_BUSINESS_ACCOUNT_ID", "test-ig-user")

    class _UnreadableGraphClient(_FakeGraphClient):
        def get_media_metrics(self, media_id: str) -> dict:
            raise metrics_module.SupabaseError(
                'Instagram Graph API media details failed (400): {"error":{"message":"Unsupported get request","type":"GraphMethodException","code":100,"error_subcode":33}}'
            )

    monkeypatch.setattr(metrics_module, "InstagramGraphClient", _UnreadableGraphClient)
    client = _FakeSupabaseClient()

    result = metrics_module.collect_instagram_metrics(
        _config(),
        client,
        now=datetime(2026, 7, 5, 3, 17, tzinfo=timezone.utc),
        backfill=True,
    )

    assert result.failures == 1
    assert result.action_required is False
    assert client.inserted_errors[0]["error_type"] == "meta_media_unreadable_or_missing_permission"
