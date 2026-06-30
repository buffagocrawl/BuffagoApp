from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

from config import CONFIG_FILE, ConfigError


DEFAULT_AI_SECTION: dict[str, Any] = {
    "models": {
        "production": {
            "text": "gpt-5.5",
            "image": "gpt-image-2",
        },
        "development": {
            "text": "gpt-5.4-mini",
            "image": "gpt-image-2",
        },
    },
    "max_output_tokens": 1200,
    "timeout_seconds": 75,
    "retry_count": 3,
    "retry_backoff_seconds": 2.0,
    "temperature": 0.7,
    "daily_cost_limit_usd": None,
    "per_run_cost_limit_usd": None,
    "pricing": {
        "gpt-5.5": {
            "input_cost_per_million_usd": None,
            "output_cost_per_million_usd": None,
        },
        "gpt-5.4-mini": {
            "input_cost_per_million_usd": None,
            "output_cost_per_million_usd": None,
        },
        "gpt-image-2": {
            "input_cost_per_million_usd": None,
            "output_cost_per_million_usd": None,
        },
    },
}


@dataclass(frozen=True, slots=True)
class ModelPricing:
    input_cost_per_million_usd: float | None
    output_cost_per_million_usd: float | None


@dataclass(frozen=True, slots=True)
class ModelSelectionConfig:
    text: str
    image: str


@dataclass(frozen=True, slots=True)
class AIModelsConfig:
    production: ModelSelectionConfig
    development: ModelSelectionConfig


@dataclass(frozen=True, slots=True)
class AIConfig:
    models: AIModelsConfig
    max_output_tokens: int
    timeout_seconds: float
    retry_count: int
    retry_backoff_seconds: float
    temperature: float
    daily_cost_limit_usd: float | None
    per_run_cost_limit_usd: float | None
    pricing: dict[str, ModelPricing]
    function_url: str | None
    function_token: str | None
    function_name: str = "jalapeno-ai-generate"


def _read_yaml_file(config_path: Path = CONFIG_FILE) -> dict[str, Any]:
    if not config_path.exists():
        raise ConfigError(f"Missing config file: {config_path}")

    with config_path.open("r", encoding="utf-8") as handle:
        raw = yaml.safe_load(handle) or {}

    if not isinstance(raw, dict):
        raise ConfigError("config.yaml must contain a mapping at the top level")

    return raw


def _coerce_optional_float(value: Any, key: str) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError) as exc:
        raise ConfigError(f"Invalid AI config value for {key}") from exc


def _coerce_optional_int(value: Any, key: str) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError) as exc:
        raise ConfigError(f"Invalid AI config value for {key}") from exc


def _coerce_string(value: Any, key: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ConfigError(f"Invalid AI config value for {key}")
    return value.strip()


def _load_ai_section(config_path: Path = CONFIG_FILE) -> dict[str, Any]:
    raw = _read_yaml_file(config_path)
    section = raw.get("ai")
    if section is None:
        return dict(DEFAULT_AI_SECTION)
    if not isinstance(section, dict):
        raise ConfigError("ai section must be a mapping")

    merged: dict[str, Any] = dict(DEFAULT_AI_SECTION)
    for key, value in section.items():
        if key == "models" and isinstance(value, dict):
            merged_models = dict(DEFAULT_AI_SECTION["models"])
            for profile_key, profile_value in value.items():
                if isinstance(profile_value, dict):
                    merged_models[profile_key] = dict(profile_value)
            merged["models"] = merged_models
            continue
        if key == "pricing" and isinstance(value, dict):
            merged_pricing = dict(DEFAULT_AI_SECTION["pricing"])
            for pricing_key, pricing_value in value.items():
                if isinstance(pricing_value, dict):
                    merged_pricing[pricing_key] = dict(pricing_value)
            merged["pricing"] = merged_pricing
            continue
        merged[key] = value

    if "models" not in section and any(key in section for key in ("text_model", "image_model", "validation_model")):
        merged["models"] = {
            "production": {
                "text": section.get("text_model", DEFAULT_AI_SECTION["models"]["production"]["text"]),
                "image": section.get("image_model", DEFAULT_AI_SECTION["models"]["production"]["image"]),
            },
            "development": {
                "text": section.get("validation_model", DEFAULT_AI_SECTION["models"]["development"]["text"]),
                "image": section.get("image_model", DEFAULT_AI_SECTION["models"]["development"]["image"]),
            },
        }
    return merged


def _build_pricing(section: dict[str, Any]) -> dict[str, ModelPricing]:
    pricing: dict[str, ModelPricing] = {}
    for model_key, model_section in section.items():
        if not isinstance(model_section, dict):
            raise ConfigError(f"Invalid pricing section for {model_key}")
        pricing[model_key] = ModelPricing(
            input_cost_per_million_usd=_coerce_optional_float(
                model_section.get("input_cost_per_million_usd"),
                f"pricing.{model_key}.input_cost_per_million_usd",
            ),
            output_cost_per_million_usd=_coerce_optional_float(
                model_section.get("output_cost_per_million_usd"),
                f"pricing.{model_key}.output_cost_per_million_usd",
            ),
        )
    return pricing


def _build_models_config(section: dict[str, Any]) -> AIModelsConfig:
    models = section.get("models")
    if not isinstance(models, dict):
        raise ConfigError("ai.models section must be a mapping")

    production = models.get("production")
    development = models.get("development")
    if not isinstance(production, dict):
        raise ConfigError("ai.models.production section must be a mapping")
    if not isinstance(development, dict):
        raise ConfigError("ai.models.development section must be a mapping")

    return AIModelsConfig(
        production=ModelSelectionConfig(
            text=_coerce_string(production.get("text"), "models.production.text"),
            image=_coerce_string(production.get("image"), "models.production.image"),
        ),
        development=ModelSelectionConfig(
            text=_coerce_string(development.get("text"), "models.development.text"),
            image=_coerce_string(development.get("image"), "models.development.image"),
        ),
    )


def load_ai_config(config_path: Path = CONFIG_FILE) -> AIConfig:
    section = _load_ai_section(config_path)
    function_url = os.getenv("JALAPENO_AI_FUNCTION_URL", "").strip() or None
    if function_url is None:
        supabase_url = os.getenv("SUPABASE_URL", "").strip()
        if supabase_url:
            function_url = f"{supabase_url.rstrip('/')}/functions/v1/jalapeno-ai-generate"

    function_token = os.getenv("JALAPENO_AI_FUNCTION_TOKEN", "").strip() or None
    if function_token is None:
        function_token = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip() or None

    return AIConfig(
        models=_build_models_config(section),
        max_output_tokens=int(_coerce_optional_int(section["max_output_tokens"], "max_output_tokens") or 0),
        timeout_seconds=float(_coerce_optional_float(section["timeout_seconds"], "timeout_seconds") or 0),
        retry_count=int(_coerce_optional_int(section["retry_count"], "retry_count") or 0),
        retry_backoff_seconds=float(_coerce_optional_float(section["retry_backoff_seconds"], "retry_backoff_seconds") or 0),
        temperature=float(_coerce_optional_float(section["temperature"], "temperature") or 0),
        daily_cost_limit_usd=_coerce_optional_float(section.get("daily_cost_limit_usd"), "daily_cost_limit_usd"),
        per_run_cost_limit_usd=_coerce_optional_float(section.get("per_run_cost_limit_usd"), "per_run_cost_limit_usd"),
        pricing=_build_pricing(section.get("pricing", {})),
        function_url=function_url,
        function_token=function_token,
    )
