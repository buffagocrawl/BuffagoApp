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
