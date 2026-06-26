from __future__ import annotations

from dataclasses import replace
from io import StringIO
from pathlib import Path
import sys

import pytest

PROJECT_DIR = Path(__file__).resolve().parents[1]
if str(PROJECT_DIR) not in sys.path:
    sys.path.insert(0, str(PROJECT_DIR))

from config import (  # noqa: E402
    ConfigError,
    JalapenoConfig,
    get_mode_plan,
    initialize_logging,
    load_configuration,
    validate_phase1_environment,
    warn_missing_future_secrets,
)
import config as config_module  # noqa: E402
from logging_utils import format_structured_log, log_event  # noqa: E402
from validation import validate_phase2_environment  # noqa: E402
from main import build_parser, run_production_placeholder  # noqa: E402


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
        "OPENAI_API_KEY",
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
    assert config.test_mode_never_posts is True


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
    assert parser.parse_args(["--dry-run"]).dry_run is True
    assert parser.parse_args(["--test"]).test is True
    assert parser.parse_args(["--production"]).production is True


def test_test_mode_never_enables_posting() -> None:
    plan = get_mode_plan("test")

    assert plan.blocked is False
    assert plan.posting_allowed is False
    assert plan.meta_api_allowed is False
    assert plan.image_generation_allowed is False


def test_production_mode_is_blocked() -> None:
    plan = get_mode_plan("production")

    assert plan.blocked is True
    assert plan.posting_allowed is False
    assert plan.meta_api_allowed is False
    assert plan.image_generation_allowed is False


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
    assert "OPENAI_API_KEY" in output


def test_production_placeholder_exits_safely(monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]) -> None:
    monkeypatch.setattr("main.load_env_file", lambda: False)
    monkeypatch.setattr("main.warn_missing_future_secrets", lambda *args, **kwargs: [])

    assert run_production_placeholder() == 0

    output = capsys.readouterr().out
    assert "Production mode is not implemented yet." in output


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


def test_phase2_validation_can_create_and_complete_a_run(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key")
    config = load_configuration(env_path=PROJECT_DIR / ".missing-test-env", config_path=PROJECT_DIR / "config.yaml")

    class FakeSupabaseClient:
        def __init__(self) -> None:
            self.inserted: list[dict[str, object]] = []
            self.updated: list[dict[str, object]] = []

        def table_exists(self, table_name: str) -> bool:
            return table_name in {
                "jalapeno_runs",
                "jalapeno_post_candidates",
                "jalapeno_posts",
                "jalapeno_errors",
                "jalapeno_post_metrics",
                "jalapeno_settings",
            }

        def fetch_rows(self, table_name: str, *, filters=None, select="*"):
            assert table_name == "jalapeno_settings"
            return [
                {"setting_key": "posting_enabled", "setting_value": False},
                {"setting_key": "dry_run", "setting_value": True},
                {"setting_key": "instagram_enabled", "setting_value": False},
                {"setting_key": "buffago_post_time", "setting_value": "16:00"},
                {"setting_key": "meme_post_time", "setting_value": "20:00"},
                {"setting_key": "timezone", "setting_value": "America/New_York"},
                {"setting_key": "text_model", "setting_value": "gpt-4.1-mini"},
                {"setting_key": "image_model", "setting_value": "gpt-image-1"},
                {"setting_key": "temperature", "setting_value": 0.7},
                {"setting_key": "max_candidates", "setting_value": 5},
                {"setting_key": "max_retries", "setting_value": 3},
                {"setting_key": "prompt_version", "setting_value": "phase2-v1"},
                {"setting_key": "workflow_version", "setting_value": "phase2-v1"},
                {"setting_key": "default_hashtag_count", "setting_value": 8},
                {"setting_key": "default_image_size", "setting_value": "1024x1024"},
                {"setting_key": "storage_bucket", "setting_value": "jalapeno-media"},
                {"setting_key": "metrics_collection_enabled", "setting_value": False},
            ]

        def insert_row(self, table_name: str, payload):
            self.inserted.append({"table": table_name, "payload": payload})
            run_id = payload.get("run_id", "00000000-0000-0000-0000-000000000000")
            return [payload | {"run_id": run_id}]

        def update_rows(self, table_name: str, filters, payload):
            self.updated.append({"table": table_name, "filters": filters, "payload": payload})
            return [payload]

    fake_client = FakeSupabaseClient()
    stream = StringIO()
    logger = initialize_logging(replace(config, log_directory=PROJECT_DIR / "logs"), stream=stream)

    result = validate_phase2_environment(config, logger=logger, client=fake_client)  # type: ignore[arg-type]

    assert result.connected is True
    assert result.validation_run_id is not None
    assert any(item["table"] == "jalapeno_runs" for item in fake_client.inserted)
    assert any(item["table"] == "jalapeno_runs" for item in fake_client.updated)
    output = stream.getvalue()
    assert "validation_started" in output
    assert "validation_completed" in output
