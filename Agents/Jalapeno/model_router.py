from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any

from ai_config import AIConfig, ModelSelectionConfig


@dataclass(frozen=True, slots=True)
class AIRunContext:
    execution_source: str
    environment: str
    scheduled: bool
    dry_run: bool
    validation: bool
    test_mode: bool
    manual_dispatch: bool
    manual: bool
    fake_publish: bool = False
    scheduled_post_type: str | None = None
    explicit_text_model: str | None = None

    def to_log_fields(self) -> dict[str, Any]:
        return {
            "execution_source": self.execution_source,
            "environment": self.environment,
            "scheduled": self.scheduled,
            "manual": self.manual,
            "dry_run": self.dry_run,
            "validation": self.validation,
            "test_mode": self.test_mode,
            "manual_dispatch": self.manual_dispatch,
            "fake_publish": self.fake_publish,
            "scheduled_post_type": self.scheduled_post_type,
        }

    def to_payload(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True, slots=True)
class ModelRoutingDecision:
    text_model: str
    image_model: str
    routing_reason: str
    profile: str


def _profile(config: AIConfig, profile: str) -> ModelSelectionConfig:
    if profile == "production":
        return config.models.production
    return config.models.development


def get_text_model(config: AIConfig, run_context: AIRunContext) -> ModelRoutingDecision:
    if run_context.explicit_text_model:
        selected = _profile(config, "development")
        return ModelRoutingDecision(
            text_model=run_context.explicit_text_model,
            image_model=selected.image,
            routing_reason="explicit_text_model_override",
            profile="override",
        )

    if run_context.validation:
        selected = _profile(config, "development")
        return ModelRoutingDecision(
            text_model=selected.text,
            image_model=selected.image,
            routing_reason="validation_run",
            profile="development",
        )

    if run_context.dry_run:
        selected = _profile(config, "development")
        return ModelRoutingDecision(
            text_model=selected.text,
            image_model=selected.image,
            routing_reason="dry_run",
            profile="development",
        )

    if run_context.test_mode or run_context.fake_publish:
        selected = _profile(config, "development")
        return ModelRoutingDecision(
            text_model=selected.text,
            image_model=selected.image,
            routing_reason="test_or_fake_publish",
            profile="development",
        )

    if run_context.manual_dispatch or run_context.manual:
        selected = _profile(config, "development")
        return ModelRoutingDecision(
            text_model=selected.text,
            image_model=selected.image,
            routing_reason="manual_execution",
            profile="development",
        )

    is_production_scheduled = (
        run_context.environment == "production"
        and run_context.scheduled
        and run_context.execution_source == "github_actions_scheduler"
        and run_context.scheduled_post_type in {"buffago_post", "meme_post"}
    )
    if is_production_scheduled:
        selected = _profile(config, "production")
        return ModelRoutingDecision(
            text_model=selected.text,
            image_model=selected.image,
            routing_reason="scheduled_production_run",
            profile="production",
        )

    selected = _profile(config, "development")
    return ModelRoutingDecision(
        text_model=selected.text,
        image_model=selected.image,
        routing_reason="development_default",
        profile="development",
    )
