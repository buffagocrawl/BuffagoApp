from __future__ import annotations

import time
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import UUID

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


def precheck_approved_post(
    config: JalapenoConfig,
    post: ApprovedInstagramPost,
    *,
    dry_run: bool,
    test_mode: bool,
    logger=None,
) -> PublishPrecheckResult:
    started_at = time.perf_counter()
    log_event(
        logger,
        "publish_precheck_started",
        run_id=post.run_id,
        candidate_id=post.candidate_id,
        post_id=post.post_id,
        status="started",
        dry_run=dry_run,
        quality_score=post.quality_score,
        minimum_quality_score=_quality_threshold(config),
        image_source=post.image_source,
        image_validation_status=post.image_validation_status,
        validation_reason=post.image_validation_reason,
        prompt_quality=post.prompt_quality,
    )
    reason: str | None = None
    passed = True
    if not post.approved:
        passed = False
        reason = "approved is false"
    elif post.quality_score < _quality_threshold(config):
        passed = False
        reason = "quality score below threshold"
    elif post.image_validation_status != "passed":
        passed = False
        reason = post.image_validation_reason or "image validation failed"
    elif post.image_source != "real_ai":
        passed = False
        reason = f"image source must be real_ai, received {post.image_source}"
    elif not post.public_image_url:
        passed = False
        reason = "missing public_image_url"
    elif not post.caption:
        passed = False
        reason = "missing caption"
    elif dry_run or config.instagram.dry_run:
        passed = False
        reason = "dry_run enabled"
    elif test_mode:
        passed = False
        reason = "test_mode enabled"
    elif not config.instagram.enabled:
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
            quality_score=post.quality_score,
            minimum_quality_score=_quality_threshold(config),
            image_source=post.image_source,
            image_validation_status=post.image_validation_status,
            validation_reason=post.image_validation_reason,
            prompt_quality=post.prompt_quality,
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
            quality_score=post.quality_score,
            minimum_quality_score=_quality_threshold(config),
            image_source=post.image_source,
            image_validation_status=post.image_validation_status,
            validation_reason=post.image_validation_reason,
            prompt_quality=post.prompt_quality,
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
        caption=post.caption,
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
    post_id: str | None = None,
    report_path: Path = DEFAULT_PUBLISH_REPORT_PATH,
) -> dict[str, Any]:
    started_at = time.perf_counter()
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
    precheck = precheck_approved_post(config, post, dry_run=dry_run, test_mode=test_mode, logger=logger)
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
