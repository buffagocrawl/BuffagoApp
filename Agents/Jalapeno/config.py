from __future__ import annotations

import logging
import os
import re
import tempfile
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Final
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError, available_timezones

from dotenv import load_dotenv
import yaml

from logging_utils import log_event

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
    image: "ImageConfig"
    branding: "BrandingConfig"
    storage: "StorageConfig"
    cleanup: "CleanupConfig"
    instagram: "InstagramConfig"
    publishing: "PublishingConfig"
    notifications: "NotificationsConfig"


@dataclass(frozen=True, slots=True)
class ImageConfig:
    default_aspect_ratio: str
    default_width: int
    default_height: int
    square_width: int
    square_height: int
    temp_dir: Path
    output_format: str
    quality: int


@dataclass(frozen=True, slots=True)
class BrandingConfig:
    enabled: bool
    logo_path: Path | None
    placement: str
    opacity: float
    margin_px: int
    max_width_percent: int
    border_enabled: bool
    accent_color: str
    label_text: str


@dataclass(frozen=True, slots=True)
class StorageConfig:
    provider: str
    bucket: str
    public: bool


@dataclass(frozen=True, slots=True)
class CleanupConfig:
    cleanup_temp_files: bool
    keep_failed_images: bool


@dataclass(frozen=True, slots=True)
class InstagramConfig:
    enabled: bool
    dry_run: bool
    ig_user_id_secret_name: str
    access_token_secret_name: str
    api_version: str
    quality_threshold: int


@dataclass(frozen=True, slots=True)
class PublishingConfig:
    container_poll_max_attempts: int
    container_poll_wait_seconds: int
    container_poll_timeout_seconds: int
    publish_max_retries: int
    retry_backoff_seconds: int
    retryable_error_codes: tuple[str, ...]
    fail_run_on_publish_failure: bool


@dataclass(frozen=True, slots=True)
class NotificationChannelsConfig:
    console: bool
    email: bool
    webhook: bool


@dataclass(frozen=True, slots=True)
class NotificationsConfig:
    enabled: bool
    channels: NotificationChannelsConfig


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


def _optional_string(data: dict[str, Any], key: str, default: str = "") -> str:
    value = data.get(key)
    if value is None:
        return default
    if not isinstance(value, str):
        raise ConfigError(f"Missing or invalid config value: {key}")
    return value.strip()


def _require_int(data: dict[str, Any], key: str) -> int:
    value = data.get(key)
    if isinstance(value, bool) or not isinstance(value, int):
        raise ConfigError(f"Missing or invalid config value: {key}")
    return value


def _require_string_list(data: dict[str, Any], key: str) -> tuple[str, ...]:
    value = data.get(key)
    if not isinstance(value, list) or any(not isinstance(item, str) or not item.strip() for item in value):
        raise ConfigError(f"Missing or invalid config value: {key}")
    return tuple(item.strip() for item in value)


def _require_float(data: dict[str, Any], key: str) -> float:
    value = data.get(key)
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ConfigError(f"Missing or invalid config value: {key}")
    return float(value)


def _parse_color(value: str, key: str) -> str:
    if not re.fullmatch(r"#[0-9A-Fa-f]{6}", value):
        raise ConfigError(f"Invalid color format for {key}; expected #RRGGBB")
    return value.upper()


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


def _resolve_temp_dir(value: str) -> Path:
    temp_dir = Path(value)
    if os.name != "nt":
        return temp_dir
    normalized = value.replace("\\", "/").strip().lower()
    if normalized == "/tmp" or normalized.startswith("/tmp/"):
        suffix = Path(value.replace("\\", "/").lstrip("/")).parts[1:]
        return Path(tempfile.gettempdir(), *suffix)
    return temp_dir


def _resolve_config_path(value: str) -> Path:
    path = Path(value)
    if path.is_absolute():
        return path
    return (BASE_DIR / path).resolve()


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
    instagram_section = _require_mapping(raw, "instagram")
    publishing_section = _require_mapping(raw, "publishing")
    notifications_section = _require_mapping(raw, "notifications")
    image_section = _require_mapping(raw, "image")
    branding_section = _require_mapping(raw, "branding")
    storage_section = _require_mapping(raw, "storage")
    cleanup_section = _require_mapping(raw, "cleanup")

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
    image_config = ImageConfig(
        default_aspect_ratio=_require_string(image_section, "default_aspect_ratio"),
        default_width=_require_int(image_section, "default_width"),
        default_height=_require_int(image_section, "default_height"),
        square_width=_require_int(image_section, "square_width"),
        square_height=_require_int(image_section, "square_height"),
        temp_dir=_resolve_temp_dir(_require_string(image_section, "temp_dir")),
        output_format=_require_string(image_section, "output_format").lower(),
        quality=_require_int(image_section, "quality"),
    )
    branding_config = BrandingConfig(
        enabled=_require_bool(branding_section, "enabled"),
        logo_path=_resolve_config_path(path_value) if (path_value := _optional_string(branding_section, "logo_path", "")) else None,
        placement=_require_string(branding_section, "placement"),
        opacity=_require_float(branding_section, "opacity"),
        margin_px=_require_int(branding_section, "margin_px"),
        max_width_percent=_require_int(branding_section, "max_width_percent"),
        border_enabled=_require_bool(branding_section, "border_enabled"),
        accent_color=_parse_color(_require_string(branding_section, "accent_color"), "branding.accent_color"),
        label_text=_optional_string(branding_section, "label_text", ""),
    )
    storage_config = StorageConfig(
        provider=_require_string(storage_section, "provider").lower(),
        bucket=_require_string(storage_section, "bucket"),
        public=_require_bool(storage_section, "public"),
    )
    cleanup_config = CleanupConfig(
        cleanup_temp_files=_require_bool(cleanup_section, "cleanup_temp_files"),
        keep_failed_images=_require_bool(cleanup_section, "keep_failed_images"),
    )
    instagram_config = InstagramConfig(
        enabled=_require_bool(instagram_section, "enabled"),
        dry_run=_require_bool(instagram_section, "dry_run"),
        ig_user_id_secret_name=_require_string(instagram_section, "ig_user_id_secret_name"),
        access_token_secret_name=_require_string(instagram_section, "access_token_secret_name"),
        api_version=_require_string(instagram_section, "api_version"),
        quality_threshold=_require_int(instagram_section, "quality_threshold"),
    )
    retryable_error_codes = _require_string_list(publishing_section, "retryable_error_codes")
    channels_section = notifications_section.get("channels")
    if isinstance(channels_section, dict):
        channels_mapping = channels_section
    else:
        channels_mapping = notifications_section
    notifications_config = NotificationsConfig(
        enabled=_require_bool(notifications_section, "enabled"),
        channels=NotificationChannelsConfig(
            console=_require_bool(channels_mapping, "console"),
            email=_require_bool(channels_mapping, "email"),
            webhook=_require_bool(channels_mapping, "webhook"),
        ),
    )

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
    if instagram_config.quality_threshold < 0 or instagram_config.quality_threshold > 100:
        raise ConfigError("instagram.quality_threshold must be between 0 and 100")
    if publishing_section.get("container_poll_timeout_seconds") is None:
        container_poll_timeout_seconds = _require_int(publishing_section, "container_poll_max_attempts") * _require_int(
            publishing_section, "container_poll_wait_seconds"
        )
    else:
        container_poll_timeout_seconds = _require_int(publishing_section, "container_poll_timeout_seconds")
    if container_poll_timeout_seconds <= 0:
        raise ConfigError("publishing.container_poll_timeout_seconds must be positive")
    publishing_config = PublishingConfig(
        container_poll_max_attempts=_require_int(publishing_section, "container_poll_max_attempts"),
        container_poll_wait_seconds=_require_int(publishing_section, "container_poll_wait_seconds"),
        container_poll_timeout_seconds=container_poll_timeout_seconds,
        publish_max_retries=_require_int(publishing_section, "publish_max_retries"),
        retry_backoff_seconds=_require_int(publishing_section, "retry_backoff_seconds"),
        retryable_error_codes=retryable_error_codes,
        fail_run_on_publish_failure=_require_bool(publishing_section, "fail_run_on_publish_failure"),
    )
    if publishing_config.container_poll_max_attempts <= 0:
        raise ConfigError("publishing.container_poll_max_attempts must be positive")
    if publishing_config.container_poll_wait_seconds <= 0:
        raise ConfigError("publishing.container_poll_wait_seconds must be positive")
    if publishing_config.publish_max_retries < 0:
        raise ConfigError("publishing.publish_max_retries must be non-negative")
    if publishing_config.retry_backoff_seconds < 0:
        raise ConfigError("publishing.retry_backoff_seconds must be non-negative")

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
        image=image_config,
        branding=branding_config,
        storage=storage_config,
        cleanup=cleanup_config,
        instagram=instagram_config,
        publishing=publishing_config,
        notifications=notifications_config,
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
        "image_temp_dir": str(config.image.temp_dir),
        "image_output_format": config.image.output_format,
        "storage_provider": config.storage.provider,
        "storage_bucket": config.storage.bucket,
        "branding_enabled": str(config.branding.enabled),
        "cleanup_temp_files": str(config.cleanup.cleanup_temp_files),
        "instagram_enabled": str(config.instagram.enabled),
        "instagram_dry_run": str(config.instagram.dry_run),
        "instagram_api_version": config.instagram.api_version,
        "publishing_max_retries": str(config.publishing.publish_max_retries),
        "notifications_enabled": str(config.notifications.enabled),
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
            posting_allowed=True,
            meta_api_allowed=True,
            image_generation_allowed=True,
            blocked=False,
            description="Live scheduled publishing workflow",
        ),
    }
    if normalized not in plans:
        raise ConfigError(f"Unknown mode: {mode}")
    return plans[normalized]


def log_startup_state(logger: logging.Logger, config: JalapenoConfig, mode: str, env_loaded: bool) -> None:
    log_event(logger, "startup", agent_name=config.agent_name, mode=mode)
    log_event(logger, "env_loaded", env_file=ENV_FILE, loaded=env_loaded)
    log_event(logger, "config_file_loaded", config_file=CONFIG_FILE)
    log_event(logger, "config_snapshot", **_public_snapshot(config))
    log_event(
        logger,
        "account_presence_checked",
        facebook_page_id_present=bool(config.facebook_page_id),
        instagram_business_account_id_present=bool(config.instagram_business_account_id),
    )
    log_event(logger, "safety_status", posting_allowed=False, dry_run=True)


def log_mode_plan(logger: logging.Logger, plan: ModePlan) -> None:
    log_event(
        logger,
        "selected_mode",
        mode=plan.name,
        blocked=plan.blocked,
        posting_allowed=plan.posting_allowed,
        meta_api_allowed=plan.meta_api_allowed,
        image_generation_allowed=plan.image_generation_allowed,
        description=plan.description,
    )
