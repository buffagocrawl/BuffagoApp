from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from caption_rules import BANNED_GENERIC_PHRASES, normalize_caption_text, validate_caption, validate_overlay_text, validate_post_pair


@dataclass(frozen=True, slots=True)
class VariantScore:
    score: float
    breakdown: dict[str, float]
    reasons: list[str]
    rejected: bool = False


def _has_any(text: str, needles: tuple[str, ...]) -> bool:
    lowered = normalize_caption_text(text).lower()
    return any(needle in lowered for needle in needles)


def _similarity(a: str, b: str) -> float:
    left = set(re.findall(r"[a-z0-9]+", normalize_caption_text(a).lower()))
    right = set(re.findall(r"[a-z0-9]+", normalize_caption_text(b).lower()))
    if not left or not right:
        return 0.0
    union = left | right
    return len(left & right) / len(union)


def _recent_similarity_penalty(text: str, recent_texts: list[str]) -> float:
    if not recent_texts:
        return 0.0
    best = max(_similarity(text, recent_text) for recent_text in recent_texts if recent_text)
    if best >= 0.8:
        return 20.0
    if best >= 0.65:
        return 12.0
    if best >= 0.5:
        return 6.0
    return 0.0


def score_caption_overlay_variant(
    caption: str,
    overlay_text: str,
    hashtags: list[str],
    *,
    candidate: dict[str, Any],
    feedback_summary: dict[str, Any],
    recent_captions: list[str] | None = None,
    recent_overlays: list[str] | None = None,
    recent_hashtag_sets: list[list[str]] | None = None,
) -> VariantScore:
    recent_captions = recent_captions or []
    recent_overlays = recent_overlays or []
    recent_hashtag_sets = recent_hashtag_sets or []
    breakdown: dict[str, float] = {
        "engagement_cta": 0.0,
        "originality": 0.0,
        "clarity": 0.0,
        "overlay_brevity": 0.0,
        "hashtag_quality": 0.0,
        "feedback_fit": 0.0,
    }
    reasons: list[str] = []

    caption_validation = validate_caption(caption)
    overlay_validation = validate_overlay_text(overlay_text)
    pair_validation = validate_post_pair(caption, overlay_text)

    if not caption_validation["passed"]:
        return VariantScore(score=0.0, breakdown=breakdown, reasons=caption_validation["issues"], rejected=True)
    if not overlay_validation["passed"]:
        return VariantScore(score=0.0, breakdown=breakdown, reasons=overlay_validation["issues"], rejected=True)
    if not pair_validation["passed"]:
        return VariantScore(score=0.0, breakdown=breakdown, reasons=pair_validation["issues"], rejected=True)

    lowered_caption = normalize_caption_text(caption).lower()
    lowered_overlay = normalize_caption_text(overlay_text).lower()

    engagement_actions = len(caption_validation["engagement_actions"])
    if engagement_actions:
        breakdown["engagement_cta"] = min(engagement_actions * 5.0, 15.0)
        reasons.append("direct engagement CTA present")
    if any(term in lowered_caption for term in ("send this", "tag", "comment", "share", "vote", "pick", "choose")):
        breakdown["engagement_cta"] += 4.0
    if any(term in lowered_overlay for term in ("?", "send", "tag", "comment", "flats or drums", "who's", "who is")):
        breakdown["engagement_cta"] += 2.0

    breakdown["originality"] = max(0.0, 14.0 - _recent_similarity_penalty(caption, recent_captions))
    if _recent_similarity_penalty(caption, recent_captions) == 0.0:
        reasons.append("not repetitive against recent captions")

    breakdown["clarity"] = 8.0
    if len(caption) <= 120:
        breakdown["clarity"] += 3.0
    if len(caption) <= 90:
        breakdown["clarity"] += 2.0
    if "?" in caption or any(term in lowered_caption for term in ("send this", "tag", "comment", "share")):
        breakdown["clarity"] += 2.0
    if any(phrase in lowered_caption for phrase in BANNED_GENERIC_PHRASES):
        breakdown["clarity"] -= 20.0
    if candidate.get("restaurants_mentioned"):
        breakdown["clarity"] += 1.0

    word_count = overlay_validation["word_count"]
    if word_count <= 5:
        breakdown["overlay_brevity"] = 10.0
    elif word_count <= 8:
        breakdown["overlay_brevity"] = 7.0
    else:
        breakdown["overlay_brevity"] = 3.0
    if "?" in overlay_text:
        breakdown["overlay_brevity"] += 2.0
    if _recent_similarity_penalty(overlay_text, recent_overlays) == 0.0:
        breakdown["overlay_brevity"] += 1.0

    hashtag_count = len(hashtags)
    if hashtag_count == 5:
        breakdown["hashtag_quality"] = 12.0
        reasons.append("exactly five hashtags")
    else:
        breakdown["hashtag_quality"] = max(0.0, 12.0 - abs(5 - hashtag_count) * 3.0)
    if any(tag.lower().startswith("#buffago") for tag in hashtags):
        breakdown["hashtag_quality"] += 3.0
    if any(tag.lower().startswith("#wing") for tag in hashtags):
        breakdown["hashtag_quality"] += 2.0

    feedback_ctas = {str(item.get("name") or "").lower() for item in feedback_summary.get("best_cta_types", []) if isinstance(item, dict)}
    feedback_captions = {str(item.get("name") or "").lower() for item in feedback_summary.get("best_caption_types", []) if isinstance(item, dict)}
    feedback_overlays = {str(item.get("name") or "").lower() for item in feedback_summary.get("best_overlay_patterns", []) if isinstance(item, dict)}
    preferred_windows = [str(item).lower() for item in feedback_summary.get("preferred_posting_windows", [])]
    if str(candidate.get("cta_category") or "").lower() in feedback_ctas:
        breakdown["feedback_fit"] += 4.0
        reasons.append("matches strong CTA history")
    if str(candidate.get("caption_style") or "").lower() in feedback_captions:
        breakdown["feedback_fit"] += 3.0
    if str(candidate.get("hook_style") or "").lower() in feedback_overlays:
        breakdown["feedback_fit"] += 2.0
    if preferred_windows and any(term in " ".join(preferred_windows) for term in ("18:00", "20:00", "12:00")):
        breakdown["feedback_fit"] += 1.0
    if candidate.get("content_type") in {"restaurant_spotlight", "hidden_gem"} and feedback_summary.get("best_image_styles"):
        breakdown["feedback_fit"] += 1.0
    if candidate.get("content_type") in {"meme", "challenge", "leaderboard"} and feedback_summary.get("recommended_adjustments"):
        breakdown["feedback_fit"] += 1.0

    if recent_hashtag_sets:
        current = {tag.lower() for tag in hashtags}
        best_overlap = 0.0
        for set_ in recent_hashtag_sets:
            recent = {tag.lower() for tag in set_}
            if not recent:
                continue
            overlap = len(current & recent) / len(current | recent)
            best_overlap = max(best_overlap, overlap)
        if best_overlap >= 0.8:
            breakdown["originality"] -= 8.0
        elif best_overlap >= 0.5:
            breakdown["originality"] -= 4.0

    total = round(sum(breakdown.values()), 3)
    if not any(term in lowered_caption for term in ("send this", "tag", "comment", "share", "vote", "pick", "choose", "who")):
        reasons.append("caption could be more explicit about engagement")
    if "?" in caption or "?" in overlay_text:
        reasons.append("includes a question prompt")
    return VariantScore(score=total, breakdown=breakdown, reasons=reasons, rejected=False)
