from __future__ import annotations

import os
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID, uuid4

from config import JalapenoConfig, ConfigError
from instagram_publishing.instagram_client import InstagramGraphClient
from jalapeno_db import insert_error_row, insert_metrics_snapshot
from logging_utils import log_event
from supabase_client import SupabaseClient, SupabaseError


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


def _safe_int(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    if isinstance(value, str) and value.strip().isdigit():
        return int(value)
    return None


def _read_secret(secret_name: str) -> str:
    for candidate in (secret_name, secret_name.upper()):
        value = os.getenv(candidate, "").strip()
        if value:
            return value
    raise ConfigError(f"Missing required secret: {secret_name}")


def _is_token_error(error: Exception) -> bool:
    text = str(error).lower()
    return any(marker in text for marker in ("oauth", "token", "session", "permission", "190", "401", "403"))


def _is_rate_limit(error: Exception) -> bool:
    text = str(error).lower()
    return any(marker in text for marker in ("rate limit", "too many", "613", "429", "throttle"))


@dataclass(frozen=True, slots=True)
class MetricsCollectionResult:
    run_id: str
    checked_posts: int
    snapshots_persisted: int
    failures: int
    action_required: bool


def _extract_metadata(post: dict[str, Any]) -> dict[str, Any]:
    metadata = post.get("metadata") if isinstance(post.get("metadata"), dict) else {}
    return {
        "caption": post.get("generated_caption") or metadata.get("caption"),
        "category": metadata.get("category") or metadata.get("content_type") or post.get("post_type"),
        "prompt_template": metadata.get("prompt_template") or metadata.get("prompt_version"),
        "prompt_reason": metadata.get("prompt_reason") or metadata.get("reason_chosen"),
        "image_prompt": post.get("image_prompt") or metadata.get("image_prompt"),
        "image_style": metadata.get("image_style") or metadata.get("visual_style"),
        "hashtags": post.get("hashtags") or metadata.get("hashtags") or [],
        "cta_type": metadata.get("cta_type") or metadata.get("cta_category"),
        "generation_model": metadata.get("generation_model") or metadata.get("model_name"),
        "image_model": metadata.get("image_model") or metadata.get("image_model_name"),
        "cost_metadata": metadata.get("cost_metadata") or {"cost_estimate": metadata.get("cost_estimate")},
        "state": metadata.get("states_mentioned") or metadata.get("state"),
        "restaurant": metadata.get("restaurants_mentioned") or metadata.get("restaurant"),
        "topic": metadata.get("primary_theme") or metadata.get("topic"),
    }


def _should_collect(post: dict[str, Any], now: datetime) -> bool:
    published_at = _parse_dt(post.get("published_at"))
    if published_at is None:
        return False
    age_hours = (now - published_at).total_seconds() / 3600.0
    if 23 <= age_hours <= 30:
        return True
    if 71 <= age_hours <= 80:
        return True
    return age_hours <= 30 * 24


def _engagement_rate(metrics: dict[str, Any]) -> float | None:
    reach = _safe_int(metrics.get("reach")) or _safe_int(metrics.get("impressions")) or 0
    if reach <= 0:
        return None
    engagement = sum(_safe_int(metrics.get(key)) or 0 for key in ("likes", "comments", "saves", "shares"))
    return round(engagement / reach, 4)


def _fetch_published_posts(client: SupabaseClient, now: datetime) -> list[dict[str, Any]]:
    cutoff = now - timedelta(days=30)
    posts = client.fetch_rows(
        "jalapeno_posts",
        select="*",
        filters={
            "published_at": f"gte.{cutoff.isoformat()}",
            "publish_status": "in.(published,published_with_permalink_pending)",
            "order": "published_at.desc",
            "limit": 200,
        },
    )
    if not posts:
        instagram_rows = client.fetch_rows(
            "jalapeno_instagram_posts",
            select="*",
            filters={
                "published_at": f"gte.{cutoff.isoformat()}",
                "status": "in.(published,published_with_permalink_pending)",
                "order": "published_at.desc",
                "limit": 200,
            },
        )
        posts = [
            {
                "id": row.get("post_id"),
                "run_id": row.get("run_id"),
                "generated_caption": row.get("caption"),
                "hashtags": row.get("hashtags"),
                "post_type": row.get("scheduled_post_type") or row.get("content_type"),
                "instagram_media_id": row.get("published_media_id"),
                "published_at": row.get("published_at"),
                "metadata": row.get("metadata") if isinstance(row.get("metadata"), dict) else {},
            }
            for row in instagram_rows
            if row.get("post_id") and row.get("published_media_id")
        ]
    return [post for post in posts if post.get("instagram_media_id") and post.get("id") and _should_collect(post, now)]


def collect_instagram_metrics(
    config: JalapenoConfig,
    client: SupabaseClient,
    *,
    logger=None,
    run_id: str | None = None,
    now: datetime | None = None,
) -> MetricsCollectionResult:
    started = time.perf_counter()
    now = now or _utcnow()
    active_run_id = run_id or str(uuid4())
    persisted = 0
    failures = 0
    action_required = False
    log_event(logger, "metrics_collection_started", run_id=active_run_id, stage="metrics", status="started")
    access_token = _read_secret(config.instagram.access_token_secret_name)
    ig_user_id = _read_secret(config.instagram.ig_user_id_secret_name)
    graph = InstagramGraphClient(
        ig_user_id=ig_user_id,
        access_token=access_token,
        api_version=config.instagram.api_version,
        simulate=False,
        timeout_seconds=30,
    )
    posts = _fetch_published_posts(client, now)
    for post in posts:
        post_started = time.perf_counter()
        post_id = str(post.get("id"))
        media_id = str(post.get("instagram_media_id"))
        try:
            raw_metrics = graph.get_media_metrics(media_id)
            metrics = {
                "likes": _safe_int(raw_metrics.get("likes") or raw_metrics.get("like_count")),
                "comments": _safe_int(raw_metrics.get("comments") or raw_metrics.get("comments_count")),
                "saves": _safe_int(raw_metrics.get("saves") or raw_metrics.get("saved")),
                "shares": _safe_int(raw_metrics.get("shares")),
                "reach": _safe_int(raw_metrics.get("reach")),
                "impressions": _safe_int(raw_metrics.get("impressions")),
            }
            metrics["engagement_rate"] = _engagement_rate(metrics)
            published_at = _parse_dt(post.get("published_at"))
            age_hours = round((now - published_at).total_seconds() / 3600.0, 2) if published_at else None
            age_days = round(age_hours / 24.0, 2) if age_hours is not None else None
            creative = _extract_metadata(post)
            insert_metrics_snapshot(
                client,
                post_id=UUID(post_id),
                instagram_media_id=media_id,
                collected_at=now,
                published_at=published_at,
                post_age_hours=age_hours,
                post_age_days=age_days,
                raw_metrics=raw_metrics,
                metadata={"source": "instagram_graph_api", "run_id": active_run_id, **creative},
                **metrics,
                **creative,
            )
            persisted += 1
            log_event(
                logger,
                "metrics_snapshot_persisted",
                run_id=active_run_id,
                post_id=post_id,
                instagram_media_id=media_id,
                stage="metrics",
                status="completed",
                duration_ms=int((time.perf_counter() - post_started) * 1000),
                engagement_rate=metrics["engagement_rate"],
            )
        except Exception as exc:
            failures += 1
            error_type = "meta_token_expired" if _is_token_error(exc) else "rate_limit" if _is_rate_limit(exc) else type(exc).__name__
            if error_type == "meta_token_expired":
                action_required = True
                log_event(logger, "token_expired_detected", level="error", run_id=active_run_id, post_id=post_id, instagram_media_id=media_id, stage="metrics", status="failed_action_required", error=str(exc))
                log_event(logger, "failure_alert_required", level="error", run_id=active_run_id, post_id=post_id, instagram_media_id=media_id, stage="metrics", status="failed_action_required", error_type=error_type, error=str(exc))
            elif error_type == "rate_limit":
                log_event(logger, "rate_limit_retry", level="warning", run_id=active_run_id, post_id=post_id, instagram_media_id=media_id, stage="metrics", status="retry_deferred", retry_count=0, error=str(exc))
            else:
                log_event(logger, "metrics_collection_failed", level="error", run_id=active_run_id, post_id=post_id, instagram_media_id=media_id, stage="metrics", status="failed", error_type=error_type, error=str(exc))
            try:
                insert_error_row(
                    client,
                    run_id=UUID(active_run_id) if len(active_run_id) == 36 else None,
                    post_id=UUID(post_id),
                    stage="metrics",
                    error_type=error_type,
                    message=str(exc),
                    raw_payload={"instagram_media_id": media_id},
                    is_retryable=error_type == "rate_limit",
                    retry_count=0,
                )
            except Exception:
                pass
            if action_required:
                break
    log_event(
        logger,
        "metrics_collection_completed" if not failures else "metrics_collection_failed",
        level="error" if action_required else "info",
        run_id=active_run_id,
        stage="metrics",
        status="failed_action_required" if action_required else "completed",
        duration_ms=int((time.perf_counter() - started) * 1000),
        checked_posts=len(posts),
        snapshots_persisted=persisted,
        failures=failures,
    )
    return MetricsCollectionResult(
        run_id=active_run_id,
        checked_posts=len(posts),
        snapshots_persisted=persisted,
        failures=failures,
        action_required=action_required,
    )
