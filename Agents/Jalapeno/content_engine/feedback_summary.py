from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any


FEEDBACK_SUMMARY_VERSION = "feedback-v1"


@dataclass(frozen=True, slots=True)
class ContentFeedbackSummary:
    version: str
    generated_at: str
    prompt_guidance: str
    best_cta_types: list[dict[str, Any]]
    best_caption_types: list[dict[str, Any]]
    best_overlay_patterns: list[dict[str, Any]]
    best_hashtag_patterns: list[dict[str, Any]]
    best_image_styles: list[dict[str, Any]]
    best_video_assets: list[dict[str, Any]]
    worst_categories: list[dict[str, Any]]
    worst_image_styles: list[dict[str, Any]]
    duplicate_topics_to_avoid: list[str]
    preferred_posting_windows: list[str]
    recommended_adjustments: list[str]
    strong_patterns: list[str]
    weak_patterns: list[str]
    active_strategy: dict[str, Any]
    source_counts: dict[str, int]

    def to_dict(self) -> dict[str, Any]:
        return {
            "version": self.version,
            "generated_at": self.generated_at,
            "prompt_guidance": self.prompt_guidance,
            "best_cta_types": self.best_cta_types,
            "best_caption_types": self.best_caption_types,
            "best_overlay_patterns": self.best_overlay_patterns,
            "best_hashtag_patterns": self.best_hashtag_patterns,
            "best_image_styles": self.best_image_styles,
            "best_video_assets": self.best_video_assets,
            "worst_categories": self.worst_categories,
            "worst_image_styles": self.worst_image_styles,
            "duplicate_topics_to_avoid": self.duplicate_topics_to_avoid,
            "preferred_posting_windows": self.preferred_posting_windows,
            "recommended_adjustments": self.recommended_adjustments,
            "strong_patterns": self.strong_patterns,
            "weak_patterns": self.weak_patterns,
            "active_strategy": self.active_strategy,
            "source_counts": self.source_counts,
        }


def _normalize_list(rows: Any, *, limit: int = 5) -> list[dict[str, Any]]:
    if not isinstance(rows, list):
        return []
    normalized: list[dict[str, Any]] = []
    for row in rows[:limit]:
        if isinstance(row, dict):
            normalized.append(dict(row))
    return normalized


def build_feedback_summary(performance_context: dict[str, Any] | None, memory_summary: dict[str, Any] | None = None) -> ContentFeedbackSummary:
    performance_context = performance_context if isinstance(performance_context, dict) else {}
    memory_summary = memory_summary if isinstance(memory_summary, dict) else {}
    prompt_guidance = str(performance_context.get("prompt_guidance") or "").strip()
    if memory_summary.get("theme_rotation_needed"):
        prompt_guidance = "\n".join(
            part for part in (
                prompt_guidance,
                "Rotate away from the most recent theme repetition.",
            )
            if part
        )
    strategy = performance_context.get("active_strategy") if isinstance(performance_context.get("active_strategy"), dict) else {}
    preferred_windows = []
    if isinstance(strategy.get("best_posting_windows"), list):
        preferred_windows = [str(item).strip() for item in strategy["best_posting_windows"] if str(item).strip()]
    return ContentFeedbackSummary(
        version=FEEDBACK_SUMMARY_VERSION,
        generated_at=datetime.now(timezone.utc).isoformat(),
        prompt_guidance=prompt_guidance or "Use recent Instagram performance to keep the next post direct, local, and engagement-first.",
        best_cta_types=_normalize_list(performance_context.get("best_cta_types")),
        best_caption_types=_normalize_list(performance_context.get("best_caption_types")),
        best_overlay_patterns=_normalize_list(performance_context.get("best_overlay_patterns")),
        best_hashtag_patterns=_normalize_list(performance_context.get("best_hashtag_patterns")),
        best_image_styles=_normalize_list(performance_context.get("best_image_styles")),
        best_video_assets=_normalize_list(performance_context.get("best_video_assets")),
        worst_categories=_normalize_list(performance_context.get("worst_categories")),
        worst_image_styles=_normalize_list(performance_context.get("worst_image_styles")),
        duplicate_topics_to_avoid=[str(item).strip() for item in performance_context.get("duplicate_topics_to_avoid", []) if str(item).strip()],
        preferred_posting_windows=preferred_windows,
        recommended_adjustments=[str(item).strip() for item in performance_context.get("recommended_adjustments", []) if str(item).strip()],
        strong_patterns=[str(item).strip() for item in performance_context.get("strong_patterns", []) if str(item).strip()],
        weak_patterns=[str(item).strip() for item in performance_context.get("weak_patterns", []) if str(item).strip()],
        active_strategy=strategy,
        source_counts=performance_context.get("source_counts") if isinstance(performance_context.get("source_counts"), dict) else {},
    )
