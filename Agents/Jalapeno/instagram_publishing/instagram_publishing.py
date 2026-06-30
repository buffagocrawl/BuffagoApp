from __future__ import annotations

import json
import os
import time
from dataclasses import asdict, dataclass, replace
from pathlib import Path
from typing import Any
from uuid import UUID

from config import JalapenoConfig, ConfigError
from instagram_publishing.media_container import ApprovedInstagramPost, load_approved_post_from_artifacts as _load_approved_post_from_artifacts
from instagram_publishing.publisher import (
    DEFAULT_PUBLISH_REPORT_PATH,
    precheck_approved_post,
    publish_instagram_post,
)
from jalapeno_db import JalapenoRunContext, complete_run, ensure_selected_post_candidate, insert_final_post
from logging_utils import log_event
from supabase_client import SupabaseClient


DEFAULT_CONTENT_DECISION_PATH = Path(__file__).resolve().parents[1] / "data" / "latest_content_decision.json"
DEFAULT_IMAGE_PIPELINE_PATH = Path(__file__).resolve().parents[1] / "data" / "latest_image_pipeline.json"


@dataclass(frozen=True, slots=True)
class InstagramPublishingValidationResult:
    modules_imported: bool
    config_keys_present: bool
    secrets_resolved: bool
    dry_run_blocked: bool
    fake_precheck_passed: bool
    fake_publish_succeeded: bool
    retry_no_duplicate: bool
    report_generated: bool
    report_path: str
    result: dict[str, Any]


@dataclass(frozen=True, slots=True)
class InstagramPublishingResult:
    report_path: str
    result: dict[str, Any]


class _ValidationCandidateClient:
    def __init__(self) -> None:
        self.run_rows: dict[str, dict[str, Any]] = {}
        self.candidate_rows: dict[str, dict[str, Any]] = {}

    def fetch_rows(self, table_name: str, *, filters: dict[str, Any] | None = None, select: str = "*") -> list[dict[str, Any]]:
        filters = filters or {}
        if table_name == "jalapeno_runs":
            run_id = str(filters.get("run_id", "")).removeprefix("eq.")
            row = self.run_rows.get(run_id)
            return [row] if row is not None else []
        if table_name == "jalapeno_post_candidates":
            candidate_id = str(filters.get("id", "")).removeprefix("eq.")
            row = self.candidate_rows.get(candidate_id)
            return [row] if row is not None else []
        return []

    def insert_row(self, table_name: str, payload):
        row = dict(payload) if isinstance(payload, dict) else dict(payload[0])
        if table_name == "jalapeno_runs":
            self.run_rows[str(row["run_id"])] = row
        elif table_name == "jalapeno_post_candidates":
            self.candidate_rows[str(row["id"])] = row
        return [row]

    def update_rows(self, table_name: str, filters: dict[str, Any], payload: dict[str, Any]) -> list[dict[str, Any]]:
        if table_name == "jalapeno_post_candidates":
            candidate_id = str(filters.get("id", "")).removeprefix("eq.")
            current = dict(self.candidate_rows.get(candidate_id, {"id": candidate_id}))
            current.update(payload)
            self.candidate_rows[candidate_id] = current
            return [current]
        if table_name == "jalapeno_runs":
            run_id = str(filters.get("run_id", "")).removeprefix("eq.")
            current = dict(self.run_rows.get(run_id, {"run_id": run_id}))
            current.update(payload)
            self.run_rows[run_id] = current
            return [current]
        return []


def _read_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise ConfigError(f"Missing JSON artifact: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def _read_secret(secret_name: str) -> str:
    candidates = [secret_name, secret_name.upper()]
    for candidate in candidates:
        value = os.getenv(candidate, "").strip()
        if value:
            return value
    raise ConfigError(f"Missing required secret: {secret_name}")


def load_approved_post_from_artifacts(
    content_decision_path: Path = DEFAULT_CONTENT_DECISION_PATH,
    image_pipeline_path: Path = DEFAULT_IMAGE_PIPELINE_PATH,
) -> ApprovedInstagramPost:
    content_decision = _read_json(content_decision_path)
    image_pipeline = _read_json(image_pipeline_path) if image_pipeline_path.exists() else None
    return _load_approved_post_from_artifacts(content_decision, image_pipeline=image_pipeline)


def _build_validation_config(config: JalapenoConfig) -> JalapenoConfig:
    return replace(
        config,
        instagram=replace(config.instagram, enabled=True, dry_run=False),
        publishing=replace(config.publishing, publish_max_retries=max(config.publishing.publish_max_retries, 1), retry_backoff_seconds=0),
    )


def validate_instagram_publishing_environment(
    config: JalapenoConfig,
    *,
    logger=None,
    report_path: Path = DEFAULT_PUBLISH_REPORT_PATH,
) -> InstagramPublishingValidationResult:
    started_at = time.perf_counter()
    log_event(
        logger,
        "publish_pipeline_started",
        run_id="validation",
        candidate_id="validation",
        status="started",
        duration_ms=0,
    )
    modules_imported = False
    config_keys_present = False
    secrets_resolved = False
    dry_run_blocked = False
    fake_precheck_passed = False
    fake_publish_succeeded = False
    retry_no_duplicate = False
    report_generated = False

    try:
        from instagram_publishing import container_status as _container_status  # noqa: F401
        from instagram_publishing import instagram_client as _instagram_client  # noqa: F401
        from instagram_publishing import media_container as _media_container  # noqa: F401
        from instagram_publishing import publish_report as _publish_report  # noqa: F401
        from instagram_publishing import publish_retry as _publish_retry  # noqa: F401
        from instagram_publishing import publisher as _publisher  # noqa: F401
        modules_imported = True
        config_keys_present = bool(
            hasattr(config, "instagram")
            and hasattr(config, "publishing")
            and hasattr(config, "notifications")
            and isinstance(config.instagram.enabled, bool)
            and isinstance(config.instagram.dry_run, bool)
            and config.instagram.ig_user_id_secret_name
            and config.instagram.access_token_secret_name
            and config.instagram.api_version
            and isinstance(config.instagram.quality_threshold, int)
            and isinstance(config.publishing.container_poll_max_attempts, int)
            and isinstance(config.publishing.container_poll_wait_seconds, int)
            and isinstance(config.publishing.container_poll_timeout_seconds, int)
            and isinstance(config.publishing.publish_max_retries, int)
            and isinstance(config.publishing.retry_backoff_seconds, int)
            and config.publishing.retryable_error_codes
            and isinstance(config.notifications.enabled, bool)
            and isinstance(config.notifications.channels.console, bool)
            and isinstance(config.notifications.channels.email, bool)
            and isinstance(config.notifications.channels.webhook, bool)
        )
        _read_secret(config.instagram.ig_user_id_secret_name)
        _read_secret(config.instagram.access_token_secret_name)
        secrets_resolved = True
    except Exception as exc:
        log_event(
            logger,
            "publish_pipeline_failed",
            level="error",
            run_id="validation",
            candidate_id="validation",
            status="failed",
            duration_ms=int((time.perf_counter() - started_at) * 1000),
            error=str(exc),
        )
        raise

    fake_post = ApprovedInstagramPost(
        run_id="11111111-1111-1111-1111-111111111111",
        candidate_id="22222222-2222-2222-2222-222222222222",
        caption="Buffago test caption",
        hashtags=["buffago", "wingnight"],
        alt_text="A test alt text for validation",
        image_prompt="A test prompt",
        public_image_url="https://example.com/public-image.jpg",
        content_type="restaurant_spotlight",
        quality_score=max(config.instagram.quality_threshold, 90),
        approved=True,
        scheduled_post_type="buffago_post",
    )

    dry_run_precheck = precheck_approved_post(
        config,
        fake_post,
        dry_run=True,
        test_mode=False,
        logger=logger,
    )
    dry_run_blocked = not dry_run_precheck.passed

    validation_config = _build_validation_config(config)
    live_precheck = precheck_approved_post(
        validation_config,
        fake_post,
        dry_run=False,
        test_mode=False,
        logger=logger,
    )
    fake_precheck_passed = live_precheck.passed

    simulate_client = publish_instagram_post(
        validation_config,
        fake_post,
        access_token="simulated-access-token",
        ig_user_id="simulated-ig-user-id",
        logger=logger,
        client=None,
        simulate=True,
        dry_run=False,
        test_mode=False,
        post_id="33333333-3333-3333-3333-333333333333",
        report_path=report_path,
    )
    fake_publish_succeeded = simulate_client["status"] in {"published", "published_with_permalink_pending"}

    duplicate_post = replace(
        fake_post,
        container_id=simulate_client["container_id"],
        published_media_id=simulate_client["published_media_id"],
        permalink=simulate_client["permalink"],
    )
    duplicate_result = publish_instagram_post(
        validation_config,
        duplicate_post,
        access_token="simulated-access-token",
        ig_user_id="simulated-ig-user-id",
        logger=logger,
        client=None,
        simulate=True,
        dry_run=False,
        test_mode=False,
        post_id="33333333-3333-3333-3333-333333333333",
        report_path=report_path,
    )
    retry_no_duplicate = duplicate_result["published_media_id"] == simulate_client["published_media_id"]
    report_generated = report_path.exists()
    candidate_validation_client = _ValidationCandidateClient()
    candidate_run_context = JalapenoRunContext(
        run_id=UUID(fake_post.run_id),
        agent_name=config.agent_name,
        post_type=fake_post.scheduled_post_type,
        dry_run=False,
        environment="validation",
        trigger_source="instagram_publishing_validation",
    )
    candidate_payload = {
        "candidate_id": fake_post.candidate_id,
        "content_type": fake_post.content_type,
        "scheduled_post_type": fake_post.scheduled_post_type,
        "caption": fake_post.caption,
        "hashtags": fake_post.hashtags,
        "image_prompt": fake_post.image_prompt,
        "image_url": fake_post.public_image_url,
        "working_title": "Validation candidate",
        "short_summary": "Validation candidate summary",
    }
    ensure_selected_post_candidate(
        candidate_validation_client,
        run_context=candidate_run_context,
        winner_payload=candidate_payload,
        decision_summary={"winner_reasoning": ["validation insert path"]},
        logger=logger,
    )
    ensure_selected_post_candidate(
        candidate_validation_client,
        run_context=candidate_run_context,
        winner_payload=candidate_payload,
        decision_summary={"winner_reasoning": ["validation already exists path"]},
        logger=logger,
    )

    result = {
        "dry_run_precheck": asdict(dry_run_precheck),
        "live_precheck": asdict(live_precheck),
        "publish_result": simulate_client,
        "duplicate_result": duplicate_result,
        "modules_imported": modules_imported,
        "config_keys_present": config_keys_present,
        "secrets_resolved": secrets_resolved,
        "dry_run_blocked": dry_run_blocked,
        "fake_precheck_passed": fake_precheck_passed,
        "fake_publish_succeeded": fake_publish_succeeded,
        "retry_no_duplicate": retry_no_duplicate,
        "report_generated": report_generated,
        "candidate_persistence_checked": True,
    }

    log_event(
        logger,
        "publish_pipeline_completed",
        run_id="validation",
        candidate_id="validation",
        status="completed",
        duration_ms=int((time.perf_counter() - started_at) * 1000),
    )
    return InstagramPublishingValidationResult(
        modules_imported=modules_imported,
        config_keys_present=config_keys_present,
        secrets_resolved=secrets_resolved,
        dry_run_blocked=dry_run_blocked,
        fake_precheck_passed=fake_precheck_passed,
        fake_publish_succeeded=fake_publish_succeeded,
        retry_no_duplicate=retry_no_duplicate,
        report_generated=report_generated,
        report_path=str(report_path),
        result=result,
    )


def run_instagram_publishing_live_environment(
    config: JalapenoConfig,
    content_decision: dict[str, Any],
    image_pipeline: dict[str, Any] | None = None,
    *,
    logger=None,
    client: SupabaseClient | None = None,
    report_path: Path = DEFAULT_PUBLISH_REPORT_PATH,
) -> InstagramPublishingResult:
    started_at = time.perf_counter()
    log_event(
        logger,
        "publish_pipeline_started",
        run_id=str(content_decision.get("run_id") or "unknown"),
        candidate_id=str(content_decision.get("winner", {}).get("candidate_id") if isinstance(content_decision.get("winner"), dict) else "unknown"),
        status="started",
        duration_ms=0,
    )
    approved_post = _load_approved_post_from_artifacts(content_decision, image_pipeline=image_pipeline)
    if client is not None:
        ensure_selected_post_candidate(
            client,
            run_context=JalapenoRunContext(
                run_id=UUID(approved_post.run_id),
                agent_name=config.agent_name,
                post_type=approved_post.scheduled_post_type,
                dry_run=config.instagram.dry_run,
                environment="production" if not config.instagram.dry_run else "development",
                trigger_source="instagram_publish_live",
            ),
            winner_payload={
                "candidate_id": approved_post.candidate_id,
                "content_type": approved_post.content_type,
                "scheduled_post_type": approved_post.scheduled_post_type,
                "caption": approved_post.caption,
                "hashtags": approved_post.hashtags,
                "image_prompt": approved_post.image_prompt,
                "image_url": approved_post.public_image_url,
                "public_image_url": approved_post.public_image_url,
                "working_title": approved_post.metadata.get("working_title") if isinstance(approved_post.metadata, dict) else None,
                "short_summary": approved_post.metadata.get("chosen_idea") if isinstance(approved_post.metadata, dict) else None,
            },
            decision_summary=content_decision.get("decision_summary") if isinstance(content_decision.get("decision_summary"), dict) else {},
            logger=logger,
        )
    post_id = approved_post.post_id
    if client is not None and not post_id:
        existing_rows = client.fetch_rows(
            "jalapeno_posts",
            select="id",
            filters={"run_id": f"eq.{approved_post.run_id}", "candidate_id": f"eq.{approved_post.candidate_id}", "limit": 1},
        )
        if existing_rows:
            post_id = str(existing_rows[0].get("id"))
        else:
            candidate_uuid = None
            try:
                candidate_uuid = UUID(approved_post.candidate_id)
            except ValueError:
                candidate_uuid = None
            inserted = insert_final_post(
                client,
                run_id=UUID(approved_post.run_id),
                candidate_id=candidate_uuid,
                post_type=approved_post.scheduled_post_type,
                chosen_idea=approved_post.metadata.get("chosen_idea") if isinstance(approved_post.metadata, dict) else None,
                generated_caption=approved_post.caption,
                hashtags=approved_post.hashtags,
                image_prompt=approved_post.image_prompt,
                image_url=approved_post.public_image_url,
                publish_status="publishing",
                metadata=approved_post.metadata,
            )
            post_id = str(inserted.get("id")) if inserted.get("id") else None

    access_token = _read_secret(config.instagram.access_token_secret_name)
    ig_user_id = _read_secret(config.instagram.ig_user_id_secret_name)
    result = publish_instagram_post(
        config,
        approved_post,
        access_token=access_token,
        ig_user_id=ig_user_id,
        logger=logger,
        client=client,
        simulate=False,
        dry_run=config.instagram.dry_run,
        test_mode=config.default_mode == "test",
        post_id=post_id,
        report_path=report_path,
    )
    if result["status"] in {"publish_failed", "precheck_failed"}:
        if client is not None:
            complete_run(
                client,
                run_id=UUID(approved_post.run_id),
                status="failed",
                duration_ms=int((time.perf_counter() - started_at) * 1000),
                metadata={
                    "source": "instagram_publishing",
                    "status": result["status"],
                    "failure_reason": result.get("failure_reason"),
                },
            )
        log_event(
            logger,
            "publish_pipeline_failed",
            level="error",
            run_id=approved_post.run_id,
            candidate_id=approved_post.candidate_id,
            post_id=post_id,
            container_id=result.get("container_id"),
            published_media_id=result.get("published_media_id"),
            status=result.get("status"),
            duration_ms=int((time.perf_counter() - started_at) * 1000),
            error=result.get("failure_reason"),
        )
        raise ConfigError(result.get("failure_reason") or "Instagram publish failed")
    if client is not None:
        complete_run(
            client,
            run_id=UUID(approved_post.run_id),
            status="completed",
            duration_ms=int((time.perf_counter() - started_at) * 1000),
            metadata={
                "source": "instagram_publishing",
                "status": result["status"],
                "container_id": result.get("container_id"),
                "published_media_id": result.get("published_media_id"),
            },
        )
    log_event(
        logger,
        "publish_pipeline_completed",
        run_id=approved_post.run_id,
        candidate_id=approved_post.candidate_id,
        post_id=post_id,
        container_id=result.get("container_id"),
        published_media_id=result.get("published_media_id"),
        status=result.get("status"),
        duration_ms=int((time.perf_counter() - started_at) * 1000),
    )
    return InstagramPublishingResult(report_path=report_path.as_posix(), result=result)
