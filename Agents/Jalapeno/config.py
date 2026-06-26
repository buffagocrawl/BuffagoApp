from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Final
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError, available_timezones

from dotenv import load_dotenv
import yaml

BASE_DIR: Final[Path] = Path(__file__).resolve().parent
ENV_FILE: Final[Path] = BASE_DIR / ".env"
CONFIG_FILE: Final[Path] = BASE_DIR / "config.yaml"
DEFAULT_LOG_DIR: Final[Path] = BASE_DIR / "logs"
DEFAULT_LOG_FILE: Final[Path] = DEFAULT_LOG_DIR / "jalapeno.log"
LOGGER_NAME: Final[str] = "buffago.jalapeno"

REQUIRED_ENV_VARS: Final[tuple[str, ...]] = (
    "FACEBOOK_PAGE_ID",
    "INSTAGRAM_BUSINESS_ACCOUNT_ID",
)

FUTURE_SECRET_ENV_VARS: Final[tuple[str, ...]] = (
    "OPENAI_API_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "META_APP_SECRET",
    "META_LONG_LIVED_ACCESS_TOKEN",
)

VALID_LOG_LEVELS: Final[tuple[str, ...]] = ("DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL")
VALID_MODES: Final[tuple[str, ...]] = ("validate", "dry-run", "test", "production")
SIMULATION_STEPS: Final[tuple[str, ...]] = (
    "Load config and environment",
    "Validate schedule and runtime settings",
    "Resolve Instagram Business Account ID and Facebook Page ID",
    "Simulate content planning",
    "Skip image generation",
    "Skip Meta publishing endpoints",
    "Complete Phase 1 workflow simulation",
)


@dataclass(frozen=True, slots=True)
class JalapenoConfig:
    agent_name: str
    channel: str
    brand: str
    timezone: str
    buffago_post_time: str
    meme_post_time: str
    default_mode: str
    test_mode_never_posts: bool
    log_level: str
    log_directory: Path
    facebook_page_id: str
    instagram_business_account_id: str


@dataclass(frozen=True, slots=True)
class ModePlan:
    name: str
    posting_allowed: bool
    meta_api_allowed: bool
    image_generation_allowed: bool
    blocked: bool
    description: str


class ConfigError(ValueError):
    pass


def load_env_file(env_path: Path = ENV_FILE) -> bool:
    if env_path.exists():
        load_dotenv(env_path, override=False)
        return True
    return False


def _read_yaml_file(config_path: Path = CONFIG_FILE) -> dict[str, Any]:
    if not config_path.exists():
        raise ConfigError(f"Missing config file: {config_path}")

    with config_path.open("r", encoding="utf-8") as handle:
        raw = yaml.safe_load(handle) or {}

    if not isinstance(raw, dict):
        raise ConfigError("config.yaml must contain a mapping at the top level")

    return raw


def _require_mapping(data: dict[str, Any], key: str) -> dict[str, Any]:
    value = data.get(key)
    if not isinstance(value, dict):
        raise ConfigError(f"Missing or invalid config section: {key}")
    return value


def _require_string(data: dict[str, Any], key: str) -> str:
    value = data.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ConfigError(f"Missing or invalid config value: {key}")
    return value.strip()


def _require_bool(data: dict[str, Any], key: str) -> bool:
    value = data.get(key)
    if not isinstance(value, bool):
        raise ConfigError(f"Missing or invalid config value: {key}")
    return value


def _parse_time(value: str, key: str) -> str:
    try:
        datetime.strptime(value, "%H:%M")
    except ValueError as exc:
        raise ConfigError(f"Invalid time format for {key}; expected HH:MM") from exc
    return value


def _parse_timezone(value: str) -> str:
    try:
        ZoneInfo(value)
    except ZoneInfoNotFoundError as exc:
        if _timezone_database_is_available():
            raise ConfigError(f"Invalid timezone: {value}") from exc
        raise ConfigError(
            "Timezone data is unavailable; install tzdata to validate IANA timezones"
        ) from exc
    return value


def _timezone_database_is_available() -> bool:
    try:
        return bool(available_timezones())
    except Exception:
        return False


def _missing_required_env_vars() -> list[str]:
    return [name for name in REQUIRED_ENV_VARS if not os.getenv(name, "").strip()]


def _missing_future_secret_env_vars() -> list[str]:
    return [name for name in FUTURE_SECRET_ENV_VARS if not os.getenv(name, "").strip()]


def validate_required_environment() -> None:
    missing = _missing_required_env_vars()
    if missing:
        joined = ", ".join(missing)
        raise ConfigError(f"Missing required environment variables: {joined}")


def warn_missing_future_secrets(logger: logging.Logger | None = None) -> list[str]:
    missing = _missing_future_secret_env_vars()
    if not missing:
        return []

    joined = ", ".join(missing)
    message = f"Missing future Phase 2+ secrets: {joined}"
    if logger is None:
        print(f"Warning: {message}")
    else:
        logger.warning(message)
    return missing


def load_configuration(
    env_path: Path = ENV_FILE,
    config_path: Path = CONFIG_FILE,
) -> JalapenoConfig:
    load_env_file(env_path)

    raw = _read_yaml_file(config_path)
    agent = _require_mapping(raw, "agent")
    posting = _require_mapping(raw, "posting")
    runtime = _require_mapping(raw, "runtime")
    logging_section = _require_mapping(raw, "logging")

    agent_name = _require_string(agent, "name")
    channel = _require_string(agent, "channel")
    brand = _require_string(agent, "brand")
    timezone_value = os.getenv("TIMEZONE", "").strip() or _require_string(raw, "timezone")
    timezone = _parse_timezone(timezone_value)
    buffago_post_time = _parse_time(_require_string(posting, "buffago_post_time"), "posting.buffago_post_time")
    meme_post_time = _parse_time(_require_string(posting, "meme_post_time"), "posting.meme_post_time")
    default_mode = _require_string(runtime, "default_mode")
    test_mode_never_posts = _require_bool(runtime, "test_mode_never_posts")
    log_level = _require_string(logging_section, "level").upper()
    log_directory = Path(_require_string(logging_section, "directory"))

    if channel.lower() != "instagram":
        raise ConfigError("agent.channel must be instagram")
    if brand.lower() != "buffago":
        raise ConfigError("agent.brand must be Buffago")
    if default_mode not in VALID_MODES:
        raise ConfigError(f"runtime.default_mode must be one of: {', '.join(VALID_MODES)}")
    if not test_mode_never_posts:
        raise ConfigError("runtime.test_mode_never_posts must be true")
    if log_level not in VALID_LOG_LEVELS:
        raise ConfigError(f"logging.level must be one of: {', '.join(VALID_LOG_LEVELS)}")

    return JalapenoConfig(
        agent_name=agent_name,
        channel=channel,
        brand=brand,
        timezone=timezone,
        buffago_post_time=buffago_post_time,
        meme_post_time=meme_post_time,
        default_mode=default_mode,
        test_mode_never_posts=test_mode_never_posts,
        log_level=log_level,
        log_directory=(BASE_DIR / log_directory).resolve() if not log_directory.is_absolute() else log_directory,
        facebook_page_id=os.getenv("FACEBOOK_PAGE_ID", "").strip(),
        instagram_business_account_id=os.getenv("INSTAGRAM_BUSINESS_ACCOUNT_ID", "").strip(),
    )


def validate_phase1_environment() -> None:
    validate_required_environment()
    timezone_override = os.getenv("TIMEZONE", "").strip()
    if timezone_override:
        _parse_timezone(timezone_override)


def _public_snapshot(config: JalapenoConfig) -> dict[str, str]:
    return {
        "agent_name": config.agent_name,
        "channel": config.channel,
        "brand": config.brand,
        "timezone": config.timezone,
        "buffago_post_time": config.buffago_post_time,
        "meme_post_time": config.meme_post_time,
        "default_mode": config.default_mode,
        "log_level": config.log_level,
        "facebook_page_id_present": str(bool(config.facebook_page_id)),
        "instagram_business_account_id_present": str(bool(config.instagram_business_account_id)),
    }


def initialize_logging(
    config: JalapenoConfig,
    stream: Any | None = None,
) -> logging.Logger:
    logger = logging.getLogger(LOGGER_NAME)
    logger.setLevel(getattr(logging, config.log_level, logging.INFO))
    logger.propagate = False
    logger.handlers.clear()

    formatter = logging.Formatter("%(asctime)s | %(levelname)s | %(message)s")

    console_handler = logging.StreamHandler(stream)
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)

    config.log_directory.mkdir(parents=True, exist_ok=True)
    file_handler = logging.FileHandler(config.log_directory / DEFAULT_LOG_FILE.name, encoding="utf-8")
    file_handler.setFormatter(formatter)
    logger.addHandler(file_handler)

    return logger


def get_mode_plan(mode: str) -> ModePlan:
    normalized = mode.strip().lower()
    plans = {
        "validate": ModePlan(
            name="validate",
            posting_allowed=False,
            meta_api_allowed=False,
            image_generation_allowed=False,
            blocked=False,
            description="Validation only",
        ),
        "dry-run": ModePlan(
            name="dry-run",
            posting_allowed=False,
            meta_api_allowed=False,
            image_generation_allowed=False,
            blocked=False,
            description="Planning and logging only",
        ),
        "test": ModePlan(
            name="test",
            posting_allowed=False,
            meta_api_allowed=False,
            image_generation_allowed=False,
            blocked=False,
            description="Simulated workflow only",
        ),
        "production": ModePlan(
            name="production",
            posting_allowed=False,
            meta_api_allowed=False,
            image_generation_allowed=False,
            blocked=True,
            description="Safely blocked until Phase 2 implementation",
        ),
    }
    if normalized not in plans:
        raise ConfigError(f"Unknown mode: {mode}")
    return plans[normalized]


def log_startup_state(logger: logging.Logger, config: JalapenoConfig, mode: str, env_loaded: bool) -> None:
    logger.info("startup | agent=%s | mode=%s", config.agent_name, mode)
    logger.info("env loaded | env_file=%s | loaded=%s", ENV_FILE, env_loaded)
    logger.info("config file loaded | config_file=%s", CONFIG_FILE)
    logger.info("config snapshot | %s", _public_snapshot(config))
    logger.info("Facebook Page ID present: %s", bool(config.facebook_page_id))
    logger.info("Instagram Business Account ID present: %s", bool(config.instagram_business_account_id))
    logger.info("dry-run/test/production safety status | posting_allowed=%s", False)


def log_mode_plan(logger: logging.Logger, plan: ModePlan) -> None:
    logger.info(
        "selected mode | mode=%s | blocked=%s | posting_allowed=%s | meta_api_allowed=%s | image_generation_allowed=%s",
        plan.name,
        plan.blocked,
        plan.posting_allowed,
        plan.meta_api_allowed,
        plan.image_generation_allowed,
    )
