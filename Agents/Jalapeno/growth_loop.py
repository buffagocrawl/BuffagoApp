from __future__ import annotations

import math
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from statistics import mean
from typing import Any
from uuid import UUID, uuid4

from logging_utils import log_event
from supabase_client import SupabaseClient


SCORING_VERSION = "growth-v1"
BASELINE_CONTENT_MIX = {
    "mouthwatering_food": 0.40,
    "funny_wing_memes": 0.30,
    "polls_questions": 0.20,
    "app_feature": 0.10,
}
DEFAULT_POSTING_WINDOWS = ["12:00", "18:00"]
PROFILE_BIO_RECOMMENDATION = [
    "Find the best wings near you",
    "Rate every wing you eat",
    "Discover top-rated wing spots",
]
MIN_POSTS_FOR_STRATEGY = 6
MIN_SAMPLES_PER_PATTERN = 2
SHRINKAGE_PRIOR_WEIGHT = 3
MAX_MIX_SHIFT = 0.10


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


def _num(value: Any) -> float:
    return float(value) if isinstance(value, (int, float)) else 0.0


def _text(value: Any) -> str:
    return str(value or "").strip()


def _list_of_text(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if isinstance(value, str) and value.strip():
        return [value.strip()]
    return []


def _normalize_key(value: Any) -> str:
    return " ".join(_text(value).lower().split())


def _coerce_uuid_text(value: Any) -> str | None:
    text = _text(value)
    if not text:
        return None
    try:
        return str(UUID(text))
    except ValueError:
        return text


def _metric_views(row: dict[str, Any]) -> float:
    raw = row.get("raw_metrics") if isinstance(row.get("raw_metrics"), dict) else {}
    return max(
        _num(row.get("views")),
        _num(row.get("plays")),
        _num(raw.get("views")),
        _num(raw.get("plays")),
        _num(raw.get("video_views")),
        _num(row.get("reach")),
        _num(row.get("impressions")),
    )


def _ratio(numerator: float, denominator: float) -> float | None:
    if denominator <= 0:
        return None
    return numerator / denominator


def _latest_metric_by_post(rows: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    latest: dict[str, dict[str, Any]] = {}
    for row in rows:
        post_id = _text(row.get("post_id"))
        if not post_id:
            continue
        captured_at = _parse_dt(row.get("collected_at") or row.get("captured_at")) or datetime.min.replace(tzinfo=timezone.utc)
        existing = latest.get(post_id)
        existing_captured_at = _parse_dt(existing.get("collected_at") or existing.get("captured_at")) if existing else None
        if existing is None or captured_at > (existing_captured_at or datetime.min.replace(tzinfo=timezone.utc)):
            latest[post_id] = row
    return latest


def _content_mix_bucket(content_type: str) -> str:
    normalized = _normalize_key(content_type)
    if normalized in {"restaurant_spotlight", "hidden_gem", "food_holiday", "sports_tie_in", "daily_wing_reel"}:
        return "mouthwatering_food"
    if normalized in {"meme", "funny_observation"}:
        return "funny_wing_memes"
    if normalized in {"challenge", "leaderboard", "community_highlight", "wing_fact", "poll_question"}:
        return "polls_questions"
    if normalized in {"xp_milestone", "app_feature"}:
        return "app_feature"
    return "mouthwatering_food"


def _posting_time_label(value: datetime | None) -> str | None:
    if value is None:
        return None
    return value.strftime("%H:00")


def build_post_pattern_payload(post: dict[str, Any]) -> dict[str, Any]:
    metadata = post.get("metadata") if isinstance(post.get("metadata"), dict) else {}
    content_type = _text(metadata.get("content_type") or post.get("post_type"))
    creative_style = _text(metadata.get("creative_style") or metadata.get("image_style") or metadata.get("visual_style"))
    hook_text = _text(metadata.get("hook_text") or metadata.get("working_title") or metadata.get("chosen_idea"))
    overlay_text = _text(metadata.get("overlay_text") or hook_text)
    caption_style = _text(metadata.get("caption_style") or metadata.get("cta_category") or metadata.get("caption_type"))
    prompt_template_name = _text(metadata.get("prompt_template_name") or metadata.get("prompt_template"))
    generated_prompt = _text(metadata.get("generated_prompt") or metadata.get("image_prompt") or post.get("image_prompt"))
    scheduled_time = _parse_dt(post.get("scheduled_for"))
    published_time = _parse_dt(post.get("published_at"))
    asset_path = _text(metadata.get("asset_path") or post.get("storage_path") or post.get("image_storage_path") or post.get("video_url") or post.get("image_url"))
    return {
        "post_id": _text(post.get("id")),
        "run_id": _text(post.get("run_id")),
        "candidate_id": _coerce_uuid_text(post.get("candidate_id")),
        "content_type": content_type,
        "content_mix_bucket": _content_mix_bucket(content_type),
        "creative_style": creative_style,
        "hook_text": hook_text,
        "overlay_text": overlay_text,
        "caption_style": caption_style,
        "hashtags": post.get("hashtags") if isinstance(post.get("hashtags"), list) else _list_of_text(metadata.get("hashtags")),
        "asset_path": asset_path,
        "prompt_template_name": prompt_template_name,
        "generated_prompt": generated_prompt,
        "scheduled_time": scheduled_time.isoformat() if scheduled_time else None,
        "published_time": published_time.isoformat() if published_time else None,
        "metadata": {
            "post_type": post.get("post_type"),
            "media_source": metadata.get("media_source") or post.get("media_source"),
            "caption_type": metadata.get("caption_type"),
            "video_style": metadata.get("video_style"),
        },
    }


def persist_post_pattern(client: SupabaseClient, post: dict[str, Any]) -> dict[str, Any]:
    payload = build_post_pattern_payload(post)
    rows = client.upsert_rows("jalapeno_post_patterns", payload, on_conflict="post_id")
    return rows[0] if rows else payload


def compute_post_score(row: dict[str, Any]) -> dict[str, Any]:
    reach = max(_num(row.get("reach")), _num(row.get("impressions")), _metric_views(row))
    views = _metric_views(row)
    profile_visits = _num(row.get("profile_visits"))
    follows = _num(row.get("follows"))
    shares = _num(row.get("shares"))
    saves = _num(row.get("saves"))
    comments = _num(row.get("comments"))
    likes = _num(row.get("likes"))
    engagement_rate = _num(row.get("engagement_rate"))

    components = {
        "views_reach": min(math.log1p(max(views, reach)) / math.log1p(5000), 1.4),
        "profile_visits": min(math.log1p(profile_visits) / math.log1p(250), 1.5),
        "follows": min(math.log1p(follows) / math.log1p(50), 1.6),
        "shares": min(math.log1p(shares) / math.log1p(75), 1.5),
        "saves": min(math.log1p(saves) / math.log1p(75), 1.4),
        "comments": min(math.log1p(comments) / math.log1p(40), 1.4),
        "likes": min(math.log1p(likes) / math.log1p(250), 1.3),
        "engagement_rate": min(engagement_rate / 0.20, 1.5) if engagement_rate > 0 else 0.0,
    }
    ratio_components = {
        "profile_visit_rate": min((_ratio(profile_visits, reach) or 0.0) / 0.15, 1.6),
        "follow_rate": min((_ratio(follows, reach) or 0.0) / 0.04, 1.8),
        "share_rate": min((_ratio(shares, reach) or 0.0) / 0.03, 1.6),
        "save_rate": min((_ratio(saves, reach) or 0.0) / 0.04, 1.6),
        "comment_rate": min((_ratio(comments, reach) or 0.0) / 0.02, 1.5),
        "like_rate": min((_ratio(likes, reach) or 0.0) / 0.20, 1.2),
    }
    weights = {
        "views_reach": 1.8,
        "profile_visits": 2.6,
        "follows": 4.2,
        "shares": 3.8,
        "saves": 2.8,
        "comments": 2.2,
        "likes": 1.1,
        "engagement_rate": 2.0,
        "profile_visit_rate": 1.8,
        "follow_rate": 2.8,
        "share_rate": 2.2,
        "save_rate": 2.0,
        "comment_rate": 1.4,
        "like_rate": 0.5,
    }
    weighted_total = 0.0
    total_weight = 0.0
    for key, weight in weights.items():
        value = components.get(key, ratio_components.get(key, 0.0))
        weighted_total += value * weight
        total_weight += weight
    score = round((weighted_total / total_weight) * 100, 2) if total_weight else 0.0
    return {
        "score": score,
        "score_details": {
            "version": SCORING_VERSION,
            "signal_components": {key: round(value, 4) for key, value in components.items()},
            "ratio_components": {key: round(value, 4) for key, value in ratio_components.items()},
            "raw_metrics": {
                "views": int(views),
                "reach": int(reach),
                "profile_visits": int(profile_visits),
                "follows": int(follows),
                "shares": int(shares),
                "saves": int(saves),
                "comments": int(comments),
                "likes": int(likes),
                "engagement_rate": round(engagement_rate, 4),
            },
        },
    }


@dataclass(frozen=True, slots=True)
class StrategyRecommendation:
    generated_at: str
    strategy: dict[str, Any]
    rationale: dict[str, Any]
    insufficient_data: bool


@dataclass(frozen=True, slots=True)
class GrowthReportResult:
    report_id: str | None
    run_id: str
    period_start: str
    period_end: str
    summary: dict[str, Any]
    recommendations: dict[str, Any]
    stored: bool


def _fetch_latest_rows(client: SupabaseClient, *, since: datetime) -> list[dict[str, Any]]:
    metrics = client.fetch_rows(
        "jalapeno_post_metrics",
        select="*",
        filters={"collected_at": f"gte.{since.isoformat()}", "order": "collected_at.desc", "limit": 1000},
    )
    latest_metrics = _latest_metric_by_post(metrics)
    if not latest_metrics:
        return []
    post_ids = ",".join(sorted(latest_metrics.keys()))
    posts = client.fetch_rows("jalapeno_posts", select="*", filters={"id": f"in.({post_ids})", "limit": 1000})
    patterns = client.fetch_rows("jalapeno_post_patterns", select="*", filters={"post_id": f"in.({post_ids})", "limit": 1000})
    scores = client.fetch_rows("jalapeno_post_scores", select="*", filters={"post_id": f"in.({post_ids})", "limit": 1000})
    post_map = {str(row.get("id")): row for row in posts}
    pattern_map = {str(row.get("post_id")): row for row in patterns}
    score_map = {str(row.get("post_id")): row for row in scores}
    merged: list[dict[str, Any]] = []
    for post_id, metric in latest_metrics.items():
        post = post_map.get(post_id, {})
        pattern = pattern_map.get(post_id) or build_post_pattern_payload(post)
        score = score_map.get(post_id, {})
        metadata = post.get("metadata") if isinstance(post.get("metadata"), dict) else {}
        merged.append(
            {
                **post,
                **metric,
                "post_id": post_id,
                "pattern": pattern,
                "stored_score": _num(score.get("score")),
                "stored_score_details": score.get("score_details") if isinstance(score.get("score_details"), dict) else {},
                "metadata": metadata,
            }
        )
    return merged


def score_posts(
    client: SupabaseClient,
    *,
    logger=None,
    now: datetime | None = None,
) -> list[dict[str, Any]]:
    active_now = now or _utcnow()
    log_event(logger, "post_scoring_started", stage="growth_loop", status="started", now=active_now.isoformat())
    try:
        rows = _fetch_latest_rows(client, since=active_now - timedelta(days=30))
        scored_rows: list[dict[str, Any]] = []
        for row in rows:
            computed = compute_post_score(row)
            payload = {
                "post_id": row["post_id"],
                "instagram_media_id": row.get("instagram_media_id"),
                "score": computed["score"],
                "scoring_version": SCORING_VERSION,
                "metric_snapshot_at": row.get("collected_at") or row.get("captured_at"),
                "source_window": (
                    row.get("metadata", {}).get("collection_window")
                    if isinstance(row.get("metadata"), dict)
                    else None
                ),
                "score_details": {
                    **computed["score_details"],
                    "pattern": row["pattern"],
                },
            }
            client.upsert_rows("jalapeno_post_scores", payload, on_conflict="post_id")
            scored_rows.append({**row, "growth_score": computed["score"], "growth_score_details": payload["score_details"]})
        log_event(logger, "post_scoring_completed", stage="growth_loop", status="completed", scored_posts=len(scored_rows))
        return scored_rows
    except Exception as exc:
        log_event(logger, "post_scoring_failed", level="error", stage="growth_loop", status="failed", error=str(exc))
        raise


def _aggregate_rankings(rows: list[dict[str, Any]], extractor, *, minimum_samples: int = 1) -> list[dict[str, Any]]:
    buckets: dict[str, list[float]] = defaultdict(list)
    for row in rows:
        value = extractor(row)
        key = _text(value)
        if key:
            buckets[key].append(_num(row.get("growth_score")))
    ranked = []
    overall = mean([_num(row.get("growth_score")) for row in rows]) if rows else 0.0
    for key, scores in buckets.items():
        if len(scores) < minimum_samples:
            continue
        shrunk = ((mean(scores) * len(scores)) + (overall * SHRINKAGE_PRIOR_WEIGHT)) / (len(scores) + SHRINKAGE_PRIOR_WEIGHT)
        ranked.append(
            {
                "name": key,
                "post_count": len(scores),
                "avg_score": round(mean(scores), 2),
                "shrunk_score": round(shrunk, 2),
            }
        )
    return sorted(ranked, key=lambda item: item["shrunk_score"], reverse=True)


def _top_posts(rows: list[dict[str, Any]], *, reverse: bool = True, limit: int = 5) -> list[dict[str, Any]]:
    sorted_rows = sorted(rows, key=lambda row: _num(row.get("growth_score")), reverse=reverse)
    output: list[dict[str, Any]] = []
    for row in sorted_rows[:limit]:
        pattern = row["pattern"] if isinstance(row.get("pattern"), dict) else {}
        output.append(
            {
                "post_id": row["post_id"],
                "published_at": row.get("published_at"),
                "growth_score": row.get("growth_score"),
                "content_type": pattern.get("content_type"),
                "creative_style": pattern.get("creative_style"),
                "hook_text": pattern.get("hook_text"),
                "caption_style": pattern.get("caption_style"),
                "engagement_rate": row.get("engagement_rate"),
                "reach": row.get("reach"),
                "views": _metric_views(row),
            }
        )
    return output


def _hashtag_rankings(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    buckets: dict[str, list[float]] = defaultdict(list)
    for row in rows:
        pattern = row["pattern"] if isinstance(row.get("pattern"), dict) else {}
        for hashtag in _list_of_text(pattern.get("hashtags")):
            buckets[hashtag.lower()].append(_num(row.get("growth_score")))
    ranked = [
        {"name": key, "post_count": len(scores), "avg_score": round(mean(scores), 2)}
        for key, scores in buckets.items()
        if scores
    ]
    return sorted(ranked, key=lambda item: item["avg_score"], reverse=True)


def _per_post_summary(row: dict[str, Any]) -> dict[str, Any]:
    reach = max(_num(row.get("reach")), _num(row.get("impressions")), _metric_views(row))
    saves = _num(row.get("saves"))
    shares = _num(row.get("shares"))
    comments = _num(row.get("comments"))
    likes = _num(row.get("likes"))
    return {
        "post_id": row["post_id"],
        "published_at": row.get("published_at"),
        "growth_score": row.get("growth_score"),
        "engagement_rate": row.get("engagement_rate"),
        "save_rate": round((_ratio(saves, reach) or 0.0), 4),
        "share_rate": round((_ratio(shares, reach) or 0.0), 4),
        "comment_rate": round((_ratio(comments, reach) or 0.0), 4),
        "like_rate": round((_ratio(likes, reach) or 0.0), 4),
        "follows": int(_num(row.get("follows"))),
        "profile_visits": int(_num(row.get("profile_visits"))),
    }


def recommend_strategy_from_rows(rows: list[dict[str, Any]], *, now: datetime | None = None, logger=None) -> StrategyRecommendation:
    active_now = now or _utcnow()
    log_event(logger, "strategy_recommendation_started", stage="growth_loop", status="started", post_count=len(rows))
    try:
        insufficient = len(rows) < MIN_POSTS_FOR_STRATEGY
        overall_score = mean([_num(row.get("growth_score")) for row in rows]) if rows else 0.0
        content_types = _aggregate_rankings(rows, lambda row: row["pattern"].get("content_type"), minimum_samples=MIN_SAMPLES_PER_PATTERN)
        creative_styles = _aggregate_rankings(rows, lambda row: row["pattern"].get("creative_style"), minimum_samples=MIN_SAMPLES_PER_PATTERN)
        hooks = _aggregate_rankings(rows, lambda row: row["pattern"].get("hook_text"), minimum_samples=MIN_SAMPLES_PER_PATTERN)
        overlays = _aggregate_rankings(rows, lambda row: row["pattern"].get("overlay_text"), minimum_samples=MIN_SAMPLES_PER_PATTERN)
        captions = _aggregate_rankings(rows, lambda row: row["pattern"].get("caption_style"), minimum_samples=MIN_SAMPLES_PER_PATTERN)
        posting_windows = _aggregate_rankings(
            rows,
            lambda row: _posting_time_label(_parse_dt(row["pattern"].get("published_time")) or _parse_dt(row["pattern"].get("scheduled_time"))),
            minimum_samples=MIN_SAMPLES_PER_PATTERN,
        )
        mix_rankings = _aggregate_rankings(rows, lambda row: row["pattern"].get("content_mix_bucket"), minimum_samples=1)
        use_more_styles = [item["name"] for item in creative_styles if item["shrunk_score"] >= overall_score + 4][:3]
        reduce_styles = [item["name"] for item in reversed(creative_styles) if item["shrunk_score"] <= overall_score - 4][:3]
        best_windows = [item["name"] for item in posting_windows[:2]] or DEFAULT_POSTING_WINDOWS
        best_hooks = [item["name"] for item in hooks[:3]]
        best_overlays = [item["name"] for item in overlays[:3]]
        best_caption_styles = [item["name"] for item in captions[:3]]
        top_hashtags = [item["name"] for item in _hashtag_rankings(rows)[:8]]
        mix_targets = dict(BASELINE_CONTENT_MIX)
        if not insufficient and mix_rankings:
            mix_lookup = {item["name"]: item for item in mix_rankings}
            for bucket, baseline in BASELINE_CONTENT_MIX.items():
                bucket_score = mix_lookup.get(bucket, {}).get("shrunk_score", overall_score)
                delta = 0.0
                if bucket_score >= overall_score + 3:
                    delta = MAX_MIX_SHIFT
                elif bucket_score <= overall_score - 3:
                    delta = -MAX_MIX_SHIFT
                mix_targets[bucket] = max(0.05, min(0.60, baseline + delta))
            total = sum(mix_targets.values())
            mix_targets = {key: round(value / total, 4) for key, value in mix_targets.items()}
        else:
            log_event(
                logger,
                "insufficient_data_for_strategy_adjustment",
                stage="growth_loop",
                status="completed",
                post_count=len(rows),
                minimum_required=MIN_POSTS_FOR_STRATEGY,
            )

        strategy = {
            "generated_at": active_now.isoformat(),
            "content_mix_targets": mix_targets,
            "use_more_creative_styles": use_more_styles,
            "reduce_creative_styles": reduce_styles,
            "preferred_hook_patterns": best_hooks,
            "preferred_overlay_patterns": best_overlays,
            "preferred_caption_styles": best_caption_styles,
            "best_posting_windows": best_windows,
            "preferred_hashtags": top_hashtags,
            "posting_frequency_target": {
                "reels_per_day": 2,
                "image_or_carousel_every_days": 2.5,
            },
            "profile_recommendations": {
                "current_direction": "A Wing Ratings App / Discover. Eat. Rate.",
                "recommended_bio_lines": PROFILE_BIO_RECOMMENDATION,
            },
            "safety": {
                "minimum_posts_for_adjustment": MIN_POSTS_FOR_STRATEGY,
                "minimum_samples_per_pattern": MIN_SAMPLES_PER_PATTERN,
                "shrinkage_prior_weight": SHRINKAGE_PRIOR_WEIGHT,
                "max_mix_shift": MAX_MIX_SHIFT,
                "fallback_to_baseline": insufficient,
            },
        }
        rationale = {
            "overall_growth_score": round(overall_score, 2),
            "content_type_rankings": content_types[:5],
            "creative_style_rankings": creative_styles[:5],
            "hook_rankings": hooks[:5],
            "overlay_rankings": overlays[:5],
            "caption_style_rankings": captions[:5],
            "posting_window_rankings": posting_windows[:5],
            "mix_rankings": mix_rankings[:5],
            "recommended_adjustments": [
                *(f"Use more of {style}" for style in use_more_styles),
                *(f"Reduce {style}" for style in reduce_styles),
                f"Bias posting toward {', '.join(best_windows)}" if best_windows else "Keep baseline posting windows",
                "Keep the Buffago app present, but avoid making every post feel like an ad.",
            ],
        }
        result = StrategyRecommendation(
            generated_at=active_now.isoformat(),
            strategy=strategy,
            rationale=rationale,
            insufficient_data=insufficient,
        )
        log_event(
            logger,
            "strategy_recommendation_completed",
            stage="growth_loop",
            status="completed",
            insufficient_data=insufficient,
            preferred_styles=use_more_styles,
        )
        return result
    except Exception as exc:
        log_event(logger, "strategy_recommendation_failed", level="error", stage="growth_loop", status="failed", error=str(exc))
        raise


def load_active_strategy(client: SupabaseClient | None) -> dict[str, Any] | None:
    if client is None:
        return None
    rows = client.fetch_rows(
        "jalapeno_content_strategy",
        select="*",
        filters={"is_active": "eq.true", "order": "effective_from.desc", "limit": 1},
    )
    if not rows:
        return None
    row = rows[0]
    strategy = row.get("strategy") if isinstance(row.get("strategy"), dict) else {}
    rationale = row.get("rationale") if isinstance(row.get("rationale"), dict) else {}
    return {"id": row.get("id"), "strategy": strategy, "rationale": rationale, "effective_from": row.get("effective_from")}


def apply_strategy_recommendation(
    client: SupabaseClient,
    recommendation: StrategyRecommendation,
    *,
    logger=None,
    report_id: str | None = None,
    write: bool = False,
) -> dict[str, Any]:
    log_event(logger, "strategy_applied", stage="growth_loop", status="started", write=write)
    payload = {
        "report_id": report_id,
        "strategy_status": "applied" if write else "draft",
        "is_active": write,
        "effective_from": _utcnow().isoformat(),
        "strategy": recommendation.strategy,
        "rationale": recommendation.rationale,
        "applied_at": _utcnow().isoformat() if write else None,
    }
    if not write:
        log_event(logger, "strategy_applied", stage="growth_loop", status="completed", write=write, strategy_id=None)
        return payload
    existing_active = client.fetch_rows(
        "jalapeno_content_strategy",
        select="id",
        filters={"is_active": "eq.true", "limit": 100},
    )
    for row in existing_active:
        client.update_rows(
            "jalapeno_content_strategy",
            {"id": f"eq.{row['id']}"},
            {"is_active": False, "updated_at": _utcnow().isoformat()},
        )
    inserted = client.insert_row("jalapeno_content_strategy", payload)
    log_event(logger, "strategy_applied", stage="growth_loop", status="completed", write=write, strategy_id=inserted[0].get("id") if inserted else None)
    return inserted[0] if inserted else payload


def generate_growth_report(
    client: SupabaseClient,
    *,
    logger=None,
    now: datetime | None = None,
) -> GrowthReportResult:
    active_now = now or _utcnow()
    run_id = str(uuid4())
    period_end = active_now
    period_start = active_now - timedelta(days=7)
    log_event(logger, "growth_report_started", stage="growth_loop", status="started", run_id=run_id)
    try:
        rows = score_posts(client, logger=logger, now=active_now)
        weekly_rows = [
            row
            for row in rows
            if (_parse_dt(row.get("published_at")) or _parse_dt(row["pattern"].get("published_time")) or active_now) >= period_start
        ]
        recommendation = recommend_strategy_from_rows(weekly_rows, now=active_now, logger=logger)
        content_types = _aggregate_rankings(weekly_rows, lambda row: row["pattern"].get("content_type"), minimum_samples=1)
        creative_styles = _aggregate_rankings(weekly_rows, lambda row: row["pattern"].get("creative_style"), minimum_samples=1)
        hooks = _aggregate_rankings(weekly_rows, lambda row: row["pattern"].get("hook_text"), minimum_samples=1)
        overlays = _aggregate_rankings(weekly_rows, lambda row: row["pattern"].get("overlay_text"), minimum_samples=1)
        caption_styles = _aggregate_rankings(weekly_rows, lambda row: row["pattern"].get("caption_style"), minimum_samples=1)
        posting_times = _aggregate_rankings(
            weekly_rows,
            lambda row: _posting_time_label(_parse_dt(row["pattern"].get("published_time")) or _parse_dt(row["pattern"].get("scheduled_time"))),
            minimum_samples=1,
        )
        hashtag_rankings = _hashtag_rankings(weekly_rows)
        total_views = round(sum(_metric_views(row) for row in weekly_rows))
        total_reach = round(sum(_num(row.get("reach")) for row in weekly_rows))
        total_impressions = round(sum(_num(row.get("impressions")) for row in weekly_rows))
        total_profile_views = round(sum(_num(row.get("profile_visits")) for row in weekly_rows))
        total_follows = round(sum(_num(row.get("follows")) for row in weekly_rows))
        summary = {
            "report_type": "weekly_growth",
            "period_start": period_start.isoformat(),
            "period_end": period_end.isoformat(),
            "total_posts_published": len(weekly_rows),
            "total_views": total_views,
            "total_reach": total_reach,
            "total_impressions": total_impressions,
            "follower_count_change": total_follows if total_follows > 0 else None,
            "profile_views": total_profile_views if total_profile_views > 0 else None,
            "top_performing_posts": _top_posts(weekly_rows, reverse=True),
            "worst_performing_posts": _top_posts(weekly_rows, reverse=False),
            "best_performing_content_types": content_types[:5],
            "best_performing_creative_styles": creative_styles[:5],
            "best_performing_hooks": hooks[:5],
            "best_performing_text_overlays": overlays[:5],
            "best_performing_caption_styles": caption_styles[:5],
            "best_performing_hashtags": hashtag_rankings[:10],
            "best_performing_posting_times": posting_times[:5],
            "engagement_rate_by_post": [_per_post_summary(row) for row in weekly_rows],
            "ratio_summary": {
                "avg_save_rate": round(mean([item["save_rate"] for item in map(_per_post_summary, weekly_rows)]) if weekly_rows else 0.0, 4),
                "avg_share_rate": round(mean([item["share_rate"] for item in map(_per_post_summary, weekly_rows)]) if weekly_rows else 0.0, 4),
                "avg_comment_rate": round(mean([item["comment_rate"] for item in map(_per_post_summary, weekly_rows)]) if weekly_rows else 0.0, 4),
                "avg_like_rate": round(mean([item["like_rate"] for item in map(_per_post_summary, weekly_rows)]) if weekly_rows else 0.0, 4),
            },
            "profile_optimization_recommendation": {
                "do_not_auto_apply": True,
                "recommended_bio_lines": PROFILE_BIO_RECOMMENDATION,
            },
            "posting_frequency_recommendation": {
                "target": "2 reels/day and 1 image or carousel every 2-3 days",
                "auto_schedule_change_enabled": False,
            },
        }
        report_payload = {
            "report_week_start": period_start.isoformat(),
            "report_week_end": period_end.isoformat(),
            "report_type": "weekly_growth",
            "summary": summary,
            "recommendations": recommendation.strategy,
        }
        inserted = client.insert_row("jalapeno_growth_reports", report_payload)
        report_id = str(inserted[0].get("id")) if inserted else None
        log_event(logger, "growth_report_completed", stage="growth_loop", status="completed", run_id=run_id, stored=bool(report_id))
        return GrowthReportResult(
            report_id=report_id,
            run_id=run_id,
            period_start=period_start.isoformat(),
            period_end=period_end.isoformat(),
            summary=summary,
            recommendations=recommendation.strategy,
            stored=bool(report_id),
        )
    except Exception as exc:
        log_event(logger, "growth_report_failed", level="error", stage="growth_loop", status="failed", run_id=run_id, error=str(exc))
        raise
