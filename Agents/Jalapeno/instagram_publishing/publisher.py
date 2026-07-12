from __future__ import annotations

import time
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import UUID

from caption_rules import validate_post_pair
from config import JalapenoConfig
from instagram_publishing.container_status import ContainerStatusResult, wait_for_container_ready
from instagram_publishing.instagram_client import (
    InstagramContainerResponse,
    InstagramGraphClient,
    InstagramPublishResponse,
)
from instagram_publishing.media_container import (
    ApprovedInstagramPost,
    safe_container_request_payload,
    serialize_container_record,
)
from instagram_publishing.publish_report import PublishReport, create_publish_report, send_publish_notification, write_publish_report
from instagram_publishing.publish_retry import RetrySettings, run_with_retries
from jalapeno_db import mark_run_publish_failed, update_publish_status, upsert_instagram_post
from logging_utils import log_event
from supabase_client import SupabaseClient, SupabaseError


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


DEFAULT_PUBLISH_REPORT_PATH = Path(__file__).resolve().parents[1] / "data" / "latest_publish_report.json"


@dataclass(frozen=True, slots=True)
class PublishPrecheckResult:
    passed: bool
    reason: str | None
    duration_ms: int


@dataclass(frozen=True, slots=True)
class QualityGateDecision:
    passed: bool
    reason: str | None
    minimum_quality_score: int
    standard_quality_score: int
    override_applied: bool
    policy: str
    score_used: int
    score_source: str


@dataclass(slots=True)
class PublishPipelineState:
    post: ApprovedInstagramPost
    container_id: str | None = None
    container_response: dict[str, Any] | None = None
    container_status: str | None = None
    published_media_id: str | None = None
    published_response: dict[str, Any] | None = None
    permalink: str | None = None
    permalink_response: dict[str, Any] | None = None
    status: str = "pending"
    retry_count: int = 0
    last_attempt_at: str | None = None
    failure_stage: str | None = None
    failure_reason: str | None = None
    error_code: str | None = None
    error_message: str | None = None
    report: PublishReport | None = None
    request_payload_safe: dict[str, Any] | None = None
    response_payload: dict[str, Any] | None = None
    attempt_log: list[dict[str, Any]] = field(default_factory=list)


class PublishError(RuntimeError):
    def __init__(self, message: str, *, stage: str, error_code: str | None = None) -> None:
        super().__init__(message)
        self.stage = stage
        self.error_code = error_code


class RetryablePublishError(PublishError):
    pass


def _quality_threshold(config: JalapenoConfig) -> int:
    return int(config.instagram.quality_threshold)


def _validated_image_quality_threshold(config: JalapenoConfig) -> int:
    return int(config.instagram.validated_image_quality_threshold)


def _validated_image_prompt_quality_threshold(config: JalapenoConfig) -> int:
    return int(config.instagram.validated_image_prompt_quality_threshold)


def _quality_gate_decision(config: JalapenoConfig, post: ApprovedInstagramPost) -> QualityGateDecision:
    standard_threshold = _quality_threshold(config)
    score_used = post.publish_gate_score_used if post.publish_gate_score_used is not None else post.quality_score
    score_source = post.publish_gate_score_source or "quality_score"
    if post.media_kind != "image":
        passed = score_used >= standard_threshold
        return QualityGateDecision(
            passed=passed,
            reason=None if passed else f"quality score below threshold: {score_used} < {standard_threshold}",
            minimum_quality_score=standard_threshold,
            standard_quality_score=standard_threshold,
            override_applied=False,
            policy="standard_media_quality_gate",
            score_used=score_used,
            score_source=score_source,
        )

    image_threshold = _validated_image_quality_threshold(config)
    prompt_threshold = _validated_image_prompt_quality_threshold(config)
    image_is_validated = (
        post.image_validation_status == "passed"
        and post.image_source == "real_ai"
        and post.prompt_quality >= prompt_threshold
    )
    effective_threshold = image_threshold if image_is_validated else standard_threshold
    passed = score_used >= effective_threshold
    override_applied = image_is_validated and score_used < standard_threshold and passed
    if passed:
        reason = None
    elif image_is_validated:
        reason = f"quality score below validated image threshold: {score_used} < {effective_threshold}"
    else:
        reason = f"quality score below threshold: {score_used} < {effective_threshold}"
    return QualityGateDecision(
        passed=passed,
        reason=reason,
        minimum_quality_score=effective_threshold,
        standard_quality_score=standard_threshold,
        override_applied=override_applied,
        policy="validated_real_ai_image_quality_gate" if image_is_validated else "standard_image_quality_gate",
        score_used=score_used,
        score_source=score_source,
    )


def precheck_approved_post(
    config: JalapenoConfig,
    post: ApprovedInstagramPost,
    *,
    dry_run: bool,
    test_mode: bool,
    dry_run_source: str = "argument",
    instagram_enabled_source: str = "config.instagram.enabled",
    permission_source: str = "config",
    logger=None,
) -> PublishPrecheckResult:
    started_at = time.perf_counter()
    posting_allowed = not dry_run and not config.instagram.dry_run and config.instagram.enabled and not test_mode
    meta_api_allowed = not dry_run and not config.instagram.dry_run and config.instagram.enabled and not test_mode
    quality_gate = _quality_gate_decision(config, post)
    log_event(
        logger,
        "publish_precheck_started",
        run_id=post.run_id,
        candidate_id=post.candidate_id,
        post_id=post.post_id,
        status="started",
        dry_run=dry_run,
        dry_run_source=dry_run_source,
        config_dry_run=config.instagram.dry_run,
        posting_allowed=posting_allowed,
        meta_api_allowed=meta_api_allowed,
        permission_source=permission_source,
        instagram_enabled=config.instagram.enabled,
        instagram_enabled_source=instagram_enabled_source,
        test_mode=test_mode,
        quality_score=post.quality_score,
        candidate_score=post.candidate_score,
        caption_score=post.caption_score,
        image_quality_score=post.image_quality_score,
        publish_gate_score_used=quality_gate.score_used,
        publish_gate_score_source=quality_gate.score_source,
        minimum_quality_score=quality_gate.minimum_quality_score,
        standard_quality_score=quality_gate.standard_quality_score,
        quality_gate_policy=quality_gate.policy,
        quality_gate_override_applied=quality_gate.override_applied,
        quality_gate_reason=quality_gate.reason,
        image_source=post.image_source,
        image_validation_status=post.image_validation_status,
        validation_reason=post.image_validation_reason,
        prompt_quality=post.prompt_quality,
        minimum_prompt_quality=_validated_image_prompt_quality_threshold(config) if post.media_kind == "image" else None,
        media_kind=post.media_kind,
        video_url=post.public_video_url,
        media_source=post.media_source,
    )
    reason: str | None = None
    passed = True
    if not post.approved:
        passed = False
        reason = "approved is false"
    elif post.media_kind == "image" and post.image_validation_status != "passed":
        passed = False
        reason = post.image_validation_reason or "image validation failed"
    elif post.media_kind == "image" and post.image_source != "real_ai":
        passed = False
        reason = f"image source must be real_ai, received {post.image_source}"
    elif post.media_kind == "image" and not post.public_image_url:
        passed = False
        reason = "missing public_image_url"
    elif post.media_kind == "image" and post.prompt_quality < _validated_image_prompt_quality_threshold(config):
        passed = False
        reason = f"prompt quality below threshold: {post.prompt_quality} < {_validated_image_prompt_quality_threshold(config)}"
    elif post.media_kind == "reel" and not post.public_video_url:
        passed = False
        reason = "missing public_video_url"
    elif not quality_gate.passed:
        passed = False
        reason = quality_gate.reason
    elif not post.caption:
        passed = False
        reason = "missing caption"
    elif len([tag for tag in post.hashtags if isinstance(tag, str) and tag.strip()]) != 5:
        passed = False
        reason = "hashtag count must be exactly 5"
    else:
        pair_validation = validate_post_pair(post.caption, post.overlay_text)
        if not pair_validation["passed"]:
            passed = False
            reason = f"creative validation failed: {', '.join(pair_validation['reasons'])}"
    if passed and (dry_run or config.instagram.dry_run):
        passed = False
        reason = "dry_run enabled"
    elif passed and test_mode:
        passed = False
        reason = "test_mode enabled"
    elif passed and not config.instagram.enabled:
        passed = False
        reason = "instagram publishing disabled"

    duration_ms = int((time.perf_counter() - started_at) * 1000)
    if passed:
        log_event(
            logger,
            "publish_precheck_passed",
            run_id=post.run_id,
            candidate_id=post.candidate_id,
            post_id=post.post_id,
            status="passed",
            duration_ms=duration_ms,
            dry_run=dry_run,
            dry_run_source=dry_run_source,
            config_dry_run=config.instagram.dry_run,
            posting_allowed=True,
            meta_api_allowed=True,
            permission_source=permission_source,
            instagram_enabled=config.instagram.enabled,
            instagram_enabled_source=instagram_enabled_source,
            quality_score=post.quality_score,
            candidate_score=post.candidate_score,
            caption_score=post.caption_score,
            image_quality_score=post.image_quality_score,
            publish_gate_score_used=quality_gate.score_used,
            publish_gate_score_source=quality_gate.score_source,
            minimum_quality_score=quality_gate.minimum_quality_score,
            standard_quality_score=quality_gate.standard_quality_score,
            quality_gate_policy=quality_gate.policy,
            quality_gate_override_applied=quality_gate.override_applied,
            quality_gate_reason=quality_gate.reason,
            block_reason=None,
            image_source=post.image_source,
            image_validation_status=post.image_validation_status,
            validation_reason=post.image_validation_reason,
            prompt_quality=post.prompt_quality,
            minimum_prompt_quality=_validated_image_prompt_quality_threshold(config) if post.media_kind == "image" else None,
            media_kind=post.media_kind,
            video_url=post.public_video_url,
            media_source=post.media_source,
        )
    else:
        log_event(
            logger,
            "publish_precheck_failed",
            level="error",
            run_id=post.run_id,
            candidate_id=post.candidate_id,
            post_id=post.post_id,
            status="failed",
            duration_ms=duration_ms,
            error=reason,
            dry_run=dry_run,
            dry_run_source=dry_run_source,
            config_dry_run=config.instagram.dry_run,
            posting_allowed=False,
            meta_api_allowed=False,
            permission_source=permission_source,
            instagram_enabled=config.instagram.enabled,
            instagram_enabled_source=instagram_enabled_source,
            quality_score=post.quality_score,
            candidate_score=post.candidate_score,
            caption_score=post.caption_score,
            image_quality_score=post.image_quality_score,
            publish_gate_score_used=quality_gate.score_used,
            publish_gate_score_source=quality_gate.score_source,
            minimum_quality_score=quality_gate.minimum_quality_score,
            standard_quality_score=quality_gate.standard_quality_score,
            quality_gate_policy=quality_gate.policy,
            quality_gate_override_applied=quality_gate.override_applied,
            quality_gate_reason=quality_gate.reason,
            block_reason=reason,
            image_source=post.image_source,
            image_validation_status=post.image_validation_status,
            validation_reason=post.image_validation_reason,
            prompt_quality=post.prompt_quality,
            minimum_prompt_quality=_validated_image_prompt_quality_threshold(config) if post.media_kind == "image" else None,
            media_kind=post.media_kind,
            video_url=post.public_video_url,
            media_source=post.media_source,
        )
    return PublishPrecheckResult(passed=passed, reason=reason, duration_ms=duration_ms)


def _build_graph_client(
    config: JalapenoConfig,
    *,
    access_token: str,
    ig_user_id: str,
    simulate: bool,
) -> InstagramGraphClient:
    return InstagramGraphClient(
        ig_user_id=ig_user_id,
        access_token=access_token,
        api_version=config.instagram.api_version,
        simulate=simulate,
        timeout_seconds=config.publishing.container_poll_timeout_seconds,
    )


def _build_request_payload(
    *,
    post: ApprovedInstagramPost,
    access_token: str,
    include_accessibility_caption: bool = False,
) -> tuple[dict[str, Any], dict[str, Any]]:
    return safe_container_request_payload(
        image_url=post.public_image_url,
        video_url=post.public_video_url,
        media_kind=post.media_kind,
        caption=post.caption,
        hashtags=post.hashtags,
        access_token=access_token,
        user_tags=post.user_tags,
        location_id=post.location_id,
        accessibility_caption=post.alt_text,
        include_accessibility_caption=include_accessibility_caption,
    )


def _persist_publish_state(
    client: SupabaseClient | None,
    state: PublishPipelineState,
) -> None:
    if client is None:
        return
    payload = {
        "run_id": state.post.run_id,
        "candidate_id": state.post.candidate_id,
        "image_asset_id": state.post.image_asset_id,
        "container_id": state.container_id,
        "published_media_id": state.published_media_id,
        "permalink": state.permalink,
        "caption": state.post.caption,
        "hashtags": state.post.hashtags,
        "alt_text": state.post.alt_text,
        "image_url": state.post.public_image_url,
        "content_type": state.post.content_type,
        "quality_score": state.post.quality_score,
        "image_source": state.post.image_source,
        "image_validation_status": state.post.image_validation_status,
        "image_validation_reason": state.post.image_validation_reason,
        "prompt_quality": state.post.prompt_quality,
        "scheduled_for": state.post.scheduled_for,
        "published_at": state.post.published_at,
        "status": state.status,
        "failure_stage": state.failure_stage,
        "failure_reason": state.failure_reason,
        "error_code": state.error_code,
        "error_message": state.error_message,
        "retry_count": state.retry_count,
        "updated_at": _utcnow().isoformat(),
        "request_payload_safe": state.request_payload_safe or {},
        "response_payload": state.response_payload or {},
        "metadata": dict(state.post.metadata) if isinstance(state.post.metadata, dict) else {},
    }
    if state.post.video_asset_id is not None:
        payload["video_asset_id"] = state.post.video_asset_id
    if state.post.public_video_url is not None:
        payload["video_url"] = state.post.public_video_url
    if state.post.original_video_url is not None:
        payload["original_video_url"] = state.post.original_video_url
    if state.post.processed_video_url is not None:
        payload["processed_video_url"] = state.post.processed_video_url
    if state.post.original_storage_path is not None:
        payload["original_storage_path"] = state.post.original_storage_path
    if state.post.processed_storage_path is not None:
        payload["processed_storage_path"] = state.post.processed_storage_path
    if state.post.overlay_text is not None:
        payload["overlay_text"] = state.post.overlay_text
    if state.post.overlay_status is not None:
        payload["overlay_status"] = state.post.overlay_status
    if state.post.overlay_error is not None:
        payload["overlay_error"] = state.post.overlay_error
    if state.post.media_kind != "image":
        payload["media_kind"] = state.post.media_kind
    if state.post.media_source is not None:
        payload["media_source"] = state.post.media_source
    if state.post.storage_path is not None:
        payload["storage_path"] = state.post.storage_path
    if isinstance(state.post.metadata, dict) and state.post.metadata.get("created_at"):
        payload["created_at"] = state.post.metadata.get("created_at")
    upsert_instagram_post(client, payload=payload)


def _record_failure(
    client: SupabaseClient | None,
    *,
    run_id: str,
    failure_stage: str,
    failure_reason: str,
    error_code: str | None,
    error_message: str,
    retry_count: int,
    post_id: str | None,
) -> None:
    if client is None:
        return
    mark_run_publish_failed(
        client,
        run_id=UUID(run_id),
        failure_stage=failure_stage,
        failure_reason=failure_reason,
        error_code=error_code,
        error_message=error_message,
        last_attempt_at=_utcnow(),
        retry_count=retry_count,
    )
    if post_id:
        update_publish_status(
            client,
            post_id=UUID(post_id),
            publish_status="publish_failed",
            retry_count=retry_count,
            last_publish_attempt_at=_utcnow(),
            failure_stage=failure_stage,
            failure_reason=failure_reason,
            error_code=error_code,
            error_message=error_message,
        )


def publish_instagram_post(
    config: JalapenoConfig,
    post: ApprovedInstagramPost,
    *,
    access_token: str,
    ig_user_id: str,
    logger=None,
    client: SupabaseClient | None = None,
    simulate: bool = False,
    dry_run: bool = True,
    test_mode: bool = False,
    dry_run_source: str = "argument",
    instagram_enabled_source: str = "config.instagram.enabled",
    permission_source: str = "config",
    post_id: str | None = None,
    report_path: Path = DEFAULT_PUBLISH_REPORT_PATH,
) -> dict[str, Any]:
    started_at = time.perf_counter()
    posting_allowed = not dry_run and not config.instagram.dry_run and config.instagram.enabled and not test_mode
    meta_api_allowed = not dry_run and not config.instagram.dry_run and config.instagram.enabled and not test_mode
    state = PublishPipelineState(
        post=post,
        container_id=post.container_id,
        container_response=post.response_payload,
        container_status=post.status,
        published_media_id=post.published_media_id,
        published_response=post.response_payload,
        permalink=post.permalink,
        status=post.status or "pending",
        retry_count=post.retry_count,
        last_attempt_at=post.last_attempt_at,
        failure_stage=post.failure_stage,
        failure_reason=post.failure_reason,
        error_code=post.error_code,
        error_message=post.error_message,
        request_payload_safe=post.request_payload_safe,
        response_payload=post.response_payload,
    )
    log_event(
        logger,
        "publish_pipeline_dry_run_resolved",
        run_id=post.run_id,
        candidate_id=post.candidate_id,
        post_id=post_id,
        dry_run=dry_run,
        dry_run_source=dry_run_source,
        config_dry_run=config.instagram.dry_run,
        posting_allowed=posting_allowed,
        meta_api_allowed=meta_api_allowed,
        permission_source=permission_source,
        instagram_enabled=config.instagram.enabled,
        instagram_enabled_source=instagram_enabled_source,
        test_mode=test_mode,
        simulate=simulate,
    )
    precheck = precheck_approved_post(
        config,
        post,
        dry_run=dry_run,
        test_mode=test_mode,
        dry_run_source=dry_run_source,
        instagram_enabled_source=instagram_enabled_source,
        permission_source=permission_source,
        logger=logger,
    )
    if not precheck.passed:
        state.status = "precheck_failed"
        state.failure_stage = "precheck"
        state.failure_reason = precheck.reason
        state.error_message = precheck.reason
        state.retry_count = 0
        state.last_attempt_at = _utcnow().isoformat()
        _persist_publish_state(client, state)
        _record_failure(
            client,
            run_id=post.run_id,
            failure_stage="precheck",
            failure_reason=precheck.reason or "precheck failed",
            error_code="PRECHECK_FAILED",
            error_message=precheck.reason or "precheck failed",
            retry_count=0,
            post_id=post_id,
        )
        report = create_publish_report(
            run_id=post.run_id,
            scheduled_post_type=post.scheduled_post_type,
            candidate_id=post.candidate_id,
            content_type=post.content_type,
            caption=post.caption,
            hashtags=post.hashtags,
            image_url=post.public_image_url,
            container_id=None,
            published_media_id=None,
            permalink=None,
            status=state.status,
            quality_score=post.quality_score,
            retry_count=state.retry_count,
            failure_reason=state.failure_reason,
            duration_ms=int((time.perf_counter() - started_at) * 1000),
            cost_estimate=post.metadata.get("cost_estimate") if isinstance(post.metadata, dict) else None,
            metadata={"failure_stage": "precheck"},
        )
        write_publish_report(report_path, report)
        state.report = report
        log_event(
            logger,
            "publish_pipeline_failed",
            level="error",
            run_id=post.run_id,
            candidate_id=post.candidate_id,
            post_id=post_id,
            container_id=None,
            published_media_id=None,
            status=state.status,
            duration_ms=report.duration_ms,
            error=precheck.reason,
        )
        return {
            "status": state.status,
            "run_id": post.run_id,
            "candidate_id": post.candidate_id,
            "container_id": None,
            "published_media_id": None,
            "permalink": None,
            "failure_reason": precheck.reason,
            "report": asdict(report),
        }

    graph_client = _build_graph_client(
        config,
        access_token=access_token,
        ig_user_id=ig_user_id,
        simulate=simulate,
    )
    retry_settings = RetrySettings(
        max_retries=config.publishing.publish_max_retries,
        backoff_seconds=config.publishing.retry_backoff_seconds,
        retryable_error_codes=config.publishing.retryable_error_codes,
    )

    def attempt_publish(attempt: int) -> dict[str, Any]:
        state.retry_count = attempt - 1
        state.last_attempt_at = _utcnow().isoformat()
        log_event(
            logger,
            "publish_started",
            run_id=post.run_id,
            candidate_id=post.candidate_id,
            post_id=post_id,
            container_id=state.container_id,
            published_media_id=state.published_media_id,
            status="started",
            duration_ms=0,
            dry_run=dry_run,
            meta_api_allowed=not dry_run and not config.instagram.dry_run and config.instagram.enabled and not test_mode,
        )

        if state.published_media_id:
            log_event(
                logger,
                "publish_retry_skipped_already_published",
                run_id=post.run_id,
                candidate_id=post.candidate_id,
                post_id=post_id,
                container_id=state.container_id,
                published_media_id=state.published_media_id,
                status="skipped",
                retry_count=state.retry_count,
            )
            permalink_details = graph_client.get_media_details(state.published_media_id)
            state.permalink = str(permalink_details.get("permalink") or state.permalink or "")
            state.status = "published" if state.permalink else "published_with_permalink_pending"
            state.response_payload = permalink_details
            return _finalize_success(state, config=config, post=post, logger=logger, client=client, post_id=post_id, report_path=report_path, started_at=started_at)

        if not state.container_id:
            container_payload, safe_payload = _build_request_payload(post=post, access_token=access_token)
            state.request_payload_safe = safe_payload
            log_event(
                logger,
                "media_container_create_started",
                run_id=post.run_id,
                candidate_id=post.candidate_id,
                post_id=post_id,
                status="started",
                duration_ms=0,
                dry_run=dry_run,
                meta_api_allowed=not dry_run and not config.instagram.dry_run and config.instagram.enabled and not test_mode,
            )
            log_event(
                logger,
                "media_container_request_ready",
                run_id=post.run_id,
                candidate_id=post.candidate_id,
                post_id=post_id,
                media_kind=post.media_kind,
                media_source=post.media_source,
                video_asset_id=post.video_asset_id,
                storage_path=post.storage_path,
                video_url=post.public_video_url,
                status="ready",
                dry_run=dry_run,
                meta_api_allowed=not dry_run and not config.instagram.dry_run and config.instagram.enabled and not test_mode,
            )
            try:
                container_response: InstagramContainerResponse = graph_client.create_media_container(
                    container_payload,
                    request_payload_safe=safe_payload,
                )
            except Exception as exc:
                error_code = getattr(exc, "error_code", None) or getattr(exc, "code", None)
                state.failure_stage = "container_create"
                state.failure_reason = str(exc)
                state.error_code = str(error_code) if error_code is not None else None
                state.error_message = str(exc)
                log_event(
                    logger,
                    "media_container_create_failed",
                    level="error",
                    run_id=post.run_id,
                    candidate_id=post.candidate_id,
                    post_id=post_id,
                    container_id=None,
                    status="failed",
                    error=str(exc),
                )
                if state.error_code and state.error_code.upper() in {code.upper() for code in config.publishing.retryable_error_codes}:
                    raise RetryablePublishError(str(exc), stage="container_create", error_code=state.error_code) from exc
                raise PublishError(str(exc), stage="container_create", error_code=state.error_code) from exc
            state.container_id = container_response.container_id
            state.container_response = container_response.response_payload
            state.response_payload = container_response.response_payload
            log_event(
                logger,
                "media_container_created",
                run_id=post.run_id,
                candidate_id=post.candidate_id,
                post_id=post_id,
                container_id=state.container_id,
                status=container_response.status,
                duration_ms=0,
            )
            _persist_publish_state(client, state)
        else:
            log_event(
                logger,
                "media_container_created",
                run_id=post.run_id,
                candidate_id=post.candidate_id,
                post_id=post_id,
                container_id=state.container_id,
                status="reused",
                duration_ms=0,
            )

        status_result: ContainerStatusResult = wait_for_container_ready(
            graph_client,
            container_id=state.container_id,
            max_attempts=config.publishing.container_poll_max_attempts,
            wait_seconds=config.publishing.container_poll_wait_seconds,
            timeout_seconds=config.publishing.container_poll_timeout_seconds,
            logger=logger,
            sleep_fn=(lambda _: None) if simulate else time.sleep,
        )
        state.container_status = status_result.status
        state.response_payload = status_result.last_response or state.response_payload
        if not status_result.ready:
            state.failure_stage = "container_status"
            state.failure_reason = status_result.error or f"Container status {status_result.status}"
            state.error_message = state.failure_reason
            state.error_code = "POLL_TIMEOUT" if status_result.timed_out else status_result.status
            if status_result.timed_out and attempt <= config.publishing.publish_max_retries:
                raise RetryablePublishError(state.failure_reason, stage="container_status", error_code=state.error_code)
            raise PublishError(state.failure_reason, stage="container_status", error_code=state.error_code)

        if state.published_media_id:
            log_event(
                logger,
                "publish_retry_skipped_already_published",
                run_id=post.run_id,
                candidate_id=post.candidate_id,
                post_id=post_id,
                container_id=state.container_id,
                published_media_id=state.published_media_id,
                status="skipped",
                retry_count=state.retry_count,
            )
            return _finalize_success(state, config=config, post=post, logger=logger, client=client, post_id=post_id, report_path=report_path, started_at=started_at)

        log_event(
            logger,
            "publish_started",
            run_id=post.run_id,
            candidate_id=post.candidate_id,
            post_id=post_id,
            container_id=state.container_id,
            published_media_id=state.published_media_id,
            status="started",
            duration_ms=0,
            dry_run=dry_run,
            meta_api_allowed=not dry_run and not config.instagram.dry_run and config.instagram.enabled and not test_mode,
        )
        try:
            publish_response: InstagramPublishResponse = graph_client.publish_media(state.container_id)
        except Exception as exc:
            error_code = getattr(exc, "error_code", None) or getattr(exc, "code", None)
            state.failure_stage = "publish"
            state.failure_reason = str(exc)
            state.error_code = str(error_code) if error_code is not None else None
            state.error_message = str(exc)
            log_event(
                logger,
                "publish_failed",
                level="error",
                run_id=post.run_id,
                candidate_id=post.candidate_id,
                post_id=post_id,
                container_id=state.container_id,
                status="failed",
                error=str(exc),
            )
            if state.error_code and state.error_code.upper() in {code.upper() for code in config.publishing.retryable_error_codes}:
                raise RetryablePublishError(str(exc), stage="publish", error_code=state.error_code) from exc
            raise PublishError(str(exc), stage="publish", error_code=state.error_code) from exc

        state.published_media_id = publish_response.published_media_id
        state.published_response = publish_response.response_payload
        state.response_payload = publish_response.response_payload
        state.status = publish_response.status
        log_event(
            logger,
            "publish_succeeded",
            run_id=post.run_id,
            candidate_id=post.candidate_id,
            post_id=post_id,
            container_id=state.container_id,
            published_media_id=state.published_media_id,
            status=state.status,
            duration_ms=0,
        )

        log_event(
            logger,
            "permalink_fetch_started",
            run_id=post.run_id,
            candidate_id=post.candidate_id,
            post_id=post_id,
            container_id=state.container_id,
            published_media_id=state.published_media_id,
            status="started",
            duration_ms=0,
        )
        try:
            permalink_details = graph_client.get_media_details(state.published_media_id)
            state.permalink_response = permalink_details
            state.permalink = str(permalink_details.get("permalink") or "")
            state.status = "published" if state.permalink else "published_with_permalink_pending"
            log_event(
                logger,
                "permalink_saved",
                run_id=post.run_id,
                candidate_id=post.candidate_id,
                post_id=post_id,
                container_id=state.container_id,
                published_media_id=state.published_media_id,
                status=state.status,
                duration_ms=0,
                permalink=state.permalink,
            )
        except Exception as exc:
            log_event(
                logger,
                "permalink_fetch_failed",
                level="warning",
                run_id=post.run_id,
                candidate_id=post.candidate_id,
                post_id=post_id,
                container_id=state.container_id,
                published_media_id=state.published_media_id,
                status="published_with_permalink_pending",
                duration_ms=0,
                error=str(exc),
            )
            state.status = "published_with_permalink_pending"
            state.failure_stage = None
            state.failure_reason = None
            state.error_code = None
            state.error_message = None

        return _finalize_success(
            state,
            config=config,
            post=post,
            logger=logger,
            client=client,
            post_id=post_id,
            report_path=report_path,
            started_at=started_at,
        )

    try:
        result = run_with_retries(
            attempt_publish,
            settings=retry_settings,
            logger=logger,
            run_id=post.run_id,
            candidate_id=post.candidate_id,
            container_id=state.container_id,
            published_media_id=state.published_media_id,
        )
        log_event(
            logger,
            "publish_pipeline_completed",
            run_id=post.run_id,
            candidate_id=post.candidate_id,
            post_id=post_id,
            container_id=state.container_id,
            published_media_id=state.published_media_id,
            status=state.status,
            duration_ms=int((time.perf_counter() - started_at) * 1000),
        )
        return result
    except PublishError as exc:
        state.status = "publish_failed"
        state.failure_stage = exc.stage
        state.failure_reason = str(exc)
        state.error_code = exc.error_code
        state.error_message = str(exc)
        _persist_publish_state(client, state)
        _record_failure(
            client,
            run_id=post.run_id,
            failure_stage=exc.stage,
            failure_reason=str(exc),
            error_code=exc.error_code,
            error_message=str(exc),
            retry_count=state.retry_count,
            post_id=post_id,
        )
        report = create_publish_report(
            run_id=post.run_id,
            scheduled_post_type=post.scheduled_post_type,
            candidate_id=post.candidate_id,
            content_type=post.content_type,
            caption=post.caption,
            hashtags=post.hashtags,
            image_url=post.public_image_url,
            container_id=state.container_id,
            published_media_id=state.published_media_id,
            permalink=state.permalink,
            status=state.status,
            quality_score=post.quality_score,
            retry_count=state.retry_count,
            failure_reason=state.failure_reason,
            duration_ms=int((time.perf_counter() - started_at) * 1000),
            cost_estimate=post.metadata.get("cost_estimate") if isinstance(post.metadata, dict) else None,
            metadata={"failure_stage": state.failure_stage},
        )
        state.report = report
        write_publish_report(report_path, report)
        log_event(
            logger,
            "publish_report_created",
            run_id=post.run_id,
            candidate_id=post.candidate_id,
            post_id=post_id,
            container_id=state.container_id,
            published_media_id=state.published_media_id,
            status=state.status,
            duration_ms=report.duration_ms,
        )
        send_publish_notification(
            report=report,
            logger=logger,
            notifications_enabled=config.notifications.enabled,
            console_enabled=config.notifications.channels.console,
            email_enabled=config.notifications.channels.email,
            webhook_enabled=config.notifications.channels.webhook,
        )
        log_event(
            logger,
            "run_marked_publish_failed",
            level="error",
            run_id=post.run_id,
            candidate_id=post.candidate_id,
            post_id=post_id,
            container_id=state.container_id,
            published_media_id=state.published_media_id,
            status=state.status,
            duration_ms=report.duration_ms,
            error=state.failure_reason,
        )
        log_event(
            logger,
            "failure_alert_required",
            level="error",
            run_id=post.run_id,
            candidate_id=post.candidate_id,
            post_id=post_id,
            container_id=state.container_id,
            published_media_id=state.published_media_id,
            stage=state.failure_stage,
            status=state.status,
            error_type=state.error_code,
            retry_count=state.retry_count,
            error=state.failure_reason,
        )
        log_event(
            logger,
            "publish_pipeline_failed",
            level="error",
            run_id=post.run_id,
            candidate_id=post.candidate_id,
            post_id=post_id,
            container_id=state.container_id,
            published_media_id=state.published_media_id,
            status=state.status,
            duration_ms=report.duration_ms,
            error=state.failure_reason,
        )
        return {
            "status": state.status,
            "run_id": post.run_id,
            "candidate_id": post.candidate_id,
            "container_id": state.container_id,
            "published_media_id": state.published_media_id,
            "permalink": state.permalink,
            "failure_reason": state.failure_reason,
            "report": asdict(report),
        }


def _finalize_success(
    state: PublishPipelineState,
    *,
    config: JalapenoConfig,
    post: ApprovedInstagramPost,
    logger=None,
    client: SupabaseClient | None,
    post_id: str | None,
    report_path: Path,
    started_at: float,
) -> dict[str, Any]:
    state.status = "published" if state.permalink else "published_with_permalink_pending"
    state.retry_count = state.retry_count
    state.failure_stage = None
    state.failure_reason = None
    state.error_code = None
    state.error_message = None
    post_metadata = dict(state.post.metadata) if isinstance(state.post.metadata, dict) else {}
    if post_metadata.get("approval_bypass_enabled"):
        post_metadata["approval_required"] = False
        post_metadata["approval_status"] = "published"
        state.post.metadata.clear()
        state.post.metadata.update(post_metadata)
    _persist_publish_state(client, state)
    log_event(
        logger,
        "publish_state_persisted",
        run_id=post.run_id,
        candidate_id=post.candidate_id,
        post_id=post_id,
        instagram_container_id=state.container_id,
        instagram_published_media_id=state.published_media_id,
        persisted_instagram_media_id=state.published_media_id,
        status=state.status,
    )
    if client is not None and post_id:
        update_publish_status(
            client,
            post_id=UUID(post_id),
            publish_status=state.status,
            retry_count=state.retry_count,
            last_publish_attempt_at=_utcnow(),
            published_at=_utcnow(),
            instagram_media_id=state.published_media_id,
            instagram_permalink=state.permalink,
            instagram_timestamp=state.permalink_response.get("timestamp") if isinstance(state.permalink_response, dict) else None,
            instagram_media_type=state.permalink_response.get("media_type") if isinstance(state.permalink_response, dict) else None,
            container_id=state.container_id,
            publish_response=state.response_payload or {},
            metadata=post_metadata,
        )
        log_event(
            logger,
            "publish_post_record_updated",
            run_id=post.run_id,
            candidate_id=post.candidate_id,
            post_id=post_id,
            instagram_container_id=state.container_id,
            instagram_published_media_id=state.published_media_id,
            persisted_instagram_media_id=state.published_media_id,
            status=state.status,
        )
    report = create_publish_report(
        run_id=post.run_id,
        scheduled_post_type=post.scheduled_post_type,
        candidate_id=post.candidate_id,
        content_type=post.content_type,
        caption=post.caption,
        hashtags=post.hashtags,
        image_url=post.public_image_url,
        container_id=state.container_id,
        published_media_id=state.published_media_id,
        permalink=state.permalink,
        status=state.status,
        quality_score=post.quality_score,
        retry_count=state.retry_count,
        failure_reason=None,
        duration_ms=int((time.perf_counter() - started_at) * 1000),
        cost_estimate=post.metadata.get("cost_estimate") if isinstance(post.metadata, dict) else None,
        metadata={"publish_status": state.status},
    )
    state.report = report
    write_publish_report(report_path, report)
    log_event(
        logger,
        "publish_report_created",
        run_id=post.run_id,
        candidate_id=post.candidate_id,
        post_id=post_id,
        container_id=state.container_id,
        published_media_id=state.published_media_id,
        status=state.status,
        duration_ms=report.duration_ms,
    )
    send_publish_notification(
        report=report,
        logger=logger,
        notifications_enabled=config.notifications.enabled,
        console_enabled=config.notifications.channels.console,
        email_enabled=config.notifications.channels.email,
        webhook_enabled=config.notifications.channels.webhook,
    )
    return {
        "status": state.status,
        "run_id": post.run_id,
        "candidate_id": post.candidate_id,
        "container_id": state.container_id,
        "published_media_id": state.published_media_id,
        "permalink": state.permalink,
        "report": asdict(report),
    }
