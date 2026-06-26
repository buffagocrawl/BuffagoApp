from __future__ import annotations

import os
from dataclasses import dataclass
from uuid import UUID, uuid4

from config import ConfigError, JalapenoConfig
from jalapeno_db import (
    JalapenoRunContext,
    complete_run,
    create_run,
    insert_error_row,
    read_settings,
)
from logging_utils import log_event
from supabase_client import SupabaseClient, SupabaseError


REQUIRED_PHASE2_ENV_VARS = (
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
)

REQUIRED_SETTINGS = (
    "posting_enabled",
    "dry_run",
    "instagram_enabled",
    "buffago_post_time",
    "meme_post_time",
    "timezone",
    "text_model",
    "image_model",
    "temperature",
    "max_candidates",
    "max_retries",
    "prompt_version",
    "workflow_version",
    "default_hashtag_count",
    "default_image_size",
    "storage_bucket",
    "metrics_collection_enabled",
)

REQUIRED_TABLES = (
    "jalapeno_runs",
    "jalapeno_post_candidates",
    "jalapeno_posts",
    "jalapeno_errors",
    "jalapeno_post_metrics",
    "jalapeno_settings",
)


@dataclass(frozen=True, slots=True)
class ValidationResult:
    connected: bool
    validation_run_id: UUID | None = None


def _setting_value(record: dict[str, object]) -> object:
    value = record.get("setting_value")
    if isinstance(value, dict) and "value" in value:
        return value["value"]
    return value


def _require_env_vars() -> None:
    missing = [name for name in REQUIRED_PHASE2_ENV_VARS if not os.getenv(name, "").strip()]
    if missing:
        raise ConfigError(f"Missing required environment variables: {', '.join(missing)}")


def validate_phase2_environment(
    config: JalapenoConfig,
    *,
    logger=None,
    client: SupabaseClient | None = None,
) -> ValidationResult:
    _require_env_vars()
    supabase = client or SupabaseClient.from_env()

    try:
        log_event(
            logger,
            "validation_started",
            run_id=None,
            agent_name=config.agent_name,
            stage="validation",
            status="started",
            dry_run=True,
        )

        for table_name in REQUIRED_TABLES:
            if not supabase.table_exists(table_name):
                raise ConfigError(f"Missing required Supabase table: {table_name}")

        settings = read_settings(supabase, list(REQUIRED_SETTINGS))
        missing_settings = [key for key in REQUIRED_SETTINGS if key not in settings]
        if missing_settings:
            raise ConfigError(f"Missing required Jalapeno settings: {', '.join(missing_settings)}")

        dry_run_enabled = bool(_setting_value(settings["dry_run"]))
        if not dry_run_enabled:
            raise ConfigError("jalapeno_settings.dry_run must be enabled by default")

        if "storage_bucket" not in settings:
            raise ConfigError("Missing required Jalapeno storage bucket setting")

        if logger is not None:
            log_event(
                logger,
                "settings_loaded",
                agent_name=config.agent_name,
                stage="settings_load",
                status="completed",
                dry_run=True,
                storage_bucket=_setting_value(settings["storage_bucket"]),
                dry_run_enabled=dry_run_enabled,
            )

        workflow_version = str(_setting_value(settings["workflow_version"]) or config.default_mode)
        prompt_version = str(_setting_value(settings["prompt_version"]) or config.default_mode)
        text_model = str(_setting_value(settings["text_model"]) or "")
        image_model = str(_setting_value(settings["image_model"]) or "")

        validation_context = JalapenoRunContext(
            run_id=uuid4(),
            agent_name="jalapeno",
            post_type="validation",
            dry_run=True,
            workflow_version=workflow_version,
            prompt_version=prompt_version,
            trigger_source="validation",
            environment=os.getenv("BUFFAGO_ENVIRONMENT", "local").strip() or "local",
            model_name=text_model or None,
            image_model_name=image_model or None,
        )

        validation_run = create_run(supabase, context=validation_context, metadata={"validation": True, "phase": 2})
        if logger is not None:
            log_event(
                logger,
                "validation_run_created",
                run_id=validation_run.get("run_id"),
                agent_name=config.agent_name,
                stage="validation",
                status="started",
                dry_run=True,
                prompt_version=validation_context.prompt_version,
                workflow_version=validation_context.workflow_version,
            )

        complete_run(
            supabase,
            run_id=UUID(str(validation_run.get("run_id"))),
            status="completed",
            metadata={"validation": True, "phase": 2, "tables_checked": list(REQUIRED_TABLES)},
        )

        if logger is not None:
            log_event(
                logger,
                "validation_completed",
                run_id=validation_run.get("run_id"),
                agent_name=config.agent_name,
                stage="validation",
                status="completed",
                dry_run=True,
                workflow_version=validation_context.workflow_version,
                prompt_version=validation_context.prompt_version,
            )
        return ValidationResult(connected=True, validation_run_id=UUID(str(validation_run.get("run_id"))))
    except (SupabaseError, OSError, ConfigError) as exc:
        if logger is not None:
            log_event(
                logger,
                "validation_failed",
                level="error",
                agent_name=config.agent_name,
                stage="validation",
                status="failed",
                dry_run=True,
                message=str(exc),
            )
        raise ConfigError(str(exc)) from exc


def record_validation_error(
    supabase: SupabaseClient,
    *,
    message: str,
    stage: str,
    run_id: UUID | None = None,
    logger=None,
) -> dict[str, object]:
    error_row = insert_error_row(supabase, message=message, stage=stage, run_id=run_id, raw_payload={"validation": True})
    if logger is not None:
        log_event(logger, "validation_error", level="error", run_id=run_id, stage=stage, message=message)
    return error_row
