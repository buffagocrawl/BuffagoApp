from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path
from uuid import UUID, uuid4

from config import (
    CONFIG_FILE,
    ConfigError,
    ENV_FILE,
    SIMULATION_STEPS,
    get_mode_plan,
    initialize_logging,
    load_configuration,
    load_env_file,
    log_mode_plan,
    log_startup_state,
    validate_phase1_environment,
    warn_missing_future_secrets,
)
from content_engine.content_engine import run_content_decision_engine
from data_snapshot import generate_latest_snapshot
from external_context import generate_external_context
from jalapeno_db import JalapenoRunContext, complete_run, create_run, ensure_selected_post_candidate, fail_run
from logging_utils import log_event
from metrics_collector import collect_instagram_metrics
from performance_context import build_performance_context
from reporting import generate_admin_report
from supabase_client import SupabaseClient, SupabaseError
from validation import (
    validate_content_engine_environment,
    validate_instagram_publishing_environment,
    validate_image_pipeline_environment,
    validate_phase3_environment,
    validate_phase4_environment,
    validate_phase5_environment,
    run_instagram_publishing_live_environment,
    validate_prompt_library_environment,
    run_image_pipeline_live_environment,
)


PRODUCTION_POST_TYPE_MAP = {
    "buffago": "buffago_post",
    "meme": "meme_post",
}


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Jalapeno Instagram agent runner")
    mode_group = parser.add_mutually_exclusive_group(required=True)
    mode_group.add_argument("--validate", action="store_true", help="Validate env, Supabase reads, snapshots, external context, AI bridge, content engine, and image pipeline")
    mode_group.add_argument("--dry-run", action="store_true", help="Log the planned work without publishing")
    mode_group.add_argument("--test", action="store_true", help="Run the fully simulated Phase 1 workflow")
    mode_group.add_argument("--image-pipeline-live", action="store_true", help="Run only the live image pipeline upload and persistence flow")
    mode_group.add_argument("--instagram-publish-live", action="store_true", help="Run only the live Instagram publishing flow")
    mode_group.add_argument("--production", action="store_true", help="Run the live production publishing pipeline")
    mode_group.add_argument("--metrics", action="store_true", help="Collect Instagram metrics for recent published posts")
    mode_group.add_argument("--daily-report", action="store_true", help="Generate and optionally email the Jalapeno daily report")
    mode_group.add_argument("--weekly-report", action="store_true", help="Generate and optionally email the Jalapeno weekly report")
    parser.add_argument(
        "--refresh-external-context",
        action="store_true",
        help="Bypass today's external-context cache and rebuild it",
    )
    parser.add_argument(
        "--skip-ai",
        action="store_true",
        help="Skip Phase 5 AI backend calls and use fallback content",
    )
    return parser


def _normalize_production_post_type(raw_value: str | None) -> str:
    value = (raw_value or "").strip().lower()
    if not value:
        raise ConfigError("POST_TYPE is required for --production. Valid values: buffago, meme")
    if value not in PRODUCTION_POST_TYPE_MAP:
        raise ConfigError(f"Invalid POST_TYPE '{raw_value}'. Valid values: buffago, meme")
    return value


def _normalize_optional_post_type(raw_value: str | None) -> str | None:
    value = (raw_value or "").strip()
    if not value:
        return None
    return _normalize_production_post_type(value)


def _production_scheduled_post_type(post_type: str) -> str:
    return PRODUCTION_POST_TYPE_MAP[post_type]


def _github_run_source() -> str:
    if os.getenv("GITHUB_ACTIONS", "").strip().lower() != "true":
        return "python_main_production"
    event_name = os.getenv("GITHUB_EVENT_NAME", "").strip().lower()
    if event_name == "schedule":
        return "github_actions_scheduler"
    if event_name == "workflow_dispatch":
        return "github_actions_manual_dispatch"
    if event_name:
        return f"github_actions_{event_name}"
    return "github_actions"


def _github_run_metadata() -> dict[str, str]:
    metadata: dict[str, str] = {}
    for env_name, field_name in (
        ("GITHUB_EVENT_NAME", "github_event_name"),
        ("GITHUB_EVENT_SCHEDULE", "github_event_schedule"),
        ("GITHUB_RUN_ID", "github_run_id"),
        ("GITHUB_RUN_ATTEMPT", "github_run_attempt"),
        ("GITHUB_WORKFLOW", "github_workflow"),
        ("GITHUB_ACTOR", "github_actor"),
        ("GITHUB_REF_NAME", "github_ref_name"),
        ("GITHUB_SHA", "github_sha"),
    ):
        value = os.getenv(env_name, "").strip()
        if value:
            metadata[field_name] = value
    return metadata


def run_validate(*, refresh_external_context: bool = False, skip_ai: bool = False) -> int:
    print(f"Loading env file: {ENV_FILE}")
    env_loaded = load_env_file()
    print(f"Env loaded: {env_loaded}")
    config = load_configuration()
    logger = initialize_logging(config)
    validate_phase1_environment()
    warn_missing_future_secrets(logger)
    print(f"Config loaded: {CONFIG_FILE}")
    prompt_library_manifest = validate_prompt_library_environment(logger=logger)
    print(f"Prompt library validated: {prompt_library_manifest['version']}")
    has_url = bool(os.getenv("SUPABASE_URL", "").strip())
    has_service_role_key = bool(os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip())
    log_event(logger, "supabase_connection_started", has_url=has_url, has_service_role_key=has_service_role_key)
    client = None
    try:
        if has_url and has_service_role_key:
            client = SupabaseClient.from_env()
            client.fetch_rows("users", select="user_id", filters={"limit": 1})
            log_event(logger, "supabase_connection_success", has_connection=True)
        else:
            raise SupabaseError("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
    except (SupabaseError, OSError) as exc:
        log_event(logger, "supabase_connection_failed", level="warning", message=str(exc), has_connection=False)
        client = None
    result = validate_phase3_environment(config, logger=logger, client=client)
    print(f"Snapshot written: {result.snapshot_path}")
    print(f"Fallback used: {result.is_fallback}")
    external_result = validate_phase4_environment(
        config,
        logger=logger,
        refresh=refresh_external_context,
    )
    print(f"External context written: {external_result.context_path}")
    print(f"External context cache: {external_result.cache_path}")
    print(f"External context fallback used: {external_result.is_fallback}")
    print(f"External context cached: {external_result.is_cached}")
    if external_result.signals_used:
        print(f"External signals used: {', '.join(external_result.signals_used)}")
    ai_result = validate_phase5_environment(
        config,
        result.snapshot,
        external_result.context,
        logger=logger,
        skip_ai=skip_ai,
    )
    print(f"AI sample output written: {ai_result.output_path}")
    print(f"AI usage written: {ai_result.usage_path}")
    print(f"AI backend used: {ai_result.used_backend}")
    print(f"AI fallback used: {ai_result.used_fallback}")
    content_result = validate_content_engine_environment(
        config,
        result.snapshot,
        external_result.context,
        logger=logger,
        client=client,
        dry_run=True,
    )
    print(f"Content decision written: {content_result.output_path}")
    print(f"Content decision run id: {content_result.run_id}")
    print(f"Content decision candidates: {content_result.candidate_count}")
    image_result = validate_image_pipeline_environment(
        config,
        content_result.result,
        logger=logger,
        client=client,
    )
    print(f"Image pipeline written: {image_result.output_path}")
    print(f"Image pipeline temp dir: {image_result.temp_dir}")
    print(f"Image pipeline validation temp dir ready: {image_result.temp_dir_ready}")
    print(f"Image pipeline validation status: {image_result.result['validation_status']}")
    publish_result = validate_instagram_publishing_environment(config, logger=logger)
    print(f"Publish report written: {publish_result.report_path}")
    print(f"Publish dry-run blocked: {publish_result.dry_run_blocked}")
    print(f"Publish fake precheck passed: {publish_result.fake_precheck_passed}")
    print(f"Publish fake publish succeeded: {publish_result.fake_publish_succeeded}")
    print(f"Publish retry deduped: {publish_result.retry_no_duplicate}")
    required_tables = [
        "jalapeno_runs",
        "jalapeno_posts",
        "jalapeno_image_assets",
        "jalapeno_post_metrics",
        "jalapeno_instagram_posts",
        "jalapeno_performance_summaries",
        "jalapeno_report_logs",
        "jalapeno_errors",
    ]
    missing_tables: list[str] = []
    if client is not None:
        for table_name in required_tables:
            if not client.table_exists(table_name):
                missing_tables.append(table_name)
    else:
        missing_tables = required_tables
    if missing_tables:
        print(f"Warning: missing or inaccessible tables: {', '.join(missing_tables)}")
    else:
        print("Required tables exist")
    image_asset_required_columns = {
        "id",
        "run_id",
        "candidate_id",
        "post_id",
        "local_temp_path",
        "storage_bucket",
        "storage_path",
        "public_url",
        "image_type",
        "content_type",
        "width",
        "height",
        "aspect_ratio",
        "file_size_bytes",
        "format",
        "branding_applied",
        "meme_format_applied",
        "validation_status",
        "image_source",
        "image_prompt",
        "prompt_quality",
        "validation_reason",
        "prompt_version",
        "generation_time_ms",
        "image_model",
        "metadata",
        "uploaded_at",
        "cleanup_status",
        "created_at",
        "updated_at",
    }
    if client is not None and "jalapeno_image_assets" not in missing_tables:
        try:
            image_asset_columns = client.table_columns("jalapeno_image_assets")
        except SupabaseError as exc:
            raise ConfigError(str(exc)) from exc
        missing_image_asset_columns = sorted(image_asset_required_columns - image_asset_columns)
        if missing_image_asset_columns:
            message = f"jalapeno_image_assets missing columns: {', '.join(missing_image_asset_columns)}"
            log_event(logger, "jalapeno_image_assets_schema_validation_failed", level="error", missing_columns=missing_image_asset_columns)
            raise ConfigError(message)
        log_event(logger, "jalapeno_image_assets_schema_validation_passed", column_count=len(image_asset_columns))
        print("jalapeno_image_assets columns exist")
    elif client is None:
        print("Warning: jalapeno_image_assets columns not inspected because Supabase is unavailable")
    print(f"OpenAI key available: {bool(os.getenv('OPENAI_API_KEY', '').strip() or os.getenv('JALAPENO_AI_FUNCTION_URL', '').strip())}")
    print(f"Meta credentials available: {bool(os.getenv(config.instagram.access_token_secret_name, '').strip() and os.getenv(config.instagram.ig_user_id_secret_name, '').strip())}")
    print(f"Instagram business account id present: {bool(config.instagram_business_account_id)}")
    print(f"Facebook page id present: {bool(config.facebook_page_id)}")
    print(f"Email reporting configured: {bool(os.getenv('REPORT_EMAIL_TO', '').strip() and os.getenv('REPORT_EMAIL_FROM', '').strip() and os.getenv('RESEND_API_KEY', '').strip())}")
    fallback_path_ready = config.image.temp_dir.exists() or config.image.temp_dir.parent.exists()
    print(f"Fallback/temp content path ready: {fallback_path_ready}")
    performance_context = build_performance_context(client, logger=logger, run_id=content_result.run_id).to_dict()
    print(f"Performance context rows: {performance_context['source_counts']['rows']}")
    daily_report = generate_admin_report(config, client, report_type="daily", logger=logger, send_email=False, run_id=content_result.run_id)
    weekly_report = generate_admin_report(config, client, report_type="weekly", logger=logger, send_email=False, run_id=content_result.run_id)
    print(f"Daily report dry run generated: {bool(daily_report.body)}")
    print(f"Weekly report dry run generated: {bool(weekly_report.body)}")
    print("Validation succeeded")
    print(f"Mode: {config.default_mode}")
    return 0


def run_image_pipeline_live() -> int:
    print(f"Loading env file: {ENV_FILE}")
    env_loaded = load_env_file()
    print(f"Env loaded: {env_loaded}")
    config = load_configuration()
    logger = initialize_logging(config)
    validate_phase1_environment()
    warn_missing_future_secrets(logger)
    print(f"Config loaded: {CONFIG_FILE}")

    has_url = bool(os.getenv("SUPABASE_URL", "").strip())
    has_service_role_key = bool(os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip())
    log_event(logger, "supabase_connection_started", has_url=has_url, has_service_role_key=has_service_role_key)
    if not (has_url and has_service_role_key):
        raise ConfigError("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")

    client = SupabaseClient.from_env()
    client.fetch_rows("users", select="user_id", filters={"limit": 1})
    log_event(logger, "supabase_connection_success", has_connection=True)

    decision_path = Path(__file__).resolve().parent / "data" / "latest_content_decision.json"
    if not decision_path.exists():
        raise ConfigError(f"Missing content decision file: {decision_path}")
    import json

    content_decision = json.loads(decision_path.read_text(encoding="utf-8"))
    result = run_image_pipeline_live_environment(
        config,
        content_decision,
        logger=logger,
        client=client,
    )
    print(f"Image pipeline written: {result.output_path}")
    print(f"Image pipeline public URL: {result.result['public_url']}")
    print(f"Image pipeline storage path: {result.result['storage_path']}")
    print(f"Image pipeline validation status: {result.result['validation_status']}")
    print("Live image pipeline succeeded")
    return 0


def run_instagram_publish_live() -> int:
    print(f"Loading env file: {ENV_FILE}")
    env_loaded = load_env_file()
    print(f"Env loaded: {env_loaded}")
    config = load_configuration()
    logger = initialize_logging(config)
    validate_phase1_environment()
    warn_missing_future_secrets(logger)
    print(f"Config loaded: {CONFIG_FILE}")

    has_url = bool(os.getenv("SUPABASE_URL", "").strip())
    has_service_role_key = bool(os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip())
    log_event(logger, "supabase_connection_started", has_url=has_url, has_service_role_key=has_service_role_key)
    if not (has_url and has_service_role_key):
        raise ConfigError("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")

    client = SupabaseClient.from_env()
    client.fetch_rows("users", select="user_id", filters={"limit": 1})
    log_event(logger, "supabase_connection_success", has_connection=True)

    decision_path = Path(__file__).resolve().parent / "data" / "latest_content_decision.json"
    image_path = Path(__file__).resolve().parent / "data" / "latest_image_pipeline.json"
    if not decision_path.exists():
        raise ConfigError(f"Missing content decision file: {decision_path}")
    if not image_path.exists():
        raise ConfigError(f"Missing image pipeline file: {image_path}")
    import json

    content_decision = json.loads(decision_path.read_text(encoding="utf-8"))
    image_pipeline = json.loads(image_path.read_text(encoding="utf-8"))
    result = run_instagram_publishing_live_environment(
        config,
        content_decision,
        image_pipeline,
        logger=logger,
        client=client,
    )
    print(f"Publish report written: {result.report_path}")
    print(f"Publish status: {result.result['status']}")
    print(f"Publish media id: {result.result.get('published_media_id')}")
    print(f"Publish permalink: {result.result.get('permalink')}")
    print("Live Instagram publish succeeded")
    return 0


def _load_live_client_and_config(mode_name: str):
    print(f"Loading env file: {ENV_FILE}")
    env_loaded = load_env_file()
    print(f"Env loaded: {env_loaded}")
    config = load_configuration()
    logger = initialize_logging(config)
    validate_phase1_environment()
    warn_missing_future_secrets(logger)
    print(f"Config loaded: {CONFIG_FILE}")
    has_url = bool(os.getenv("SUPABASE_URL", "").strip())
    has_service_role_key = bool(os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip())
    log_event(logger, "supabase_connection_started", mode=mode_name, has_url=has_url, has_service_role_key=has_service_role_key)
    if not (has_url and has_service_role_key):
        raise ConfigError("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
    client = SupabaseClient.from_env()
    client.fetch_rows("users", select="user_id", filters={"limit": 1})
    log_event(logger, "supabase_connection_success", mode=mode_name, has_connection=True)
    return config, logger, client


def run_metrics() -> int:
    config, logger, client = _load_live_client_and_config("metrics")
    result = collect_instagram_metrics(config, client, logger=logger)
    print(f"Metrics checked posts: {result.checked_posts}")
    print(f"Metrics snapshots persisted: {result.snapshots_persisted}")
    print(f"Metrics failures: {result.failures}")
    if result.action_required:
        print("Metrics action required: Meta token/auth issue detected")
        return 2
    return 0


def run_admin_report(report_type: str) -> int:
    config, logger, client = _load_live_client_and_config(f"{report_type}-report")
    result = generate_admin_report(config, client, report_type=report_type, logger=logger, send_email=True)
    print(result.subject)
    print(result.body)
    print(f"Report stored: {result.stored}")
    print(f"Email status: {result.email_status}")
    return 0 if result.email_status != "failed" else 2


def run_dry_run() -> int:
    env_loaded = load_env_file()
    config = load_configuration()
    validate_phase1_environment()
    logger = initialize_logging(config)
    plan = get_mode_plan("dry-run")
    post_type = _normalize_optional_post_type(os.getenv("POST_TYPE"))
    scheduled_post_type = _production_scheduled_post_type(post_type) if post_type else None
    run_source = _github_run_source()
    github_metadata = _github_run_metadata()

    log_startup_state(logger, config, plan.name, env_loaded)
    log_event(
        logger,
        "selected_mode",
        mode=plan.name,
        blocked=plan.blocked,
        posting_allowed=plan.posting_allowed,
        meta_api_allowed=plan.meta_api_allowed,
        image_generation_allowed=plan.image_generation_allowed,
        description=plan.description,
        post_type=post_type,
        scheduled_post_type=scheduled_post_type,
        dry_run=True,
        run_source=run_source,
    )
    warn_missing_future_secrets(logger)
    log_event(logger, "dry_run_schedule_loaded", timezone=config.timezone, buffago_post_time=config.buffago_post_time, meme_post_time=config.meme_post_time)
    log_event(
        logger,
        "dry_run_requested",
        mode="dry-run",
        post_type=post_type,
        scheduled_post_type=scheduled_post_type,
        dry_run=True,
        run_source=run_source,
        **github_metadata,
    )
    log_event(
        logger,
        "dry_run_targets_loaded",
        facebook_page_id_present=bool(config.facebook_page_id),
        instagram_business_account_id_present=bool(config.instagram_business_account_id),
    )
    log_event(
        logger,
        "run_completed",
        agent_name=config.agent_name,
        stage="run",
        status="skipped",
        dry_run=True,
        post_type=post_type,
        scheduled_post_type=scheduled_post_type,
        run_source=run_source,
        posting_blocked=True,
        meta_endpoints_skipped=True,
    )
    return 0


def run_test_mode() -> int:
    env_loaded = load_env_file()
    config = load_configuration()
    validate_phase1_environment()
    logger = initialize_logging(config)
    plan = get_mode_plan("test")

    log_startup_state(logger, config, plan.name, env_loaded)
    log_mode_plan(logger, plan)
    warn_missing_future_secrets(logger)
    log_event(logger, "candidate_generation_started", stage="candidate_generation", status="simulated", dry_run=True)
    for step in SIMULATION_STEPS:
        logger.info("test simulation step | step=%s", step)
    log_event(
        logger,
        "candidate_generation_completed",
        stage="candidate_generation",
        status="simulated",
        dry_run=True,
    )
    log_event(
        logger,
        "run_completed",
        agent_name=config.agent_name,
        stage="run",
        status="completed",
        dry_run=True,
        posting_disabled=True,
        meta_api_disabled=True,
        image_generation_disabled=True,
    )
    return 0


def run_production() -> int:
    started_at = time.perf_counter()
    print(f"Loading env file: {ENV_FILE}")
    env_loaded = load_env_file()
    print(f"Env loaded: {env_loaded}")
    config = load_configuration()
    logger = initialize_logging(config)
    validate_phase1_environment()
    warn_missing_future_secrets(logger)
    print(f"Config loaded: {CONFIG_FILE}")

    post_type = _normalize_production_post_type(os.getenv("POST_TYPE"))
    scheduled_post_type = _production_scheduled_post_type(post_type)
    run_source = _github_run_source()
    github_metadata = _github_run_metadata()

    plan = get_mode_plan("production")
    log_event(
        logger,
        "selected_mode",
        mode=plan.name,
        blocked=plan.blocked,
        posting_allowed=plan.posting_allowed,
        meta_api_allowed=plan.meta_api_allowed,
        image_generation_allowed=plan.image_generation_allowed,
        description=plan.description,
        post_type=post_type,
        scheduled_post_type=scheduled_post_type,
        dry_run=False,
        run_source=run_source,
    )
    log_event(
        logger,
        "production_run_requested",
        mode="production",
        post_type=post_type,
        scheduled_post_type=scheduled_post_type,
        dry_run=False,
        run_source=run_source,
        **github_metadata,
    )

    has_url = bool(os.getenv("SUPABASE_URL", "").strip())
    has_service_role_key = bool(os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip())
    log_event(logger, "supabase_connection_started", has_url=has_url, has_service_role_key=has_service_role_key)
    if not (has_url and has_service_role_key):
        raise ConfigError("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")

    client = SupabaseClient.from_env()
    client.fetch_rows("users", select="user_id", filters={"limit": 1})
    log_event(logger, "supabase_connection_success", has_connection=True)

    run_uuid = uuid4()
    run_id = str(run_uuid)
    run_context = JalapenoRunContext(
        run_id=run_uuid,
        agent_name=config.agent_name,
        post_type=scheduled_post_type,
        dry_run=False,
        environment="production",
        trigger_source=run_source,
        git_commit=github_metadata.get("github_sha"),
    )
    create_run(
        client,
        context=run_context,
        metadata={
            "mode": "production",
            "post_type": post_type,
            "scheduled_post_type": scheduled_post_type,
            "dry_run": False,
            "run_source": run_source,
            **github_metadata,
        },
    )
    log_event(
        logger,
        "run_started",
        run_id=run_id,
        agent_name=config.agent_name,
        mode="production",
        post_type=post_type,
        scheduled_post_type=scheduled_post_type,
        dry_run=False,
        run_source=run_source,
    )

    try:
        snapshot_result = generate_latest_snapshot(logger=logger, client=client)
        print(f"Snapshot written: {snapshot_result.output_path}")
        external_result = generate_external_context(config, logger=logger)
        print(f"External context written: {external_result.output_path}")
        content_result = run_content_decision_engine(
            snapshot=snapshot_result.snapshot,
            external_context=external_result.context,
            client=client,
            logger=logger,
            run_id=run_id,
            dry_run=False,
            scheduled_post_type=scheduled_post_type,
        )
        content_decision = {
            "run_id": content_result.run_id,
            "generated_at": content_result.generated_at,
            "scheduled_post_type": scheduled_post_type,
            "winner": content_result.winner,
            "runner_up": content_result.runner_up,
            "all_candidates": content_result.all_candidates,
            "decision_summary": content_result.decision_summary,
        }
        print(f"Content decision written: {content_result.output_path}")
        print(f"Content decision run id: {content_result.run_id}")
        print(f"Content winner type: {content_result.winner.get('content_type')}")
        ensure_selected_post_candidate(
            client,
            run_context=run_context,
            winner_payload=content_result.winner,
            decision_summary=content_result.decision_summary,
            logger=logger,
        )

        image_result = run_image_pipeline_live_environment(
            config,
            content_decision,
            logger=logger,
            client=client,
            complete_run_on_success=False,
        )
        print(f"Image pipeline written: {image_result.output_path}")
        print(f"Image pipeline public URL: {image_result.result['public_url']}")

        publish_result = run_instagram_publishing_live_environment(
            config,
            content_decision,
            image_result.result,
            logger=logger,
            client=client,
        )
        duration_ms = int((time.perf_counter() - started_at) * 1000)
        complete_run(
            client,
            run_id=UUID(run_id),
            duration_ms=duration_ms,
            status="completed",
            metadata={
                "mode": "production",
                "post_type": post_type,
                "scheduled_post_type": scheduled_post_type,
                "dry_run": False,
                "run_source": run_source,
                "publish_status": publish_result.result.get("status"),
                **github_metadata,
            },
        )
        log_event(
            logger,
            "run_completed",
            run_id=run_id,
            agent_name=config.agent_name,
            mode="production",
            post_type=post_type,
            scheduled_post_type=scheduled_post_type,
            dry_run=False,
            run_source=run_source,
            success=True,
            duration_ms=duration_ms,
        )
        print(f"Publish report written: {publish_result.report_path}")
        print(f"Publish status: {publish_result.result['status']}")
        print("Production publish succeeded")
        return 0
    except Exception as exc:
        duration_ms = int((time.perf_counter() - started_at) * 1000)
        fail_run(
            client,
            run_id=UUID(run_id),
            message=str(exc),
            duration_ms=duration_ms,
            metadata={
                "mode": "production",
                "post_type": post_type,
                "scheduled_post_type": scheduled_post_type,
                "dry_run": False,
                "run_source": run_source,
                "error": str(exc),
                **github_metadata,
            },
        )
        log_event(
            logger,
            "run_failed",
            level="error",
            run_id=run_id,
            agent_name=config.agent_name,
            mode="production",
            post_type=post_type,
            scheduled_post_type=scheduled_post_type,
            dry_run=False,
            run_source=run_source,
            success=False,
            duration_ms=duration_ms,
            error=str(exc),
        )
        raise


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    try:
        if args.validate:
            return run_validate(refresh_external_context=args.refresh_external_context, skip_ai=args.skip_ai)
        if args.dry_run:
            return run_dry_run()
        if args.test:
            return run_test_mode()
        if args.image_pipeline_live:
            return run_image_pipeline_live()
        if args.instagram_publish_live:
            return run_instagram_publish_live()
        if args.production:
            return run_production()
        if args.metrics:
            return run_metrics()
        if args.daily_report:
            return run_admin_report("daily")
        if args.weekly_report:
            return run_admin_report("weekly")
        parser.error("one mode must be selected")
    except ConfigError as exc:
        print(f"Validation failed: {exc}")
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
