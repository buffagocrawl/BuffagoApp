from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from content_engine.candidate_generator import ContentCandidate
from content_engine.settings import ContentEngineSettings


TOKEN_RE = re.compile(r"[a-z0-9]+")


@dataclass(frozen=True, slots=True)
class DuplicateCheckResult:
    candidate_id: str
    duplicate_score: float
    rejected: bool
    rejection_reason: str | None
    matched_post: dict[str, Any] | None
    comparison_notes: list[str] = field(default_factory=list)


def _normalize_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, list):
        return " ".join(_normalize_text(item) for item in value)
    if isinstance(value, dict):
        return " ".join(_normalize_text(item) for item in value.values())
    return str(value).lower()


def _tokens(value: Any) -> set[str]:
    text = _normalize_text(value)
    return {token for token in TOKEN_RE.findall(text) if len(token) > 1}


def _jaccard(left: set[str], right: set[str]) -> float:
    if not left and not right:
        return 0.0
    if not left or not right:
        return 0.0
    return len(left & right) / len(left | right)


def _component_similarity(candidate: ContentCandidate, post: dict[str, Any]) -> tuple[float, list[str]]:
    metadata = post.get("metadata") if isinstance(post.get("metadata"), dict) else {}
    parts = {
        "topic": _jaccard(_tokens([candidate.content_type, candidate.primary_theme, candidate.secondary_theme]), _tokens([post.get("post_type"), post.get("chosen_idea"), metadata.get("primary_theme")])),
        "caption": _jaccard(_tokens(candidate.suggested_caption_angle), _tokens(post.get("generated_caption") or post.get("caption"))),
        "hashtags": _jaccard(_tokens(candidate.metadata.get("hashtags", [])), _tokens(post.get("hashtags", []))),
        "restaurant": _jaccard(_tokens(candidate.restaurants_mentioned), _tokens(post.get("restaurants_mentioned") or metadata.get("restaurants_mentioned") or [])),
        "cta": _jaccard(_tokens(candidate.suggested_cta), _tokens(post.get("cta") or metadata.get("cta"))),
        "image": _jaccard(_tokens(candidate.suggested_image_concept), _tokens(post.get("image_prompt") or post.get("image_concept") or metadata.get("image_concept"))),
    }
    weighted = (
        parts["topic"] * 0.25
        + parts["caption"] * 0.20
        + parts["hashtags"] * 0.15
        + parts["restaurant"] * 0.20
        + parts["cta"] * 0.10
        + parts["image"] * 0.10
    )
    notes = [f"{name}={round(score, 3)}" for name, score in parts.items() if score > 0]
    return round(weighted, 3), notes


class DuplicateChecker:
    def __init__(self, settings: ContentEngineSettings) -> None:
        self.settings = settings

    def check(
        self,
        candidate: ContentCandidate,
        recent_posts: list[dict[str, Any]],
        *,
        threshold: float | None = None,
    ) -> DuplicateCheckResult:
        configured_threshold = threshold if threshold is not None else self.settings.duplicate_similarity_threshold
        best_score = 0.0
        best_post: dict[str, Any] | None = None
        notes: list[str] = []
        for post in recent_posts[:30]:
            score, comparison_notes = _component_similarity(candidate, post)
            if score > best_score:
                best_score = score
                best_post = post
                notes = comparison_notes
        rejected = best_score >= configured_threshold
        reason = None
        if rejected and best_post is not None:
            reason = (
                f"Too similar to previous post {best_post.get('id') or best_post.get('post_id') or 'unknown'} "
                f"(duplicate_similarity={round(best_score, 3)}; threshold={configured_threshold})."
            )
        return DuplicateCheckResult(
            candidate_id=candidate.candidate_id,
            duplicate_score=round(best_score, 3),
            rejected=rejected,
            rejection_reason=reason,
            matched_post=best_post,
            comparison_notes=notes,
        )
