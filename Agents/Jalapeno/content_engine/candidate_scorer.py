from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from content_engine.candidate_generator import ContentCandidate
from content_engine.settings import ContentEngineSettings


@dataclass(frozen=True, slots=True)
class CandidateScore:
    category_scores: dict[str, float]
    weighted_total: float
    adjustments: dict[str, float] = field(default_factory=dict)
    notes: list[str] = field(default_factory=list)


@dataclass(frozen=True, slots=True)
class ScoredCandidate:
    candidate: ContentCandidate
    score: CandidateScore
    duplicate_score: float = 0.0
    rejected_duplicate: bool = False
    duplicate_reason: str | None = None
    duplicate_notes: list[str] = field(default_factory=list)

    @property
    def final_score(self) -> float:
        return round(self.score.weighted_total + sum(self.score.adjustments.values()), 3)


def _contains_any(values: list[str], needles: list[str]) -> bool:
    normalized = {item.lower() for item in values}
    return any(needle.lower() in normalized for needle in needles)


class CandidateScorer:
    def __init__(self, settings: ContentEngineSettings) -> None:
        self.settings = settings

    def score(
        self,
        candidate: ContentCandidate,
        *,
        snapshot: dict[str, Any],
        external_context: dict[str, Any],
        memory_summary: dict[str, Any],
        duplicate_score: float = 0.0,
    ) -> CandidateScore:
        weights = self.settings.scoring_weights
        recent_themes = [str(item) for item in memory_summary.get("recent_themes", []) if str(item).strip()]
        recent_ctas = [str(item) for item in memory_summary.get("recent_ctas", []) if str(item).strip()]
        recent_restaurants = [str(item) for item in memory_summary.get("recent_restaurants", []) if str(item).strip()]
        recent_hooks = [str(item) for item in memory_summary.get("recent_hooks", []) if str(item).strip()]
        recent_visuals = [str(item) for item in memory_summary.get("recent_visual_styles", []) if str(item).strip()]
        underused_themes = [str(item) for item in memory_summary.get("underused_themes", []) if str(item).strip()]
        community_activity = int(memory_summary.get("community_activity_score", 0) or 0)
        performance_context = memory_summary.get("performance_context") if isinstance(memory_summary.get("performance_context"), dict) else {}
        best_categories = {
            str(item.get("name") or "").strip().lower()
            for item in performance_context.get("best_categories", [])[:5]
            if isinstance(item, dict)
        }
        weak_styles = {
            str(item.get("name") or "").strip().lower()
            for item in performance_context.get("worst_image_styles", [])[:5]
            if isinstance(item, dict)
        }
        best_ctas = {
            str(item.get("name") or "").strip().lower()
            for item in performance_context.get("best_cta_types", [])[:5]
            if isinstance(item, dict)
        }

        category_scores: dict[str, float] = {}
        category_scores["originality"] = max(0.0, 1.0 - duplicate_score) * 20.0
        category_scores["likelihood_of_engagement"] = self._engagement_score(candidate)
        category_scores["brand_fit"] = self._brand_fit_score(candidate)
        category_scores["uses_recent_buffago_activity"] = self._activity_score(candidate, snapshot)
        category_scores["current_relevance"] = self._current_relevance_score(candidate, external_context)
        category_scores["visual_potential"] = self._visual_score(candidate)
        category_scores["conversation_starter"] = self._conversation_score(candidate)
        category_scores["gamification_potential"] = self._gamification_score(candidate)
        category_scores["cta_quality"] = self._cta_quality_score(candidate)

        weighted_total = self._weighted_total(category_scores, weights)

        adjustments: dict[str, float] = {}
        if candidate.primary_theme.lower() in {theme.lower() for theme in underused_themes}:
            adjustments["diversity_bonus"] = self.settings.memory_adjustments.diversity_bonus
        if recent_themes and candidate.primary_theme.lower() not in {theme.lower() for theme in recent_themes[:3]}:
            adjustments["theme_rotation_bonus"] = self.settings.memory_adjustments.theme_rotation_bonus
        if candidate.content_type in {"food_holiday", "sports_tie_in"}:
            adjustments["seasonal_bonus"] = self.settings.memory_adjustments.seasonal_bonus
        if community_activity > 10 and candidate.content_type in {"community_highlight", "challenge", "leaderboard"}:
            adjustments["community_activity_bonus"] = self.settings.memory_adjustments.community_activity_bonus
        if candidate.content_type in {"meme", "challenge", "question"}:
            adjustments["unexpectedness_bonus"] = self.settings.memory_adjustments.unexpectedness_bonus
        if candidate.content_type in {"restaurant_spotlight", "hidden_gem"}:
            adjustments["freshness_bonus"] = self.settings.memory_adjustments.freshness_bonus
        if any(term in candidate.suggested_caption_angle.lower() for term in ["right now", "today", "weekend", "game day", "crawl"]):
            adjustments["recent_trend_bonus"] = self.settings.memory_adjustments.recent_trend_bonus
        if candidate.content_type.lower() in best_categories or candidate.primary_theme.lower() in best_categories:
            adjustments["performance_category_bonus"] = 4.0
        if candidate.cta_category.lower() in best_ctas:
            adjustments["performance_cta_bonus"] = 2.0
        if candidate.metadata.get("strategy_preferred_style"):
            adjustments["strategy_preferred_style_bonus"] = 2.5
        if candidate.metadata.get("strategy_preferred_hook"):
            adjustments["strategy_preferred_hook_bonus"] = 1.5
        if candidate.metadata.get("strategy_preferred_caption_style"):
            adjustments["strategy_preferred_caption_style_bonus"] = 1.0

        if candidate.primary_theme.lower() in {theme.lower() for theme in recent_themes[:5]}:
            adjustments["recently_used_theme_penalty"] = -self.settings.memory_adjustments.recently_used_theme_penalty
        if candidate.suggested_cta.lower() in {cta.lower() for cta in recent_ctas[:5]}:
            adjustments["recently_used_cta_penalty"] = -self.settings.memory_adjustments.recently_used_cta_penalty
        if _contains_any(candidate.restaurants_mentioned, recent_restaurants[:5]):
            adjustments["recently_used_restaurant_penalty"] = -self.settings.memory_adjustments.recently_used_restaurant_penalty
        if candidate.hook_style.lower() in {hook.lower() for hook in recent_hooks[:5]}:
            adjustments["recently_used_hook_penalty"] = -self.settings.memory_adjustments.recently_used_hook_penalty
        if candidate.visual_style.lower() in {style.lower() for style in recent_visuals[:5]}:
            adjustments["recently_used_visual_style_penalty"] = -self.settings.memory_adjustments.recently_used_visual_style_penalty
        if candidate.visual_style.lower() in weak_styles or candidate.metadata.get("poor_image_style_risk"):
            adjustments["poor_image_style_penalty"] = -4.0
        if candidate.metadata.get("strategy_reduce_style"):
            adjustments["strategy_reduce_style_penalty"] = -2.5

        if duplicate_score > 0.0:
            adjustments["duplicate_penalty"] = -duplicate_score * self.settings.memory_adjustments.duplicate_penalty

        notes = [
            f"originality={round(category_scores['originality'], 2)}",
            f"engagement={round(category_scores['likelihood_of_engagement'], 2)}",
            f"brand_fit={round(category_scores['brand_fit'], 2)}",
            f"activity={round(category_scores['uses_recent_buffago_activity'], 2)}",
            f"relevance={round(category_scores['current_relevance'], 2)}",
        ]
        return CandidateScore(
            category_scores={key: round(value, 3) for key, value in category_scores.items()},
            weighted_total=round(weighted_total, 3),
            adjustments={key: round(value, 3) for key, value in adjustments.items()},
            notes=notes,
        )

    def _weighted_total(self, category_scores: dict[str, float], weights) -> float:
        weight_map = {
            "originality": weights.originality,
            "likelihood_of_engagement": weights.likelihood_of_engagement,
            "brand_fit": weights.brand_fit,
            "uses_recent_buffago_activity": weights.uses_recent_buffago_activity,
            "current_relevance": weights.current_relevance,
            "visual_potential": weights.visual_potential,
            "conversation_starter": weights.conversation_starter,
            "gamification_potential": weights.gamification_potential,
            "cta_quality": weights.cta_quality,
        }
        max_map = {
            "originality": 20.0,
            "likelihood_of_engagement": 20.0,
            "brand_fit": 20.0,
            "uses_recent_buffago_activity": 10.0,
            "current_relevance": 10.0,
            "visual_potential": 10.0,
            "conversation_starter": 5.0,
            "gamification_potential": 5.0,
            "cta_quality": 5.0,
        }
        total = 0.0
        for key, score in category_scores.items():
            total += (score / max_map[key]) * weight_map[key]
        return total

    def _engagement_score(self, candidate: ContentCandidate) -> float:
        score = 8.0
        if candidate.cta_category in {"comment", "question"}:
            score += 4.0
        if candidate.content_type in {"challenge", "leaderboard", "meme"}:
            score += 4.0
        if candidate.target_emotion in {"Curious", "Amused", "Competitive", "Playful"}:
            score += 2.0
        if candidate.content_type in {"restaurant_spotlight", "hidden_gem"}:
            score += 1.5
        return min(score, 20.0)

    def _brand_fit_score(self, candidate: ContentCandidate) -> float:
        score = 10.0
        if candidate.primary_theme in {"restaurant focus", "community", "gamification", "competition", "humor", "holiday", "sports"}:
            score += 3.0
        if candidate.restaurants_mentioned or candidate.food_categories:
            score += 2.0
        if candidate.mood in {"Friendly", "Funny", "Educational", "Exciting"}:
            score += 2.0
        if candidate.content_type == "meme":
            score += 1.0
        return min(score, 20.0)

    def _activity_score(self, candidate: ContentCandidate, snapshot: dict[str, Any]) -> float:
        summary = snapshot.get("summary") if isinstance(snapshot.get("summary"), dict) else {}
        snapshot_activity = int(summary.get("activity_score", 0) or 0)
        score = min(snapshot_activity / 5.0, 4.0)
        if candidate.restaurants_mentioned:
            score += 3.0
        if candidate.source_signals and any(signal in {"recent_ratings", "top_restaurants", "new_restaurants"} for signal in candidate.source_signals):
            score += 2.5
        if candidate.content_type in {"community_highlight", "xp_milestone", "leaderboard", "challenge"}:
            score += 2.5
        return min(score, 10.0)

    def _current_relevance_score(self, candidate: ContentCandidate, external_context: dict[str, Any]) -> float:
        score = 4.0
        if candidate.content_type == "sports_tie_in":
            score += 3.0
        if candidate.content_type == "food_holiday" and external_context.get("food_holidays"):
            score += 4.0
        if candidate.content_type in {"challenge", "meme"} and external_context.get("trend_topics"):
            score += 2.0
        if any("weekend" in str(angle).lower() or "game day" in str(angle).lower() for angle in external_context.get("recommended_content_angles", []) or []):
            score += 2.0
        return min(score, 10.0)

    def _visual_score(self, candidate: ContentCandidate) -> float:
        score = 6.0
        if candidate.visual_style in {"realistic", "illustration", "meme"}:
            score += 3.0
        if candidate.image_composition:
            score += 1.5
        if candidate.food_categories or candidate.restaurants_mentioned:
            score += 2.0
        return min(score, 10.0)

    def _conversation_score(self, candidate: ContentCandidate) -> float:
        score = 2.0
        if candidate.cta_category in {"question", "comment"}:
            score += 2.0
        if candidate.content_type in {"leaderboard", "challenge", "meme", "community_highlight"}:
            score += 1.5
        return min(score, 5.0)

    def _gamification_score(self, candidate: ContentCandidate) -> float:
        score = 1.0
        if candidate.content_type in {"xp_milestone", "leaderboard", "challenge"}:
            score += 3.0
        if candidate.content_type == "community_highlight":
            score += 1.0
        return min(score, 5.0)

    def _cta_quality_score(self, candidate: ContentCandidate) -> float:
        score = 2.0
        if candidate.suggested_cta:
            score += 1.5
        if candidate.cta_category in {"comment", "save", "question"}:
            score += 1.5
        return min(score, 5.0)
