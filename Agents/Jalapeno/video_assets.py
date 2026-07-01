from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

from config import JalapenoConfig
from logging_utils import log_event
from supabase_client import SupabaseClient, SupabaseError


VIDEO_EXTENSIONS = (".mp4", ".mov", ".m4v", ".webm")


class VideoAssetError(RuntimeError):
    pass


@dataclass(frozen=True, slots=True)
class VideoAsset:
    id: str
    storage_bucket: str
    storage_path: str
    public_url: str
    style: str | None
    caption_type: str | None
    used_count: int
    last_used_at: str | None
    performance_score: float | None
    metadata: dict[str, Any]


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _parse_dt(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _is_video_path(path: str) -> bool:
    return path.lower().endswith(VIDEO_EXTENSIONS)


def _storage_public_url(client: SupabaseClient, bucket: str, path: str, public_url: Any) -> str:
    if isinstance(public_url, str) and public_url.strip():
        return public_url.strip()
    return client.storage_public_url(bucket, path)


class VideoAssetRepository:
    def __init__(self, client: SupabaseClient, config: JalapenoConfig, *, logger=None) -> None:
        self.client = client
        self.config = config
        self.logger = logger
        self.bucket = config.video.bucket

    def list_active_assets(self) -> list[VideoAsset]:
        rows = self.client.fetch_rows(
            "jalapeno_video_assets",
            select="*",
            filters={
                "active": "eq.true",
                "storage_bucket": f"eq.{self.bucket}",
                "order": "last_used_at.asc.nullsfirst,used_count.asc",
                "limit": 500,
            },
        )
        return [self._from_row(row) for row in rows if isinstance(row.get("storage_path"), str)]

    def ensure_assets_available(self) -> list[VideoAsset]:
        assets = self.list_active_assets()
        if assets:
            return assets
        log_event(self.logger, "video_asset_table_empty_autoregister_started", bucket=self.bucket)
        self.auto_register_storage_objects()
        return self.list_active_assets()

    def select_asset(self, *, excluded_ids: set[str] | None = None) -> VideoAsset:
        excluded_ids = excluded_ids or set()
        assets = [asset for asset in self.ensure_assets_available() if asset.id not in excluded_ids]
        if not assets:
            raise VideoAssetError("no_video_assets: no active Supabase video assets are available")

        cutoff = _utcnow() - timedelta(days=self.config.video.recent_reuse_days)
        not_recent = [
            asset for asset in assets
            if asset.last_used_at is None or (_parse_dt(asset.last_used_at) or datetime.min.replace(tzinfo=timezone.utc)) < cutoff
        ]
        pool = not_recent if not_recent else assets
        selected = sorted(
            pool,
            key=lambda asset: (
                asset.last_used_at is not None,
                _parse_dt(asset.last_used_at) or datetime.min.replace(tzinfo=timezone.utc),
                asset.used_count,
                -(asset.performance_score or 0.0),
            ),
        )[0]
        log_event(
            self.logger,
            "video_asset_selected",
            video_asset_id=selected.id,
            storage_bucket=selected.storage_bucket,
            storage_path=selected.storage_path,
            used_count=selected.used_count,
            last_used_at=selected.last_used_at,
            recent_reuse_days=self.config.video.recent_reuse_days,
        )
        return selected

    def increment_used(self, asset: VideoAsset) -> None:
        self.client.update_rows(
            "jalapeno_video_assets",
            {"id": f"eq.{asset.id}"},
            {"used_count": asset.used_count + 1, "last_used_at": _utcnow().isoformat()},
        )

    def auto_register_storage_objects(self) -> int:
        if not self.client.storage_bucket_exists(self.bucket):
            raise VideoAssetError(f"missing_video_bucket: Supabase storage bucket '{self.bucket}' is not accessible")
        try:
            objects = self.client.list_storage_objects(self.bucket)
        except SupabaseError as exc:
            raise VideoAssetError(f"video_bucket_list_failed: {exc}") from exc
        inserted = 0
        for item in objects:
            name = str(item.get("name") or "").strip()
            if not name or name.endswith("/") or not _is_video_path(name):
                continue
            payload = {
                "storage_bucket": self.bucket,
                "storage_path": name,
                "public_url": self.client.storage_public_url(self.bucket, name),
                "active": True,
                "notes": "Auto-registered from Supabase Storage",
            }
            self.client.upsert_rows("jalapeno_video_assets", payload, on_conflict="storage_path")
            inserted += 1
        log_event(self.logger, "video_asset_autoregister_completed", bucket=self.bucket, registered_count=inserted)
        return inserted

    def _from_row(self, row: dict[str, Any]) -> VideoAsset:
        bucket = str(row.get("storage_bucket") or self.bucket)
        path = str(row.get("storage_path") or "")
        return VideoAsset(
            id=str(row.get("id") or ""),
            storage_bucket=bucket,
            storage_path=path,
            public_url=_storage_public_url(self.client, bucket, path, row.get("public_url")),
            style=str(row.get("style")).strip() if row.get("style") else None,
            caption_type=str(row.get("caption_type")).strip() if row.get("caption_type") else None,
            used_count=int(row.get("used_count") or 0),
            last_used_at=str(row.get("last_used_at")) if row.get("last_used_at") else None,
            performance_score=float(row["performance_score"]) if isinstance(row.get("performance_score"), (int, float)) else None,
            metadata=row,
        )
