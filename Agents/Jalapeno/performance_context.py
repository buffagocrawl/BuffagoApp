from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from statistics import mean
from typing import Any

from growth_loop import load_active_strategy
from logging_utils import log_event
from supabase_client import SupabaseClient


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _parse_dt(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _float(value: Any, default: float = 0.0) -> float:
    if isinstance(value, (int, float)):
        return float(value)
    return default


def _text(value: Any) -> str:
    return str(value or "").strip()


@dataclass(frozen=True, slots=True)
class PerformanceContext:
    generated_at: str
    best_posts: dict[str, list[dict[str, Any]]]
    worst_posts: dict[str, list[dict[str, Any]]]
    best_categories: list[dict[str, Any]]
    worst_categories: list[dict[str, Any]]
    best_image_styles: list[dict[str, Any]]
    worst_image_styles: list[dict[str, Any]]
    best_cta_types: list[dict[str, Any]]
    best_video_assets: list[dict[str, Any]]
    worst_video_assets: list[dict[str, Any]]
    best_caption_types: list[dict[str, Any]]
    best_overlay_patterns: list[dict[str, Any]]
    best_hashtag_patterns: list[dict[str, Any]]
    duplicate_topics_to_avoid: list[str]
    strong_patterns: list[str]
    weak_patterns: list[str]
    recommended_adjustments: list[str]
    prompt_guidance: str
    source_counts: dict[str, int]
    active_strategy: dict[str, Any]

    def to_dict(self) -> dict[str, Any]:
        return {
            "generated_at": self.generated_at,
            "best_posts": self.best_posts,
            "worst_posts": self.worst_posts,
            "best_categories": self.best_categories,
            "worst_categories": self.worst_categories,
            "best_image_styles": self.best_image_styles,
            "worst_image_styles": self.worst_image_styles,
            "best_cta_types": self.best_cta_types,
            "best_video_assets": self.best_video_assets,
            "worst_video_assets": self.worst_video_assets,
            "best_caption_types": self.best_caption_types,
            "best_overlay_patterns": self.best_overlay_patterns,
            "best_hashtag_patterns": self.best_hashtag_patterns,
            "duplicate_topics_to_avoid": self.duplicate_topics_to_avoid,
            "strong_patterns": self.strong_patterns,
            "weak_patterns": self.weak_patterns,
            "recommended_adjustments": self.recommended_adjustments,
            "prompt_guidance": self.prompt_guidance,
            "source_counts": self.source_counts,
            "active_strategy": self.active_strategy,
        }


def _latest_by_post(metrics: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    latest: dict[str, dict[str, Any]] = {}
    for row in metrics:
        post_id = _text(row.get("post_id"))
        if not post_id:
            continue
        captured = _parse_dt(row.get("collected_at") or row.get("captured_at")) or datetime.min.replace(tzinfo=timezone.utc)
        current = latest.get(post_id)
        current_captured = _parse_dt(current.get("collected_at") or current.get("captured_at")) if current else None
        if current is None or captured > (current_captured or datetime.min.replace(tzinfo=timezone.utc)):
            latest[post_id] = row
    return latest


def _aggregate(rows: list[dict[str, Any]], key: str, *, limit: int = 5, reverse: bool = True) -> list[dict[str, Any]]:
    buckets: dict[str, list[float]] = defaultdict(list)
    for row in rows:
        label = _text(row.get(key)) or "unknown"
        buckets[label].append(_float(row.get("engagement_rate")))
    summarized = [
        {"name": label, "avg_engagement_rate": round(mean(values), 4), "post_count": len(values)}
        for label, values in buckets.items()
        if values
    ]
    return sorted(summarized, key=lambda item: item["avg_engagement_rate"], reverse=reverse)[:limit]


def _hashtags(rows: list[dict[str, Any]], *, limit: int = 5) -> list[dict[str, Any]]:
    buckets: dict[str, list[float]] = defaultdict(list)
    for row in rows:
        tags = row.get("hashtags")
        if not isinstance(tags, list):
            tags = []
        normalized = [str(tag).strip().lstrip("#").lower() for tag in tags if str(tag).strip()]
        if not normalized:
            continue
        key = " ".join(sorted(normalized[:4]))
        buckets[key].append(_float(row.get("engagement_rate")))
    summarized = [
        {"pattern": key, "avg_engagement_rate": round(mean(values), 4), "post_count": len(values)}
        for key, values in buckets.items()
    ]
    return sorted(summarized, key=lambda item: item["avg_engagement_rate"], reverse=True)[:limit]


def _post_summary(row: dict[str, Any]) -> dict[str, Any]:
    caption = _text(row.get("caption") or row.get("generated_caption"))
    return {
        "post_id": row.get("post_id") or row.get("id"),
        "instagram_media_id": row.get("instagram_media_id"),
        "published_at": row.get("published_at"),
        "category": row.get("category") or row.get("post_type") or row.get("content_type"),
        "image_style": row.get("image_style") or row.get("visual_style"),
        "cta_type": row.get("cta_type") or row.get("cta_category"),
        "video_asset_id": row.get("video_asset_id"),
        "caption_type": row.get("caption_type"),
        "video_style": row.get("video_style"),
        "engagement_rate": row.get("engagement_rate"),
        "reach": row.get("reach"),
        "likes": row.get("likes"),
        "comments": row.get("comments"),
        "caption_preview": caption[:140],
        "prompt_reason": row.get("prompt_reason") or row.get("reason_chosen"),
    }


def _merged_rows(client: SupabaseClient, *, since: datetime) -> list[dict[str, Any]]:
    metrics = client.fetch_rows(
        "jalapeno_post_metrics",
        select="*",
        filters={"collected_at": f"gte.{since.isoformat()}", "order": "collected_at.desc", "limit": 500},
    )
    if not metrics:
        metrics = client.fetch_rows(
            "jalapeno_post_metrics",
            select="*",
            filters={"captured_at": f"gte.{since.isoformat()}", "order": "captured_at.desc", "limit": 500},
        )
    latest = _latest_by_post(metrics)
    if not latest:
        return []
    post_ids = ",".join(latest.keys())
    posts = client.fetch_rows(
        "jalapeno_posts",
        select="*",
        filters={"id": f"in.({post_ids})", "limit": 500},
    )
    post_map = {str(row.get("id")): row for row in posts}
    rows: list[dict[str, Any]] = []
    for post_id, metric in latest.items():
        post = post_map.get(post_id, {})
        metadata = post.get("metadata") if isinstance(post.get("metadata"), dict) else {}
        metric_metadata = metric.get("metadata") if isinstance(metric.get("metadata"), dict) else {}
        rows.append(
            {
                **post,
                **metadata,
                **metric,
                **metric_metadata,
                "post_id": post_id,
                "category": metric.get("category") or metadata.get("category") or post.get("post_type"),
                "image_style": metric.get("image_style") or metadata.get("image_style") or metadata.get("visual_style"),
                "cta_type": metric.get("cta_type") or metadata.get("cta_type") or metadata.get("cta_category"),
                "video_asset_id": metric.get("video_asset_id") or metadata.get("video_asset_id"),
                "caption_type": metric.get("caption_type") or metadata.get("caption_type"),
                "video_style": metric.get("video_style") or metadata.get("video_style") or metadata.get("style"),
                "prompt_reason": metric.get("prompt_reason") or metadata.get("prompt_reason") or metadata.get("reason_chosen"),
                "hashtags": metric.get("hashtags") or post.get("hashtags") or metadata.get("hashtags") or [],
                "caption": metric.get("caption") or post.get("generated_caption"),
                "published_at": metric.get("published_at") or post.get("published_at"),
            }
        )
    return rows


def build_performance_context(
    client: SupabaseClient | None,
    *,
    logger=None,
    run_id: str | None = None,
    now: datetime | None = None,
) -> PerformanceContext:
    started = _utcnow()
    now = now or started
    log_event(logger, "performance_context_built", run_id=run_id, stage="learning_context", status="started")
    rows: list[dict[str, Any]] = []
    active_strategy: dict[str, Any] = {}
    if client is not None:
        try:
            rows = _merged_rows(client, since=now - timedelta(days=90))
            loaded_strategy = load_active_strategy(client)
            if isinstance(loaded_strategy, dict):
                active_strategy = loaded_strategy
                log_event(
                    logger,
                    "strategy_loaded",
                    run_id=run_id,
                    stage="learning_context",
                    status="completed",
                    strategy_id=loaded_strategy.get("id"),
                )
        except Exception as exc:
            log_event(
                logger,
                "performance_context_built",
                level="warning",
                run_id=run_id,
                stage="learning_context",
                status="fallback",
                error_type=type(exc).__name__,
                error=str(exc),
            )
            rows = []

    best_posts: dict[str, list[dict[str, Any]]] = {}
    worst_posts: dict[str, list[dict[str, Any]]] = {}
    for days in (7, 30, 90):
        cutoff = now - timedelta(days=days)
        window_rows = [row for row in rows if (_parse_dt(row.get("published_at")) or now) >= cutoff]
        sorted_rows = sorted(window_rows, key=lambda row: _float(row.get("engagement_rate")), reverse=True)
        best_posts[f"{days}d"] = [_post_summary(row) for row in sorted_rows[:5]]
        worst_posts[f"{days}d"] = [_post_summary(row) for row in sorted_rows[-5:]][::-1]

    best_categories = _aggregate(rows, "category", reverse=True)
    worst_categories = _aggregate(rows, "category", reverse=False)
    best_image_styles = _aggregate(rows, "image_style", reverse=True)
    worst_image_styles = _aggregate(rows, "image_style", reverse=False)
    best_cta_types = _aggregate(rows, "cta_type", reverse=True)
    best_video_assets = _aggregate(rows, "video_asset_id", reverse=True)
    worst_video_assets = _aggregate(rows, "video_asset_id", reverse=False)
    best_caption_types = _aggregate(rows, "caption_type", reverse=True)
    best_overlay_patterns = _aggregate(rows, "overlay_text", reverse=True)
    best_hashtags = _hashtags(rows)
    duplicate_topics = []
    for row in rows[:25]:
        for key in ("chosen_idea", "primary_theme", "secondary_theme", "caption"):
            value = _text(row.get(key))
            if value and value.lower() not in {item.lower() for item in duplicate_topics}:
                duplicate_topics.append(value[:120])
    strong_patterns = [
        f"Prefer {item['name']} for {label} (avg ER {item['avg_engagement_rate']})"
        for label, values in (("category", best_categories[:2]), ("image style", best_image_styles[:2]), ("CTA", best_cta_types[:2]))
        for item in values
        if item["name"] != "unknown"
    ]
    weak_patterns = [
        f"Avoid weak {label}: {item['name']} (avg ER {item['avg_engagement_rate']})"
        for label, values in (("category", worst_categories[:2]), ("image style", worst_image_styles[:2]))
        for item in values
        if item["name"] != "unknown"
    ]
    guidance_parts = [
        "Use recent Instagram performance before choosing the next Jalapeno post.",
        "Prefer patterns that are working and explain the content direction.",
        "Avoid recent duplicates and weak image styles.",
        "If prior images underperformed, make the next image prompt more specific, appetizing, branded, and Instagram-safe.",
        "Avoid visible text inside generated images unless explicitly required.",
    ]
    strategy = active_strategy.get("strategy") if isinstance(active_strategy.get("strategy"), dict) else {}
    recommended_adjustments = []
    if strategy.get("use_more_creative_styles"):
        recommended_adjustments.extend(f"Use more {style}" for style in strategy["use_more_creative_styles"][:3])
    if strategy.get("reduce_creative_styles"):
        recommended_adjustments.extend(f"Reduce {style}" for style in strategy["reduce_creative_styles"][:3])
    if strategy.get("best_posting_windows"):
        recommended_adjustments.append("Prefer posting around " + ", ".join(strategy["best_posting_windows"][:2]))
    if strong_patterns:
        guidance_parts.append("Working patterns: " + "; ".join(strong_patterns[:5]))
    if weak_patterns:
        guidance_parts.append("Weak patterns: " + "; ".join(weak_patterns[:5]))
    if recommended_adjustments:
        guidance_parts.append("Active strategy: " + "; ".join(recommended_adjustments[:5]))
    context = PerformanceContext(
        generated_at=started.isoformat(),
        best_posts=best_posts,
        worst_posts=worst_posts,
        best_categories=best_categories,
        worst_categories=worst_categories,
        best_image_styles=best_image_styles,
        worst_image_styles=worst_image_styles,
        best_cta_types=best_cta_types,
        best_video_assets=best_video_assets,
        worst_video_assets=worst_video_assets,
        best_caption_types=best_caption_types,
        best_overlay_patterns=best_overlay_patterns,
        best_hashtag_patterns=best_hashtags,
        duplicate_topics_to_avoid=duplicate_topics[:12],
        strong_patterns=strong_patterns[:8],
        weak_patterns=weak_patterns[:8],
        recommended_adjustments=recommended_adjustments[:8],
        prompt_guidance="\n".join(guidance_parts),
        source_counts={"rows": len(rows)},
        active_strategy=active_strategy,
    )
    log_event(
        logger,
        "performance_context_built",
        run_id=run_id,
        stage="learning_context",
        status="completed",
        duration_ms=int((_utcnow() - started).total_seconds() * 1000),
        post_count=len(rows),
        best_category=best_categories[0]["name"] if best_categories else None,
        worst_image_style=worst_image_styles[0]["name"] if worst_image_styles else None,
    )
    return context
