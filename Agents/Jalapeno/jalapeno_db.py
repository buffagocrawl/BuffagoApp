from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

from logging_utils import log_event
from supabase_client import SupabaseClient


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


@dataclass(frozen=True, slots=True)
class JalapenoRunContext:
    run_id: UUID
    agent_name: str = "jalapeno"
    post_type: str | None = None
    dry_run: bool = True
    agent_version: str | None = None
    workflow_version: str | None = None
    prompt_version: str | None = None
    git_commit: str | None = None
    environment: str | None = None
    trigger_source: str | None = None
    model_name: str | None = None
    image_model_name: str | None = None


def _base_run_payload(context: JalapenoRunContext, status: str, metadata: dict[str, Any] | None = None) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "run_id": str(context.run_id),
        "agent_name": context.agent_name,
        "status": status,
        "dry_run": context.dry_run,
        "started_at": _utcnow().isoformat(),
        "metadata": metadata or {},
    }
    optional_fields = {
        "post_type": context.post_type,
        "agent_version": context.agent_version,
        "workflow_version": context.workflow_version,
        "prompt_version": context.prompt_version,
        "git_commit": context.git_commit,
        "environment": context.environment,
        "trigger_source": context.trigger_source,
        "model_name": context.model_name,
        "image_model_name": context.image_model_name,
    }
    payload.update({key: value for key, value in optional_fields.items() if value is not None})
    return payload


def create_run(
    client: SupabaseClient,
    *,
    context: JalapenoRunContext | None = None,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    run_context = context or JalapenoRunContext(run_id=uuid4())
    payload = _base_run_payload(run_context, "started", metadata=metadata)
    rows = client.insert_row("jalapeno_runs", payload)
    return rows[0] if rows else payload


def ensure_run(
    client: SupabaseClient,
    *,
    context: JalapenoRunContext,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    existing_rows = client.fetch_rows(
        "jalapeno_runs",
        select="*",
        filters={"run_id": f"eq.{context.run_id}", "limit": 1},
    )
    if existing_rows:
        return existing_rows[0]
    return create_run(client, context=context, metadata=metadata)


def complete_run(
    client: SupabaseClient,
    *,
    run_id: UUID,
    started_at: datetime | None = None,
    duration_ms: int | None = None,
    status: str = "completed",
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    now = _utcnow()
    update_payload: dict[str, Any] = {
        "status": status,
        "completed_at": now.isoformat(),
        "updated_at": now.isoformat(),
    }
    if duration_ms is None and started_at is not None:
        duration_ms = int((now - started_at).total_seconds() * 1000)
    if duration_ms is not None:
        update_payload["duration_ms"] = duration_ms
    if metadata is not None:
        update_payload["metadata"] = metadata
    rows = client.update_rows("jalapeno_runs", {"run_id": f"eq.{run_id}"}, update_payload)
    return rows[0] if rows else update_payload


def fail_run(
    client: SupabaseClient,
    *,
    run_id: UUID,
    message: str,
    started_at: datetime | None = None,
    duration_ms: int | None = None,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    payload = {"message": message, "failed_at": _utcnow().isoformat(), "metadata": metadata or {}}
    result = complete_run(
        client,
        run_id=run_id,
        started_at=started_at,
        duration_ms=duration_ms,
        status="failed",
        metadata=payload,
    )
    return result


def insert_post_candidate(
    client: SupabaseClient,
    *,
    run_id: UUID,
    candidate_id: UUID | None = None,
    candidate_number: int | None = None,
    post_type: str | None = None,
    idea: str | None = None,
    reasoning: str | None = None,
    caption: str | None = None,
    hashtags: list[str] | None = None,
    image_prompt: str | None = None,
    image_storage_path: str | None = None,
    image_url: str | None = None,
    caption_options: list[dict[str, Any]] | None = None,
    overlay_options: list[dict[str, Any]] | None = None,
    selected_caption: str | None = None,
    selected_overlay: str | None = None,
    ranking_reason: str | None = None,
    ranking_score: float | None = None,
    ranking_breakdown: dict[str, Any] | None = None,
    openai_used: bool | None = None,
    openai_model: str | None = None,
    fallback_reason: str | None = None,
    feedback_summary_version: str | None = None,
    feedback_summary: dict[str, Any] | None = None,
    raw_text_prompt: dict[str, Any] | None = None,
    raw_image_prompt: dict[str, Any] | None = None,
    raw_ai_response: dict[str, Any] | None = None,
    scores: dict[str, float] | None = None,
    selected: bool = False,
    rejection_reason: str | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "run_id": str(run_id),
        "candidate_number": candidate_number,
        "post_type": post_type,
        "idea": idea,
        "reasoning": reasoning,
        "caption": caption,
        "hashtags": hashtags,
        "image_prompt": image_prompt,
        "image_storage_path": image_storage_path,
        "image_url": image_url,
        "caption_options": caption_options or [],
        "overlay_options": overlay_options or [],
        "selected_caption": selected_caption,
        "selected_overlay": selected_overlay,
        "ranking_reason": ranking_reason,
        "ranking_score": ranking_score,
        "ranking_breakdown": ranking_breakdown or {},
        "openai_used": openai_used if openai_used is not None else False,
        "openai_model": openai_model,
        "fallback_reason": fallback_reason,
        "feedback_summary_version": feedback_summary_version,
        "feedback_summary": feedback_summary or {},
        "raw_text_prompt": raw_text_prompt or {},
        "raw_image_prompt": raw_image_prompt or {},
        "raw_ai_response": raw_ai_response or {},
        "selected": selected,
        "rejection_reason": rejection_reason,
    }
    if candidate_id is not None:
        payload["id"] = str(candidate_id)
    if scores:
        payload.update(scores)
    rows = client.insert_row("jalapeno_post_candidates", payload)
    return rows[0] if rows else payload


def _string_or_none(value: Any) -> str | None:
    if isinstance(value, str):
        stripped = value.strip()
        if stripped:
            return stripped
    return None


def _list_of_strings(value: Any) -> list[str] | None:
    if not isinstance(value, list):
        return None
    items = [item.strip() for item in value if isinstance(item, str) and item.strip()]
    return items or None


def ensure_selected_post_candidate(
    client: SupabaseClient,
    *,
    run_context: JalapenoRunContext,
    winner_payload: dict[str, Any],
    decision_summary: dict[str, Any] | None = None,
    logger=None,
) -> dict[str, Any]:
    candidate_id_raw = _string_or_none(winner_payload.get("candidate_id")) or _string_or_none(winner_payload.get("id"))
    if not candidate_id_raw:
        message = "Selected candidate is missing candidate_id"
        log_event(logger, "candidate_persistence_failed", level="error", run_id=str(run_context.run_id), error=message)
        raise ValueError(message)

    try:
        candidate_id = UUID(candidate_id_raw)
    except ValueError as exc:
        message = f"Selected candidate_id is not a valid UUID: {candidate_id_raw}"
        log_event(
            logger,
            "candidate_persistence_failed",
            level="error",
            run_id=str(run_context.run_id),
            candidate_id=candidate_id_raw,
            error=message,
        )
        raise ValueError(message) from exc

    log_event(
        logger,
        "candidate_persistence_started",
        run_id=str(run_context.run_id),
        candidate_id=str(candidate_id),
        post_type=winner_payload.get("scheduled_post_type") or winner_payload.get("content_type") or run_context.post_type,
    )
    try:
        ensure_run(
            client,
            context=run_context,
            metadata={
                "source": "candidate_persistence",
                "candidate_id": str(candidate_id),
            },
        )
        existing_rows = client.fetch_rows(
            "jalapeno_post_candidates",
            select="id,run_id,selected",
            filters={"id": f"eq.{candidate_id}", "limit": 1},
        )
        if existing_rows:
            mark_selected_candidate(client, run_id=run_context.run_id, candidate_id=candidate_id)
            log_event(
                logger,
                "candidate_already_existed",
                run_id=str(run_context.run_id),
                candidate_id=str(candidate_id),
            )
            return existing_rows[0]

        reasoning_lines = decision_summary.get("winner_reasoning", []) if isinstance(decision_summary, dict) else []
        reasoning = "\n".join(str(item) for item in reasoning_lines if str(item).strip()) or _string_or_none(winner_payload.get("reason_chosen"))
        row = insert_post_candidate(
            client,
            run_id=run_context.run_id,
            candidate_id=candidate_id,
            post_type=_string_or_none(winner_payload.get("scheduled_post_type")) or _string_or_none(winner_payload.get("content_type")) or run_context.post_type,
            idea=_string_or_none(winner_payload.get("working_title")) or _string_or_none(winner_payload.get("short_summary")),
            reasoning=reasoning,
            caption=_string_or_none(winner_payload.get("caption")),
            hashtags=_list_of_strings(winner_payload.get("hashtags")),
            image_prompt=_string_or_none(winner_payload.get("image_prompt")),
            image_storage_path=_string_or_none(winner_payload.get("image_storage_path")),
            image_url=_string_or_none(winner_payload.get("image_url")) or _string_or_none(winner_payload.get("public_image_url")),
            caption_options=winner_payload.get("caption_options") if isinstance(winner_payload.get("caption_options"), list) else None,
            overlay_options=winner_payload.get("overlay_options") if isinstance(winner_payload.get("overlay_options"), list) else None,
            selected_caption=_string_or_none(winner_payload.get("caption")),
            selected_overlay=_string_or_none(winner_payload.get("overlay_text")),
            ranking_reason=_string_or_none(winner_payload.get("ranking_reason")),
            ranking_score=winner_payload.get("ranking_score") if isinstance(winner_payload.get("ranking_score"), (int, float)) else None,
            ranking_breakdown=winner_payload.get("ranking_breakdown") if isinstance(winner_payload.get("ranking_breakdown"), dict) else None,
            openai_used=bool(winner_payload.get("openai_used")) if winner_payload.get("openai_used") is not None else None,
            openai_model=_string_or_none(winner_payload.get("openai_model")),
            fallback_reason=_string_or_none(winner_payload.get("fallback_reason")),
            feedback_summary_version=_string_or_none(winner_payload.get("feedback_summary_version")),
            feedback_summary=winner_payload.get("feedback_summary") if isinstance(winner_payload.get("feedback_summary"), dict) else None,
            raw_ai_response={
                "winner": winner_payload,
                "decision_summary": decision_summary or {},
                "persisted_from": "selected_candidate_guard",
            },
            scores={
                key: winner_payload.get(key)
                for key in ("quality_score", "overall_score", "duplicate_score")
                if isinstance(winner_payload.get(key), (int, float))
            },
            selected=True,
        )
        mark_selected_candidate(client, run_id=run_context.run_id, candidate_id=candidate_id)
    except Exception as exc:
        log_event(
            logger,
            "candidate_persistence_failed",
            level="error",
            run_id=str(run_context.run_id),
            candidate_id=str(candidate_id),
            error=str(exc),
        )
        raise
    log_event(
        logger,
        "candidate_persistence_succeeded",
        run_id=str(run_context.run_id),
        candidate_id=str(candidate_id),
    )
    return row


def mark_selected_candidate(client: SupabaseClient, *, run_id: UUID, candidate_id: UUID) -> dict[str, Any]:
    client.update_rows(
        "jalapeno_post_candidates",
        {"id": f"eq.{candidate_id}"},
        {"selected": True, "updated_at": _utcnow().isoformat()},
    )
    rows = client.update_rows(
        "jalapeno_runs",
        {"run_id": f"eq.{run_id}"},
        {"selected_candidate_id": str(candidate_id), "updated_at": _utcnow().isoformat()},
    )
    return rows[0] if rows else {"run_id": str(run_id), "selected_candidate_id": str(candidate_id)}


def insert_final_post(
    client: SupabaseClient,
    *,
    run_id: UUID,
    candidate_id: UUID | None = None,
    post_type: str | None = None,
    chosen_idea: str | None = None,
    generated_caption: str | None = None,
    hashtags: list[str] | None = None,
    image_prompt: str | None = None,
    image_storage_path: str | None = None,
    image_url: str | None = None,
    media_source: str | None = None,
    video_asset_id: UUID | None = None,
    storage_path: str | None = None,
    video_url: str | None = None,
    original_video_url: str | None = None,
    processed_video_url: str | None = None,
    original_storage_path: str | None = None,
    processed_storage_path: str | None = None,
    overlay_text: str | None = None,
    overlay_status: str | None = None,
    overlay_error: str | None = None,
    caption_options: list[dict[str, Any]] | None = None,
    overlay_options: list[dict[str, Any]] | None = None,
    selected_caption: str | None = None,
    selected_overlay: str | None = None,
    ranking_reason: str | None = None,
    ranking_score: float | None = None,
    ranking_breakdown: dict[str, Any] | None = None,
    openai_used: bool | None = None,
    openai_model: str | None = None,
    fallback_reason: str | None = None,
    feedback_summary_version: str | None = None,
    feedback_summary: dict[str, Any] | None = None,
    scheduled_for: datetime | None = None,
    publish_status: str = "drafted",
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "run_id": str(run_id),
        "candidate_id": str(candidate_id) if candidate_id else None,
        "post_type": post_type,
        "chosen_idea": chosen_idea,
        "generated_caption": generated_caption,
        "hashtags": hashtags,
        "image_prompt": image_prompt,
        "image_storage_path": image_storage_path,
        "image_url": image_url,
        "scheduled_for": scheduled_for.isoformat() if scheduled_for else None,
        "publish_status": publish_status,
        "caption_options": caption_options or [],
        "overlay_options": overlay_options or [],
        "selected_caption": selected_caption,
        "selected_overlay": selected_overlay,
        "ranking_reason": ranking_reason,
        "ranking_score": ranking_score,
        "ranking_breakdown": ranking_breakdown or {},
        "openai_used": openai_used if openai_used is not None else False,
        "openai_model": openai_model,
        "fallback_reason": fallback_reason,
        "feedback_summary_version": feedback_summary_version,
        "feedback_summary": feedback_summary or {},
        "metadata": metadata or {},
    }
    if media_source is not None:
        payload["media_source"] = media_source
    if video_asset_id is not None:
        payload["video_asset_id"] = str(video_asset_id)
    if storage_path is not None:
        payload["storage_path"] = storage_path
    if video_url is not None:
        payload["video_url"] = video_url
    if original_video_url is not None:
        payload["original_video_url"] = original_video_url
    if processed_video_url is not None:
        payload["processed_video_url"] = processed_video_url
    if original_storage_path is not None:
        payload["original_storage_path"] = original_storage_path
    if processed_storage_path is not None:
        payload["processed_storage_path"] = processed_storage_path
    if overlay_text is not None:
        payload["overlay_text"] = overlay_text
    if overlay_status is not None:
        payload["overlay_status"] = overlay_status
    if overlay_error is not None:
        payload["overlay_error"] = overlay_error
    rows = client.insert_row("jalapeno_posts", payload)
    return rows[0] if rows else payload


def update_publish_status(
    client: SupabaseClient,
    *,
    post_id: UUID,
    publish_status: str,
    container_id: str | None = None,
    retry_count: int | None = None,
    last_publish_attempt_at: datetime | None = None,
    published_at: datetime | None = None,
    instagram_media_id: str | None = None,
    instagram_permalink: str | None = None,
    instagram_timestamp: str | None = None,
    instagram_media_type: str | None = None,
    failure_stage: str | None = None,
    failure_reason: str | None = None,
    error_code: str | None = None,
    error_message: str | None = None,
    publish_response: dict[str, Any] | None = None,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    now = _utcnow().isoformat()
    payload: dict[str, Any] = {
        "publish_status": publish_status,
        "updated_at": now,
    }
    metadata_updates: dict[str, Any] = dict(metadata or {})
    if retry_count is not None:
        payload["retry_count"] = retry_count
    if container_id is not None:
        metadata_updates["container_id"] = container_id
    if last_publish_attempt_at is not None:
        payload["last_publish_attempt_at"] = last_publish_attempt_at.isoformat()
    if published_at is not None:
        payload["published_at"] = published_at.isoformat()
    if instagram_media_id is not None:
        payload["instagram_media_id"] = instagram_media_id
    if instagram_permalink is not None:
        payload["instagram_permalink"] = instagram_permalink
    if instagram_timestamp is not None:
        metadata_updates["instagram_timestamp"] = instagram_timestamp
    if instagram_media_type is not None:
        metadata_updates["instagram_media_type"] = instagram_media_type
    if failure_stage is not None:
        metadata_updates["failure_stage"] = failure_stage
    if failure_reason is not None:
        metadata_updates["failure_reason"] = failure_reason
    if error_code is not None:
        metadata_updates["error_code"] = error_code
    if error_message is not None:
        metadata_updates["error_message"] = error_message
    if publish_response is not None:
        payload["publish_response"] = publish_response
    if metadata_updates:
        payload["metadata"] = metadata_updates
    rows = client.update_rows("jalapeno_posts", {"id": f"eq.{post_id}"}, payload)
    return rows[0] if rows else payload


def upsert_instagram_post(
    client: SupabaseClient,
    *,
    payload: dict[str, Any],
) -> dict[str, Any]:
    rows = client.upsert_rows("jalapeno_instagram_posts", payload, on_conflict="run_id")
    return rows[0] if rows else payload


def update_instagram_post(
    client: SupabaseClient,
    *,
    record_id: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    rows = client.update_rows("jalapeno_instagram_posts", {"id": f"eq.{record_id}"}, payload)
    return rows[0] if rows else payload


def update_instagram_post_by_post_id(
    client: SupabaseClient,
    *,
    post_id: UUID,
    payload: dict[str, Any],
) -> dict[str, Any]:
    rows = client.update_rows("jalapeno_instagram_posts", {"post_id": f"eq.{post_id}"}, payload)
    return rows[0] if rows else payload


def update_jalapeno_post_by_id(
    client: SupabaseClient,
    *,
    post_id: UUID,
    payload: dict[str, Any],
) -> dict[str, Any]:
    rows = client.update_rows("jalapeno_posts", {"id": f"eq.{post_id}"}, payload)
    return rows[0] if rows else payload


def mark_run_publish_failed(
    client: SupabaseClient,
    *,
    run_id: UUID,
    failure_stage: str,
    failure_reason: str,
    error_code: str | None = None,
    error_message: str | None = None,
    last_attempt_at: datetime | None = None,
    retry_count: int = 0,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "status": "failed",
        "publish_failure_stage": failure_stage,
        "publish_failure_reason": failure_reason,
        "publish_retry_count": retry_count,
        "updated_at": _utcnow().isoformat(),
    }
    if error_code is not None:
        payload["publish_error_code"] = error_code
    if error_message is not None:
        payload["publish_error_message"] = error_message
    if last_attempt_at is not None:
        payload["last_publish_attempt_at"] = last_attempt_at.isoformat()
    rows = client.update_rows("jalapeno_runs", {"run_id": f"eq.{run_id}"}, payload)
    return rows[0] if rows else payload


def insert_error_row(
    client: SupabaseClient,
    *,
    message: str,
    stage: str,
    run_id: UUID | None = None,
    post_id: UUID | None = None,
    candidate_id: UUID | None = None,
    error_type: str | None = None,
    stack_trace: str | None = None,
    raw_payload: dict[str, Any] | None = None,
    is_retryable: bool = False,
    retry_count: int = 0,
    resolved: bool = False,
    resolved_at: datetime | None = None,
) -> dict[str, Any]:
    payload = {
        "run_id": str(run_id) if run_id else None,
        "post_id": str(post_id) if post_id else None,
        "candidate_id": str(candidate_id) if candidate_id else None,
        "stage": stage,
        "error_type": error_type,
        "message": message,
        "stack_trace": stack_trace,
        "raw_payload": raw_payload or {},
        "is_retryable": is_retryable,
        "retry_count": retry_count,
        "resolved": resolved,
        "resolved_at": resolved_at.isoformat() if resolved_at else None,
    }
    rows = client.insert_row("jalapeno_errors", payload)
    return rows[0] if rows else payload


def insert_metrics_snapshot(
    client: SupabaseClient,
    *,
    post_id: UUID,
    instagram_media_id: str | None = None,
    likes: int | None = None,
    comments: int | None = None,
    shares: int | None = None,
    saves: int | None = None,
    reach: int | None = None,
    impressions: int | None = None,
    profile_visits: int | None = None,
    follows: int | None = None,
    engagement_rate: float | None = None,
    raw_metrics: dict[str, Any] | None = None,
    captured_at: datetime | None = None,
    collected_at: datetime | None = None,
    post_age_hours: float | None = None,
    post_age_days: float | None = None,
    caption: str | None = None,
    category: str | None = None,
    prompt_template: str | None = None,
    prompt_reason: str | None = None,
    image_prompt: str | None = None,
    image_style: str | None = None,
    hashtags: list[str] | None = None,
    cta_type: str | None = None,
    generation_model: str | None = None,
    image_model: str | None = None,
    cost_metadata: dict[str, Any] | None = None,
    published_at: datetime | None = None,
    state: str | list[str] | None = None,
    restaurant: str | list[str] | None = None,
    topic: str | None = None,
    video_asset_id: UUID | str | None = None,
    caption_type: str | None = None,
    video_style: str | None = None,
    media_source: str | None = None,
    storage_path: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    effective_collected_at = collected_at or captured_at or _utcnow()
    payload = {
        "post_id": str(post_id),
        "instagram_media_id": instagram_media_id,
        "likes": likes,
        "comments": comments,
        "shares": shares,
        "saves": saves,
        "reach": reach,
        "impressions": impressions,
        "profile_visits": profile_visits,
        "follows": follows,
        "engagement_rate": engagement_rate,
        "raw_metrics": raw_metrics or {},
        "captured_at": effective_collected_at.isoformat(),
        "collected_at": effective_collected_at.isoformat(),
        "post_age_hours": post_age_hours,
        "post_age_days": post_age_days,
        "caption": caption,
        "category": category,
        "prompt_template": prompt_template,
        "prompt_reason": prompt_reason,
        "image_prompt": image_prompt,
        "image_style": image_style,
        "hashtags": hashtags or [],
        "cta_type": cta_type,
        "generation_model": generation_model,
        "image_model": image_model,
        "cost_metadata": cost_metadata or {},
        "published_at": published_at.isoformat() if published_at else None,
        "state": state,
        "restaurant": restaurant,
        "topic": topic,
        "metadata": metadata or {},
    }
    if video_asset_id is not None:
        payload["video_asset_id"] = str(video_asset_id)
    if caption_type is not None:
        payload["caption_type"] = caption_type
    if video_style is not None:
        payload["video_style"] = video_style
    if media_source is not None:
        payload["media_source"] = media_source
    if storage_path is not None:
        payload["storage_path"] = storage_path
    rows = client.insert_row("jalapeno_post_metrics", payload)
    return rows[0] if rows else payload


def insert_performance_summary(
    client: SupabaseClient,
    *,
    summary_type: str,
    period_start: datetime,
    period_end: datetime,
    summary: dict[str, Any],
    generated_by_run_id: UUID | None = None,
) -> dict[str, Any]:
    payload = {
        "summary_type": summary_type,
        "period_start": period_start.isoformat(),
        "period_end": period_end.isoformat(),
        "summary": summary,
        "generated_by_run_id": str(generated_by_run_id) if generated_by_run_id else None,
    }
    rows = client.insert_row("jalapeno_performance_summaries", payload)
    return rows[0] if rows else payload


def insert_report_log(
    client: SupabaseClient,
    *,
    report_type: str,
    subject: str,
    body: str,
    period_start: datetime,
    period_end: datetime,
    delivery_status: str,
    recipient: str | None = None,
    run_id: UUID | None = None,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    payload = {
        "run_id": str(run_id) if run_id else None,
        "report_type": report_type,
        "subject": subject,
        "body": body,
        "period_start": period_start.isoformat(),
        "period_end": period_end.isoformat(),
        "delivery_status": delivery_status,
        "recipient": recipient,
        "metadata": metadata or {},
    }
    rows = client.insert_row("jalapeno_report_logs", payload)
    return rows[0] if rows else payload


def _json_safe_payload_value(value: Any) -> Any:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, (bytes, bytearray, memoryview)):
        return None
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, (UUID, Path)):
        return str(value)
    if isinstance(value, dict):
        cleaned: dict[str, Any] = {}
        for key, nested_value in value.items():
            safe_value = _json_safe_payload_value(nested_value)
            if safe_value is None and isinstance(nested_value, (bytes, bytearray, memoryview)):
                continue
            cleaned[str(key)] = safe_value
        return cleaned
    if isinstance(value, (list, tuple, set)):
        cleaned_items = []
        for item in value:
            safe_item = _json_safe_payload_value(item)
            if safe_item is None and isinstance(item, (bytes, bytearray, memoryview)):
                continue
            cleaned_items.append(safe_item)
        return cleaned_items
    return str(value)


def _ensure_json_serializable_payload(payload: dict[str, Any]) -> dict[str, Any]:
    cleaned = {key: _json_safe_payload_value(value) for key, value in payload.items()}
    try:
        json.dumps(cleaned)
    except TypeError as exc:  # pragma: no cover - _json_safe_payload_value should prevent this
        raise TypeError(f"jalapeno_image_assets payload contains a non-JSON-serializable value: {exc}") from exc
    return cleaned


def insert_image_asset(
    client: SupabaseClient,
    *,
    run_id: str,
    candidate_id: str,
    post_id: str | None = None,
    local_temp_path: str,
    storage_bucket: str | None,
    storage_path: str | None,
    public_url: str | None,
    image_type: str,
    content_type: str,
    width: int,
    height: int,
    aspect_ratio: float,
    file_size_bytes: int,
    format: str,
    branding_applied: bool,
    meme_format_applied: bool,
    validation_status: str,
    image_source: str,
    image_prompt: str,
    prompt_quality: int,
    validation_reason: str,
    quality_score: int | None = None,
    prompt_version: str | None = None,
    generation_time_ms: int | None = None,
    image_model: str | None = None,
    metadata: dict[str, Any] | None = None,
    uploaded_at: str | None = None,
    cleanup_status: str = "pending",
    logger=None,
) -> dict[str, Any]:
    payload = {
        "run_id": run_id,
        "candidate_id": candidate_id,
        "post_id": post_id,
        "local_temp_path": local_temp_path,
        "storage_bucket": storage_bucket,
        "storage_path": storage_path,
        "public_url": public_url,
        "image_type": image_type,
        "content_type": content_type,
        "width": width,
        "height": height,
        "aspect_ratio": aspect_ratio,
        "file_size_bytes": file_size_bytes,
        "format": format,
        "branding_applied": branding_applied,
        "meme_format_applied": meme_format_applied,
        "validation_status": validation_status,
        "image_source": image_source,
        "image_prompt": image_prompt,
        "prompt_quality": prompt_quality,
        "quality_score": quality_score,
        "validation_reason": validation_reason,
        "prompt_version": prompt_version,
        "generation_time_ms": generation_time_ms,
        "image_model": image_model,
        "metadata": metadata,
        "uploaded_at": uploaded_at,
        "cleanup_status": cleanup_status,
    }
    payload = _ensure_json_serializable_payload(payload)
    log_event(
        logger,
        "jalapeno_image_asset_insert_payload",
        table="jalapeno_image_assets",
        payload_keys=sorted(payload.keys()),
    )
    rows = client.insert_row("jalapeno_image_assets", payload)
    return rows[0] if rows else payload


def link_image_asset_to_decision(
    client: SupabaseClient,
    *,
    run_id: str,
    candidate_id: str,
    image_asset_id: str | None = None,
    image_public_url: str | None = None,
    image_storage_path: str | None = None,
    image_uploaded_at: str | None = None,
    image_prompt: str | None = None,
    image_source: str | None = None,
    prompt_quality: int | None = None,
    quality_score: int | None = None,
    validation_reason: str | None = None,
) -> dict[str, Any]:
    rows = client.fetch_rows(
        "jalapeno_content_decisions",
        select="id,decision_summary,winner_candidate_id,updated_at",
        filters={"run_id": f"eq.{run_id}", "limit": 1},
    )
    if not rows:
        return {"run_id": run_id, "candidate_id": candidate_id, "image_asset_id": image_asset_id}

    row = rows[0]
    decision_summary = row.get("decision_summary") if isinstance(row.get("decision_summary"), dict) else {}
    decision_summary = dict(decision_summary)
    decision_summary["image_asset"] = {
        "image_asset_id": image_asset_id,
        "candidate_id": candidate_id,
        "public_url": image_public_url,
        "storage_path": image_storage_path,
        "uploaded_at": image_uploaded_at,
        "image_prompt": image_prompt,
        "image_source": image_source,
        "prompt_quality": prompt_quality,
        "quality_score": quality_score,
        "validation_reason": validation_reason,
    }
    update_payload = {
        "decision_summary": decision_summary,
        "updated_at": _utcnow().isoformat(),
    }
    if image_public_url is not None:
        update_payload["image_public_url"] = image_public_url
    if image_storage_path is not None:
        update_payload["image_storage_path"] = image_storage_path
    if image_asset_id is not None:
        update_payload["image_asset_id"] = image_asset_id
    if image_uploaded_at is not None:
        update_payload["image_uploaded_at"] = image_uploaded_at
    updated = client.update_rows("jalapeno_content_decisions", {"id": f"eq.{row['id']}"}, update_payload)
    return updated[0] if updated else update_payload


def insert_content_candidate(
    client: SupabaseClient,
    *,
    run_id: UUID,
    payload: dict[str, Any],
) -> dict[str, Any]:
    row = {"run_id": str(run_id), **payload}
    rows = client.insert_row("jalapeno_content_candidates", row)
    return rows[0] if rows else row


def insert_content_decision(
    client: SupabaseClient,
    *,
    run_id: UUID,
    payload: dict[str, Any],
) -> dict[str, Any]:
    row = {"run_id": str(run_id), **payload}
    rows = client.insert_row("jalapeno_content_decisions", row)
    return rows[0] if rows else row


def upsert_content_memory(
    client: SupabaseClient,
    *,
    payload: dict[str, Any],
) -> dict[str, Any]:
    rows = client.upsert_rows("jalapeno_content_memory", payload, on_conflict="post_id")
    return rows[0] if rows else payload


def insert_content_performance(
    client: SupabaseClient,
    *,
    payload: dict[str, Any],
) -> dict[str, Any]:
    rows = client.insert_row("jalapeno_content_performance", payload)
    return rows[0] if rows else payload


def read_settings(client: SupabaseClient, setting_keys: list[str]) -> dict[str, dict[str, Any]]:
    rows = client.fetch_rows("jalapeno_settings", select="setting_key,setting_value,is_enabled,is_secret")
    wanted = set(setting_keys)
    return {row["setting_key"]: row for row in rows if row.get("setting_key") in wanted}


def log_run_started(logger, **fields: Any) -> None:
    log_event(logger, "run_started", **fields)


def log_run_completed(logger, **fields: Any) -> None:
    log_event(logger, "run_completed", **fields)


def log_run_failed(logger, **fields: Any) -> None:
    log_event(logger, "run_failed", level="error", **fields)
