from __future__ import annotations

import argparse
import json
import os
import sys
import time
from dataclasses import replace
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import UUID, uuid4
from zoneinfo import ZoneInfo

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
    resolve_runtime_publish_settings,
    validate_phase1_environment,
    warn_missing_future_secrets,
)
from content_engine.content_engine import run_content_decision_engine
from data_snapshot import generate_latest_snapshot
from external_context import generate_external_context
from jalapeno_db import JalapenoRunContext, complete_run, create_run, ensure_selected_post_candidate, fail_run, insert_error_row, insert_final_post
from logging_utils import log_event
from metrics_collector import collect_instagram_metrics
from performance_context import build_performance_context
from reporting import generate_admin_report
from supabase_client import SupabaseClient, SupabaseError
from video_assets import VideoAssetError, VideoAssetRepository
from video_overlay import apply_overlay_result_to_decision, create_text_overlay_video
from video_reel_flow import build_reel_content, content_decision_from_reel
from instagram_publishing.instagram_publishing import run_instagram_publishing_live_environment as run_instagram_publishing
from validation import (
    validate_content_engine_environment,
    validate_instagram_publishing_environment,
    validate_image_pipeline_environment,
    validate_phase3_environment,
    validate_phase4_environment,
    validate_phase5_environment,
    validate_prompt_library_environment,
    validate_video_overlay_environment,
    run_image_pipeline_live_environment,
)


PRODUCTION_POST_TYPE_MAP = {
    "buffago": "buffago_post",
    "video": "daily_wing_reel",
}
BUFFAGO_POST_CADENCE = timedelta(days=3)
SCHEDULE_TIMEZONE = "America/New_York"
SCHEDULE_WINDOW_TOLERANCE = timedelta(minutes=90)
SCHEDULE_TARGET_HOURS = {
    "buffago": 20,
    "video": 18,
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
    parser.add_argument(
        "--content-type",
        choices=sorted(PRODUCTION_POST_TYPE_MAP),
        help="Select the production content path. Equivalent to POST_TYPE for GitHub Actions.",
    )
    return parser


def _normalize_production_post_type(raw_value: str | None) -> str:
    value = (raw_value or "").strip().lower()
    if not value:
        raise ConfigError("POST_TYPE is required for --production. Valid values: buffago, video")
    if value not in PRODUCTION_POST_TYPE_MAP:
        raise ConfigError(f"Invalid POST_TYPE '{raw_value}'. Valid values: buffago, video")
    return value


def _normalize_optional_post_type(raw_value: str | None) -> str | None:
    value = (raw_value or "").strip()
    if not value:
        return None
    return _normalize_production_post_type(value)


def _production_scheduled_post_type(post_type: str) -> str:
    return PRODUCTION_POST_TYPE_MAP[post_type]


def _scheduled_post_type_for_cron(cron: str) -> str | None:
    normalized = " ".join(cron.split())
    if normalized == "0 22 * * *":
        return "video"
    if normalized == "0 0 */3 * *":
        return "buffago"
    return None


def _schedule_window_status(
    post_type: str,
    *,
    now: datetime | None = None,
    timezone_name: str = SCHEDULE_TIMEZONE,
    tolerance: timedelta = SCHEDULE_WINDOW_TOLERANCE,
) -> dict[str, object]:
    if post_type not in SCHEDULE_TARGET_HOURS:
        raise ConfigError(f"Invalid POST_TYPE '{post_type}'. Valid values: buffago, video")
    current_utc = now or datetime.now(timezone.utc)
    if current_utc.tzinfo is None:
        current_utc = current_utc.replace(tzinfo=timezone.utc)
    current_utc = current_utc.astimezone(timezone.utc)
    local_zone = ZoneInfo(timezone_name)
    local_time = current_utc.astimezone(local_zone)
    target_local = local_time.replace(
        hour=SCHEDULE_TARGET_HOURS[post_type],
        minute=0,
        second=0,
        microsecond=0,
    )
    elapsed = local_time - target_local
    allowed = timedelta(0) <= elapsed <= tolerance
    return {
        "allowed": allowed,
        "utc_time": current_utc.isoformat(),
        "local_time": local_time.isoformat(),
        "timezone": timezone_name,
        "target_local_time": target_local.isoformat(),
        "target_hour": SCHEDULE_TARGET_HOURS[post_type],
        "elapsed_minutes": round(elapsed.total_seconds() / 60, 3),
        "tolerance_minutes": int(tolerance.total_seconds() / 60),
    }


def _is_video_post(scheduled_post_type: str) -> bool:
    return scheduled_post_type == "daily_wing_reel"


def _parse_utc_datetime(value: object) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _latest_successful_buffago_post_at(client: SupabaseClient) -> datetime | None:
    rows = client.fetch_rows(
        "jalapeno_instagram_posts",
        select="published_at,status,scheduled_post_type",
        filters={
            "scheduled_post_type": "eq.buffago_post",
            "status": "in.(published,published_with_permalink_pending)",
            "order": "published_at.desc",
            "limit": 1,
        },
    )
    for row in rows:
        published_at = _parse_utc_datetime(row.get("published_at"))
        if published_at is not None:
            return published_at

    rows = client.fetch_rows(
        "jalapeno_posts",
        select="published_at,publish_status,post_type",
        filters={
            "post_type": "eq.buffago_post",
            "publish_status": "in.(published,published_with_permalink_pending)",
            "order": "published_at.desc",
            "limit": 1,
        },
    )
    for row in rows:
        published_at = _parse_utc_datetime(row.get("published_at"))
        if published_at is not None:
            return published_at
    return None


def _should_skip_buffago_three_day_run(
    client: SupabaseClient,
    *,
    now: datetime | None = None,
) -> tuple[bool, datetime | None, float | None]:
    current_time = now or datetime.now(timezone.utc)
    if current_time.tzinfo is None:
        current_time = current_time.replace(tzinfo=timezone.utc)
    current_time = current_time.astimezone(timezone.utc)
    last_published_at = _latest_successful_buffago_post_at(client)
    if last_published_at is None:
        return False, None, None
    elapsed = current_time - last_published_at
    return elapsed < BUFFAGO_POST_CADENCE, last_published_at, elapsed.total_seconds() / 86400


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
    event_schedule = (
        os.getenv("JALAPENO_EVENT_SCHEDULE", "").strip()
        or os.getenv("GITHUB_EVENT_SCHEDULE", "").strip()
    )
    if event_schedule:
        metadata["github_event_schedule"] = event_schedule
    for env_name, field_name in (
        ("GITHUB_EVENT_NAME", "github_event_name"),
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


def _is_backup_worthy_video_publish_failure(exc: Exception) -> bool:
    message = str(exc).lower()
    config_or_state_markers = (
        "dry_run",
        "dry-run",
        "test_mode",
        "publishing disabled",
        "instagram publishing disabled",
        "missing required secret",
        "approved is false",
        "quality score",
        "missing caption",
        "precheck failed",
    )
    if any(marker in message for marker in config_or_state_markers):
        return False
    media_markers = (
        "video",
        "video_url",
        "media",
        "container_create",
        "container status",
        "upload",
        "unsupported",
        "invalid url",
        "inaccessible",
        "not accessible",
    )
    return any(marker in message for marker in media_markers)


def _overlay_metadata(result) -> dict[str, object]:
    return {
        "original_video_url": result.original_video_url,
        "processed_video_url": result.processed_video_url,
        "original_storage_path": result.original_storage_path,
        "processed_storage_path": result.processed_storage_path,
        "overlay_text": result.overlay_text,
        "overlay_status": result.status,
        "overlay_error": result.error,
        "video_url": result.publish_video_url,
        "storage_path": result.publish_storage_path,
    }


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
    video_overlay_result = validate_video_overlay_environment(config, logger=logger, client=client)
    print(f"Video overlay FFmpeg available: {video_overlay_result.ffmpeg_available}")
    print(f"Video overlay dry-run render succeeded: {video_overlay_result.dry_run_render_succeeded}")
    print(f"Video overlay processed storage writable: {video_overlay_result.processed_storage_writable}")
    if video_overlay_result.processed_storage_path:
        print(f"Video overlay validation upload: {video_overlay_result.processed_storage_path}")
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
        "jalapeno_video_assets",
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
    payload_required_columns = {
        "jalapeno_runs": {
            "run_id",
            "agent_name",
            "status",
            "dry_run",
            "started_at",
            "completed_at",
            "duration_ms",
            "metadata",
            "post_type",
            "agent_version",
            "workflow_version",
            "prompt_version",
            "git_commit",
            "environment",
            "trigger_source",
            "model_name",
            "image_model_name",
            "selected_candidate_id",
            "publish_failure_stage",
            "publish_failure_reason",
            "publish_error_code",
            "publish_error_message",
            "publish_retry_count",
            "last_publish_attempt_at",
            "updated_at",
        },
        "jalapeno_post_candidates": {
            "id",
            "run_id",
            "candidate_number",
            "post_type",
            "idea",
            "reasoning",
            "caption",
            "hashtags",
            "image_prompt",
            "image_storage_path",
            "image_url",
            "raw_text_prompt",
            "raw_image_prompt",
            "raw_ai_response",
            "quality_score",
            "overall_score",
            "duplicate_score",
            "selected",
            "rejection_reason",
            "updated_at",
        },
        "jalapeno_posts": {
            "id",
            "run_id",
            "candidate_id",
            "post_type",
            "chosen_idea",
            "generated_caption",
            "hashtags",
            "image_prompt",
            "image_storage_path",
            "image_url",
            "scheduled_for",
            "publish_status",
            "metadata",
            "media_source",
            "video_asset_id",
            "storage_path",
            "video_url",
            "original_video_url",
            "processed_video_url",
            "original_storage_path",
            "processed_storage_path",
            "overlay_text",
            "overlay_status",
            "overlay_error",
            "retry_count",
            "last_publish_attempt_at",
            "published_at",
            "instagram_media_id",
            "instagram_permalink",
            "publish_response",
            "updated_at",
        },
        "jalapeno_instagram_posts": {
            "run_id",
            "candidate_id",
            "post_id",
            "image_asset_id",
            "container_id",
            "published_media_id",
            "permalink",
            "caption",
            "hashtags",
            "alt_text",
            "image_url",
            "content_type",
            "scheduled_post_type",
            "quality_score",
            "image_source",
            "image_validation_status",
            "image_validation_reason",
            "prompt_quality",
            "scheduled_for",
            "published_at",
            "status",
            "failure_stage",
            "failure_reason",
            "error_code",
            "error_message",
            "retry_count",
            "updated_at",
            "request_payload_safe",
            "response_payload",
            "metadata",
            "video_asset_id",
            "video_url",
            "media_kind",
            "media_source",
            "storage_path",
            "original_video_url",
            "processed_video_url",
            "original_storage_path",
            "processed_storage_path",
            "overlay_text",
            "overlay_status",
            "overlay_error",
            "created_at",
        },
        "jalapeno_image_assets": {
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
            "quality_score",
            "validation_reason",
            "prompt_version",
            "generation_time_ms",
            "image_model",
            "metadata",
            "uploaded_at",
            "cleanup_status",
            "created_at",
            "updated_at",
        },
        "jalapeno_video_assets": {
            "id",
            "storage_bucket",
            "storage_path",
            "public_url",
            "style",
            "caption_type",
            "active",
            "used_count",
            "last_used_at",
            "performance_score",
            "notes",
            "created_at",
            "updated_at",
        },
        "jalapeno_post_metrics": {
            "post_id",
            "instagram_media_id",
            "likes",
            "comments",
            "shares",
            "saves",
            "reach",
            "impressions",
            "profile_visits",
            "follows",
            "engagement_rate",
            "raw_metrics",
            "captured_at",
            "collected_at",
            "post_age_hours",
            "post_age_days",
            "caption",
            "category",
            "prompt_template",
            "prompt_reason",
            "image_prompt",
            "image_style",
            "hashtags",
            "cta_type",
            "generation_model",
            "image_model",
            "cost_metadata",
            "published_at",
            "state",
            "restaurant",
            "topic",
            "video_asset_id",
            "caption_type",
            "video_style",
            "media_source",
            "storage_path",
            "metadata",
        },
    }
    if client is not None:
        for table_name, required_columns in payload_required_columns.items():
            if table_name in missing_tables:
                continue
            try:
                columns = client.table_columns(table_name)
            except SupabaseError as exc:
                raise ConfigError(str(exc)) from exc
            missing_columns = sorted(required_columns - columns)
            if missing_columns:
                message = f"{table_name} missing columns: {', '.join(missing_columns)}"
                log_event(logger, "jalapeno_payload_schema_validation_failed", level="error", table=table_name, missing_columns=missing_columns)
                raise ConfigError(message)
            log_event(logger, "jalapeno_payload_schema_validation_passed", table=table_name, column_count=len(columns))
        print("Jalapeno payload columns exist")
    else:
        print("Warning: Jalapeno payload columns not inspected because Supabase is unavailable")
    image_asset_required_columns = payload_required_columns["jalapeno_image_assets"]
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
    if client is not None:
        bucket_ok = client.storage_bucket_exists(config.video.bucket)
        print(f"Video bucket accessible ({config.video.bucket}): {bucket_ok}")
    if client is not None and "jalapeno_video_assets" not in missing_tables:
        video_required_columns = payload_required_columns["jalapeno_video_assets"]
        video_columns = client.table_columns("jalapeno_video_assets")
        missing_video_columns = sorted(video_required_columns - video_columns)
        if missing_video_columns:
            raise ConfigError(f"jalapeno_video_assets missing columns: {', '.join(missing_video_columns)}")
        print("jalapeno_video_assets columns exist")
        try:
            video_assets = VideoAssetRepository(client, config, logger=logger).ensure_assets_available()
            active_count = len(video_assets)
        except Exception as exc:
            active_count = 0
            print(f"Warning: video asset availability check failed: {exc}")
        print(f"Active video assets available: {active_count}")
        if active_count == 0:
            print("Warning: no active video assets are available for the 6pm Reel")
    elif client is None:
        print("Warning: jalapeno_video_assets and video bucket not inspected because Supabase is unavailable")
    print(f"Configured 8pm Buffago cadence post: {config.buffago_post_time} {config.timezone}")
    print(f"Configured 6pm video Reel post: {config.video.post_time} {config.timezone}")
    if config.buffago_post_time != "20:00" or config.video.post_time != "18:00":
        print("Warning: scheduler config does not match expected 20:00 Buffago and 18:00 video times")
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
    result = run_instagram_publishing(
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
    if scheduled_post_type and _is_video_post(scheduled_post_type):
        has_url = bool(os.getenv("SUPABASE_URL", "").strip())
        has_service_role_key = bool(os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip())
        if has_url and has_service_role_key:
            try:
                client = SupabaseClient.from_env()
                run_uuid = uuid4()
                run_context = JalapenoRunContext(
                    run_id=run_uuid,
                    agent_name=config.agent_name,
                    post_type=scheduled_post_type,
                    dry_run=True,
                    environment="dry-run",
                    trigger_source=run_source,
                    git_commit=github_metadata.get("github_sha"),
                )
                create_run(
                    client,
                    context=run_context,
                    metadata={"mode": "dry-run", "post_type": post_type, "scheduled_post_type": scheduled_post_type, **github_metadata},
                )
                repository = VideoAssetRepository(client, config, logger=logger)
                content = build_reel_content(repository, dry_run=True, logger=logger)
                content_decision = content_decision_from_reel(str(run_uuid), content)
                overlay_result = create_text_overlay_video(
                    client,
                    content.video_asset,
                    content.caption,
                    run_id=str(run_uuid),
                    candidate_id=content.candidate_id,
                    logger=logger,
                )
                apply_overlay_result_to_decision(content_decision, overlay_result)
                overlay_fields = _overlay_metadata(overlay_result)
                ensure_selected_post_candidate(
                    client,
                    run_context=run_context,
                    winner_payload=content_decision["winner"],
                    decision_summary={"winner_reasoning": ["Dry-run selected a Supabase video asset."]},
                    logger=logger,
                )
                insert_final_post(
                    client,
                    run_id=run_uuid,
                    candidate_id=UUID(content.candidate_id),
                    post_type=scheduled_post_type,
                    chosen_idea="Daily wing Reel dry run",
                    generated_caption=content.caption,
                    hashtags=content.hashtags,
                    image_prompt="Preloaded Supabase Storage wing video asset; no AI image or video generated.",
                    image_url=content.video_asset.public_url,
                    media_source="supabase_video_asset",
                    video_asset_id=UUID(content.video_asset.id),
                    storage_path=str(overlay_fields["storage_path"]),
                    video_url=str(overlay_fields["video_url"]),
                    original_video_url=str(overlay_fields["original_video_url"]),
                    processed_video_url=overlay_fields["processed_video_url"] if isinstance(overlay_fields["processed_video_url"], str) else None,
                    original_storage_path=str(overlay_fields["original_storage_path"]),
                    processed_storage_path=overlay_fields["processed_storage_path"] if isinstance(overlay_fields["processed_storage_path"], str) else None,
                    overlay_text=str(overlay_fields["overlay_text"]),
                    overlay_status=str(overlay_fields["overlay_status"]),
                    overlay_error=overlay_fields["overlay_error"] if isinstance(overlay_fields["overlay_error"], str) else None,
                    publish_status="dry_run",
                    metadata={
                        "dry_run": True,
                        "media_source": "supabase_video_asset",
                        "video_asset_id": content.video_asset.id,
                        "storage_path": overlay_fields["storage_path"],
                        "caption_type": content.caption_type,
                        "style": content.video_asset.style,
                        "no_publish": True,
                        **overlay_fields,
                    },
                )
                log_event(
                    logger,
                    "dry_run_video_reel_selected",
                    run_id=str(run_uuid),
                    candidate_id=content.candidate_id,
                    video_asset_id=content.video_asset.id,
                    storage_path=overlay_fields["storage_path"],
                    video_url=overlay_fields["video_url"],
                    original_storage_path=overlay_fields["original_storage_path"],
                    processed_storage_path=overlay_fields["processed_storage_path"],
                    overlay_text=overlay_fields["overlay_text"],
                    overlay_status=overlay_fields["overlay_status"],
                    caption_preview=content.caption[:140],
                    publish_skipped=True,
                )
            except Exception as exc:
                log_event(
                    logger,
                    "dry_run_video_reel_selection_skipped",
                    level="warning",
                    reason=str(exc),
                    publish_skipped=True,
                )
        else:
            log_event(
                logger,
                "dry_run_video_reel_selection_skipped",
                level="warning",
                reason="SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing",
                publish_skipped=True,
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


def run_production(content_type: str | None = None) -> int:
    started_at = time.perf_counter()
    print(f"Loading env file: {ENV_FILE}")
    env_loaded = load_env_file()
    print(f"Env loaded: {env_loaded}")
    config = load_configuration()
    logger = initialize_logging(config)
    validate_phase1_environment()
    warn_missing_future_secrets(logger)
    print(f"Config loaded: {CONFIG_FILE}")

    post_type = _normalize_production_post_type(content_type or os.getenv("POST_TYPE"))
    scheduled_post_type = _production_scheduled_post_type(post_type)
    run_source = _github_run_source()
    github_metadata = _github_run_metadata()

    plan = get_mode_plan("production")
    runtime_settings = resolve_runtime_publish_settings(config=config, plan=plan)
    config = replace(
        config,
        instagram=replace(
            config.instagram,
            enabled=runtime_settings.instagram_enabled,
            dry_run=runtime_settings.dry_run,
        ),
    )
    log_event(
        logger,
        "selected_mode",
        mode=plan.name,
        blocked=plan.blocked,
        posting_allowed=runtime_settings.posting_allowed,
        meta_api_allowed=runtime_settings.meta_api_allowed,
        image_generation_allowed=runtime_settings.image_generation_allowed,
        description=plan.description,
        post_type=post_type,
        scheduled_post_type=scheduled_post_type,
        dry_run=runtime_settings.dry_run,
        dry_run_source=runtime_settings.dry_run_source,
        instagram_enabled=runtime_settings.instagram_enabled,
        instagram_enabled_source=runtime_settings.instagram_enabled_source,
        run_source=run_source,
    )
    log_event(
        logger,
        "production_run_dry_run_resolved",
        mode="production",
        post_type=post_type,
        scheduled_post_type=scheduled_post_type,
        dry_run=runtime_settings.dry_run,
        dry_run_source=runtime_settings.dry_run_source,
        posting_allowed=runtime_settings.posting_allowed,
        meta_api_allowed=runtime_settings.meta_api_allowed,
        image_generation_allowed=runtime_settings.image_generation_allowed,
        instagram_enabled=runtime_settings.instagram_enabled,
        instagram_enabled_source=runtime_settings.instagram_enabled_source,
        run_source=run_source,
        **github_metadata,
    )

    matched_cron = github_metadata.get("github_event_schedule")
    if run_source == "github_actions_scheduler":
        cron_post_type = _scheduled_post_type_for_cron(matched_cron or "")
        window_status = _schedule_window_status(post_type)
        log_event(
            logger,
            "schedule_window_checked",
            mode="production",
            post_type=post_type,
            scheduled_post_type=scheduled_post_type,
            run_source=run_source,
            matched_cron=matched_cron,
            resolved_post_type=post_type,
            cron_resolved_post_type=cron_post_type,
            schedule_window_allowed=window_status["allowed"],
            utc_time=window_status["utc_time"],
            america_new_york_time=window_status["local_time"],
            schedule_target_local_time=window_status["target_local_time"],
            schedule_elapsed_minutes=window_status["elapsed_minutes"],
            schedule_tolerance_minutes=window_status["tolerance_minutes"],
        )
        if cron_post_type is not None and cron_post_type != post_type:
            raise ConfigError(f"Scheduled cron '{matched_cron}' resolved to {cron_post_type}, not {post_type}")
        if not window_status["allowed"]:
            log_event(
                logger,
                "schedule_window_skipped",
                mode="production",
                post_type=post_type,
                scheduled_post_type=scheduled_post_type,
                run_source=run_source,
                matched_cron=matched_cron,
                resolved_post_type=post_type,
                utc_time=window_status["utc_time"],
                america_new_york_time=window_status["local_time"],
                schedule_target_local_time=window_status["target_local_time"],
                schedule_elapsed_minutes=window_status["elapsed_minutes"],
                schedule_tolerance_minutes=window_status["tolerance_minutes"],
                status="skipped",
            )
            print("Scheduled run skipped: outside America/New_York publish window")
            print(f"UTC time: {window_status['utc_time']}")
            print(f"America/New_York time: {window_status['local_time']}")
            print(f"Matched cron: {matched_cron or 'unknown'}")
            print(f"Resolved post type: {post_type}")
            return 0

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
        dry_run=runtime_settings.dry_run,
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
            "dry_run": runtime_settings.dry_run,
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
        dry_run=runtime_settings.dry_run,
        posting_allowed=runtime_settings.posting_allowed,
        meta_api_allowed=runtime_settings.meta_api_allowed,
        run_source=run_source,
    )

    try:
        if run_source == "github_actions_scheduler" and scheduled_post_type == "buffago_post" and not runtime_settings.dry_run:
            should_skip, last_published_at, elapsed_days = _should_skip_buffago_three_day_run(client)
            if should_skip:
                duration_ms = int((time.perf_counter() - started_at) * 1000)
                skip_metadata = {
                    "mode": "production",
                    "post_type": post_type,
                    "scheduled_post_type": scheduled_post_type,
                    "dry_run": runtime_settings.dry_run,
                    "run_source": run_source,
                    "skip_reason": "buffago_three_day_cadence",
                    "last_successful_buffago_post_at": last_published_at.isoformat() if last_published_at else None,
                    "elapsed_days": round(elapsed_days, 4) if elapsed_days is not None else None,
                    "required_elapsed_days": BUFFAGO_POST_CADENCE.days,
                    **github_metadata,
                }
                complete_run(
                    client,
                    run_id=UUID(run_id),
                    duration_ms=duration_ms,
                    status="skipped",
                    metadata=skip_metadata,
                )
                log_event(
                    logger,
                    "buffago_three_day_skipped",
                    run_id=run_id,
                    agent_name=config.agent_name,
                    mode="production",
                    post_type=post_type,
                    scheduled_post_type=scheduled_post_type,
                    run_source=run_source,
                    last_successful_buffago_post_at=last_published_at.isoformat() if last_published_at else None,
                    elapsed_days=round(elapsed_days, 4) if elapsed_days is not None else None,
                    required_elapsed_days=BUFFAGO_POST_CADENCE.days,
                    duration_ms=duration_ms,
                )
                log_event(
                    logger,
                    "skipped_run",
                    run_id=run_id,
                    agent_name=config.agent_name,
                    mode="production",
                    post_type=post_type,
                    scheduled_post_type=scheduled_post_type,
                    status="skipped",
                    reason="buffago_three_day_cadence",
                    duration_ms=duration_ms,
                )
                print("Buffago three-day run skipped")
                print(f"Last successful Buffago post: {last_published_at.isoformat() if last_published_at else 'none'}")
                print(f"Elapsed days: {round(elapsed_days, 4) if elapsed_days is not None else 'n/a'}")
                return 0
            log_event(
                logger,
                "buffago_three_day_run",
                run_id=run_id,
                agent_name=config.agent_name,
                mode="production",
                post_type=post_type,
                scheduled_post_type=scheduled_post_type,
                run_source=run_source,
                last_successful_buffago_post_at=last_published_at.isoformat() if last_published_at else None,
                elapsed_days=round(elapsed_days, 4) if elapsed_days is not None else None,
                required_elapsed_days=BUFFAGO_POST_CADENCE.days,
            )
        if _is_video_post(scheduled_post_type):
            if run_source == "github_actions_scheduler":
                log_event(
                    logger,
                    "video_daily_run",
                    run_id=run_id,
                    agent_name=config.agent_name,
                    mode="production",
                    post_type=post_type,
                    scheduled_post_type=scheduled_post_type,
                    run_source=run_source,
                )
            repository = VideoAssetRepository(client, config, logger=logger)
            content = build_reel_content(repository, dry_run=runtime_settings.dry_run, logger=logger)
            content_decision = content_decision_from_reel(run_id, content)
            overlay_result = create_text_overlay_video(
                client,
                content.video_asset,
                content.caption,
                run_id=run_id,
                candidate_id=content.candidate_id,
                logger=logger,
            )
            apply_overlay_result_to_decision(content_decision, overlay_result)
            overlay_fields = _overlay_metadata(overlay_result)
            ensure_selected_post_candidate(
                client,
                run_context=run_context,
                winner_payload=content_decision["winner"],
                decision_summary=content_decision["decision_summary"],
                logger=logger,
            )
            inserted_post = insert_final_post(
                client,
                run_id=run_uuid,
                candidate_id=UUID(content.candidate_id),
                post_type=scheduled_post_type,
                chosen_idea="Daily wing Reel",
                generated_caption=content.caption,
                hashtags=content.hashtags,
                image_prompt="Preloaded Supabase Storage wing video asset; no AI image or video generated.",
                image_url=content.video_asset.public_url,
                media_source="supabase_video_asset",
                video_asset_id=UUID(content.video_asset.id),
                storage_path=str(overlay_fields["storage_path"]),
                video_url=str(overlay_fields["video_url"]),
                original_video_url=str(overlay_fields["original_video_url"]),
                processed_video_url=overlay_fields["processed_video_url"] if isinstance(overlay_fields["processed_video_url"], str) else None,
                original_storage_path=str(overlay_fields["original_storage_path"]),
                processed_storage_path=overlay_fields["processed_storage_path"] if isinstance(overlay_fields["processed_storage_path"], str) else None,
                overlay_text=str(overlay_fields["overlay_text"]),
                overlay_status=str(overlay_fields["overlay_status"]),
                overlay_error=overlay_fields["overlay_error"] if isinstance(overlay_fields["overlay_error"], str) else None,
                publish_status="drafted" if runtime_settings.dry_run else "publishing",
                metadata={
                    "media_source": "supabase_video_asset",
                    "video_asset_id": content.video_asset.id,
                    "storage_bucket": content.video_asset.storage_bucket,
                    "storage_path": overlay_fields["storage_path"],
                    "caption_type": content.caption_type,
                    "style": content.video_asset.style,
                    "post_type": scheduled_post_type,
                    "no_ai_media_generation": True,
                    **overlay_fields,
                },
            )
            content_decision["post_id"] = inserted_post.get("id")
            content_decision["metadata"] = {
                "media_source": "supabase_video_asset",
                "video_asset_id": content.video_asset.id,
                **overlay_fields,
            }
            log_event(
                logger,
                "video_reel_publish_started",
                run_id=run_id,
                candidate_id=content.candidate_id,
                post_id=inserted_post.get("id"),
                video_asset_id=content.video_asset.id,
                storage_path=overlay_fields["storage_path"],
                video_url=overlay_fields["video_url"],
                original_storage_path=overlay_fields["original_storage_path"],
                processed_storage_path=overlay_fields["processed_storage_path"],
                overlay_text=overlay_fields["overlay_text"],
                overlay_status=overlay_fields["overlay_status"],
                dry_run=runtime_settings.dry_run,
                posting_allowed=runtime_settings.posting_allowed,
                meta_api_allowed=runtime_settings.meta_api_allowed,
            )
            try:
                log_event(
                    logger,
                    "video_publish_request_dry_run",
                    run_id=run_id,
                    candidate_id=content.candidate_id,
                    post_id=inserted_post.get("id"),
                    dry_run=runtime_settings.dry_run,
                    posting_allowed=runtime_settings.posting_allowed,
                    meta_api_allowed=runtime_settings.meta_api_allowed,
                    instagram_enabled=runtime_settings.instagram_enabled,
                    instagram_enabled_source=runtime_settings.instagram_enabled_source,
                )
                publish_result = run_instagram_publishing(
                    config,
                    content_decision,
                    image_pipeline=None,
                    logger=logger,
                    client=client,
                    runtime_settings=runtime_settings,
                )
            except Exception as first_exc:
                if not _is_backup_worthy_video_publish_failure(first_exc):
                    log_event(
                        logger,
                        "video_reel_backup_skipped",
                        level="warning",
                        run_id=run_id,
                        candidate_id=content.candidate_id,
                        video_asset_id=content.video_asset.id,
                        storage_path=content.video_asset.storage_path,
                        reason="config_or_state_failure",
                        error=str(first_exc),
                    )
                    raise
                insert_error_row(
                    client,
                    run_id=UUID(run_id),
                    post_id=UUID(str(inserted_post["id"])) if inserted_post.get("id") else None,
                    candidate_id=UUID(content.candidate_id),
                    stage="video_reel_publish",
                    error_type=type(first_exc).__name__,
                    message=str(first_exc),
                    raw_payload={
                        "reason": "primary_video_asset_failed",
                        "video_asset_id": content.video_asset.id,
                        "storage_path": content.video_asset.storage_path,
                    },
                    is_retryable=True,
                    retry_count=0,
                )
                log_event(
                    logger,
                    "video_reel_primary_asset_failed_trying_backup",
                    level="warning",
                    run_id=run_id,
                    candidate_id=content.candidate_id,
                    video_asset_id=content.video_asset.id,
                    storage_path=content.video_asset.storage_path,
                    error=str(first_exc),
                )
                backup_content = build_reel_content(
                    repository,
                    excluded_ids={content.video_asset.id},
                    dry_run=runtime_settings.dry_run,
                    logger=logger,
                )
                backup_decision = content_decision_from_reel(run_id, backup_content)
                backup_overlay_result = create_text_overlay_video(
                    client,
                    backup_content.video_asset,
                    backup_content.caption,
                    run_id=run_id,
                    candidate_id=backup_content.candidate_id,
                    logger=logger,
                )
                apply_overlay_result_to_decision(backup_decision, backup_overlay_result)
                backup_overlay_fields = _overlay_metadata(backup_overlay_result)
                ensure_selected_post_candidate(
                    client,
                    run_context=run_context,
                    winner_payload=backup_decision["winner"],
                    decision_summary=backup_decision["decision_summary"],
                    logger=logger,
                )
                backup_post = insert_final_post(
                    client,
                    run_id=run_uuid,
                    candidate_id=UUID(backup_content.candidate_id),
                    post_type=scheduled_post_type,
                    chosen_idea="Daily wing Reel backup",
                    generated_caption=backup_content.caption,
                    hashtags=backup_content.hashtags,
                    image_prompt="Preloaded Supabase Storage wing video asset backup; no AI image or video generated.",
                    image_url=backup_content.video_asset.public_url,
                    media_source="supabase_video_asset",
                    video_asset_id=UUID(backup_content.video_asset.id),
                    storage_path=str(backup_overlay_fields["storage_path"]),
                    video_url=str(backup_overlay_fields["video_url"]),
                    original_video_url=str(backup_overlay_fields["original_video_url"]),
                    processed_video_url=backup_overlay_fields["processed_video_url"] if isinstance(backup_overlay_fields["processed_video_url"], str) else None,
                    original_storage_path=str(backup_overlay_fields["original_storage_path"]),
                    processed_storage_path=backup_overlay_fields["processed_storage_path"] if isinstance(backup_overlay_fields["processed_storage_path"], str) else None,
                    overlay_text=str(backup_overlay_fields["overlay_text"]),
                    overlay_status=str(backup_overlay_fields["overlay_status"]),
                    overlay_error=backup_overlay_fields["overlay_error"] if isinstance(backup_overlay_fields["overlay_error"], str) else None,
                    publish_status="drafted" if runtime_settings.dry_run else "publishing",
                    metadata={
                        "media_source": "supabase_video_asset",
                        "video_asset_id": backup_content.video_asset.id,
                        "storage_bucket": backup_content.video_asset.storage_bucket,
                        "storage_path": backup_overlay_fields["storage_path"],
                        "caption_type": backup_content.caption_type,
                        "style": backup_content.video_asset.style,
                        "backup_for_video_asset_id": content.video_asset.id,
                        "no_ai_media_generation": True,
                        **backup_overlay_fields,
                    },
                )
                backup_decision["post_id"] = backup_post.get("id")
                backup_decision["metadata"] = {
                    "media_source": "supabase_video_asset",
                    "video_asset_id": backup_content.video_asset.id,
                    **backup_overlay_fields,
                }
                publish_result = run_instagram_publishing(
                    config,
                    backup_decision,
                    image_pipeline=None,
                    logger=logger,
                    client=client,
                    runtime_settings=runtime_settings,
                )
                content = backup_content
                overlay_fields = backup_overlay_fields
            if publish_result.result.get("status") in {"published", "published_with_permalink_pending"}:
                repository.increment_used(content.video_asset)
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
                    "dry_run": runtime_settings.dry_run,
                    "run_source": run_source,
                    "publish_status": publish_result.result.get("status"),
                    "media_source": "supabase_video_asset",
                    "video_asset_id": content.video_asset.id,
                    "storage_path": overlay_fields["storage_path"],
                    "original_storage_path": overlay_fields["original_storage_path"],
                    "processed_storage_path": overlay_fields["processed_storage_path"],
                    "overlay_text": overlay_fields["overlay_text"],
                    "overlay_status": overlay_fields["overlay_status"],
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
                dry_run=runtime_settings.dry_run,
                posting_allowed=runtime_settings.posting_allowed,
                meta_api_allowed=runtime_settings.meta_api_allowed,
                run_source=run_source,
                success=True,
                duration_ms=duration_ms,
                media_source="supabase_video_asset",
                video_asset_id=content.video_asset.id,
                storage_path=overlay_fields["storage_path"],
                original_storage_path=overlay_fields["original_storage_path"],
                processed_storage_path=overlay_fields["processed_storage_path"],
                overlay_text=overlay_fields["overlay_text"],
                overlay_status=overlay_fields["overlay_status"],
            )
            print(f"Publish report written: {publish_result.report_path}")
            print(f"Publish status: {publish_result.result['status']}")
            print(f"Video asset: {content.video_asset.storage_path}")
            print("Production Reel publish succeeded")
            return 0

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
            dry_run=runtime_settings.dry_run,
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

        publish_result = run_instagram_publishing(
            config,
            content_decision,
            image_result.result,
            logger=logger,
            client=client,
            runtime_settings=runtime_settings,
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
                "dry_run": runtime_settings.dry_run,
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
            dry_run=runtime_settings.dry_run,
            posting_allowed=runtime_settings.posting_allowed,
            meta_api_allowed=runtime_settings.meta_api_allowed,
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
        if _is_video_post(scheduled_post_type):
            try:
                insert_error_row(
                    client,
                    run_id=UUID(run_id),
                    stage="video_reel_pipeline",
                    error_type=type(exc).__name__,
                    message=str(exc),
                    raw_payload={
                        "post_type": post_type,
                        "scheduled_post_type": scheduled_post_type,
                        "reason": "no_assets" if isinstance(exc, VideoAssetError) and "no_video_assets" in str(exc) else "video_reel_failure",
                    },
                )
            except Exception:
                pass
        fail_run(
            client,
            run_id=UUID(run_id),
            message=str(exc),
            duration_ms=duration_ms,
            metadata={
                "mode": "production",
                "post_type": post_type,
                "scheduled_post_type": scheduled_post_type,
                "dry_run": runtime_settings.dry_run,
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
            dry_run=runtime_settings.dry_run,
            posting_allowed=runtime_settings.posting_allowed,
            meta_api_allowed=runtime_settings.meta_api_allowed,
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
            return run_production(content_type=args.content_type)
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
