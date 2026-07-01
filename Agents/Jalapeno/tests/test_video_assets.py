from __future__ import annotations

from pathlib import Path
import sys

PROJECT_DIR = Path(__file__).resolve().parents[1]
if str(PROJECT_DIR) not in sys.path:
    sys.path.insert(0, str(PROJECT_DIR))

from config import load_configuration  # noqa: E402
from video_assets import VideoAssetRepository  # noqa: E402
from video_overlay import processed_storage_path, select_overlay_text  # noqa: E402


class _VideoAssetClient:
    def __init__(self) -> None:
        self.filters: dict[str, object] | None = None

    def fetch_rows(self, table_name: str, *, filters=None, select: str = "*"):
        assert table_name == "jalapeno_video_assets"
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

    def storage_public_url(self, bucket: str, storage_path: str) -> str:
        return f"https://example.com/{bucket}/{storage_path}"


def test_video_asset_repository_filters_to_configured_bucket() -> None:
    config = load_configuration(env_path=PROJECT_DIR / ".missing-test-env", config_path=PROJECT_DIR / "config.yaml")
    client = _VideoAssetClient()

    assets = VideoAssetRepository(client, config).list_active_assets()  # type: ignore[arg-type]

    assert client.filters is not None
    assert client.filters["storage_bucket"] == "eq.jalapeno-wing-videos"
    assert assets[0].storage_bucket == "jalapeno-wing-videos"


def test_overlay_text_uses_caption_hook_without_hashtags() -> None:
    text = select_overlay_text("Daily wing reel because the scroll deserved sauce.\n\n#Buffago #WingNight")

    assert text == "DAILY WING REEL BECAUSE THE SCROLL DESERVED SAUCE"
    assert "#" not in text


def test_overlay_text_falls_back_for_generic_caption() -> None:
    assert select_overlay_text("8pm wing check.\n\n#Buffago") == "SAUCY WING NIGHT"


def test_processed_storage_path_uses_processed_folder_and_texted_suffix() -> None:
    assert processed_storage_path("uploads/wings/fire-clip.mp4") == "processed/fire-clip_texted.mp4"
