from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from logging_utils import log_event


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _string_or_none(value: Any) -> str | None:
    if isinstance(value, str) and value.strip():
        return value.strip()
    return None


def _list_of_strings(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    items: list[str] = []
    for item in value:
        if isinstance(item, str) and item.strip():
            items.append(item.strip())
    return items


def _number_or_none(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    return None


def _resolve_prompt_quality(image_result: dict[str, Any]) -> int:
    prompt_quality_value = _number_or_none(image_result.get("prompt_quality"))
    if prompt_quality_value is None and isinstance(image_result.get("validation"), dict):
        prompt_quality_value = _number_or_none(image_result["validation"].get("prompt_quality"))
    if prompt_quality_value is None:
        quality_score_value = _number_or_none(image_result.get("quality_score"))
        if quality_score_value is not None:
            prompt_quality_value = quality_score_value
    if prompt_quality_value is None:
        raise ValueError("Approved post is missing prompt_quality")
    return int(round(prompt_quality_value))


def _resolve_quality_score(
    winner: dict[str, Any],
    image_result: dict[str, Any],
    *,
    logger=None,
) -> int:
    for key in ("quality_score", "overall_score", "final_score", "score"):
        value = _number_or_none(winner.get(key))
        if value is not None:
            return int(round(value))

    image_score = _number_or_none(image_result.get("quality_score"))
    if image_score is not None:
        return int(round(image_score))

    validation_payload = image_result.get("validation") if isinstance(image_result.get("validation"), dict) else {}
    validation_score = _number_or_none(validation_payload.get("quality_score"))
    if validation_score is None:
        validation_score = _number_or_none(validation_payload.get("prompt_quality"))
    if validation_score is None:
        validation_score = _number_or_none(image_result.get("prompt_quality"))

    source_object = {
        "winner": winner,
        "image_result": image_result,
    }
    log_event(
        logger,
        "quality_score missing from publish state",
        level="warning",
        quality_score=int(round(validation_score)) if validation_score is not None else None,
        source_object=source_object,
    )
    if validation_score is not None:
        return int(round(validation_score))

    raise ValueError("Approved post is missing quality_score")


@dataclass(frozen=True, slots=True)
class ApprovedInstagramPost:
    run_id: str
    candidate_id: str
    caption: str
    hashtags: list[str]
    alt_text: str | None
    image_prompt: str
    public_image_url: str
    content_type: str
    quality_score: int
    image_source: str
    image_validation_status: str
    image_validation_reason: str | None
    prompt_quality: int
    approved: bool
    scheduled_post_type: str | None = None
    user_tags: list[dict[str, Any]] = field(default_factory=list)
    location_id: str | None = None
    post_id: str | None = None
    image_asset_id: str | None = None
    media_kind: str = "image"
    public_video_url: str | None = None
    video_asset_id: str | None = None
    storage_path: str | None = None
    media_source: str | None = None
    container_id: str | None = None
    published_media_id: str | None = None
    permalink: str | None = None
    status: str | None = None
    scheduled_for: str | None = None
    published_at: str | None = None
    last_attempt_at: str | None = None
    retry_count: int = 0
    failure_stage: str | None = None
    failure_reason: str | None = None
    error_code: str | None = None
    error_message: str | None = None
    request_payload_safe: dict[str, Any] | None = None
    response_payload: dict[str, Any] | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


def _post_dict(source: dict[str, Any]) -> dict[str, Any]:
    if isinstance(source.get("winner"), dict):
        return source["winner"]
    return source


def load_approved_post_from_artifacts(
    content_decision: dict[str, Any],
    *,
    image_pipeline: dict[str, Any] | None = None,
    logger=None,
) -> ApprovedInstagramPost:
    winner = _post_dict(content_decision)
    decision_summary = content_decision.get("decision_summary") if isinstance(content_decision.get("decision_summary"), dict) else {}
    image_payload = image_pipeline or {}
    image_result = image_payload.get("result") if isinstance(image_payload.get("result"), dict) else image_payload
    if image_result is not image_payload and isinstance(image_payload.get("validation"), dict) and "validation" not in image_result:
        image_result = {**image_result, "validation": image_payload["validation"]}

    run_id = _string_or_none(content_decision.get("run_id")) or _string_or_none(winner.get("run_id")) or _string_or_none(decision_summary.get("run_id"))
    candidate_id = _string_or_none(winner.get("candidate_id")) or _string_or_none(winner.get("id")) or _string_or_none(decision_summary.get("winner_candidate_id"))
    caption = _string_or_none(winner.get("caption")) or _string_or_none(winner.get("generated_caption")) or _string_or_none(winner.get("final_caption"))
    hashtags = _list_of_strings(winner.get("hashtags"))
    alt_text = _string_or_none(winner.get("alt_text")) or _string_or_none(winner.get("accessibility_caption"))
    image_prompt = _string_or_none(winner.get("image_prompt")) or _string_or_none(winner.get("suggested_image_concept"))
    public_image_url = _string_or_none(winner.get("public_image_url")) or _string_or_none(winner.get("image_url")) or _string_or_none(image_result.get("public_url"))
    public_video_url = _string_or_none(winner.get("public_video_url")) or _string_or_none(winner.get("video_url"))
    media_kind = "reel" if public_video_url or content_decision.get("scheduled_post_type") == "daily_wing_reel" else "image"
    content_type = _string_or_none(winner.get("content_type")) or _string_or_none(winner.get("post_type")) or "instagram"
    image_source = _string_or_none(image_result.get("image_source")) or "unknown"
    image_validation_status = _string_or_none(image_result.get("image_validation_status")) or _string_or_none(image_result.get("validation_status")) or "unknown"
    image_validation_reason = _string_or_none(image_result.get("image_validation_reason"))
    if media_kind == "reel":
        prompt_quality = int(_number_or_none(winner.get("prompt_quality")) or 100)
        quality_score = int(_number_or_none(winner.get("quality_score")) or 90)
    else:
        prompt_quality = _resolve_prompt_quality(image_result)
        quality_score = _resolve_quality_score(winner, image_result, logger=logger)
    approved_value = winner.get("approved")
    if approved_value is None:
        approved_value = decision_summary.get("approved")
    approved = bool(approved_value)

    if not run_id:
        raise ValueError("Approved post is missing run_id")
    if not candidate_id:
        raise ValueError("Approved post is missing candidate_id")
    if not caption:
        raise ValueError("Approved post is missing caption")
    if not image_prompt:
        raise ValueError("Approved post is missing image_prompt")
    if media_kind == "image" and not public_image_url:
        raise ValueError("Approved post is missing public_image_url")
    if media_kind == "reel" and not public_video_url:
        raise ValueError("Approved Reel is missing public_video_url")

    return ApprovedInstagramPost(
        run_id=run_id,
        candidate_id=candidate_id,
        caption=caption,
        hashtags=hashtags,
        alt_text=alt_text,
        image_prompt=image_prompt,
        public_image_url=public_image_url or public_video_url or "",
        content_type=content_type,
        quality_score=quality_score,
        image_source=image_source,
        image_validation_status=image_validation_status,
        image_validation_reason=image_validation_reason,
        prompt_quality=prompt_quality,
        approved=approved,
        scheduled_post_type=_string_or_none(content_decision.get("scheduled_post_type")) or _string_or_none(winner.get("scheduled_post_type")),
        user_tags=winner.get("user_tags") if isinstance(winner.get("user_tags"), list) else [],
        location_id=_string_or_none(winner.get("location_id")),
        post_id=_string_or_none(content_decision.get("post_id")) or _string_or_none(winner.get("post_id")),
        image_asset_id=_string_or_none(image_result.get("image_asset_id")) if isinstance(image_result, dict) else None,
        media_kind=media_kind,
        public_video_url=public_video_url,
        video_asset_id=_string_or_none(winner.get("video_asset_id")),
        storage_path=_string_or_none(winner.get("storage_path")),
        media_source=_string_or_none(winner.get("media_source")),
        container_id=_string_or_none(content_decision.get("container_id")),
        published_media_id=_string_or_none(content_decision.get("published_media_id")),
        permalink=_string_or_none(content_decision.get("permalink")) or _string_or_none(winner.get("permalink")),
        status=_string_or_none(content_decision.get("status")) or "approved",
        scheduled_for=_string_or_none(content_decision.get("scheduled_for")),
        published_at=_string_or_none(content_decision.get("published_at")),
        last_attempt_at=_string_or_none(content_decision.get("last_attempt_at")),
        retry_count=int(content_decision.get("retry_count") or 0),
        failure_stage=_string_or_none(content_decision.get("failure_stage")),
        failure_reason=_string_or_none(content_decision.get("failure_reason")),
        error_code=_string_or_none(content_decision.get("error_code")),
        error_message=_string_or_none(content_decision.get("error_message")),
        request_payload_safe=None,
        response_payload=None,
        metadata=content_decision.get("metadata") if isinstance(content_decision.get("metadata"), dict) else {},
    )


def safe_container_request_payload(
    *,
    image_url: str,
    video_url: str | None = None,
    media_kind: str = "image",
    caption: str,
    access_token: str,
    user_tags: list[dict[str, Any]] | None = None,
    location_id: str | None = None,
    accessibility_caption: str | None = None,
    include_accessibility_caption: bool = False,
) -> tuple[dict[str, Any], dict[str, Any]]:
    request_payload: dict[str, Any] = {
        "caption": caption,
        "access_token": access_token,
    }
    if media_kind == "reel":
        request_payload["media_type"] = "REELS"
        request_payload["video_url"] = video_url or image_url
    else:
        request_payload["image_url"] = image_url
    if user_tags:
        request_payload["user_tags"] = user_tags
    if location_id:
        request_payload["location_id"] = location_id
    if include_accessibility_caption and accessibility_caption:
        request_payload["accessibility_caption"] = accessibility_caption

    safe_payload = dict(request_payload)
    safe_payload["access_token"] = "[redacted]"
    return request_payload, safe_payload


def serialize_container_record(record: ApprovedInstagramPost) -> dict[str, Any]:
    payload = {
        "run_id": record.run_id,
        "candidate_id": record.candidate_id,
        "caption": record.caption,
        "hashtags": record.hashtags,
        "alt_text": record.alt_text,
        "image_prompt": record.image_prompt,
        "public_image_url": record.public_image_url,
        "content_type": record.content_type,
        "quality_score": record.quality_score,
        "image_source": record.image_source,
        "image_validation_status": record.image_validation_status,
        "image_validation_reason": record.image_validation_reason,
        "prompt_quality": record.prompt_quality,
        "approved": record.approved,
        "scheduled_post_type": record.scheduled_post_type,
        "user_tags": record.user_tags,
        "location_id": record.location_id,
        "post_id": record.post_id,
        "image_asset_id": record.image_asset_id,
        "media_kind": record.media_kind,
        "public_video_url": record.public_video_url,
        "video_asset_id": record.video_asset_id,
        "storage_path": record.storage_path,
        "media_source": record.media_source,
        "container_id": record.container_id,
        "published_media_id": record.published_media_id,
        "permalink": record.permalink,
        "status": record.status,
        "scheduled_for": record.scheduled_for,
        "published_at": record.published_at,
        "last_attempt_at": record.last_attempt_at,
        "retry_count": record.retry_count,
        "failure_stage": record.failure_stage,
        "failure_reason": record.failure_reason,
        "error_code": record.error_code,
        "error_message": record.error_message,
        "request_payload_safe": record.request_payload_safe or {},
        "response_payload": record.response_payload or {},
        "metadata": record.metadata,
    }
    return payload


def write_publish_artifact(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, sort_keys=True, default=str)
        handle.write("\n")
