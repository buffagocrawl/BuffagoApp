from __future__ import annotations

import os
import re
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID, uuid4

from config import JalapenoConfig, ConfigError
from instagram_publishing.instagram_client import InstagramGraphClient
from jalapeno_db import insert_error_row, insert_metrics_snapshot, update_publish_status
from logging_utils import log_event
from supabase_client import SupabaseClient, SupabaseError


_RESERVED_LOG_EVENT_KEYS = frozenset({"run_id", "stage", "status", "event", "level"})


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


def _extract_graph_error_fields(message: str) -> dict[str, int | str]:
    lowered = message.lower()
    code_match = re.search(r'"code"\s*:\s*(\d+)', message)
    subcode_match = re.search(r'"error_subcode"\s*:\s*(\d+)', message)
    status_match = re.search(r"\((\d{3})\)", message)
    if not code_match:
        code_match = re.search(r"\bcode[= :]+(\d+)", lowered)
    if not subcode_match:
        subcode_match = re.search(r"\bsubcode[= :]+(\d+)", lowered)
    fields: dict[str, int | str] = {}
    if code_match:
        fields["code"] = int(code_match.group(1))
    if subcode_match:
        fields["subcode"] = int(subcode_match.group(1))
    if status_match:
        fields["http_status"] = int(status_match.group(1))
    return fields


def classify_meta_error(error: Exception) -> str:
    message = str(error)
    lowered = message.lower()
    details = _extract_graph_error_fields(message)
    code = details.get("code")
    subcode = details.get("subcode")
    http_status = details.get("http_status")
    if code == 190 or "oauthexception" in lowered:
        return "token_expired"
    if code == 100 and subcode == 33:
        return "meta_media_unreadable_or_missing_permission"
    if code == 613 or http_status == 429 or "rate limit" in lowered or "too many" in lowered or "throttle" in lowered:
        return "rate_limit"
    if http_status == 401:
        return "token_expired"
    return type(error).__name__


@dataclass(frozen=True, slots=True)
class MetricsCollectionResult:
    run_id: str
    checked_posts: int
    snapshots_persisted: int
    failures: int
    action_required: bool
    skipped_duplicates: int = 0
    dry_run: bool = False
    diagnostics_ran: bool = False
    repair_candidates: int = 0


@dataclass(frozen=True, slots=True)
class MetricsDiagnosticsResult:
    me_ok: bool
    accounts_ok: bool
    configured_page_found: bool
    configured_ig_account_found: bool
    recent_media_ok: bool
    recent_media_count: int
    stored_ids_checked: int
    stored_ids_found_in_recent_media: int
    mismatch_count: int
    repair_candidates: list[dict[str, Any]]
    mismatches: list[dict[str, Any]]


def _extract_metadata(post: dict[str, Any]) -> dict[str, Any]:
    metadata = post.get("metadata") if isinstance(post.get("metadata"), dict) else {}
    creative = {
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
    media_source = post.get("media_source") or metadata.get("media_source")
    if media_source == "supabase_video_asset":
        creative.update(
            {
                "video_asset_id": post.get("video_asset_id") or metadata.get("video_asset_id"),
                "caption_type": metadata.get("caption_type"),
                "video_style": metadata.get("video_style") or metadata.get("style"),
                "media_source": media_source,
                "storage_path": post.get("storage_path") or metadata.get("storage_path"),
            }
        )
    return creative


def _post_age_hours(post: dict[str, Any], now: datetime) -> float | None:
    published_at = _parse_dt(post.get("published_at"))
    if published_at is None:
        return None
    return (now - published_at).total_seconds() / 3600.0


def _collection_window(age_hours: float, *, backfill: bool = False) -> str | None:
    if 23 <= age_hours <= 30:
        return "24h"
    if 71 <= age_hours <= 80:
        return "72h"
    if 164 <= age_hours <= 180:
        return "7d"
    if not backfill:
        return None
    if 24 <= age_hours < 72:
        return "24h"
    if 72 <= age_hours < 168:
        return "72h"
    if 168 <= age_hours <= 30 * 24:
        return "7d"
    return None


def _engagement_rate(metrics: dict[str, Any]) -> float | None:
    reach = _safe_int(metrics.get("reach")) or _safe_int(metrics.get("impressions")) or 0
    if reach <= 0:
        return None
    engagement = sum(_safe_int(metrics.get(key)) or 0 for key in ("likes", "comments", "saves", "shares"))
    return round(engagement / reach, 4)


def _fetch_published_posts(client: SupabaseClient, now: datetime, *, backfill: bool = False) -> list[dict[str, Any]]:
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
    instagram_by_post_id = {
        str(row.get("post_id")): row
        for row in instagram_rows
        if row.get("post_id") and row.get("published_media_id")
    }
    for post in posts:
        instagram_row = instagram_by_post_id.get(str(post.get("id")))
        if instagram_row and not post.get("instagram_media_id"):
            post["instagram_media_id"] = instagram_row.get("published_media_id")
        if instagram_row and not post.get("published_at"):
            post["published_at"] = instagram_row.get("published_at")
    known_post_ids = {str(post.get("id")) for post in posts if post.get("id")}
    posts.extend(
        {
            "id": row.get("post_id"),
            "run_id": row.get("run_id"),
            "generated_caption": row.get("caption"),
            "hashtags": row.get("hashtags"),
            "post_type": row.get("scheduled_post_type") or row.get("content_type"),
            "instagram_media_id": row.get("published_media_id"),
            "instagram_permalink": row.get("permalink"),
            "published_at": row.get("published_at"),
            "metadata": row.get("metadata") if isinstance(row.get("metadata"), dict) else {},
        }
        for row in instagram_rows
        if row.get("post_id") and row.get("published_media_id") and str(row.get("post_id")) not in known_post_ids
    )
    candidates: list[dict[str, Any]] = []
    for post in posts:
        if not post.get("instagram_media_id") or not post.get("id"):
            continue
        age_hours = _post_age_hours(post, now)
        if age_hours is None:
            continue
        window = _collection_window(age_hours, backfill=backfill)
        if window is None:
            continue
        enriched = dict(post)
        enriched["metrics_collection_window"] = window
        enriched["metrics_exact_window"] = 23 <= age_hours <= 30 or 71 <= age_hours <= 80 or 164 <= age_hours <= 180
        candidates.append(enriched)
    return candidates


def _existing_metric_windows(client: SupabaseClient, posts: list[dict[str, Any]]) -> set[tuple[str, str]]:
    post_ids = sorted({str(post.get("id")) for post in posts if post.get("id")})
    if not post_ids:
        return set()
    rows = client.fetch_rows(
        "jalapeno_post_metrics",
        select="post_id,post_age_hours,metadata",
        filters={
            "post_id": f"in.({','.join(post_ids)})",
            "limit": 1000,
        },
    )
    windows: set[tuple[str, str]] = set()
    for row in rows:
        post_id = str(row.get("post_id") or "")
        metadata = row.get("metadata") if isinstance(row.get("metadata"), dict) else {}
        window = metadata.get("collection_window")
        if not window:
            age_hours = row.get("post_age_hours")
            if isinstance(age_hours, str):
                try:
                    age_hours = float(age_hours)
                except ValueError:
                    age_hours = None
            if isinstance(age_hours, (int, float)):
                window = _collection_window(float(age_hours), backfill=True)
        if post_id and isinstance(window, str) and window:
            windows.add((post_id, window))
    return windows


def _normalize_caption(value: Any) -> str:
    if not isinstance(value, str):
        return ""
    return " ".join(value.strip().lower().split())


def _normalize_permalink(value: Any) -> str:
    if not isinstance(value, str):
        return ""
    normalized = value.strip().rstrip("/")
    return normalized.lower()


def _timestamp_close(left: datetime | None, right: datetime | None, *, threshold_seconds: int = 7200) -> bool:
    if left is None or right is None:
        return False
    return abs((left - right).total_seconds()) <= threshold_seconds


def _sanitize_log_fields(fields: dict[str, Any], *, prefix: str) -> dict[str, Any]:
    sanitized: dict[str, Any] = {}
    for key, value in fields.items():
        sanitized_key = f"{prefix}{key}" if key in _RESERVED_LOG_EVENT_KEYS else key
        sanitized[sanitized_key] = value
    return sanitized


def _build_graph_client(config: JalapenoConfig) -> InstagramGraphClient:
    access_token = _read_secret(config.instagram.access_token_secret_name)
    ig_user_id = _read_secret(config.instagram.ig_user_id_secret_name)
    return InstagramGraphClient(
        ig_user_id=ig_user_id,
        access_token=access_token,
        api_version=config.instagram.api_version,
        simulate=False,
        timeout_seconds=30,
    )


def _analyze_post_media_against_recent_media(post: dict[str, Any], recent_media: list[dict[str, Any]]) -> dict[str, Any]:
    stored_id = str(post.get("instagram_media_id") or "")
    post_caption = _normalize_caption(post.get("generated_caption") or post.get("caption"))
    post_permalink = _normalize_permalink(post.get("instagram_permalink"))
    post_published_at = _parse_dt(post.get("published_at"))
    exact_id_match = any(str(item.get("id") or "") == stored_id for item in recent_media)
    if exact_id_match:
        return {"post_id": str(post.get("id")), "stored_id": stored_id, "match_type": "exact_id", "candidate": None}
    for item in recent_media:
        if post_permalink and _normalize_permalink(item.get("permalink")) == post_permalink:
            return {"post_id": str(post.get("id")), "stored_id": stored_id, "match_type": "permalink", "candidate": item}
    for item in recent_media:
        if post_caption and _normalize_caption(item.get("caption")) == post_caption:
            return {"post_id": str(post.get("id")), "stored_id": stored_id, "match_type": "caption", "candidate": item}
    for item in recent_media:
        if _timestamp_close(post_published_at, _parse_dt(item.get("timestamp"))):
            return {"post_id": str(post.get("id")), "stored_id": stored_id, "match_type": "timestamp", "candidate": item}
    return {"post_id": str(post.get("id")), "stored_id": stored_id, "match_type": "none", "candidate": None}


def run_metrics_diagnostics(
    config: JalapenoConfig,
    client: SupabaseClient,
    *,
    logger=None,
    run_id: str | None = None,
    now: datetime | None = None,
    recent_media_limit: int = 25,
) -> MetricsDiagnosticsResult:
    active_run_id = run_id or str(uuid4())
    current_now = now or _utcnow()
    graph = _build_graph_client(config)
    me_ok = False
    accounts_ok = False
    configured_page_found = False
    configured_ig_account_found = False
    recent_media_ok = False
    mismatches: list[dict[str, Any]] = []
    repair_candidates: list[dict[str, Any]] = []

    log_event(logger, "metrics_diagnostics_started", run_id=active_run_id, stage="metrics", status="started")

    me_payload = graph.get_me()
    me_ok = bool(me_payload.get("id"))
    log_event(logger, "metrics_diagnostics_me_checked", run_id=active_run_id, me_ok=me_ok, me_id=me_payload.get("id"))

    accounts_payload = graph.get_me_accounts()
    account_rows = accounts_payload.get("data") if isinstance(accounts_payload.get("data"), list) else []
    accounts_ok = True
    for account in account_rows:
        if str(account.get("id") or "") == config.facebook_page_id:
            configured_page_found = True
        ig_account = account.get("instagram_business_account") if isinstance(account.get("instagram_business_account"), dict) else {}
        if str(ig_account.get("id") or "") == config.instagram_business_account_id:
            configured_ig_account_found = True
    log_event(
        logger,
        "metrics_diagnostics_accounts_checked",
        run_id=active_run_id,
        accounts_ok=accounts_ok,
        account_count=len(account_rows),
        configured_page_found=configured_page_found,
        configured_ig_account_found=configured_ig_account_found,
        configured_facebook_page_id=config.facebook_page_id,
        configured_instagram_business_account_id=config.instagram_business_account_id,
    )

    recent_media = graph.get_recent_media(limit=recent_media_limit)
    recent_media_ok = True
    recent_media_ids = {str(item.get("id") or "") for item in recent_media}
    log_event(
        logger,
        "metrics_diagnostics_recent_media_loaded",
        run_id=active_run_id,
        recent_media_ok=recent_media_ok,
        recent_media_count=len(recent_media),
        recent_media_ids=sorted(id_ for id_ in recent_media_ids if id_),
    )

    posts = _fetch_published_posts(client, current_now, backfill=True)
    found_in_recent = 0
    for post in posts:
        stored_id = str(post.get("instagram_media_id") or "")
        if stored_id in recent_media_ids:
            found_in_recent += 1
            continue
        analysis = _analyze_post_media_against_recent_media(post, recent_media)
        mismatch = {
            "post_id": str(post.get("id") or ""),
            "run_id": str(post.get("run_id") or ""),
            "stored_instagram_media_id": stored_id,
            "instagram_permalink": post.get("instagram_permalink"),
            "published_at": post.get("published_at"),
            "caption_preview": (post.get("generated_caption") or "")[:120],
            "match_type": analysis["match_type"],
            "proposed_instagram_media_id": analysis["candidate"].get("id") if isinstance(analysis["candidate"], dict) else None,
            "proposed_permalink": analysis["candidate"].get("permalink") if isinstance(analysis["candidate"], dict) else None,
            "proposed_timestamp": analysis["candidate"].get("timestamp") if isinstance(analysis["candidate"], dict) else None,
        }
        mismatches.append(mismatch)
        log_event(
            logger,
            "metrics_recent_media_mismatch",
            run_id=active_run_id,
            stage="metrics",
            status="mismatch",
            **_sanitize_log_fields(mismatch, prefix="mismatch_"),
        )
        if mismatch["proposed_instagram_media_id"]:
            repair_candidates.append(mismatch)

    log_event(
        logger,
        "metrics_diagnostics_completed",
        run_id=active_run_id,
        stage="metrics",
        status="completed",
        me_ok=me_ok,
        accounts_ok=accounts_ok,
        configured_page_found=configured_page_found,
        configured_ig_account_found=configured_ig_account_found,
        recent_media_ok=recent_media_ok,
        recent_media_count=len(recent_media),
        stored_ids_checked=len(posts),
        stored_ids_found_in_recent_media=found_in_recent,
        mismatch_count=len(mismatches),
        repair_candidate_count=len(repair_candidates),
    )
    return MetricsDiagnosticsResult(
        me_ok=me_ok,
        accounts_ok=accounts_ok,
        configured_page_found=configured_page_found,
        configured_ig_account_found=configured_ig_account_found,
        recent_media_ok=recent_media_ok,
        recent_media_count=len(recent_media),
        stored_ids_checked=len(posts),
        stored_ids_found_in_recent_media=found_in_recent,
        mismatch_count=len(mismatches),
        repair_candidates=repair_candidates,
        mismatches=mismatches,
    )


def repair_metrics_media_ids(
    config: JalapenoConfig,
    client: SupabaseClient,
    *,
    logger=None,
    dry_run: bool = True,
    run_id: str | None = None,
    now: datetime | None = None,
) -> list[dict[str, Any]]:
    active_run_id = run_id or str(uuid4())
    diagnostics = run_metrics_diagnostics(config, client, logger=logger, run_id=active_run_id, now=now)
    proposed_updates: list[dict[str, Any]] = []
    for candidate in diagnostics.repair_candidates:
        if not candidate.get("proposed_instagram_media_id"):
            continue
        proposed = {
            "post_id": candidate["post_id"],
            "old_instagram_media_id": candidate["stored_instagram_media_id"],
            "new_instagram_media_id": candidate["proposed_instagram_media_id"],
            "match_type": candidate["match_type"],
            "proposed_permalink": candidate.get("proposed_permalink"),
        }
        proposed_updates.append(proposed)
        log_event(
            logger,
            "metrics_media_id_repair_candidate",
            run_id=active_run_id,
            stage="metrics",
            dry_run=dry_run,
            **_sanitize_log_fields(proposed, prefix="repair_"),
        )
        if dry_run:
            continue
        update_publish_status(
            client,
            post_id=UUID(candidate["post_id"]),
            publish_status="published",
            instagram_media_id=str(candidate["proposed_instagram_media_id"]),
            instagram_permalink=str(candidate.get("proposed_permalink") or ""),
        )
        log_event(
            logger,
            "metrics_media_id_repair_applied",
            run_id=active_run_id,
            stage="metrics",
            **_sanitize_log_fields(proposed, prefix="repair_"),
        )
    return proposed_updates


def collect_instagram_metrics(
    config: JalapenoConfig,
    client: SupabaseClient,
    *,
    logger=None,
    run_id: str | None = None,
    now: datetime | None = None,
    backfill: bool = False,
    dry_run: bool = False,
    diagnostics: bool = False,
    repair_media_ids: bool = False,
) -> MetricsCollectionResult:
    started = time.perf_counter()
    now = now or _utcnow()
    active_run_id = run_id or str(uuid4())
    persisted = 0
    failures = 0
    action_required = False
    skipped_duplicates = 0
    repair_candidates = 0

    log_event(
        logger,
        "metrics_collection_started",
        run_id=active_run_id,
        stage="metrics",
        status="started",
        backfill=backfill,
        dry_run=dry_run,
        diagnostics=diagnostics,
        repair_media_ids=repair_media_ids,
    )

    diagnostics_result = None
    if diagnostics or repair_media_ids:
        diagnostics_result = run_metrics_diagnostics(config, client, logger=logger, run_id=active_run_id, now=now)
        repair_candidates = len(diagnostics_result.repair_candidates)
    if repair_media_ids:
        repair_metrics_media_ids(config, client, logger=logger, dry_run=dry_run, run_id=active_run_id, now=now)

    graph: InstagramGraphClient | None = None
    if not dry_run:
        graph = _build_graph_client(config)

    posts = _fetch_published_posts(client, now, backfill=backfill)
    log_event(logger, "published_posts_loaded", run_id=active_run_id, stage="metrics", status="completed", candidate_count=len(posts), backfill=backfill)
    existing_windows = _existing_metric_windows(client, posts)
    deduped_posts: list[dict[str, Any]] = []
    for post in posts:
        post_id = str(post.get("id"))
        window = str(post.get("metrics_collection_window"))
        if (post_id, window) in existing_windows:
            skipped_duplicates += 1
            log_event(
                logger,
                "metrics_candidate_skipped_duplicate",
                run_id=active_run_id,
                post_id=post_id,
                instagram_media_id=post.get("instagram_media_id"),
                collection_window=window,
                stage="metrics",
                status="skipped",
            )
            continue
        deduped_posts.append(post)
    posts = deduped_posts

    for post in posts:
        post_started = time.perf_counter()
        post_id = str(post.get("id"))
        media_id = str(post.get("instagram_media_id"))
        window = str(post.get("metrics_collection_window"))
        log_event(
            logger,
            "metrics_candidate_selected",
            run_id=active_run_id,
            post_id=post_id,
            instagram_media_id=media_id,
            collection_window=window,
            exact_window=bool(post.get("metrics_exact_window")),
            stage="metrics",
            status="selected",
        )
        if dry_run:
            continue
        failure_stage = "insights"
        try:
            if graph is None:
                raise ConfigError("Instagram Graph client was not initialized")
            log_event(
                logger,
                "instagram_insights_fetch_started",
                run_id=active_run_id,
                post_id=post_id,
                instagram_media_id=media_id,
                collection_window=window,
                stage="metrics",
                status="started",
            )
            raw_metrics = graph.get_media_metrics(media_id)
            insight_errors = raw_metrics.get("insight_errors") if isinstance(raw_metrics.get("insight_errors"), dict) else {}
            returned_metrics = raw_metrics.get("returned_insight_metrics") if isinstance(raw_metrics.get("returned_insight_metrics"), list) else []
            if insight_errors and not returned_metrics:
                combined_error = " ".join(str(value) for value in insight_errors.values())
                classification = classify_meta_error(SupabaseError(combined_error))
                if classification in {"token_expired", "rate_limit", "meta_media_unreadable_or_missing_permission"}:
                    raise SupabaseError(combined_error)
            log_event(
                logger,
                "instagram_insights_fetch_succeeded",
                run_id=active_run_id,
                post_id=post_id,
                instagram_media_id=media_id,
                collection_window=window,
                requested_metrics=raw_metrics.get("requested_insight_metrics"),
                returned_metrics=raw_metrics.get("returned_insight_metrics"),
                missing_metrics=raw_metrics.get("missing_insight_metrics"),
                stage="metrics",
                status="completed",
            )
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
            failure_stage = "insert"
            log_event(
                logger,
                "post_metrics_insert_started",
                run_id=active_run_id,
                post_id=post_id,
                instagram_media_id=media_id,
                collection_window=window,
                stage="metrics",
                status="started",
            )
            insert_metrics_snapshot(
                client,
                post_id=UUID(post_id),
                instagram_media_id=media_id,
                collected_at=now,
                published_at=published_at,
                post_age_hours=age_hours,
                post_age_days=age_days,
                raw_metrics=raw_metrics,
                metadata={
                    "source": "instagram_graph_api",
                    "run_id": active_run_id,
                    "collection_window": window,
                    "exact_collection_window": bool(post.get("metrics_exact_window")),
                    "backfill": backfill,
                    **creative,
                },
                **metrics,
                **creative,
            )
            persisted += 1
            log_event(
                logger,
                "post_metrics_insert_succeeded",
                run_id=active_run_id,
                post_id=post_id,
                instagram_media_id=media_id,
                collection_window=window,
                stage="metrics",
                status="completed",
                duration_ms=int((time.perf_counter() - post_started) * 1000),
                engagement_rate=metrics["engagement_rate"],
            )
        except Exception as exc:
            failures += 1
            error_type = classify_meta_error(exc)
            if error_type == "token_expired":
                action_required = True
                log_event(
                    logger,
                    "instagram_insights_fetch_failed" if failure_stage == "insights" else "post_metrics_insert_failed",
                    level="error",
                    run_id=active_run_id,
                    post_id=post_id,
                    instagram_media_id=media_id,
                    collection_window=window,
                    stage="metrics",
                    status="failed_action_required",
                    error_type=error_type,
                    error=str(exc),
                )
                log_event(
                    logger,
                    "token_expired_detected",
                    level="error",
                    run_id=active_run_id,
                    post_id=post_id,
                    instagram_media_id=media_id,
                    stage="metrics",
                    status="failed_action_required",
                    error=str(exc),
                )
            elif error_type == "rate_limit":
                log_event(
                    logger,
                    "instagram_insights_fetch_failed" if failure_stage == "insights" else "post_metrics_insert_failed",
                    level="warning",
                    run_id=active_run_id,
                    post_id=post_id,
                    instagram_media_id=media_id,
                    collection_window=window,
                    stage="metrics",
                    status="retry_deferred",
                    error_type=error_type,
                    error=str(exc),
                )
            else:
                log_event(
                    logger,
                    "instagram_insights_fetch_failed" if failure_stage == "insights" else "post_metrics_insert_failed",
                    level="error",
                    run_id=active_run_id,
                    post_id=post_id,
                    instagram_media_id=media_id,
                    collection_window=window,
                    stage="metrics",
                    status="failed",
                    error_type=error_type,
                    error=str(exc),
                )
            try:
                insert_error_row(
                    client,
                    run_id=UUID(active_run_id) if len(active_run_id) == 36 else None,
                    post_id=UUID(post_id),
                    stage="metrics",
                    error_type=error_type,
                    message=str(exc),
                    raw_payload={"instagram_media_id": media_id, "collection_window": window},
                    is_retryable=error_type == "rate_limit",
                    retry_count=0,
                )
            except Exception:
                pass
            continue

    log_event(
        logger,
        "metrics_collection_completed" if not failures else "metrics_collection_completed_with_failures",
        level="error" if action_required else "info",
        run_id=active_run_id,
        stage="metrics",
        status="failed_action_required" if action_required else "completed",
        duration_ms=int((time.perf_counter() - started) * 1000),
        checked_posts=len(posts),
        snapshots_persisted=persisted,
        failures=failures,
        skipped_duplicates=skipped_duplicates,
        backfill=backfill,
        dry_run=dry_run,
        diagnostics=diagnostics,
        repair_media_ids=repair_media_ids,
        diagnostics_mismatch_count=(diagnostics_result.mismatch_count if diagnostics_result else 0),
        repair_candidate_count=repair_candidates,
    )
    return MetricsCollectionResult(
        run_id=active_run_id,
        checked_posts=len(posts),
        snapshots_persisted=persisted,
        failures=failures,
        action_required=action_required,
        skipped_duplicates=skipped_duplicates,
        dry_run=dry_run,
        diagnostics_ran=bool(diagnostics or repair_media_ids),
        repair_candidates=repair_candidates,
    )
