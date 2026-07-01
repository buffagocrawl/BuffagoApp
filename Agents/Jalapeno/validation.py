from __future__ import annotations

import json
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID
from uuid import uuid4
from typing import Any

from config import JalapenoConfig
from ai_client import JalapenoAIClient
from ai_config import load_ai_config
from ai_prompts import DEFAULT_BRAND_RULES
from ai_schemas import sanitize_for_ai
from ai_text_client import JalapenoTextClient
from ai_image_client import JalapenoImageClient
from ai_usage import AIUsageRecord, build_usage_record, write_usage_summary
from data_client import Phase3WindowConfig
from content_engine.content_engine import DEFAULT_DECISION_OUTPUT_PATH, ContentDecisionResult, run_content_decision_engine
from data_snapshot import DEFAULT_SNAPSHOT_PATH, SnapshotResult, generate_latest_snapshot
from external_context import DEFAULT_EXTERNAL_CONTEXT_PATH, ExternalContextResult, generate_external_context
from logging_utils import log_event
from model_router import AIRunContext, get_text_model
from config import ConfigError
from prompt_library_loader import PROMPT_LIBRARY_VERSION, PromptLibraryError, prompt_library_manifest, validate_prompt_library
from jalapeno_db import complete_run, create_run, insert_content_decision, JalapenoRunContext
from supabase_client import SupabaseClient
from config import BASE_DIR
from image_pipeline.image_pipeline import ImagePipelineResult
from instagram_publishing.instagram_publishing import (
    InstagramPublishingValidationResult,
    run_instagram_publishing_live_environment,
    validate_instagram_publishing_environment as _validate_instagram_publishing_environment,
)


DEFAULT_AI_OUTPUT_PATH: Path = BASE_DIR / "data" / "latest_ai_output.json"
DEFAULT_AI_USAGE_PATH: Path = BASE_DIR / "data" / "ai_usage_latest.json"
DEFAULT_IMAGE_PIPELINE_OUTPUT_PATH: Path = BASE_DIR / "data" / "latest_image_pipeline.json"


@dataclass(frozen=True, slots=True)
class ValidationResult:
    connected: bool
    snapshot_path: str
    is_fallback: bool
    section_counts: dict[str, int]
    snapshot: dict[str, Any]


@dataclass(frozen=True, slots=True)
class ExternalContextValidationResult:
    context_path: str
    cache_path: str
    is_fallback: bool
    is_cached: bool
    signals_used: list[str]
    context: dict[str, Any]


@dataclass(frozen=True, slots=True)
class AIValidationResult:
    run_id: str
    output_path: str
    usage_path: str
    used_backend: bool
    used_fallback: bool
    text_result: dict[str, Any]
    image_result: dict[str, Any]
    brand_result: dict[str, Any]
    usage_summary: dict[str, Any]


@dataclass(frozen=True, slots=True)
class ContentEngineValidationResult:
    output_path: str
    run_id: str
    winner_candidate_id: str
    runner_up_candidate_id: str | None
    candidate_count: int
    dry_run: bool
    result: dict[str, Any]


@dataclass(frozen=True, slots=True)
class ImagePipelineValidationResult:
    output_path: str
    temp_dir: str
    temp_dir_ready: bool
    result: dict[str, Any]


@dataclass(frozen=True, slots=True)
class ImagePipelineRunResult:
    output_path: str
    result: dict[str, Any]


def validate_prompt_library_environment(*, logger=None) -> dict[str, Any]:
    log_event(
        logger,
        "prompt_library_validation_started",
        prompt_library_version=PROMPT_LIBRARY_VERSION,
    )
    try:
        validate_prompt_library()
    except PromptLibraryError as exc:
        message = str(exc)
        log_event(
            logger,
            "prompt_library_validation_failed",
            level="error",
            prompt_library_version=PROMPT_LIBRARY_VERSION,
            message=message,
        )
        raise ConfigError(message) from exc
    manifest = prompt_library_manifest()
    log_event(
        logger,
        "prompt_library_validation_completed",
        prompt_library_version=manifest["version"],
        prompt_library_directory=manifest["directory"],
        prompt_library_files=len(manifest["files"]),
    )
    return manifest


def _write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, sort_keys=True, default=str)
        handle.write("\n")


def validate_phase3_environment(
    config: JalapenoConfig,
    *,
    logger=None,
    client: SupabaseClient | None = None,
    output_path=DEFAULT_SNAPSHOT_PATH,
    window_config: Phase3WindowConfig | None = None,
) -> ValidationResult:
    log_event(
        logger,
        "validation_started",
        agent_name=config.agent_name,
        stage="validation",
        status="started",
        dry_run=True,
        phase=3,
    )
    snapshot_result: SnapshotResult = generate_latest_snapshot(
        logger=logger,
        client=client,
        output_path=output_path,
        window_config=window_config or Phase3WindowConfig(),
    )
    log_event(
        logger,
        "validation_completed",
        agent_name=config.agent_name,
        stage="validation",
        status="completed",
        dry_run=True,
        phase=3,
        is_fallback=snapshot_result.is_fallback,
    )
    return ValidationResult(
        connected=client is not None,
        snapshot_path=str(snapshot_result.output_path),
        is_fallback=snapshot_result.is_fallback,
        section_counts=snapshot_result.section_counts,
        snapshot=snapshot_result.snapshot,
    )


def validate_phase4_environment(
    config: JalapenoConfig,
    *,
    logger=None,
    output_path=DEFAULT_EXTERNAL_CONTEXT_PATH,
    cache_directory=None,
    refresh: bool = False,
    current_datetime=None,
) -> ExternalContextValidationResult:
    output_path = Path(output_path)
    cache_directory = Path(cache_directory) if cache_directory is not None else None
    log_event(
        logger,
        "validation_started",
        agent_name=config.agent_name,
        stage="validation",
        status="started",
        dry_run=True,
        phase=4,
    )
    context_result: ExternalContextResult = generate_external_context(
        config,
        logger=logger,
        output_path=output_path,
        cache_directory=cache_directory or output_path.parent,
        refresh=refresh,
        current_datetime=current_datetime,
    )
    log_event(
        logger,
        "validation_completed",
        agent_name=config.agent_name,
        stage="validation",
        status="completed",
        dry_run=True,
        phase=4,
        is_fallback=context_result.is_fallback,
        is_cached=context_result.is_cached,
    )
    return ExternalContextValidationResult(
        context_path=str(context_result.output_path),
        cache_path=str(context_result.cache_path),
        is_fallback=context_result.is_fallback,
        is_cached=context_result.is_cached,
        signals_used=context_result.signals_used,
        context=context_result.context,
    )


def validate_phase5_environment(
    config: JalapenoConfig,
    snapshot: dict[str, Any],
    external_context: dict[str, Any],
    *,
    logger=None,
    skip_ai: bool = False,
    output_path: Path = DEFAULT_AI_OUTPUT_PATH,
    usage_path: Path = DEFAULT_AI_USAGE_PATH,
    run_id: str | None = None,
) -> AIValidationResult:
    ai_config = load_ai_config()
    active_run_id = run_id or str(uuid4())
    run_context = AIRunContext(
        execution_source="python_main_validate",
        environment="development",
        scheduled=False,
        dry_run=True,
        validation=True,
        test_mode=False,
        manual_dispatch=False,
        manual=True,
    )
    routing_decision = get_text_model(ai_config, run_context)
    sanitized_snapshot = sanitize_for_ai(snapshot)
    sanitized_context = sanitize_for_ai(external_context)
    shared_client = JalapenoAIClient(ai_config, logger=logger)
    text_client = JalapenoTextClient(shared_client)
    image_client = JalapenoImageClient(shared_client)
    brand_rules = DEFAULT_BRAND_RULES

    log_event(
        logger,
        "ai_generation_started",
        agent_name=config.agent_name,
        run_id=active_run_id,
        phase=5,
        skip_ai=skip_ai,
    )

    log_event(
        logger,
        "ai_text_generation_started",
        agent_name=config.agent_name,
        run_id=active_run_id,
        content_slot="buffago_post",
        skip_ai=skip_ai,
    )
    log_event(
        logger,
        "model_selected",
        request_type="text_content",
        content_slot="buffago_post",
        selected_text_model=routing_decision.text_model,
        selected_image_model=routing_decision.image_model,
        routing_reason=routing_decision.routing_reason,
        **run_context.to_log_fields(),
    )

    text_started_at = time.perf_counter()
    if skip_ai:
        text_result = text_client.client._fallback_result(  # pylint: disable=protected-access
            request_type="text_content",
            schema_version="1.0",
            model=routing_decision.text_model,
            content_slot="buffago_post",
            internal_snapshot=sanitized_snapshot,
            external_context=sanitized_context,
            errors=["AI generation skipped by request"],
            run_id=active_run_id,
        )
    else:
        text_result = text_client.generate(
            agent_name=config.agent_name,
            run_id=active_run_id,
            internal_snapshot=sanitized_snapshot,
            external_context=sanitized_context,
            content_slot="buffago_post",
            output_schema_version="1.0",
            brand_rules=brand_rules,
            run_context=run_context,
        )
    text_generation_time_ms = int((time.perf_counter() - text_started_at) * 1000)
    log_event(
        logger,
        "ai_text_generation_success",
        agent_name=config.agent_name,
        run_id=active_run_id,
        content_slot="buffago_post",
        used_fallback=text_result.used_fallback,
    )

    log_event(
        logger,
        "ai_image_prompt_generation_started",
        agent_name=config.agent_name,
        run_id=active_run_id,
        content_slot="meme_post",
        skip_ai=skip_ai,
    )
    log_event(
        logger,
        "model_selected",
        request_type="image_prompt",
        content_slot="meme_post",
        selected_text_model=routing_decision.text_model,
        selected_image_model=routing_decision.image_model,
        routing_reason=routing_decision.routing_reason,
        **run_context.to_log_fields(),
    )

    image_started_at = time.perf_counter()
    if skip_ai:
        image_result = image_client.client._fallback_result(  # pylint: disable=protected-access
            request_type="image_prompt",
            schema_version="1.0",
            model=routing_decision.text_model,
            content_slot="meme_post",
            internal_snapshot=sanitized_snapshot,
            external_context=sanitized_context,
            errors=["AI generation skipped by request"],
            run_id=active_run_id,
        )
    else:
        image_result = image_client.generate(
            agent_name=config.agent_name,
            run_id=active_run_id,
            internal_snapshot=sanitized_snapshot,
            external_context=sanitized_context,
            content_slot="meme_post",
            output_schema_version="1.0",
            brand_rules=brand_rules,
            run_context=run_context,
        )
    image_generation_time_ms = int((time.perf_counter() - image_started_at) * 1000)
    log_event(
        logger,
        "ai_image_prompt_generation_success",
        agent_name=config.agent_name,
        run_id=active_run_id,
        content_slot="meme_post",
        used_fallback=image_result.used_fallback,
    )

    log_event(
        logger,
        "ai_brand_validation_started",
        agent_name=config.agent_name,
        run_id=active_run_id,
        content_slot="buffago_post",
        skip_ai=skip_ai,
    )
    log_event(
        logger,
        "model_selected",
        request_type="brand_validation",
        content_slot="buffago_post",
        selected_text_model=routing_decision.text_model,
        selected_image_model=routing_decision.image_model,
        routing_reason=routing_decision.routing_reason,
        **run_context.to_log_fields(),
    )

    brand_started_at = time.perf_counter()
    if skip_ai:
        brand_result = text_client.client._fallback_result(  # pylint: disable=protected-access
            request_type="brand_validation",
            schema_version="1.0",
            model=routing_decision.text_model,
            content_slot="buffago_post",
            internal_snapshot=sanitized_snapshot,
            external_context=sanitized_context,
            errors=["AI generation skipped by request"],
            run_id=active_run_id,
        )
    else:
        brand_result = text_client.client.validate_brand(  # pylint: disable=protected-access
            agent_name=config.agent_name,
            run_id=active_run_id,
            internal_snapshot={
                "draft_text_content": sanitize_for_ai(text_result.output),
                "draft_image_prompt": sanitize_for_ai(image_result.output),
                "brand_rules": brand_rules,
            },
            external_context={
                "external_signals": sanitize_for_ai(external_context),
                "prompt_version": PROMPT_LIBRARY_VERSION,
            },
            content_slot="buffago_post",
            output_schema_version="1.0",
            brand_rules=brand_rules,
            run_context=run_context,
        )
    brand_generation_time_ms = int((time.perf_counter() - brand_started_at) * 1000)
    if bool(brand_result.safety.get("passed", False)):
        log_event(logger, "ai_brand_validation_passed", run_id=active_run_id, risk_level=brand_result.safety.get("risk_level", "low"))
    else:
        log_event(logger, "ai_brand_validation_failed", run_id=active_run_id, risk_level=brand_result.safety.get("risk_level", "high"))

    usage_records: list[AIUsageRecord] = [
        build_usage_record(
            ai_config,
            request_type="text_content",
            model=text_result.model,
            prompt_name="buffago_post",
            prompt_version=PROMPT_LIBRARY_VERSION,
            content_slot="buffago_post",
            content_category=text_result.output.get("post_type") if isinstance(text_result.output.get("post_type"), str) else "buffago_post",
            chosen_cta=text_result.output.get("cta") if isinstance(text_result.output.get("cta"), str) else None,
            chosen_hashtags=text_result.output.get("hashtags") if isinstance(text_result.output.get("hashtags"), list) else None,
            image_generation_prompt=text_result.output.get("image_prompt") if isinstance(text_result.output.get("image_prompt"), str) else None,
            review_score=float(text_result.output.get("confidence_score") or 0) * 100.0 if isinstance(text_result.output.get("confidence_score"), (int, float)) else None,
            rejected_reason="; ".join(text_result.errors) if text_result.errors else None,
            input_size_chars=len(json.dumps(sanitized_snapshot, default=str)) + len(json.dumps(sanitized_context, default=str)),
            output_size_chars=len(json.dumps(text_result.output, default=str)),
            generation_time_ms=text_generation_time_ms,
            input_tokens=int(text_result.usage.get("input_tokens") or 0),
            output_tokens=int(text_result.usage.get("output_tokens") or 0),
            total_tokens=int(text_result.usage.get("total_tokens") or 0),
            backend_used=text_result.backend_available and not text_result.used_fallback,
            used_fallback=text_result.used_fallback,
        ),
        build_usage_record(
            ai_config,
            request_type="image_prompt",
            model=image_result.model,
            prompt_name="image_generation",
            prompt_version=PROMPT_LIBRARY_VERSION,
            content_slot="meme_post",
            content_category="meme_post",
            image_generation_prompt=image_result.output.get("image_prompt") if isinstance(image_result.output.get("image_prompt"), str) else None,
            rejected_reason="; ".join(image_result.errors) if image_result.errors else None,
            input_size_chars=len(json.dumps(sanitized_snapshot, default=str)) + len(json.dumps(sanitized_context, default=str)),
            output_size_chars=len(json.dumps(image_result.output, default=str)),
            generation_time_ms=image_generation_time_ms,
            input_tokens=int(image_result.usage.get("input_tokens") or 0),
            output_tokens=int(image_result.usage.get("output_tokens") or 0),
            total_tokens=int(image_result.usage.get("total_tokens") or 0),
            backend_used=image_result.backend_available and not image_result.used_fallback,
            used_fallback=image_result.used_fallback,
        ),
        build_usage_record(
            ai_config,
            request_type="brand_validation",
            model=brand_result.model,
            prompt_name="quality_review",
            prompt_version=PROMPT_LIBRARY_VERSION,
            content_slot="buffago_post",
            content_category="brand_validation",
            review_score=100.0 if bool(brand_result.safety.get("passed", False)) else 0.0,
            rejected_reason="; ".join(brand_result.safety.get("reasons", [])) if not bool(brand_result.safety.get("passed", False)) else None,
            input_size_chars=len(json.dumps(sanitized_snapshot, default=str)) + len(json.dumps(sanitized_context, default=str)),
            output_size_chars=len(json.dumps(brand_result.output, default=str)),
            generation_time_ms=brand_generation_time_ms,
            input_tokens=int(brand_result.usage.get("input_tokens") or 0),
            output_tokens=int(brand_result.usage.get("output_tokens") or 0),
            total_tokens=int(brand_result.usage.get("total_tokens") or 0),
            backend_used=brand_result.backend_available and not brand_result.used_fallback,
            used_fallback=brand_result.used_fallback,
        ),
    ]
    usage_payload = write_usage_summary(usage_path, run_id=active_run_id, records=usage_records)

    output_payload = {
        "agent_name": config.agent_name,
        "run_id": active_run_id,
        "schema_version": "1.0",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "backend_available": bool(ai_config.function_url and ai_config.function_token),
        "used_backend": any(record.backend_used for record in usage_records),
        "used_fallback": any(record.used_fallback for record in usage_records),
        "text_content": text_result.output,
        "image_prompt": image_result.output,
        "brand_validation": brand_result.output,
        "text_result": text_result.to_dict(),
        "image_result": image_result.to_dict(),
        "brand_result": brand_result.to_dict(),
        "usage": usage_payload,
    }
    _write_json(output_path, output_payload)

    total_cost = usage_payload["totals"].get("estimated_cost_usd")
    log_event(
        logger,
        "ai_usage_logged",
        run_id=active_run_id,
        input_tokens=usage_payload["totals"].get("input_tokens", 0),
        output_tokens=usage_payload["totals"].get("output_tokens", 0),
        total_tokens=usage_payload["totals"].get("total_tokens", 0),
        estimated_cost_usd=total_cost,
    )
    if total_cost is not None:
        log_event(logger, "ai_cost_estimated", run_id=active_run_id, estimated_cost_usd=total_cost)

    if any(record.used_fallback for record in usage_records):
        log_event(logger, "ai_fallback_used", run_id=active_run_id, request_type="phase5", model=routing_decision.text_model)
    else:
        log_event(logger, "ai_generation_completed", run_id=active_run_id, phase=5, used_backend=True)

    return AIValidationResult(
        run_id=active_run_id,
        output_path=str(output_path),
        usage_path=str(usage_path),
        used_backend=any(record.backend_used for record in usage_records),
        used_fallback=any(record.used_fallback for record in usage_records),
        text_result=text_result.to_dict(),
        image_result=image_result.to_dict(),
        brand_result=brand_result.to_dict(),
        usage_summary=usage_payload,
    )


def validate_content_engine_environment(
    config: JalapenoConfig,
    snapshot: dict[str, Any],
    external_context: dict[str, Any],
    *,
    logger=None,
    client: SupabaseClient | None = None,
    dry_run: bool = True,
    output_path: Path = DEFAULT_DECISION_OUTPUT_PATH,
    run_id: str | None = None,
    scheduled_post_type: str | None = None,
) -> ContentEngineValidationResult:
    active_run_id = run_id or str(uuid4())
    log_event(
        logger,
        "content_engine_validation_started",
        agent_name=config.agent_name,
        run_id=active_run_id,
        dry_run=dry_run,
    )
    result: ContentDecisionResult = run_content_decision_engine(
        snapshot=snapshot,
        external_context=external_context,
        client=client,
        logger=logger,
        run_id=active_run_id,
        dry_run=dry_run,
        output_path=output_path,
        scheduled_post_type=scheduled_post_type,
    )
    log_event(
        logger,
        "content_engine_validation_completed",
        agent_name=config.agent_name,
        run_id=active_run_id,
        dry_run=dry_run,
        candidate_count=len(result.all_candidates),
        winner_candidate_id=result.winner.get("candidate_id"),
    )
    return ContentEngineValidationResult(
        output_path=result.output_path,
        run_id=result.run_id,
        winner_candidate_id=str(result.winner.get("candidate_id")),
        runner_up_candidate_id=str(result.runner_up.get("candidate_id")) if result.runner_up else None,
        candidate_count=len(result.all_candidates),
        dry_run=dry_run,
        result={
            "scheduled_post_type": scheduled_post_type,
            "winner": result.winner,
            "runner_up": result.runner_up,
            "all_candidates": result.all_candidates,
            "decision_summary": result.decision_summary,
        },
    )


def validate_image_pipeline_environment(
    config: JalapenoConfig,
    content_decision: dict[str, Any],
    *,
    logger=None,
    client: SupabaseClient | None = None,
    output_path: Path = DEFAULT_IMAGE_PIPELINE_OUTPUT_PATH,
) -> ImagePipelineValidationResult:
    log_event(
        logger,
        "image_pipeline_validation_started",
        agent_name=config.agent_name,
        stage="validation",
        status="started",
        dry_run=True,
        phase=6,
    )
    config.image.temp_dir.mkdir(parents=True, exist_ok=True)
    temp_dir_ready = config.image.temp_dir.exists()

    try:
        import PIL  # noqa: F401
    except ModuleNotFoundError as exc:
        message = "Pillow is not installed. Install the Pillow dependency to run the image pipeline."
        log_event(
            logger,
            "image_pipeline_validation_failed",
            level="error",
            agent_name=config.agent_name,
            stage="validation",
            status="failed",
            dry_run=True,
            phase=6,
            message=message,
        )
        raise ConfigError(message) from exc

    try:
        from image_pipeline.branding import apply_branding  # noqa: F401
        from image_pipeline.cleanup import cleanup_temp_files  # noqa: F401
        from image_pipeline.image_formatter import format_for_instagram  # noqa: F401
        from image_pipeline.image_generator import generate_image  # noqa: F401
        from image_pipeline.image_pipeline import run_image_pipeline
        from image_pipeline.image_storage import SupabaseImageStorage  # noqa: F401
        from image_pipeline.image_validator import validate_image_file  # noqa: F401
        from image_pipeline.meme_formatter import format_meme_image  # noqa: F401
    except Exception as exc:  # pragma: no cover - defensive guard
        log_event(
            logger,
            "image_pipeline_validation_failed",
            level="error",
            agent_name=config.agent_name,
            stage="validation",
            status="failed",
            dry_run=True,
            phase=6,
            message=str(exc),
        )
        raise

    result: ImagePipelineResult = run_image_pipeline(
        config,
        content_decision=content_decision,
        logger=logger,
        client=client,
        upload_enabled=False,
        persist_enabled=False,
        output_path=output_path,
        dry_run=True,
    )
    log_event(
        logger,
        "image_pipeline_validation_completed",
        agent_name=config.agent_name,
        stage="validation",
        status="completed",
        dry_run=True,
        phase=6,
        validation_status=result.validation_status,
        public_url=result.public_url,
    )
    return ImagePipelineValidationResult(
        output_path=str(output_path),
        temp_dir=str(config.image.temp_dir),
        temp_dir_ready=temp_dir_ready,
        result={
            "run_id": result.run_id,
            "candidate_id": result.candidate_id,
            "content_type": result.content_type,
            "image_type": result.image_type,
            "image_prompt": result.image_prompt,
            "image_prompt_preview": result.image_prompt_preview,
            "image_source": result.image_source,
            "local_temp_path": result.local_temp_path,
            "formatted_feed_path": result.formatted_feed_path,
            "square_fallback_path": result.square_fallback_path,
            "validation_status": result.validation_status,
            "image_validation_status": result.image_validation_status,
            "image_validation_reason": result.image_validation_reason,
            "prompt_quality": result.prompt_quality,
            "public_url": result.public_url,
            "storage_bucket": result.storage_bucket,
            "storage_path": result.storage_path,
            "branding_applied": result.branding_applied,
            "meme_format_applied": result.meme_format_applied,
            "cleanup_status": result.cleanup_status,
        },
    )


def run_image_pipeline_live_environment(
    config: JalapenoConfig,
    content_decision: dict[str, Any],
    *,
    logger=None,
    client: SupabaseClient | None = None,
    output_path: Path = DEFAULT_IMAGE_PIPELINE_OUTPUT_PATH,
    complete_run_on_success: bool = True,
) -> ImagePipelineRunResult:
    live_started = time.perf_counter()
    log_event(
        logger,
        "image_pipeline_live_started",
        agent_name=config.agent_name,
        stage="run",
        status="started",
        dry_run=False,
        phase=6,
    )
    if client is None:
        raise ConfigError("Live image pipeline requires a Supabase client")

    run_id = str(content_decision.get("run_id") or "")
    if not run_id:
        raise ConfigError("Content decision is missing run_id")
    existing_run_rows = client.fetch_rows("jalapeno_runs", select="run_id", filters={"run_id": f"eq.{run_id}", "limit": 1})
    if not existing_run_rows:
        create_run(
            client,
            context=JalapenoRunContext(run_id=UUID(run_id), dry_run=False),
            metadata={
                "source": "image_pipeline_live",
                "content_decision_loaded": True,
            },
        )

    decision_rows = client.fetch_rows("jalapeno_content_decisions", select="id", filters={"run_id": f"eq.{run_id}", "limit": 1})
    if not decision_rows:
        decision_summary = content_decision.get("decision_summary") if isinstance(content_decision.get("decision_summary"), dict) else {}
        winner = content_decision.get("winner") if isinstance(content_decision.get("winner"), dict) else {}
        runner_up = content_decision.get("runner_up") if isinstance(content_decision.get("runner_up"), dict) else None
        insert_content_decision(
            client,
            run_id=UUID(run_id),
            payload={
                "winner_candidate_id": winner.get("candidate_id"),
                "runner_up_candidate_id": runner_up.get("candidate_id") if runner_up else None,
                "decision_summary": decision_summary,
                "winner_reasoning": decision_summary.get("winner_reasoning", []),
                "model_name": decision_summary.get("model_name"),
                "token_usage": decision_summary.get("token_usage", {}),
                "cost_estimate": decision_summary.get("cost_estimate"),
                "platform": decision_summary.get("platform", "instagram"),
            },
        )

    from image_pipeline.image_pipeline import run_image_pipeline

    result: ImagePipelineResult = run_image_pipeline(
        config,
        content_decision=content_decision,
        logger=logger,
        client=client,
        upload_enabled=True,
        persist_enabled=True,
        output_path=output_path,
        dry_run=False,
    )
    if complete_run_on_success:
        complete_run(
            client,
            run_id=UUID(run_id),
            duration_ms=int((time.perf_counter() - live_started) * 1000),
            status="completed",
            metadata={
                "source": "image_pipeline_live",
                "public_url": result.public_url,
                "storage_path": result.storage_path,
            },
        )
    log_event(
        logger,
        "image_pipeline_live_completed",
        agent_name=config.agent_name,
        stage="run",
        status="completed",
        dry_run=False,
        phase=6,
        public_url=result.public_url,
    )
    return ImagePipelineRunResult(
        output_path=str(output_path),
        result={
            "run_id": result.run_id,
            "candidate_id": result.candidate_id,
            "content_type": result.content_type,
            "image_type": result.image_type,
            "image_prompt": result.image_prompt,
            "image_prompt_preview": result.image_prompt_preview,
            "image_source": result.image_source,
            "local_temp_path": result.local_temp_path,
            "formatted_feed_path": result.formatted_feed_path,
            "square_fallback_path": result.square_fallback_path,
            "validation_status": result.validation_status,
            "image_validation_status": result.image_validation_status,
            "image_validation_reason": result.image_validation_reason,
            "prompt_quality": result.prompt_quality,
            "public_url": result.public_url,
            "storage_bucket": result.storage_bucket,
            "storage_path": result.storage_path,
            "uploaded_at": result.uploaded_at,
            "branding_applied": result.branding_applied,
            "meme_format_applied": result.meme_format_applied,
            "cleanup_status": result.cleanup_status,
        },
    )


def validate_instagram_publishing_environment(
    config: JalapenoConfig,
    *,
    logger=None,
    report_path=None,
) -> InstagramPublishingValidationResult:
    if report_path is None:
        return _validate_instagram_publishing_environment(config, logger=logger)
    return _validate_instagram_publishing_environment(config, logger=logger, report_path=report_path)
