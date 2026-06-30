from __future__ import annotations

import json
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any


PACKAGE_DIR = Path(__file__).resolve().parent
DEFAULT_DECISION_CONFIG_PATH = PACKAGE_DIR / "decision_config.json"


@dataclass(frozen=True, slots=True)
class ScoringWeights:
    originality: int = 20
    likelihood_of_engagement: int = 20
    brand_fit: int = 15
    uses_recent_buffago_activity: int = 10
    current_relevance: int = 10
    visual_potential: int = 10
    conversation_starter: int = 5
    gamification_potential: int = 5
    cta_quality: int = 5

    def total(self) -> int:
        return sum(
            [
                self.originality,
                self.likelihood_of_engagement,
                self.brand_fit,
                self.uses_recent_buffago_activity,
                self.current_relevance,
                self.visual_potential,
                self.conversation_starter,
                self.gamification_potential,
                self.cta_quality,
            ]
        )


@dataclass(frozen=True, slots=True)
class MemoryAdjustments:
    diversity_bonus: float = 6.0
    theme_rotation_bonus: float = 4.0
    seasonal_bonus: float = 4.0
    community_activity_bonus: float = 4.0
    freshness_bonus: float = 4.0
    unexpectedness_bonus: float = 3.0
    recent_trend_bonus: float = 4.0
    recently_used_theme_penalty: float = 6.0
    recently_used_cta_penalty: float = 4.0
    recently_used_restaurant_penalty: float = 5.0
    recently_used_caption_style_penalty: float = 3.0
    recently_used_hook_penalty: float = 3.0
    recently_used_visual_style_penalty: float = 3.0
    duplicate_penalty: float = 35.0


@dataclass(frozen=True, slots=True)
class ContentEngineSettings:
    candidate_count_min: int = 5
    candidate_count_max: int = 10
    preferred_candidate_count: int = 7
    duplicate_similarity_threshold: float = 0.72
    scoring_weights: ScoringWeights = field(default_factory=ScoringWeights)
    memory_adjustments: MemoryAdjustments = field(default_factory=MemoryAdjustments)

    def candidate_count(self) -> int:
        return max(self.candidate_count_min, min(self.preferred_candidate_count, self.candidate_count_max))


def _read_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    if not isinstance(payload, dict):
        raise ValueError(f"Decision config must be a JSON object: {path}")
    return payload


def _build_settings(payload: dict[str, Any]) -> ContentEngineSettings:
    weights_payload = payload.get("scoring_weights") if isinstance(payload.get("scoring_weights"), dict) else {}
    adjustments_payload = payload.get("memory_adjustments") if isinstance(payload.get("memory_adjustments"), dict) else {}
    weights = ScoringWeights(
        originality=int(weights_payload.get("originality", 20)),
        likelihood_of_engagement=int(weights_payload.get("likelihood_of_engagement", 20)),
        brand_fit=int(weights_payload.get("brand_fit", 15)),
        uses_recent_buffago_activity=int(weights_payload.get("uses_recent_buffago_activity", 10)),
        current_relevance=int(weights_payload.get("current_relevance", 10)),
        visual_potential=int(weights_payload.get("visual_potential", 10)),
        conversation_starter=int(weights_payload.get("conversation_starter", 5)),
        gamification_potential=int(weights_payload.get("gamification_potential", 5)),
        cta_quality=int(weights_payload.get("cta_quality", 5)),
    )
    adjustments = MemoryAdjustments(
        diversity_bonus=float(adjustments_payload.get("diversity_bonus", 6.0)),
        theme_rotation_bonus=float(adjustments_payload.get("theme_rotation_bonus", 4.0)),
        seasonal_bonus=float(adjustments_payload.get("seasonal_bonus", 4.0)),
        community_activity_bonus=float(adjustments_payload.get("community_activity_bonus", 4.0)),
        freshness_bonus=float(adjustments_payload.get("freshness_bonus", 4.0)),
        unexpectedness_bonus=float(adjustments_payload.get("unexpectedness_bonus", 3.0)),
        recent_trend_bonus=float(adjustments_payload.get("recent_trend_bonus", 4.0)),
        recently_used_theme_penalty=float(adjustments_payload.get("recently_used_theme_penalty", 6.0)),
        recently_used_cta_penalty=float(adjustments_payload.get("recently_used_cta_penalty", 4.0)),
        recently_used_restaurant_penalty=float(adjustments_payload.get("recently_used_restaurant_penalty", 5.0)),
        recently_used_caption_style_penalty=float(adjustments_payload.get("recently_used_caption_style_penalty", 3.0)),
        recently_used_hook_penalty=float(adjustments_payload.get("recently_used_hook_penalty", 3.0)),
        recently_used_visual_style_penalty=float(adjustments_payload.get("recently_used_visual_style_penalty", 3.0)),
        duplicate_penalty=float(adjustments_payload.get("duplicate_penalty", 35.0)),
    )
    return ContentEngineSettings(
        candidate_count_min=int(payload.get("candidate_count_min", 5)),
        candidate_count_max=int(payload.get("candidate_count_max", 10)),
        preferred_candidate_count=int(payload.get("preferred_candidate_count", 7)),
        duplicate_similarity_threshold=float(payload.get("duplicate_similarity_threshold", 0.72)),
        scoring_weights=weights,
        memory_adjustments=adjustments,
    )


@lru_cache(maxsize=1)
def load_content_engine_settings(path: Path = DEFAULT_DECISION_CONFIG_PATH) -> ContentEngineSettings:
    return _build_settings(_read_json(path))
