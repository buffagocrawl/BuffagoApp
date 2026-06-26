from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
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
    candidate_number: int | None = None,
    post_type: str | None = None,
    idea: str | None = None,
    reasoning: str | None = None,
    caption: str | None = None,
    hashtags: list[str] | None = None,
    image_prompt: str | None = None,
    image_storage_path: str | None = None,
    image_url: str | None = None,
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
        "raw_text_prompt": raw_text_prompt or {},
        "raw_image_prompt": raw_image_prompt or {},
        "raw_ai_response": raw_ai_response or {},
        "selected": selected,
        "rejection_reason": rejection_reason,
    }
    if scores:
        payload.update(scores)
    rows = client.insert_row("jalapeno_post_candidates", payload)
    return rows[0] if rows else payload


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
        "metadata": metadata or {},
    }
    rows = client.insert_row("jalapeno_posts", payload)
    return rows[0] if rows else payload


def update_publish_status(
    client: SupabaseClient,
    *,
    post_id: UUID,
    publish_status: str,
    retry_count: int | None = None,
    last_publish_attempt_at: datetime | None = None,
    published_at: datetime | None = None,
    instagram_media_id: str | None = None,
    instagram_permalink: str | None = None,
    publish_response: dict[str, Any] | None = None,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    now = _utcnow().isoformat()
    payload: dict[str, Any] = {
        "publish_status": publish_status,
        "updated_at": now,
    }
    if retry_count is not None:
        payload["retry_count"] = retry_count
    if last_publish_attempt_at is not None:
        payload["last_publish_attempt_at"] = last_publish_attempt_at.isoformat()
    if published_at is not None:
        payload["published_at"] = published_at.isoformat()
    if instagram_media_id is not None:
        payload["instagram_media_id"] = instagram_media_id
    if instagram_permalink is not None:
        payload["instagram_permalink"] = instagram_permalink
    if publish_response is not None:
        payload["publish_response"] = publish_response
    if metadata is not None:
        payload["metadata"] = metadata
    rows = client.update_rows("jalapeno_posts", {"id": f"eq.{post_id}"}, payload)
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
) -> dict[str, Any]:
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
        "captured_at": captured_at.isoformat() if captured_at else None,
    }
    rows = client.insert_row("jalapeno_post_metrics", payload)
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
