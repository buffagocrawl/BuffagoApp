from __future__ import annotations

from dataclasses import replace
import json
from io import StringIO
from datetime import datetime, timezone
from pathlib import Path
import sys

import pytest
from zoneinfo import ZoneInfo

PROJECT_DIR = Path(__file__).resolve().parents[1]
if str(PROJECT_DIR) not in sys.path:
    sys.path.insert(0, str(PROJECT_DIR))

from config import (  # noqa: E402
    ConfigError,
    JalapenoConfig,
    get_mode_plan,
    initialize_logging,
    load_configuration,
    resolve_runtime_publish_settings,
    validate_phase1_environment,
    warn_missing_future_secrets,
)
import config as config_module  # noqa: E402
from data_client import Phase3WindowConfig  # noqa: E402
from data_snapshot import generate_latest_snapshot  # noqa: E402
from ai_schemas import fallback_image_output, normalize_image_output  # noqa: E402
from content_engine.candidate_generator import CandidateGenerator, ContentCandidate  # noqa: E402
from content_engine.image_prompt_generator import generate_image_prompt  # noqa: E402
from content_engine.settings import ContentEngineSettings  # noqa: E402
from jalapeno_db import insert_image_asset  # noqa: E402
from logging_utils import format_structured_log, log_event  # noqa: E402
from reporting import _daily_body, _weekly_body, generate_admin_report  # noqa: E402
from validation import validate_content_engine_environment, validate_phase3_environment, validate_phase4_environment  # noqa: E402
from validation import validate_image_pipeline_environment, validate_phase5_environment, validate_prompt_library_environment  # noqa: E402
from main import (  # noqa: E402
    PRODUCTION_POST_TYPE_MAP,
    _is_backup_worthy_video_publish_failure,
    _should_skip_buffago_three_day_run,
    _normalize_optional_post_type,
    _normalize_production_post_type,
    build_parser,
    run_dry_run,
    main,
)


STRUCTURAL_ENV_VALUES = {
    "FACEBOOK_PAGE_ID": "facebook-page-id",
    "INSTAGRAM_BUSINESS_ACCOUNT_ID": "instagram-business-account-id",
}


@pytest.fixture(autouse=True)
def required_env(monkeypatch: pytest.MonkeyPatch) -> None:
    for key, value in STRUCTURAL_ENV_VALUES.items():
        monkeypatch.setenv(key, value)
    for key in (
        "TIMEZONE",
        "SUPABASE_URL",
        "SUPABASE_SERVICE_ROLE_KEY",
        "META_APP_ID",
        "META_APP_SECRET",
        "META_LONG_LIVED_ACCESS_TOKEN",
    ):
        monkeypatch.delenv(key, raising=False)


def test_config_yaml_loads() -> None:
    config = load_configuration(env_path=PROJECT_DIR / ".missing-test-env", config_path=PROJECT_DIR / "config.yaml")

    assert isinstance(config, JalapenoConfig)
    assert config.agent_name == "Jalapeno"
    assert config.channel == "instagram"
    assert config.brand == "Buffago"
    assert config.timezone == "America/New_York"
    assert config.buffago_post_time == "16:00"
    assert config.meme_post_time == "20:00"
    assert config.video_post_time == "20:00"
    assert config.video.bucket == "jalapeno-wing-videos"
    assert config.video.recent_reuse_days == 7
    assert config.test_mode_never_posts is True


def test_image_pipeline_config_sections_load() -> None:
    config = load_configuration(env_path=PROJECT_DIR / ".missing-test-env", config_path=PROJECT_DIR / "config.yaml")

    assert config.image.default_aspect_ratio == "4:5"
    assert config.image.default_width == 1080
    assert config.image.default_height == 1350
    assert config.image.square_width == 1080
    assert config.image.square_height == 1080
    assert config.storage.provider == "supabase"
    assert config.storage.bucket == "jalapeno-assets"
    assert config.cleanup.cleanup_temp_files is True


def test_windows_tmp_image_dir_is_normalized(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(config_module.os, "name", "nt", raising=False)
    monkeypatch.setattr(config_module.tempfile, "gettempdir", lambda: "C:\\temp-root")

    resolved = config_module._resolve_temp_dir("/tmp/jalapeno/images")

    assert resolved == Path("C:/temp-root/jalapeno/images")


def test_time_zone_can_be_overridden_from_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TIMEZONE", "UTC")

    config = load_configuration(env_path=PROJECT_DIR / ".missing-test-env", config_path=PROJECT_DIR / "config.yaml")

    assert config.timezone == "UTC"


def test_parse_timezone_reports_invalid_name_when_timezone_data_exists(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(config_module, "_timezone_database_is_available", lambda: True)

    def fake_zoneinfo(value: str) -> None:
        raise config_module.ZoneInfoNotFoundError(value)

    monkeypatch.setattr(config_module, "ZoneInfo", fake_zoneinfo)

    with pytest.raises(ConfigError, match="Invalid timezone: Mars/Base"):
        config_module._parse_timezone("Mars/Base")


def test_parse_timezone_reports_missing_timezone_data(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(config_module, "_timezone_database_is_available", lambda: False)

    def fake_zoneinfo(value: str) -> None:
        raise config_module.ZoneInfoNotFoundError(value)

    monkeypatch.setattr(config_module, "ZoneInfo", fake_zoneinfo)

    with pytest.raises(ConfigError, match="Timezone data is unavailable; install tzdata"):
        config_module._parse_timezone("America/New_York")


def test_required_cli_modes_exist() -> None:
    parser = build_parser()

    assert parser.parse_args(["--validate"]).validate is True
    assert parser.parse_args(["--validate", "--refresh-external-context"]).refresh_external_context is True
    assert parser.parse_args(["--validate", "--skip-ai"]).skip_ai is True
    assert parser.parse_args(["--dry-run"]).dry_run is True
    assert parser.parse_args(["--test"]).test is True
    assert parser.parse_args(["--production"]).production is True
    assert parser.parse_args(["--production", "--content-type", "video"]).content_type == "video"


def test_prompt_library_validation_reports_manifest(tmp_path: Path) -> None:
    stream = StringIO()
    config = load_configuration(env_path=PROJECT_DIR / ".missing-test-env", config_path=PROJECT_DIR / "config.yaml")
    logger = initialize_logging(replace(config, log_directory=tmp_path / "logs"), stream=stream)

    manifest = validate_prompt_library_environment(logger=logger)

    assert manifest["version"] == "prompt-library-v1"
    assert len(manifest["files"]) == 10
    assert "prompt_library_validation_started" in stream.getvalue()
    assert "prompt_library_validation_completed" in stream.getvalue()


def test_test_mode_never_enables_posting() -> None:
    plan = get_mode_plan("test")

    assert plan.blocked is False
    assert plan.posting_allowed is False
    assert plan.meta_api_allowed is False
    assert plan.image_generation_allowed is False


def test_production_mode_is_blocked() -> None:
    plan = get_mode_plan("production")

    assert plan.blocked is False
    assert plan.posting_allowed is True
    assert plan.meta_api_allowed is True
    assert plan.image_generation_allowed is True


def test_production_runtime_uses_jalapeno_dry_run_false(monkeypatch: pytest.MonkeyPatch) -> None:
    config = load_configuration(env_path=PROJECT_DIR / ".missing-test-env", config_path=PROJECT_DIR / "config.yaml")
    plan = get_mode_plan("production")
    monkeypatch.setenv("JALAPENO_DRY_RUN", "false")

    settings = resolve_runtime_publish_settings(config=config, plan=plan)

    assert config.instagram.dry_run is True
    assert settings.dry_run is False
    assert settings.posting_allowed is True
    assert settings.meta_api_allowed is True
    assert settings.dry_run_source == "JALAPENO_DRY_RUN"


def test_non_production_runtime_forces_dry_run() -> None:
    config = load_configuration(env_path=PROJECT_DIR / ".missing-test-env", config_path=PROJECT_DIR / "config.yaml")

    for mode in ("validate", "dry-run", "test"):
        settings = resolve_runtime_publish_settings(config=config, plan=get_mode_plan(mode), env={"JALAPENO_DRY_RUN": "false"})
        assert settings.dry_run is True
        assert settings.posting_allowed is False
        assert settings.meta_api_allowed is False


def test_video_backup_skips_config_state_failures() -> None:
    assert _is_backup_worthy_video_publish_failure(ConfigError("dry_run enabled")) is False
    assert _is_backup_worthy_video_publish_failure(ConfigError("missing required secret: token")) is False
    assert _is_backup_worthy_video_publish_failure(RuntimeError("Instagram Graph API video upload failed")) is True


def test_phase1_environment_validation_requires_structural_values(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("FACEBOOK_PAGE_ID", raising=False)

    with pytest.raises(ConfigError, match="FACEBOOK_PAGE_ID"):
        validate_phase1_environment()


def test_future_secrets_can_be_missing() -> None:
    config = load_configuration(env_path=PROJECT_DIR / ".missing-test-env", config_path=PROJECT_DIR / "config.yaml")

    assert config.facebook_page_id == "facebook-page-id"
    assert config.instagram_business_account_id == "instagram-business-account-id"


def test_missing_future_secret_warning_is_emitted(capsys: pytest.CaptureFixture[str]) -> None:
    warn_missing_future_secrets()

    output = capsys.readouterr().out
    assert "Missing future Phase 2+ secrets" in output
    assert "SUPABASE_SERVICE_ROLE_KEY" in output


def test_production_post_type_map_is_stable() -> None:
    assert PRODUCTION_POST_TYPE_MAP == {
        "buffago": "buffago_post",
        "video": "daily_wing_reel",
    }


def test_production_requires_post_type() -> None:
    with pytest.raises(ConfigError, match="POST_TYPE is required"):
        _normalize_production_post_type(None)


def test_production_rejects_invalid_post_type() -> None:
    with pytest.raises(ConfigError, match="Invalid POST_TYPE"):
        _normalize_production_post_type("invalid")


def test_production_normalizes_valid_post_type() -> None:
    assert _normalize_production_post_type(" BuFfAgO ") == "buffago"
    assert _normalize_production_post_type("video") == "video"


def test_optional_post_type_allows_blank() -> None:
    assert _normalize_optional_post_type(None) is None
    assert _normalize_optional_post_type("   ") is None


def test_optional_post_type_reuses_production_validation() -> None:
    assert _normalize_optional_post_type(" video ") == "video"
    with pytest.raises(ConfigError, match="Invalid POST_TYPE"):
        _normalize_optional_post_type("wings")


def test_main_routes_production_flag_to_production_runner(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("main.run_production", lambda *, content_type=None: 0)

    assert main(["--production"]) == 0


def test_main_passes_content_type_to_production_runner(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, str | None] = {}

    def fake_run_production(*, content_type: str | None = None) -> int:
        captured["content_type"] = content_type
        return 0

    monkeypatch.setattr("main.run_production", fake_run_production)

    assert main(["--production", "--content-type", "video"]) == 0
    assert captured["content_type"] == "video"


class _BuffagoCadenceClient:
    def __init__(self, instagram_rows: list[dict[str, object]] | None = None, post_rows: list[dict[str, object]] | None = None) -> None:
        self.instagram_rows = instagram_rows or []
        self.post_rows = post_rows or []

    def fetch_rows(self, table_name: str, *, filters=None, select: str = "*") -> list[dict[str, object]]:
        if table_name == "jalapeno_instagram_posts":
            return self.instagram_rows
        if table_name == "jalapeno_posts":
            return self.post_rows
        return []


def test_buffago_three_day_cadence_runs_when_no_prior_success() -> None:
    should_skip, last_published_at, elapsed_days = _should_skip_buffago_three_day_run(
        _BuffagoCadenceClient(),  # type: ignore[arg-type]
        now=datetime(2026, 7, 1, 1, 0, tzinfo=timezone.utc),
    )

    assert should_skip is False
    assert last_published_at is None
    assert elapsed_days is None


def test_buffago_three_day_cadence_skips_recent_success() -> None:
    should_skip, last_published_at, elapsed_days = _should_skip_buffago_three_day_run(
        _BuffagoCadenceClient(
            instagram_rows=[
                {
                    "published_at": "2026-06-29T01:00:00+00:00",
                    "status": "published",
                    "scheduled_post_type": "buffago_post",
                }
            ]
        ),  # type: ignore[arg-type]
        now=datetime(2026, 7, 1, 1, 0, tzinfo=timezone.utc),
    )

    assert should_skip is True
    assert last_published_at == datetime(2026, 6, 29, 1, 0, tzinfo=timezone.utc)
    assert elapsed_days == 2


def test_buffago_three_day_cadence_runs_after_three_days() -> None:
    should_skip, last_published_at, elapsed_days = _should_skip_buffago_three_day_run(
        _BuffagoCadenceClient(
            instagram_rows=[
                {
                    "published_at": "2026-06-28T01:00:00Z",
                    "status": "published",
                    "scheduled_post_type": "buffago_post",
                }
            ]
        ),  # type: ignore[arg-type]
        now=datetime(2026, 7, 1, 1, 0, tzinfo=timezone.utc),
    )

    assert should_skip is False
    assert last_published_at == datetime(2026, 6, 28, 1, 0, tzinfo=timezone.utc)
    assert elapsed_days == 3


def test_dry_run_logs_optional_post_type_for_manual_dispatch(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("POST_TYPE", "video")
    monkeypatch.setenv("GITHUB_ACTIONS", "true")
    monkeypatch.setenv("GITHUB_EVENT_NAME", "workflow_dispatch")
    monkeypatch.setenv("GITHUB_EVENT_SCHEDULE", "")
    monkeypatch.setenv("GITHUB_RUN_ID", "123456")
    config = load_configuration(env_path=PROJECT_DIR / ".missing-test-env", config_path=PROJECT_DIR / "config.yaml")
    stream = StringIO()
    logger = initialize_logging(replace(config, log_directory=tmp_path / "logs"), stream=stream)
    monkeypatch.setattr("main.initialize_logging", lambda _config: logger)

    assert run_dry_run() == 0

    output = stream.getvalue()
    assert "selected_mode" in output
    assert "post_type=video" in output
    assert "scheduled_post_type=daily_wing_reel" in output
    assert "run_source=github_actions_manual_dispatch" in output
    assert "github_run_id=123456" in output


def test_secrets_are_not_printed_in_logs(tmp_path: Path) -> None:
    config = load_configuration(env_path=PROJECT_DIR / ".missing-test-env", config_path=PROJECT_DIR / "config.yaml")
    stream = StringIO()
    logger = initialize_logging(replace(config, log_directory=tmp_path / "logs"), stream=stream)

    from config import log_startup_state  # noqa: E402

    log_startup_state(logger, config, "dry-run", env_loaded=True)

    output = stream.getvalue()
    for value in STRUCTURAL_ENV_VALUES.values():
        assert value not in output


def test_structured_log_format_includes_key_value_fields() -> None:
    message = format_structured_log(
        "run_started",
        run_id="abc",
        agent_name="Jalapeno",
        dry_run=True,
        duration_ms=12,
    )

    assert message == "run_started | run_id=abc | agent_name=Jalapeno | dry_run=true | duration_ms=12"


def test_phase3_snapshot_generates_real_snapshot_and_writes_file(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key")
    config = load_configuration(env_path=PROJECT_DIR / ".missing-test-env", config_path=PROJECT_DIR / "config.yaml")
    recent_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat()

    class FakeSupabaseClient:
        def fetch_rows(self, table_name: str, *, filters=None, select="*"):
            data = {
                "users": [
                    {"user_id": "11111111-1111-1111-1111-111111111111", "social_opt_out": False},
                    {"user_id": "22222222-2222-2222-2222-222222222222", "social_opt_out": True},
                ],
                "states": [
                    {"state_id": 1, "state_code": "NY", "state_name": "New York"},
                    {"state_id": 2, "state_code": "PA", "state_name": "Pennsylvania"},
                ],
                    "destinations": [
                        {"id": "dest-1", "name": "Crispy Corner", "city": "Buffalo", "state_id": 1, "created_at": recent_at},
                        {"id": "dest-2", "name": "Wing Vault", "city": "Rochester", "state_id": 1, "created_at": recent_at},
                    ],
                "destination_ratings": [
                    {
                        "id": "rating-1",
                        "destination_id": "dest-1",
                        "user_id": "11111111-1111-1111-1111-111111111111",
                        "overall": 9,
                        "weight_score": 8.9,
                            "created_at": recent_at,
                        },
                    {
                        "id": "rating-2",
                        "destination_id": "dest-2",
                        "user_id": "22222222-2222-2222-2222-222222222222",
                        "overall": 7,
                        "weight_score": 7.1,
                            "created_at": recent_at,
                        },
                ],
                "analytics_agent_restaurant_summary": [
                    {
                        "destination_id": "dest-1",
                        "destination_name": "Crispy Corner",
                        "city": "Buffalo",
                        "state_id": 1,
                        "rating_count": 42,
                        "avg_weight_score": 8.8,
                        "avg_overall": 8.7,
                            "last_rated_at": recent_at,
                        },
                    {
                        "destination_id": "dest-2",
                        "destination_name": "Wing Vault",
                        "city": "Rochester",
                        "state_id": 1,
                        "rating_count": 31,
                        "avg_weight_score": 8.5,
                        "avg_overall": 8.3,
                            "last_rated_at": recent_at,
                        },
                    ],
                    "user_events": [
                        {"state_id": 1, "user_id": "11111111-1111-1111-1111-111111111111", "anonymous_id": None, "occurred_at": recent_at},
                        {"state_id": 2, "user_id": "22222222-2222-2222-2222-222222222222", "anonymous_id": None, "occurred_at": recent_at},
                        {"state_id": 2, "user_id": None, "anonymous_id": "anon-1", "occurred_at": recent_at},
                    ],
                "badge_catalog": [
                    {"id": 1, "code": "heat_seeker", "name": "Heat Seeker", "description": "Desc", "icon": "fire", "xp_reward": 25, "category": "ratings", "tier": 1, "is_active": True},
                    {"id": 2, "code": "crawl_captain", "name": "Crawl Captain", "description": "Desc", "icon": "map", "xp_reward": 40, "category": "crawls", "tier": 1, "is_active": True},
                ],
                    "user_badges": [
                        {"user_id": "11111111-1111-1111-1111-111111111111", "badge_id": 1, "earned_at": recent_at},
                        {"user_id": "22222222-2222-2222-2222-222222222222", "badge_id": 2, "earned_at": recent_at},
                    ],
                "level_thresholds": [
                    {"level": 5, "xp_required": 250, "level_title": "Wing Rookie"},
                    {"level": 10, "xp_required": 750, "level_title": "Wing Regular"},
                ],
                "user_with_level": [
                    {"user_id": "11111111-1111-1111-1111-111111111111", "xp": 900, "level": 10},
                    {"user_id": "22222222-2222-2222-2222-222222222222", "xp": 1200, "level": 12},
                ],
                "crawl_weekly_streak": [
                    {"user_id": "11111111-1111-1111-1111-111111111111", "current_streak_weeks": 4},
                    {"user_id": "22222222-2222-2222-2222-222222222222", "current_streak_weeks": 8},
                ],
                    "socially_visible_crawls": [
                        {"crawl_id": "crawl-1", "user_id": "11111111-1111-1111-1111-111111111111", "route_id": "route-1", "status": "completed", "start_time": recent_at, "end_time": recent_at, "crawl_type": "solo", "is_solo": True},
                        {"crawl_id": "crawl-2", "user_id": "22222222-2222-2222-2222-222222222222", "route_id": "route-2", "status": "planned", "start_time": recent_at, "end_time": None, "crawl_type": "group", "is_solo": False},
                    ],
                "routes": [
                    {"id": "route-1", "title": "Buffalo Heat Trail", "city": "Buffalo", "stop1_id": "dest-1", "stop2_id": None, "stop3_id": None, "stop4_id": None, "stop5_id": None},
                    {"id": "route-2", "title": "Rochester Wing Run", "city": "Rochester", "stop1_id": "dest-2", "stop2_id": None, "stop3_id": None, "stop4_id": None, "stop5_id": None},
                ],
                "route_ordered_destinations": [
                    {"route_id": "route-1", "destination_id": "dest-1", "stop_order": 1},
                    {"route_id": "route-2", "destination_id": "dest-2", "stop_order": 1},
                ],
            }
            return data.get(table_name, [])

    fake_client = FakeSupabaseClient()
    stream = StringIO()
    logger = initialize_logging(replace(config, log_directory=PROJECT_DIR / "logs"), stream=stream)

    result = validate_phase3_environment(
        config,
        logger=logger,
        client=fake_client,  # type: ignore[arg-type]
        output_path=tmp_path / "latest_snapshot.json",
        window_config=Phase3WindowConfig(activity_score_threshold=1),
    )

    assert result.connected is True
    assert result.is_fallback is False
    assert result.snapshot_path == str(tmp_path / "latest_snapshot.json")
    assert result.section_counts["new_restaurants"] == 2
    assert result.section_counts["top_restaurants"] == 2
    assert (tmp_path / "latest_snapshot.json").exists()
    snapshot = json.loads((tmp_path / "latest_snapshot.json").read_text(encoding="utf-8"))
    assert snapshot["is_fallback"] is False
    assert snapshot["new_restaurants"][0]["restaurant_name"] == "Crispy Corner"
    assert snapshot["new_restaurants"][0]["state"] == "NY"
    assert snapshot["top_restaurants"][0]["restaurant_name"] == "Crispy Corner"
    assert snapshot["active_states"][0]["state"] == "PA"
    output = stream.getvalue()
    assert "supabase_connection" not in output
    assert "validation_started" in output
    assert "validation_completed" in output
    assert "opted_out_users_excluded" in output


def test_generate_latest_snapshot_uses_fallback_when_supabase_unavailable(tmp_path: Path) -> None:
    result = generate_latest_snapshot(client=None, output_path=tmp_path / "latest_snapshot.json")

    assert result.is_fallback is True
    assert result.snapshot["is_fallback"] is True
    assert (tmp_path / "latest_snapshot.json").exists()
    snapshot = json.loads((tmp_path / "latest_snapshot.json").read_text(encoding="utf-8"))
    assert snapshot["is_fallback"] is True
    assert snapshot["summary"]["activity_score"] > 0


def test_generate_latest_snapshot_low_activity_uses_warning_fallback(tmp_path: Path) -> None:
    class EmptySupabaseClient:
        def fetch_rows(self, table_name: str, *, filters=None, select="*"):
            return []

    stream = StringIO()
    logger = initialize_logging(replace(load_configuration(env_path=PROJECT_DIR / ".missing-test-env", config_path=PROJECT_DIR / "config.yaml"), log_directory=tmp_path / "logs"), stream=stream)

    result = generate_latest_snapshot(client=EmptySupabaseClient(), logger=logger, output_path=tmp_path / "latest_snapshot.json")

    assert result.is_fallback is True
    output = stream.getvalue()
    assert "snapshot_generation_low_activity" in output
    assert "snapshot_generation_failed" not in output


def test_phase4_external_context_writes_cache_and_reuses_it(tmp_path: Path) -> None:
    config = load_configuration(env_path=PROJECT_DIR / ".missing-test-env", config_path=PROJECT_DIR / "config.yaml")
    stream = StringIO()
    logger = initialize_logging(replace(config, log_directory=tmp_path / "logs"), stream=stream)
    current_datetime = datetime(2026, 6, 25, 12, 0, tzinfo=ZoneInfo("America/New_York"))
    latest_path = tmp_path / "latest_external_context.json"

    first = validate_phase4_environment(
        config,
        logger=logger,
        output_path=latest_path,
        cache_directory=tmp_path,
        current_datetime=current_datetime,
    )

    assert first.context_path == str(latest_path)
    assert first.cache_path.endswith("external_context_2026-06-25.json")
    assert first.is_cached is False
    assert first.signals_used

    first_context = json.loads(latest_path.read_text(encoding="utf-8"))
    assert first_context["date"] == "2026-06-25"
    assert first_context["weather"]["weather_available"] is False
    assert first_context["weather"]["weather_summary"] is None
    assert "source_summary" in first_context
    assert first_context["signal_sections"]["trends_context"]["is_fallback"] is True

    second = validate_phase4_environment(
        config,
        logger=logger,
        output_path=latest_path,
        cache_directory=tmp_path,
        current_datetime=current_datetime,
    )

    assert second.is_cached is True
    assert second.is_fallback is True
    assert second.cache_path == first.cache_path
    second_context = json.loads(latest_path.read_text(encoding="utf-8"))
    assert second_context["is_cached"] is True
    assert second_context["cache_created_at"] == first_context["cache_created_at"]

    output = stream.getvalue()
    assert "external_context_started" in output
    assert "external_cache_checked" in output
    assert "external_cache_hit" in output
    assert "external_context_written" in output
    assert "external_signals_selected" in output
    assert "external_context_fallback_used" in output


def test_phase5_validation_skips_ai_and_writes_outputs(tmp_path: Path) -> None:
    config = load_configuration(env_path=PROJECT_DIR / ".missing-test-env", config_path=PROJECT_DIR / "config.yaml")
    snapshot = generate_latest_snapshot(output_path=tmp_path / "latest_snapshot.json").snapshot
    external_context = {
        "agent": "Jalapeno",
        "phase": 4,
        "source_summary": {"signals_used": ["fallback_context"], "fallback_used": True},
    }
    stream = StringIO()
    logger = initialize_logging(replace(config, log_directory=tmp_path / "logs"), stream=stream)

    result = validate_phase5_environment(
        config,
        snapshot,
        external_context,
        logger=logger,
        skip_ai=True,
        output_path=tmp_path / "latest_ai_output.json",
        usage_path=tmp_path / "ai_usage_latest.json",
    )

    assert result.used_backend is False
    assert result.used_fallback is True
    assert (tmp_path / "latest_ai_output.json").exists()
    assert (tmp_path / "ai_usage_latest.json").exists()
    output = json.loads((tmp_path / "latest_ai_output.json").read_text(encoding="utf-8"))
    assert output["text_content"]["content_slot"] == "buffago_post"
    assert output["image_prompt"]["content_slot"] == "meme_post"
    assert output["brand_validation"]["passed"] is True
    log_output = stream.getvalue()
    assert "ai_generation_started" in log_output
    assert "ai_text_generation_started" in log_output
    assert "ai_image_prompt_generation_started" in log_output
    assert "ai_brand_validation_started" in log_output
    assert "ai_usage_logged" in log_output
    assert "ai_fallback_used" in log_output


def test_buffago_image_prompt_includes_food_comedy_and_no_text_guardrails() -> None:
    candidate = ContentCandidate(
        candidate_id="11111111-1111-1111-1111-111111111111",
        content_type="meme",
        reason_chosen="Humor test",
        working_title="Flats court is in session",
        short_summary="A wing debate gets out of hand.",
        target_emotion="Amused",
        suggested_cta="What side are you on?",
        suggested_image_concept="Dramatic wing debate.",
        suggested_caption_angle="Make the joke visual.",
        primary_theme="humor",
        secondary_theme="wing culture",
        mood="Funny",
        hook_style="meme hook",
        cta_category="question",
        food_categories=["wings"],
        visual_style="meme",
    )

    prompt = generate_image_prompt(candidate, snapshot={}, external_context={})
    lowered = prompt.lower()

    assert "golden crisp edges" in lowered
    assert "glossy buffalo-orange sauce" in lowered
    assert "steam" in lowered
    assert "comedy beat" in lowered
    assert "active gestures" in lowered
    assert any(action in lowered for action in ("pointing", "grabbing", "gasping", "cheering", "dropping to knees", "slamming the table", "holding a wing like evidence", "defending a basket", "facepalming", "celebrating"))
    assert "no visible words" in lowered
    assert "no captions" in lowered
    assert "no ui" in lowered
    assert "static seated conversation" in lowered


def test_buffago_image_prompt_metadata_is_added_to_candidate() -> None:
    candidate = ContentCandidate(
        candidate_id="22222222-2222-2222-2222-222222222222",
        content_type="restaurant_spotlight",
        reason_chosen="Food test",
        working_title="Crispy Corner close-up",
        short_summary="Spotlight a wing restaurant.",
        target_emotion="Hungry",
        suggested_cta="Drop your go-to wing spot.",
        suggested_image_concept="Wings in warm restaurant light.",
        suggested_caption_angle="Food first.",
        primary_theme="restaurant focus",
        secondary_theme="recent ratings",
        mood="Friendly",
        hook_style="direct local hook",
        cta_category="comment",
        restaurants_mentioned=["Crispy Corner"],
        cities_mentioned=["Buffalo"],
        food_categories=["wings", "sauce"],
        visual_style="realistic",
    )

    generate_image_prompt(candidate, snapshot={}, external_context={})

    for key in ("visual_style", "camera_angle", "scene_type", "comedy_beat", "character_archetype", "wing_focus_level", "prompt_version"):
        assert candidate.metadata[key]
    assert candidate.metadata["visual_style"] == "buffago_cinematic_comedy_food_v2"


def test_fallback_image_output_uses_scene_direction_metadata_and_no_text() -> None:
    result = fallback_image_output(
        content_slot="meme_post",
        internal_snapshot={},
        external_context={"source_summary": {"signals_used": ["fallback_context"]}},
    )

    prompt = result["image_prompt"].lower()
    assert "courtroom evidence" in prompt or "visual centerpiece" in prompt
    assert "golden crisp edges" in prompt
    assert "no visible words" in prompt
    assert result["needs_text_overlay"] is False
    assert result["text_overlay"] is None
    assert result["camera_angle"]
    assert result["scene_type"]
    assert result["comedy_beat"]
    assert result["character_archetype"]
    assert result["wing_focus_level"]
    assert result["prompt_version"]


def test_normalize_image_output_preserves_supported_visual_metadata() -> None:
    output = normalize_image_output(
        {
            "content_slot": "meme_post",
            "image_prompt": "Wings in a packed bar, no visible words, no captions, no UI, no prompt text, no fake app screens, no abstract placeholder shapes.",
            "style": "meme",
            "needs_text_overlay": False,
            "text_overlay": None,
            "composition_notes": "Food and joke are clear.",
            "negative_prompt_guidance": "No text inside the generated image.",
            "brand_safety_notes": ["Safe"],
            "visual_style": "buffago_cinematic_comedy_food_v2",
            "camera_angle": "bartender POV",
            "scene_type": "packed sports bar",
            "comedy_beat": "wing held like evidence",
            "character_archetype": "The Wing Referee",
            "wing_focus_level": "maximum",
            "prompt_version": "prompt-library-v1:buffago-visual-v2",
        }
    )

    assert output["visual_style"] == "buffago_cinematic_comedy_food_v2"
    assert output["camera_angle"] == "bartender POV"
    assert output["scene_type"] == "packed sports bar"
    assert output["comedy_beat"] == "wing held like evidence"
    assert output["character_archetype"] == "The Wing Referee"
    assert output["wing_focus_level"] == "maximum"
    assert output["prompt_version"] == "prompt-library-v1:buffago-visual-v2"


def test_buffago_prompt_variety_rotates_across_candidates() -> None:
    generator = CandidateGenerator(ContentEngineSettings(candidate_count_min=5, candidate_count_max=10, preferred_candidate_count=7))
    candidates = generator.generate_candidates(
        snapshot={
            "recent_ratings": [{"restaurant_name": "Crispy Corner", "city": "Buffalo", "state": "NY"}],
            "top_restaurants": [{"restaurant_name": "Wing Vault", "city": "Rochester", "state": "NY"}],
            "new_restaurants": [],
            "active_states": [{"state": "NY"}],
            "crawl_activity": {"recent_crawls": []},
            "recent_badges": [],
            "xp_streak_milestones": {"xp_levels": []},
        },
        external_context={
            "trend_topics": ["wing memes"],
            "news_topics": [],
            "recommended_content_angles": ["wing debate"],
            "sports_events": ["game day"],
            "major_holidays": [],
            "minor_holidays": [],
            "food_holidays": [],
        },
        memory_summary={},
    )

    camera_angles = {candidate.metadata.get("camera_angle") for candidate in candidates}
    scene_types = {candidate.metadata.get("scene_type") for candidate in candidates}

    assert len(camera_angles) >= 3
    assert len(scene_types) >= 3


def test_content_engine_validation_runs_dry_run_without_posting(tmp_path: Path) -> None:
    config = load_configuration(env_path=PROJECT_DIR / ".missing-test-env", config_path=PROJECT_DIR / "config.yaml")
    snapshot = generate_latest_snapshot(output_path=tmp_path / "latest_snapshot.json").snapshot
    external_context = {
        "agent": "Jalapeno",
        "phase": 4,
        "day_of_week": "Saturday",
        "major_holidays": [],
        "minor_holidays": [],
        "food_holidays": [],
        "local_or_national_events": ["Saturday game day wings", "weekend crawl idea"],
        "sports_events": ["NBA and NHL playoffs"],
        "trend_topics": ["Saturday crawl ideas", "weekend plans"],
        "news_topics": ["new restaurant openings"],
        "recommended_content_angles": ["Game day wings", "Weekend crawl idea"],
        "source_summary": {"signals_used": ["trend_topics", "sports_events"], "fallback_used": True},
    }
    stream = StringIO()
    logger = initialize_logging(replace(config, log_directory=tmp_path / "logs"), stream=stream)

    result = validate_content_engine_environment(
        config,
        snapshot,
        external_context,
        logger=logger,
        client=None,
        dry_run=True,
        output_path=tmp_path / "latest_content_decision.json",
    )

    assert result.dry_run is True
    assert result.candidate_count >= 5
    assert result.winner_candidate_id
    assert (tmp_path / "latest_content_decision.json").exists()
    payload = json.loads((tmp_path / "latest_content_decision.json").read_text(encoding="utf-8"))
    assert payload["winner"]["candidate_id"] == result.winner_candidate_id
    assert payload["decision_summary"]["candidate_count"] == result.candidate_count
    assert "content_engine_validation_started" in stream.getvalue()
    assert "candidate_generation_started" in stream.getvalue()
    assert "winner_selected" in stream.getvalue()
    assert "content_saved" in stream.getvalue()


def test_content_engine_validation_targets_meme_schedule(tmp_path: Path) -> None:
    config = load_configuration(env_path=PROJECT_DIR / ".missing-test-env", config_path=PROJECT_DIR / "config.yaml")
    snapshot = generate_latest_snapshot(output_path=tmp_path / "latest_snapshot.json").snapshot
    external_context = {
        "agent": "Jalapeno",
        "phase": 4,
        "day_of_week": "Saturday",
        "major_holidays": [],
        "minor_holidays": [],
        "food_holidays": [],
        "local_or_national_events": ["Saturday meme energy"],
        "sports_events": [],
        "trend_topics": ["wing memes"],
        "news_topics": [],
        "recommended_content_angles": ["Meme"],
        "source_summary": {"signals_used": ["trend_topics"], "fallback_used": True},
    }

    result = validate_content_engine_environment(
        config,
        snapshot,
        external_context,
        logger=None,
        client=None,
        dry_run=True,
        output_path=tmp_path / "latest_content_decision_meme.json",
        scheduled_post_type="meme_post",
    )

    assert result.result["scheduled_post_type"] == "meme_post"
    assert result.result["winner"]["scheduled_post_type"] == "meme_post"
    assert result.result["winner"]["content_type"] == "meme"


def test_content_engine_validation_targets_buffago_schedule(tmp_path: Path) -> None:
    config = load_configuration(env_path=PROJECT_DIR / ".missing-test-env", config_path=PROJECT_DIR / "config.yaml")
    snapshot = generate_latest_snapshot(output_path=tmp_path / "latest_snapshot.json").snapshot
    external_context = {
        "agent": "Jalapeno",
        "phase": 4,
        "day_of_week": "Saturday",
        "major_holidays": [],
        "minor_holidays": [],
        "food_holidays": [],
        "local_or_national_events": ["Saturday game day wings"],
        "sports_events": ["NBA playoffs"],
        "trend_topics": ["weekend wing crawl"],
        "news_topics": [],
        "recommended_content_angles": ["Game day wings"],
        "source_summary": {"signals_used": ["sports_events"], "fallback_used": True},
    }

    result = validate_content_engine_environment(
        config,
        snapshot,
        external_context,
        logger=None,
        client=None,
        dry_run=True,
        output_path=tmp_path / "latest_content_decision_buffago.json",
        scheduled_post_type="buffago_post",
    )

    assert result.result["scheduled_post_type"] == "buffago_post"
    assert result.result["winner"]["scheduled_post_type"] == "buffago_post"
    assert result.result["winner"]["content_type"] != "meme"


class _RecordingSupabaseClient:
    def __init__(self) -> None:
        self.run_row: dict[str, object] | None = None
        self.insert_order: list[str] = []

    def fetch_rows(self, table_name: str, *, filters=None, select: str = "*") -> list[dict[str, object]]:
        if table_name == "jalapeno_runs":
            return [self.run_row] if self.run_row is not None else []
        return []

    def insert_row(self, table_name: str, payload):
        self.insert_order.append(table_name)
        if table_name == "jalapeno_runs":
            self.run_row = payload if isinstance(payload, dict) else payload[0]
        return [payload] if isinstance(payload, dict) else payload


class _CandidateFailureSupabaseClient(_RecordingSupabaseClient):
    def insert_row(self, table_name: str, payload):
        self.insert_order.append(table_name)
        if table_name == "jalapeno_runs":
            self.run_row = payload if isinstance(payload, dict) else payload[0]
            return [payload] if isinstance(payload, dict) else payload
        if table_name == "jalapeno_content_candidates":
            raise RuntimeError("candidate insert failed")
        return [payload] if isinstance(payload, dict) else payload


def test_image_asset_insert_removes_binary_metadata() -> None:
    class RecordingClient:
        def __init__(self) -> None:
            self.payload: dict[str, object] | None = None

        def insert_row(self, table_name: str, payload):
            assert table_name == "jalapeno_image_assets"
            json.dumps(payload)
            self.payload = payload
            return [payload]

    client = RecordingClient()

    row = insert_image_asset(
        client,  # type: ignore[arg-type]
        run_id="11111111-1111-1111-1111-111111111111",
        candidate_id="22222222-2222-2222-2222-222222222222",
        local_temp_path="tmp/image.png",
        storage_bucket="jalapeno-images",
        storage_path="instagram/2026/07/01/image.jpg",
        public_url="https://example.test/image.jpg",
        image_type="restaurant",
        content_type="restaurant_spotlight",
        width=1080,
        height=1350,
        aspect_ratio=0.8,
        file_size_bytes=12345,
        format="JPG",
        branding_applied=True,
        meme_format_applied=False,
        validation_status="passed",
        image_source="real_ai",
        image_prompt="A plate of Buffalo wings",
        prompt_quality=92,
        validation_reason="valid",
        metadata={
            "image_source_details": {
                "bytes": b"binary image data",
                "response_id": "img_123",
                "revised_prompt": "A revised prompt",
            }
        },
    )

    assert row is client.payload
    assert client.payload is not None
    metadata = client.payload["metadata"]
    assert isinstance(metadata, dict)
    source_details = metadata["image_source_details"]
    assert isinstance(source_details, dict)
    assert "bytes" not in source_details
    assert source_details["response_id"] == "img_123"


def test_content_engine_validation_creates_run_before_related_rows(tmp_path: Path) -> None:
    config = load_configuration(env_path=PROJECT_DIR / ".missing-test-env", config_path=PROJECT_DIR / "config.yaml")
    snapshot = generate_latest_snapshot(output_path=tmp_path / "latest_snapshot.json").snapshot
    external_context = {
        "agent": "Jalapeno",
        "phase": 4,
        "day_of_week": "Saturday",
        "major_holidays": [],
        "minor_holidays": [],
        "food_holidays": [],
        "local_or_national_events": ["Saturday game day wings"],
        "sports_events": ["NBA playoffs"],
        "trend_topics": ["weekend wing crawl"],
        "news_topics": [],
        "recommended_content_angles": ["Game day wings"],
        "source_summary": {"signals_used": ["sports_events"], "fallback_used": True},
    }
    client = _RecordingSupabaseClient()

    result = validate_content_engine_environment(
        config,
        snapshot,
        external_context,
        client=client,
        dry_run=True,
        output_path=tmp_path / "latest_content_decision.json",
    )

    assert result.run_id
    assert client.insert_order[0] == "jalapeno_runs"
    assert "jalapeno_content_candidates" in client.insert_order
    assert "jalapeno_content_decisions" in client.insert_order


def test_content_engine_validation_logs_failed_persistence_when_candidate_insert_fails(tmp_path: Path) -> None:
    config = load_configuration(env_path=PROJECT_DIR / ".missing-test-env", config_path=PROJECT_DIR / "config.yaml")
    snapshot = generate_latest_snapshot(output_path=tmp_path / "latest_snapshot.json").snapshot
    external_context = {
        "agent": "Jalapeno",
        "phase": 4,
        "day_of_week": "Saturday",
        "major_holidays": [],
        "minor_holidays": [],
        "food_holidays": [],
        "local_or_national_events": ["Saturday game day wings"],
        "sports_events": ["NHL playoffs"],
        "trend_topics": ["buffalo wings"],
        "news_topics": [],
        "recommended_content_angles": ["Community wing debate"],
        "source_summary": {"signals_used": ["trend_topics"], "fallback_used": True},
    }
    stream = StringIO()
    logger = initialize_logging(replace(config, log_directory=tmp_path / "logs"), stream=stream)
    client = _CandidateFailureSupabaseClient()

    validate_content_engine_environment(
        config,
        snapshot,
        external_context,
        logger=logger,
        client=client,
        dry_run=True,
        output_path=tmp_path / "latest_content_decision.json",
    )

    log_output = stream.getvalue()
    assert "content_candidate_persist_failed" in log_output
    assert "persisted_to_db=false" in log_output


class _EmptyReportingSupabaseClient:
    def __init__(self) -> None:
        self.inserted: list[tuple[str, dict[str, object]]] = []

    def fetch_rows(self, table_name: str, *, filters=None, select: str = "*") -> list[dict[str, object]]:
        return []

    def insert_row(self, table_name: str, payload):
        self.inserted.append((table_name, payload if isinstance(payload, dict) else payload[0]))
        return [payload] if isinstance(payload, dict) else payload


def test_admin_reports_handle_empty_performance_context(tmp_path: Path) -> None:
    config = load_configuration(env_path=PROJECT_DIR / ".missing-test-env", config_path=PROJECT_DIR / "config.yaml")
    logger = initialize_logging(replace(config, log_directory=tmp_path / "logs"), stream=StringIO())
    client = _EmptyReportingSupabaseClient()
    now = datetime(2026, 7, 1, tzinfo=timezone.utc)

    daily_report = generate_admin_report(config, client, report_type="daily", logger=logger, send_email=False, now=now)
    weekly_report = generate_admin_report(config, client, report_type="weekly", logger=logger, send_email=False, now=now)

    assert daily_report.body
    assert weekly_report.body
    assert "Not enough post-performance data yet" in daily_report.body
    assert "Not enough post-performance data yet" in weekly_report.body
    assert ("jalapeno_report_logs", daily_report.body) not in client.inserted
    assert any(table == "jalapeno_report_logs" and row["body"] == daily_report.body for table, row in client.inserted)
    assert any(table == "jalapeno_report_logs" and row["body"] == weekly_report.body for table, row in client.inserted)


def test_admin_report_bodies_tolerate_null_empty_and_malformed_context() -> None:
    context = {
        "strong_patterns": [],
        "weak_patterns": None,
        "recommended_adjustments": [],
        "best_posts": None,
        "worst_posts": {"7d": [None, {"caption": "A real post", "engagement_rate": 0.08}]},
        "best_categories": None,
        "worst_categories": [{"wrong": "shape"}],
        "best_image_styles": "not-a-list",
        "worst_image_styles": [],
        "best_cta_types": [None, {"name": "question"}],
        "source_counts": {"rows": 0},
    }

    daily_body = _daily_body(runs=[], posts=[], metrics=[], errors=[], context=context, costs={})
    weekly_body = _weekly_body(runs=[], posts=[], metrics=[], errors=[], context=context, costs={})

    assert "Not enough post-performance data yet" in daily_body
    assert "Not enough post-performance data yet" in weekly_body
    assert "No best-post data yet." in weekly_body
    assert "question" in weekly_body


def test_image_pipeline_validation_runs_dry_run_without_upload(tmp_path: Path) -> None:
    config = load_configuration(env_path=PROJECT_DIR / ".missing-test-env", config_path=PROJECT_DIR / "config.yaml")
    config = replace(
        config,
        image=replace(config.image, temp_dir=tmp_path / "images"),
        branding=replace(config.branding, enabled=False),
    )
    content_decision = {
        "run_id": "11111111-1111-1111-1111-111111111111",
        "winner": {
            "candidate_id": "22222222-2222-2222-2222-222222222222",
            "content_type": "meme",
            "visual_style": "meme",
            "image_prompt": "A funny photorealistic scene at a casual wing restaurant with two friends arguing over flats versus drums, baskets of saucy chicken wings on the table, warm lighting, no visible words, no captions, no UI, no prompt text, no fake app screens, no abstract placeholder shapes.",
            "working_title": "Wing debate energy",
            "suggested_cta": "What side are you on?",
        },
        "decision_summary": {"run_id": "11111111-1111-1111-1111-111111111111"},
    }
    stream = StringIO()
    logger = initialize_logging(replace(config, log_directory=tmp_path / "logs"), stream=stream)

    result = validate_image_pipeline_environment(
        config,
        content_decision,
        logger=logger,
        client=None,
        output_path=tmp_path / "latest_image_pipeline.json",
    )

    assert result.temp_dir_ready is True
    assert result.result["validation_status"] == "passed"
    assert result.result["public_url"] is None
    assert result.result["meme_format_applied"] is True
    assert (tmp_path / "latest_image_pipeline.json").exists()
    payload = json.loads((tmp_path / "latest_image_pipeline.json").read_text(encoding="utf-8"))
    assert payload["validation"]["valid"] is True
    assert payload["image_source"] == "mock"
    assert payload["validation"]["prompt_quality"] >= 70
    assert payload["candidate_id"] == "22222222-2222-2222-2222-222222222222"
    output = stream.getvalue()
    assert "image_pipeline_validation_started" in output
    assert "image_pipeline_started" in output
    assert "image_generation_started" in output
    assert "meme_format_applied" in output
    assert "image_pipeline_validation_completed" in output
