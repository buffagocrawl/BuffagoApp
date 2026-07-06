from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import PurePosixPath
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


@dataclass(frozen=True, slots=True)
class VideoAssetSelection:
    asset: VideoAsset
    total_videos_found: int
    blocked_recent_use: int
    eligible_videos: int
    used_fallback_reuse: bool


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


def _normalize_identifier(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    stripped = value.strip()
    if not stripped:
        return None
    return stripped


def _path_tail(value: Any) -> str | None:
    normalized = _normalize_identifier(value)
    if normalized is None:
        return None
    name = PurePosixPath(normalized).name.strip()
    return name or None


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
        return self.select_asset_with_history(excluded_ids=excluded_ids).asset

    def select_asset_with_history(self, *, excluded_ids: set[str] | None = None) -> VideoAssetSelection:
        excluded_ids = excluded_ids or set()
        assets = [asset for asset in self.ensure_assets_available() if asset.id not in excluded_ids]
        if not assets:
            raise VideoAssetError("no_video_assets: no active Supabase video assets are available")

        recently_used = self._recently_used_identifiers(assets)
        eligible_assets = [asset for asset in assets if not self._asset_recently_used(asset, recently_used)]
        pool = eligible_assets if eligible_assets else assets
        used_fallback_reuse = not eligible_assets
        selected = sorted(
            pool,
            key=lambda asset: (
                asset.last_used_at is not None,
                _parse_dt(asset.last_used_at) or datetime.min.replace(tzinfo=timezone.utc),
                asset.used_count,
                -(asset.performance_score or 0.0),
            ),
        )[0]
        event_name = "video_reuse_cooldown_exhausted" if used_fallback_reuse else "video_asset_selected"
        log_event(
            self.logger,
            event_name,
            level="warning" if used_fallback_reuse else "info",
            video_asset_id=selected.id,
            storage_bucket=selected.storage_bucket,
            selected_video_key=selected.storage_path,
            selected_video_path=selected.storage_path,
            used_count=selected.used_count,
            last_used_at=selected.last_used_at,
            total_videos_found=len(assets),
            blocked_recent_use=len(assets) - len(eligible_assets),
            videos_excluded_recently_used=len(assets) - len(eligible_assets),
            eligible_count=len(eligible_assets),
            eligible_videos=len(eligible_assets),
            cooldown_days=self.config.video.reuse_cooldown_days,
        )
        return VideoAssetSelection(
            asset=selected,
            total_videos_found=len(assets),
            blocked_recent_use=len(assets) - len(eligible_assets),
            eligible_videos=len(eligible_assets),
            used_fallback_reuse=used_fallback_reuse,
        )

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

    def _recently_used_identifiers(self, assets: list[VideoAsset]) -> set[str]:
        cutoff = _utcnow() - timedelta(days=self.config.video.reuse_cooldown_days)
        rows = self.client.fetch_rows(
            "jalapeno_posts",
            select=(
                "publish_status,published_at,post_type,media_source,video_asset_id,"
                "storage_path,original_storage_path,processed_storage_path,"
                "video_url,original_video_url,processed_video_url,image_url"
            ),
            filters={
                "publish_status": "in.(published,published_with_permalink_pending)",
                "published_at": f"gte.{cutoff.isoformat()}",
                "order": "published_at.desc",
                "limit": 500,
            },
        )
        relevant_asset_ids = {asset.id for asset in assets if asset.id}
        identifiers: set[str] = set()
        for row in rows:
            if not self._row_is_video_publish(row, relevant_asset_ids):
                continue
            identifiers.update(self._row_identifiers(row))
        return identifiers

    def _asset_recently_used(self, asset: VideoAsset, recent_identifiers: set[str]) -> bool:
        return any(identifier in recent_identifiers for identifier in self._asset_identifiers(asset))

    def _asset_identifiers(self, asset: VideoAsset) -> list[str]:
        identifiers: list[str] = []
        for value in (
            _normalize_identifier(asset.storage_path),
            _normalize_identifier(asset.public_url),
            _path_tail(asset.storage_path),
            _path_tail(asset.public_url),
        ):
            if value and value not in identifiers:
                identifiers.append(value)
        return identifiers

    def _row_is_video_publish(self, row: dict[str, Any], relevant_asset_ids: set[str]) -> bool:
        if _normalize_identifier(row.get("video_asset_id")) in relevant_asset_ids:
            return True
        if _normalize_identifier(row.get("media_source")) == "supabase_video_asset":
            return True
        if _normalize_identifier(row.get("post_type")) == "daily_wing_reel":
            return True
        return any(
            _is_video_path(identifier)
            for field in (
                "storage_path",
                "original_storage_path",
                "processed_storage_path",
                "video_url",
                "original_video_url",
                "processed_video_url",
                "image_url",
            )
            if (identifier := _normalize_identifier(row.get(field)))
        )

    def _row_identifiers(self, row: dict[str, Any]) -> set[str]:
        identifiers: set[str] = set()
        stable_fields = (
            "storage_path",
            "original_storage_path",
            "processed_storage_path",
            "video_url",
            "original_video_url",
            "processed_video_url",
            "image_url",
        )
        for field in stable_fields:
            normalized = _normalize_identifier(row.get(field))
            if normalized is None or not _is_video_path(normalized):
                continue
            identifiers.add(normalized)
            tail = _path_tail(normalized)
            if tail:
                identifiers.add(tail)
        return identifiers
