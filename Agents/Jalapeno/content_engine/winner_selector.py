from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from content_engine.candidate_scorer import ScoredCandidate
from content_engine.settings import ContentEngineSettings


@dataclass(frozen=True, slots=True)
class WinnerSelectionResult:
    winner: ScoredCandidate
    runner_up: ScoredCandidate | None
    adjusted_scores: dict[str, float] = field(default_factory=dict)
    reasoning: list[str] = field(default_factory=list)


class WinnerSelector:
    def __init__(self, settings: ContentEngineSettings) -> None:
        self.settings = settings

    def select(self, candidates: list[ScoredCandidate], *, memory_summary: dict[str, Any], external_context: dict[str, Any]) -> WinnerSelectionResult:
        ranked = sorted(candidates, key=lambda item: item.final_score, reverse=True)
        adjusted_scores: dict[str, float] = {}
        reasoning: list[str] = []

        for candidate in ranked:
            bonus = 0.0
            reasons: list[str] = []
            if candidate.candidate.content_type in {"meme", "challenge"}:
                bonus += 2.5
                reasons.append("unexpectedness bonus")
            if candidate.candidate.content_type in {"food_holiday", "sports_tie_in"}:
                bonus += 2.0
                reasons.append("seasonal bonus")
            if candidate.candidate.content_type == "community_highlight":
                bonus += 2.0
                reasons.append("community activity bonus")
            if candidate.candidate.content_type in {"hidden_gem", "restaurant_spotlight"}:
                bonus += 1.5
                reasons.append("freshness bonus")
            if any("weekend" in str(angle).lower() or "game day" in str(angle).lower() for angle in external_context.get("recommended_content_angles", []) or []):
                bonus += 1.0
                reasons.append("trend alignment bonus")
            if memory_summary.get("theme_rotation_needed") and candidate.candidate.primary_theme.lower() in {str(theme).lower() for theme in memory_summary.get("underused_themes", []) or []}:
                bonus += 2.0
                reasons.append("theme rotation bonus")
            adjusted_scores[candidate.candidate.candidate_id] = round(candidate.final_score + bonus, 3)
            if reasons:
                reasoning.append(
                    f"{candidate.candidate.working_title}: +{round(bonus, 2)} {'; '.join(reasons)}"
                )

        best = max(ranked, key=lambda item: adjusted_scores.get(item.candidate.candidate_id, item.final_score))
        runner_up = None
        for candidate in ranked:
            if candidate.candidate.candidate_id != best.candidate.candidate_id:
                runner_up = candidate
                break
        reasoning.append(f"Winner selected for balance of score, freshness, and feed variety: {best.candidate.working_title}")
        return WinnerSelectionResult(winner=best, runner_up=runner_up, adjusted_scores=adjusted_scores, reasoning=reasoning)

