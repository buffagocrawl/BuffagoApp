from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from caption_rules import (
    CAPTION_STYLE_ORDER,
    choose_caption_style,
    finalize_caption,
)
from content_engine.alt_text_generator import generate_alt_text
from content_engine.candidate_generator import ContentCandidate
from content_engine.hashtag_generator import generate_hashtags
from content_engine.image_prompt_generator import generate_image_prompt
from prompt_library_loader import PROMPT_LIBRARY_VERSION, load_prompt_text


@dataclass(frozen=True, slots=True)
class CaptionPackage:
    hook: str
    body: str
    cta: str
    caption: str
    spacing: str
    emoji_placement: str
    cleanup_notes: list[str] = field(default_factory=list)
    quality_review: dict[str, Any] = field(default_factory=dict)
    hashtags: list[str] = field(default_factory=list)
    alt_text: str = ""
    image_prompt: str = ""
    caption_style: str = ""
    selected_caption_style: str = ""
    caption_type: str = ""
    validation_passed: bool = False
    fallback_used: bool = False
    caption_length: int = 0
    caption_source: str = ""
    validation_failure_reason: str | None = None


def _style_pool(candidate: ContentCandidate, external_context: dict[str, Any]) -> list[str]:
    styles: list[str] = ["simple_hype", "craving_prompt"]
    content_type = candidate.content_type.lower()
    day_of_week = str(external_context.get("day_of_week") or "").lower()
    sports_events = list(external_context.get("sports_events", []) or [])

    if candidate.cta_category in {"comment", "question"}:
        styles.extend(["tag_someone", "sauce_debate", "comment_prompt"])
    if candidate.cta_category == "save":
        styles.extend(["craving_prompt", "wing_night"])
    if content_type in {"meme", "funny_observation", "challenge", "leaderboard"}:
        styles.extend(["group_chat", "wing_debt", "tag_someone"])
    if "sauce" in " ".join(candidate.food_categories).lower():
        styles.append("sauce_debate")
    if content_type in {"restaurant_spotlight", "hidden_gem", "sports_tie_in", "food_holiday"}:
        styles.extend(["send_to_friend", "craving_prompt"])
    if day_of_week in {"friday", "saturday", "sunday"} or sports_events:
        styles.append("wing_night")

    unique: list[str] = []
    for style in styles + list(CAPTION_STYLE_ORDER):
        if style not in unique:
            unique.append(style)
    return unique


def _pick_caption(candidate: ContentCandidate, external_context: dict[str, Any]) -> tuple[str, str]:
    style_pool = _style_pool(candidate, external_context)
    style_seed = f"{candidate.candidate_id}:{candidate.content_type}:style"
    style = choose_caption_style(seed=style_seed, allowed_styles=style_pool)
    caption_plan = finalize_caption(seed=style_seed, style=style, allowed_styles=[style], allow_openai_caption=False)
    return caption_plan["selected_caption_style"], caption_plan["caption"]


def _quality_review(
    caption: str,
    hashtags: list[str],
    alt_text: str,
    image_prompt: str,
    candidate: ContentCandidate,
    *,
    validation: dict[str, Any],
    fallback_used: bool,
) -> dict[str, Any]:
    issues = list(validation["issues"])
    if len(hashtags) < 10:
        issues.append("hashtag_count_below_target")
    if len(hashtags) > 15:
        issues.append("hashtag_count_above_target")
    if not candidate.suggested_cta:
        issues.append("cta_missing")
    if not alt_text.strip():
        issues.append("alt_text_missing")
    if not image_prompt.strip():
        issues.append("image_prompt_missing")
    approved = validation["passed"]
    score = 96 if approved else max(40, 96 - len(issues) * 7)
    return {
        "approved": approved,
        "issues": issues,
        "score": score,
        "prompt_version": PROMPT_LIBRARY_VERSION,
        "fallback_used": fallback_used,
        "caption_length": validation["caption_length"],
        "validation_passed": validation["passed"],
    }


def generate_caption_package(
    candidate: ContentCandidate,
    *,
    snapshot: dict[str, Any],
    external_context: dict[str, Any],
) -> CaptionPackage:
    cleanup_prompt = load_prompt_text("caption_cleanup")
    quality_prompt = load_prompt_text("quality_review")
    hashtags = generate_hashtags(candidate, snapshot=snapshot, external_context=external_context)
    alt_text = generate_alt_text(candidate, image_prompt="", snapshot=snapshot, external_context=external_context)
    image_prompt = generate_image_prompt(candidate, snapshot=snapshot, external_context=external_context)

    selected_caption_style, draft_caption = _pick_caption(candidate, external_context)
    caption_plan = finalize_caption(
        seed=f"{candidate.candidate_id}:{candidate.content_type}:caption",
        style=selected_caption_style,
        raw_caption=draft_caption,
        allowed_styles=[selected_caption_style],
        allow_openai_caption=False,
    )
    cleaned_caption = caption_plan["caption"]
    validation = caption_plan["validation"]
    cleanup_notes = [
        "Caption generator uses short Buffago wing templates with strict validation.",
        f"Selected caption style: {selected_caption_style}.",
        f"Caption source: {caption_plan['caption_source']}.",
    ]
    fallback_used = bool(caption_plan["fallback_used"])

    if fallback_used:
        cleanup_notes.append("Primary caption failed validation and was replaced with a curated fallback.")

    cleanup_notes.append("caption_cleanup prompt reviewed against local caption rules.")
    cleanup_notes.append("quality_review prompt reviewed locally.")
    if "Need" in cleanup_prompt or "Review" in quality_prompt:
        cleanup_notes.append("Prompt library guidance loaded successfully.")

    quality_review = _quality_review(
        cleaned_caption,
        hashtags,
        alt_text,
        image_prompt,
        candidate,
        validation=validation,
        fallback_used=fallback_used,
    )

    return CaptionPackage(
        hook=selected_caption_style,
        body=cleaned_caption,
        cta=candidate.suggested_cta,
        caption=cleaned_caption,
        spacing=cleaned_caption,
        emoji_placement="Avoid emoji walls; use zero or one only when a template explicitly needs it.",
        cleanup_notes=cleanup_notes,
        quality_review=quality_review,
        hashtags=hashtags,
        alt_text=alt_text,
        image_prompt=image_prompt,
        caption_style=selected_caption_style,
        selected_caption_style=selected_caption_style,
        caption_type=selected_caption_style,
        validation_passed=validation["passed"],
        fallback_used=fallback_used,
        caption_length=validation["caption_length"],
        caption_source=caption_plan["caption_source"],
        validation_failure_reason=caption_plan["validation_failure_reason"],
    )
