from __future__ import annotations

from pathlib import Path
import sys
from datetime import datetime, timedelta, timezone
from uuid import uuid4

PROJECT_DIR = Path(__file__).resolve().parents[1]
if str(PROJECT_DIR) not in sys.path:
    sys.path.insert(0, str(PROJECT_DIR))

from config import load_configuration  # noqa: E402
from video_assets import VideoAssetError, VideoAssetRepository  # noqa: E402
from video_overlay import processed_storage_path, select_overlay_text  # noqa: E402


class _VideoAssetClient:
    def __init__(self, *, post_rows=None) -> None:
        self.filters: dict[str, object] | None = None
        self.post_filters: dict[str, object] | None = None
        self.post_rows = list(post_rows or [])

    def fetch_rows(self, table_name: str, *, filters=None, select: str = "*"):
        if table_name == "jalapeno_video_assets":
            self.filters = dict(filters or {})
            return [
                {
                    "id": "11111111-1111-1111-1111-111111111111",
                    "storage_bucket": "jalapeno-wing-videos",
                    "storage_path": "primary.mp4",
                    "public_url": "https://example.com/primary.mp4",
                    "active": True,
                    "used_count": 4,
                    "last_used_at": "2026-06-01T00:00:00+00:00",
                    "performance_score": 0.3,
                },
                {
                    "id": "22222222-2222-2222-2222-222222222222",
                    "storage_bucket": "other-bucket",
                    "storage_path": "other.mp4",
                    "public_url": "https://example.com/other.mp4",
                    "active": True,
                    "used_count": 0,
                    "last_used_at": None,
                },
            ]
        assert table_name == "jalapeno_posts"
        self.post_filters = dict(filters or {})
        rows = list(self.post_rows)
        filters = self.post_filters
        publish_status_filter = filters.get("publish_status")
        if isinstance(publish_status_filter, str) and publish_status_filter.startswith("in.(") and publish_status_filter.endswith(")"):
            allowed_statuses = {
                status.strip()
                for status in publish_status_filter[len("in.(") : -1].split(",")
                if status.strip()
            }
            rows = [row for row in rows if str(row.get("publish_status")) in allowed_statuses]
        published_after_filter = filters.get("published_at")
        if isinstance(published_after_filter, str) and published_after_filter.startswith("gte."):
            cutoff = datetime.fromisoformat(published_after_filter[4:])
            rows = [
                row
                for row in rows
                if isinstance(row.get("published_at"), str)
                and datetime.fromisoformat(str(row["published_at"])) >= cutoff
            ]
        return rows

    def storage_public_url(self, bucket: str, storage_path: str) -> str:
        return f"https://example.com/{bucket}/{storage_path}"


class _SelectionClient(_VideoAssetClient):
    def __init__(self, assets, *, post_rows=None) -> None:
        super().__init__(post_rows=post_rows)
        self.assets = list(assets)

    def fetch_rows(self, table_name: str, *, filters=None, select: str = "*"):
        if table_name == "jalapeno_video_assets":
            self.filters = dict(filters or {})
            return list(self.assets)
        return super().fetch_rows(table_name, filters=filters, select=select)


class _Logger:
    def __init__(self) -> None:
        self.records = []

    def info(self, message, *args, **kwargs) -> None:
        self.records.append(("info", message % args if args else message))

    def warning(self, message, *args, **kwargs) -> None:
        self.records.append(("warning", message % args if args else message))


def _asset_row(
    asset_id: str,
    storage_path: str,
    *,
    public_url: str | None = None,
    reuse_enabled: bool = True,
    used_count: int = 0,
    last_used_at: str | None = None,
    performance_score: float | None = None,
) -> dict[str, object]:
    return {
        "id": asset_id,
        "storage_bucket": "jalapeno-wing-videos",
        "storage_path": storage_path,
        "public_url": public_url or f"https://example.com/{storage_path}",
        "reuse_enabled": reuse_enabled,
        "active": True,
        "used_count": used_count,
        "last_used_at": last_used_at,
        "performance_score": performance_score,
    }


def _post_row(
    *,
    publish_status: str = "published",
    published_at: str,
    video_asset_id: str | None = None,
    storage_path: str | None = None,
    video_url: str | None = None,
    original_video_url: str | None = None,
    processed_video_url: str | None = None,
    original_storage_path: str | None = None,
    processed_storage_path: str | None = None,
    media_source: str = "supabase_video_asset",
    post_type: str = "daily_wing_reel",
) -> dict[str, object]:
    return {
        "publish_status": publish_status,
        "published_at": published_at,
        "post_type": post_type,
        "media_source": media_source,
        "video_asset_id": video_asset_id,
        "storage_path": storage_path,
        "original_storage_path": original_storage_path,
        "processed_storage_path": processed_storage_path,
        "video_url": video_url,
        "original_video_url": original_video_url,
        "processed_video_url": processed_video_url,
        "image_url": None,
    }


def test_video_asset_repository_filters_to_configured_bucket() -> None:
    config = load_configuration(env_path=PROJECT_DIR / ".missing-test-env", config_path=PROJECT_DIR / "config.yaml")
    client = _VideoAssetClient()

    assets = VideoAssetRepository(client, config).list_active_assets()  # type: ignore[arg-type]

    assert client.filters is not None
    assert client.filters["storage_bucket"] == "eq.jalapeno-wing-videos"
    assert assets[0].storage_bucket == "jalapeno-wing-videos"
    assert assets[0].reuse_enabled is True
    assert config.video.reuse_cooldown_days == 30


def test_recently_used_video_is_excluded() -> None:
    config = load_configuration(env_path=PROJECT_DIR / ".missing-test-env", config_path=PROJECT_DIR / "config.yaml")
    assets = [
        _asset_row("11111111-1111-1111-1111-111111111111", "used.mp4"),
        _asset_row("22222222-2222-2222-2222-222222222222", "fresh.mp4"),
    ]
    recent = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    client = _SelectionClient(
        assets,
        post_rows=[_post_row(published_at=recent, video_asset_id="11111111-1111-1111-1111-111111111111", storage_path="used.mp4")],
    )

    selection = VideoAssetRepository(client, config).select_asset_with_history()  # type: ignore[arg-type]

    assert selection.asset.id == "22222222-2222-2222-2222-222222222222"
    assert selection.blocked_recent_use == 1
    assert selection.eligible_videos == 1


def test_unused_video_is_preferred() -> None:
    config = load_configuration(env_path=PROJECT_DIR / ".missing-test-env", config_path=PROJECT_DIR / "config.yaml")
    assets = [
        _asset_row("11111111-1111-1111-1111-111111111111", "used.mp4", used_count=0),
        _asset_row("22222222-2222-2222-2222-222222222222", "unused.mp4", used_count=5),
    ]
    recent = (datetime.now(timezone.utc) - timedelta(days=2)).isoformat()
    client = _SelectionClient(
        assets,
        post_rows=[_post_row(published_at=recent, storage_path="used.mp4", video_url="https://example.com/used.mp4")],
    )

    selection = VideoAssetRepository(client, config).select_asset_with_history()  # type: ignore[arg-type]

    assert selection.asset.storage_path == "unused.mp4"
    assert selection.used_fallback_reuse is False


def test_original_storage_path_blocks_reuse_when_processed_path_was_published() -> None:
    config = load_configuration(env_path=PROJECT_DIR / ".missing-test-env", config_path=PROJECT_DIR / "config.yaml")
    assets = [
        _asset_row("11111111-1111-1111-1111-111111111111", "source.mp4"),
        _asset_row("22222222-2222-2222-2222-222222222222", "fresh.mp4"),
    ]
    recent = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    client = _SelectionClient(
        assets,
        post_rows=[
            _post_row(
                published_at=recent,
                storage_path="processed/source_texted.mp4",
                original_storage_path="source.mp4",
                processed_storage_path="processed/source_texted.mp4",
            )
        ],
    )

    selection = VideoAssetRepository(client, config).select_asset_with_history()  # type: ignore[arg-type]

    assert selection.asset.storage_path == "fresh.mp4"
    assert selection.blocked_recent_use == 1


def test_video_used_31_days_ago_is_eligible() -> None:
    config = load_configuration(env_path=PROJECT_DIR / ".missing-test-env", config_path=PROJECT_DIR / "config.yaml")
    assets = [_asset_row("11111111-1111-1111-1111-111111111111", "old.mp4")]
    old = (datetime.now(timezone.utc) - timedelta(days=31)).isoformat()
    client = _SelectionClient(
        assets,
        post_rows=[_post_row(published_at=old, storage_path="old.mp4", video_url="https://example.com/old.mp4")],
    )

    selection = VideoAssetRepository(client, config).select_asset_with_history()  # type: ignore[arg-type]

    assert selection.asset.storage_path == "old.mp4"
    assert selection.blocked_recent_use == 0
    assert selection.eligible_videos == 1


def test_fallback_reuse_happens_only_when_every_video_is_blocked() -> None:
    config = load_configuration(env_path=PROJECT_DIR / ".missing-test-env", config_path=PROJECT_DIR / "config.yaml")
    assets = [
        _asset_row("11111111-1111-1111-1111-111111111111", "used-a.mp4", used_count=1),
        _asset_row("22222222-2222-2222-2222-222222222222", "used-b.mp4", used_count=2),
    ]
    recent = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    client = _SelectionClient(
        assets,
        post_rows=[
            _post_row(published_at=recent, video_asset_id="11111111-1111-1111-1111-111111111111", storage_path="used-a.mp4"),
            _post_row(published_at=recent, video_asset_id="22222222-2222-2222-2222-222222222222", storage_path="used-b.mp4"),
        ],
    )
    logger = _Logger()

    selection = VideoAssetRepository(client, config, logger=logger).select_asset_with_history()  # type: ignore[arg-type]

    assert selection.used_fallback_reuse is True
    assert selection.reuse_disabled_count == 0
    assert selection.blocked_recent_use == 2
    assert selection.eligible_videos == 0
    assert selection.asset.storage_path == "used-a.mp4"
    assert any("video_reuse_cooldown_exhausted" in message for _, message in logger.records)


def test_dry_run_and_failed_posts_do_not_block_reuse() -> None:
    config = load_configuration(env_path=PROJECT_DIR / ".missing-test-env", config_path=PROJECT_DIR / "config.yaml")
    assets = [_asset_row("11111111-1111-1111-1111-111111111111", "available.mp4")]
    recent = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    client = _SelectionClient(
        assets,
        post_rows=[
            _post_row(published_at=recent, publish_status="dry_run", storage_path="available.mp4"),
            _post_row(published_at=recent, publish_status="failed", storage_path="available.mp4"),
        ],
    )

    selection = VideoAssetRepository(client, config).select_asset_with_history()  # type: ignore[arg-type]

    assert selection.asset.storage_path == "available.mp4"
    assert selection.blocked_recent_use == 0


def test_reuse_enabled_defaults_true_when_column_missing() -> None:
    config = load_configuration(env_path=PROJECT_DIR / ".missing-test-env", config_path=PROJECT_DIR / "config.yaml")
    client = _SelectionClient(
        [
            {
                "id": str(uuid4()),
                "storage_bucket": "jalapeno-wing-videos",
                "storage_path": "default-true.mp4",
                "public_url": "https://example.com/default-true.mp4",
                "active": True,
                "used_count": 0,
                "last_used_at": None,
            }
        ]
    )

    asset = VideoAssetRepository(client, config).list_active_assets()[0]  # type: ignore[arg-type]

    assert asset.reuse_enabled is True


def test_reuse_disabled_video_is_excluded_from_normal_selection() -> None:
    config = load_configuration(env_path=PROJECT_DIR / ".missing-test-env", config_path=PROJECT_DIR / "config.yaml")
    recent = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    assets = [
        _asset_row("11111111-1111-1111-1111-111111111111", "1593.mp4", reuse_enabled=False, used_count=0),
        _asset_row("22222222-2222-2222-2222-222222222222", "fresh.mp4", reuse_enabled=True, used_count=3),
    ]
    client = _SelectionClient(
        assets,
        post_rows=[_post_row(published_at=recent, storage_path="something-else.mp4")],
    )
    logger = _Logger()

    selection = VideoAssetRepository(client, config, logger=logger).select_asset_with_history()  # type: ignore[arg-type]

    assert selection.asset.storage_path == "fresh.mp4"
    assert selection.reuse_disabled_count == 1
    assert any("video_asset_excluded_reuse_disabled" in message for _, message in logger.records)


def test_reuse_disabled_video_is_excluded_when_cooldown_is_exhausted() -> None:
    config = load_configuration(env_path=PROJECT_DIR / ".missing-test-env", config_path=PROJECT_DIR / "config.yaml")
    recent = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    assets = [
        _asset_row("11111111-1111-1111-1111-111111111111", "1594.mp4", reuse_enabled=False, used_count=0),
        _asset_row("22222222-2222-2222-2222-222222222222", "eligible-a.mp4", reuse_enabled=True, used_count=1),
        _asset_row("33333333-3333-3333-3333-333333333333", "eligible-b.mp4", reuse_enabled=True, used_count=2),
    ]
    client = _SelectionClient(
        assets,
        post_rows=[
            _post_row(published_at=recent, video_asset_id="22222222-2222-2222-2222-222222222222", storage_path="eligible-a.mp4"),
            _post_row(published_at=recent, video_asset_id="33333333-3333-3333-3333-333333333333", storage_path="eligible-b.mp4"),
        ],
    )
    logger = _Logger()

    selection = VideoAssetRepository(client, config, logger=logger).select_asset_with_history()  # type: ignore[arg-type]

    assert selection.used_fallback_reuse is True
    assert selection.asset.storage_path == "eligible-a.mp4"
    assert selection.reuse_disabled_count == 1
    assert all(selection.asset.storage_path != blocked for blocked in ("1593.mp4", "1594.mp4"))
    assert any("video_reuse_cooldown_exhausted" in message for _, message in logger.records)


def test_all_reuse_disabled_videos_fail_clearly() -> None:
    config = load_configuration(env_path=PROJECT_DIR / ".missing-test-env", config_path=PROJECT_DIR / "config.yaml")
    client = _SelectionClient(
        [
            _asset_row("11111111-1111-1111-1111-111111111111", "1593.mp4", reuse_enabled=False),
            _asset_row("22222222-2222-2222-2222-222222222222", "1594.mp4", reuse_enabled=False),
        ]
    )

    try:
        VideoAssetRepository(client, config).select_asset_with_history()  # type: ignore[arg-type]
        assert False, "expected VideoAssetError"
    except VideoAssetError as exc:
        assert "no_reusable_video_assets" in str(exc)
        assert "reuse_enabled=false" in str(exc)


def test_reuse_enabled_migration_disables_1593_and_1594_by_storage_path() -> None:
    migration = (
        PROJECT_DIR
        / "supabase"
        / "migrations"
        / "20260709000300_jalapeno_video_asset_reuse_enabled.sql"
    ).read_text(encoding="utf-8")

    assert "ADD COLUMN IF NOT EXISTS reuse_enabled boolean NOT NULL DEFAULT true" in migration
    assert "WHERE storage_path IN ('1593.mp4', '1594.mp4')" in migration


def test_overlay_text_uses_caption_hook_without_hashtags() -> None:
    text = select_overlay_text("Send this to someone who owes you wings.")

    assert text == "SEND THIS TO SOMEONE WHO OWES YOU WINGS"
    assert "#" not in text


def test_overlay_text_falls_back_for_generic_caption() -> None:
    assert select_overlay_text("8pm wing check.") == "FLATS OR DRUMS?\nPICK A SIDE."


def test_processed_storage_path_uses_processed_folder_and_texted_suffix() -> None:
    assert processed_storage_path("uploads/wings/fire-clip.mp4") == "processed/fire-clip_texted.mp4"
