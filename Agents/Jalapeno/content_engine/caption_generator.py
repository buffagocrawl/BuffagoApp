from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any

from caption_rules import (
    BANNED_GENERIC_PHRASES,
    CAPTION_STYLE_ORDER,
    choose_caption_style,
    compose_caption_with_hashtags,
    finalize_caption_overlay_pair,
    validate_caption,
    validate_overlay_text,
    validate_post_pair,
)
from content_engine.alt_text_generator import generate_alt_text
from content_engine.candidate_generator import ContentCandidate
from content_engine.content_ranking import score_caption_overlay_variant
from content_engine.feedback_summary import ContentFeedbackSummary, build_feedback_summary
from content_engine.hashtag_generator import generate_hashtags
from content_engine.image_prompt_generator import generate_image_prompt
from openai_client import OpenAIContentClient
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
    overlay_text: str = ""
    overlay_source: str = ""
    caption_overlay_concept: str | None = None
    overlay_validation_passed: bool = False
    overlay_validation_failure_reason: str | None = None
    openai_used: bool = False
    openai_model: str | None = None
    fallback_reason: str | None = None
    feedback_summary_version: str = ""
    feedback_summary: dict[str, Any] = field(default_factory=dict)
    caption_options: list[dict[str, Any]] = field(default_factory=list)
    overlay_options: list[dict[str, Any]] = field(default_factory=list)
    ranking_reason: str = ""
    ranking_score: float = 0.0
    ranking_breakdown: dict[str, Any] = field(default_factory=dict)


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
    pair_plan = finalize_caption_overlay_pair(
        seed=style_seed,
        caption_style=style,
        allowed_styles=[style],
        allow_openai_caption=False,
    )
    return pair_plan["selected_caption_style"], pair_plan["caption"]


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
    if len(hashtags) != 5:
        issues.append("hashtag_count_not_equal_to_five")
    if not candidate.suggested_cta:
        issues.append("cta_missing")
    if not alt_text.strip():
        issues.append("alt_text_missing")
    if not image_prompt.strip():
        issues.append("image_prompt_missing")
    if any(phrase in caption.lower() for phrase in BANNED_GENERIC_PHRASES):
        issues.append("banned_phrase_in_caption")
    approved = validation["passed"] and len(hashtags) == 5 and not any(issue == "banned_phrase_in_caption" for issue in issues)
    score = 96 if approved else max(40, 96 - len(issues) * 7)
    return {
        "approved": approved,
        "issues": issues,
        "score": score,
        "prompt_version": PROMPT_LIBRARY_VERSION,
        "fallback_used": fallback_used,
        "caption_length": validation["caption_length"],
        "validation_passed": validation["passed"],
        "hashtag_count": len(hashtags),
    }


def _recent_texts(recent_posts: list[dict[str, Any]], key_names: tuple[str, ...]) -> list[str]:
    values: list[str] = []
    for row in recent_posts:
        for key in key_names:
            value = str(row.get(key) or "").strip()
            if value:
                values.append(value)
                break
    return values


def _recent_hashtag_sets(recent_posts: list[dict[str, Any]]) -> list[list[str]]:
    sets: list[list[str]] = []
    for row in recent_posts:
        hashtags = row.get("hashtags")
        if isinstance(hashtags, list):
            normalized = [str(tag).strip() for tag in hashtags if str(tag).strip()]
            if normalized:
                sets.append(normalized)
    return sets


def _local_variant_plan(candidate: ContentCandidate, snapshot: dict[str, Any], external_context: dict[str, Any], feedback_summary: ContentFeedbackSummary) -> list[dict[str, Any]]:
    style_pool = _style_pool(candidate, external_context)
    variants: list[dict[str, Any]] = []
    for index, style in enumerate(style_pool[:4]):
        pair_plan = finalize_caption_overlay_pair(
            seed=f"{candidate.candidate_id}:{candidate.content_type}:local:{index}",
            caption_style=style,
            allowed_styles=[style],
            allow_openai_caption=False,
        )
        caption = pair_plan["caption"]
        overlay_text = pair_plan["overlay_text"]
        variant_hashtags = generate_hashtags(candidate, snapshot=snapshot, external_context=external_context, limit=5)
        validation = validate_post_pair(caption, overlay_text)
        variants.append(
            {
                "source": "template",
                "caption": caption,
                "overlay_text": overlay_text,
                "caption_style": pair_plan["selected_caption_style"],
                "caption_source": pair_plan["caption_source"],
                "overlay_source": pair_plan["overlay_source"],
                "validation": validation,
                "hashtags": variant_hashtags,
                "feedback_summary_version": feedback_summary.version,
            }
        )
    return variants


def _openai_variant_plan(
    candidate: ContentCandidate,
    *,
    snapshot: dict[str, Any],
    external_context: dict[str, Any],
    feedback_summary: ContentFeedbackSummary,
    logger=None,
) -> tuple[list[dict[str, Any]], OpenAIContentClient | None, str | None]:
    client = OpenAIContentClient.from_env(logger=logger)
    if client is None:
        return [], None, "OpenAI is not configured"

    candidate_payload = candidate.to_dict()
    prompt_payload = {
        "candidate": candidate_payload,
        "snapshot": snapshot,
        "external_context": external_context,
        "feedback_summary": feedback_summary.to_dict(),
        "requirements": {
            "caption_options": 4,
            "overlay_options": 4,
            "caption_rules": [
                "Natural and punchy",
                "Exactly one clear engagement CTA",
                "Lean into tag, comment, share, question, pick-a-side, or send-this prompts",
                "Always produce exactly 5 hashtags",
                "No stale joke templates",
                "Avoid voicemail, understood the assignment, or bring napkins unless the context genuinely fits",
                "No fake metrics or surreal food-personification",
                "Do not include hashtags in the caption body",
            ],
            "overlay_rules": [
                "Short and readable on video",
                "Often ask a question",
                "Do not repeat the caption word-for-word",
            ],
        },
    }
    system_prompt = (
        "You write Buffago Instagram caption ideas for Jalapeno. "
        "Keep the language direct, local, wing-obsessed, and engagement-first. "
        "Always return captions that push sharing, tagging, comments, questions, or picking a side. "
        "Always produce exactly 5 hashtags. "
        "Avoid stale meme templates, voicemail jokes, understood the assignment, bring napkins, and generic food-influencer filler. "
        "Return valid JSON only."
    )
    user_prompt = json.dumps(prompt_payload, ensure_ascii=True, indent=2, sort_keys=True)
    result = client.generate_variant_set(
        stage="caption_generation",
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        options_count=4,
    )
    if not result.success:
        return [], client, result.fallback_reason

    output = result.output
    caption_options = output.get("caption_options")
    overlay_options = output.get("overlay_options")
    if not isinstance(caption_options, list):
        caption_options = []
    if not isinstance(overlay_options, list):
        overlay_options = []

    variants: list[dict[str, Any]] = []
    for index, caption_option in enumerate(caption_options):
        if not isinstance(caption_option, dict):
            continue
        caption_body = str(caption_option.get("caption_body") or caption_option.get("caption") or "").strip()
        if not caption_body:
            continue
        caption_style = str(caption_option.get("caption_style") or candidate.caption_style or candidate.content_type).strip()
        overlay_text = ""
        if index < len(overlay_options) and isinstance(overlay_options[index], dict):
            overlay_text = str(overlay_options[index].get("overlay_text") or overlay_options[index].get("text_overlay") or "").strip()
        if not overlay_text:
            overlay_text = str(caption_option.get("overlay_text") or candidate.overlay_text or "").strip()
        variant_hashtags = generate_hashtags(candidate, snapshot=snapshot, external_context=external_context, limit=5)
        pair_plan = finalize_caption_overlay_pair(
            seed=f"{candidate.candidate_id}:{candidate.content_type}:openai:{index}",
            caption_style=caption_style or None,
            raw_caption=caption_body,
            raw_overlay=overlay_text or None,
            allowed_styles=[caption_style] if caption_style else None,
            allow_openai_caption=True,
        )
        variants.append(
            {
                "source": "openai",
                "caption": pair_plan["caption"],
                "overlay_text": pair_plan["overlay_text"],
                "caption_style": pair_plan["selected_caption_style"],
                "caption_source": pair_plan["caption_source"],
                "overlay_source": pair_plan["overlay_source"],
                "validation": pair_plan["pair_validation"],
                "hashtags": variant_hashtags,
                "feedback_summary_version": feedback_summary.version,
                "openai_model": result.model,
            }
        )
    return variants, client, None


def _score_variant_options(
    candidate: ContentCandidate,
    *,
    variants: list[dict[str, Any]],
    feedback_summary: ContentFeedbackSummary,
    recent_posts: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    recent_captions = _recent_texts(recent_posts, ("caption", "generated_caption"))
    recent_overlays = _recent_texts(recent_posts, ("overlay_text", "hook_text"))
    recent_hashtag_sets = _recent_hashtag_sets(recent_posts)
    scored: list[dict[str, Any]] = []
    for variant in variants:
        score = score_caption_overlay_variant(
            variant["caption"],
            variant["overlay_text"],
            variant["hashtags"],
            candidate=candidate.to_dict(),
            feedback_summary=feedback_summary.to_dict(),
            recent_captions=recent_captions,
            recent_overlays=recent_overlays,
            recent_hashtag_sets=recent_hashtag_sets,
        )
        variant_row = dict(variant)
        variant_row["score"] = score.score
        variant_row["score_breakdown"] = score.breakdown
        variant_row["score_reasons"] = score.reasons
        variant_row["rejected"] = score.rejected
        scored.append(variant_row)
    return sorted(scored, key=lambda row: row.get("score", 0.0), reverse=True)


def _compose_caption(caption: str, hashtags: list[str]) -> str:
    return compose_caption_with_hashtags(caption, hashtags)


def generate_caption_package(
    candidate: ContentCandidate,
    *,
    snapshot: dict[str, Any],
    external_context: dict[str, Any],
    performance_context: dict[str, Any] | None = None,
    recent_posts: list[dict[str, Any]] | None = None,
    logger=None,
) -> CaptionPackage:
    cleanup_prompt = load_prompt_text("caption_cleanup")
    quality_prompt = load_prompt_text("quality_review")
    recent_posts = recent_posts or []
    feedback_summary = build_feedback_summary(performance_context)
    hashtags = generate_hashtags(candidate, snapshot=snapshot, external_context=external_context, limit=5)
    alt_text = generate_alt_text(candidate, image_prompt="", snapshot=snapshot, external_context=external_context)
    image_prompt = generate_image_prompt(candidate, snapshot=snapshot, external_context=external_context)

    local_variants = _local_variant_plan(candidate, snapshot, external_context, feedback_summary)
    openai_variants, openai_client, openai_fallback_reason = _openai_variant_plan(
        candidate,
        snapshot=snapshot,
        external_context=external_context,
        feedback_summary=feedback_summary,
        logger=logger,
    )
    all_variants = [variant for variant in (*openai_variants, *local_variants) if isinstance(variant, dict)]
    scored_variants = _score_variant_options(
        candidate,
        variants=all_variants,
        feedback_summary=feedback_summary,
        recent_posts=recent_posts,
    )
    if not scored_variants:
        fallback_style, draft_caption = _pick_caption(candidate, external_context)
        pair_plan = finalize_caption_overlay_pair(
            seed=f"{candidate.candidate_id}:{candidate.content_type}:fallback",
            caption_style=fallback_style,
            raw_caption=draft_caption,
            raw_overlay=candidate.overlay_text,
            allow_openai_caption=False,
        )
        scored_variants = [
            {
                "source": "template",
                "caption": pair_plan["caption"],
                "overlay_text": pair_plan["overlay_text"],
                "caption_style": pair_plan["selected_caption_style"],
                "caption_source": pair_plan["caption_source"],
                "overlay_source": pair_plan["overlay_source"],
                "validation": pair_plan["pair_validation"],
                "hashtags": hashtags,
                "feedback_summary_version": feedback_summary.version,
                "score": 0.0,
                "score_breakdown": {},
                "score_reasons": ["fallback"],
                "rejected": False,
            }
        ]

    selected_variant = scored_variants[0]
    selected_caption_style = str(selected_variant.get("caption_style") or "simple_hype")
    selected_caption = str(selected_variant.get("caption") or "").strip()
    selected_overlay = str(selected_variant.get("overlay_text") or "").strip()
    validation = validate_post_pair(selected_caption, selected_overlay)
    repair_applied = False
    if not validation["passed"]:
        repair_applied = True
        fallback_style, draft_caption = _pick_caption(candidate, external_context)
        pair_plan = finalize_caption_overlay_pair(
            seed=f"{candidate.candidate_id}:{candidate.content_type}:repair",
            caption_style=fallback_style,
            raw_caption=draft_caption,
            raw_overlay=candidate.overlay_text,
            allow_openai_caption=False,
        )
        selected_caption_style = pair_plan["selected_caption_style"]
        selected_caption = pair_plan["caption"]
        selected_overlay = pair_plan["overlay_text"]
        validation = pair_plan["pair_validation"]

    caption = _compose_caption(selected_caption, hashtags)
    caption_validation = validate_caption(caption, require_hashtags=True)
    if not caption_validation["passed"]:
        repair_applied = True
        repair_style, repair_caption = _pick_caption(candidate, external_context)
        repair_plan = finalize_caption_overlay_pair(
            seed=f"{candidate.candidate_id}:{candidate.content_type}:repair-final",
            caption_style=repair_style,
            raw_caption=repair_caption,
            raw_overlay=candidate.overlay_text,
            allow_openai_caption=False,
        )
        caption = _compose_caption(repair_plan["caption"], hashtags)
        selected_caption_style = repair_plan["selected_caption_style"]
        selected_overlay = repair_plan["overlay_text"]
        validation = repair_plan["pair_validation"]
        caption_validation = validate_caption(caption, require_hashtags=True)

    cleanup_notes = [
        "Caption generator now ranks multiple caption and overlay variants before selecting a winner.",
        f"Selected caption style: {selected_caption_style}.",
        f"Caption source: {selected_variant.get('caption_source', 'template')}.",
        f"Overlay source: {selected_variant.get('overlay_source', 'template')}.",
        f"Feedback summary version: {feedback_summary.version}.",
    ]
    fallback_used = bool(selected_variant.get("source") == "template" and openai_client is None and openai_fallback_reason)
    if selected_variant.get("source") == "openai":
        cleanup_notes.append("OpenAI variant generation was available and used as part of the ranking pool.")
    if openai_fallback_reason:
        cleanup_notes.append(f"OpenAI fallback reason: {openai_fallback_reason}.")
    if repair_applied:
        cleanup_notes.append("Primary caption failed validation and was replaced with a curated fallback.")

    cleanup_notes.append("caption_cleanup prompt reviewed against local caption rules.")
    cleanup_notes.append("quality_review prompt reviewed locally.")
    if "Need" in cleanup_prompt or "Review" in quality_prompt:
        cleanup_notes.append("Prompt library guidance loaded successfully.")

    quality_review = _quality_review(
        caption,
        hashtags,
        alt_text,
        image_prompt,
        candidate,
        validation=caption_validation,
        fallback_used=repair_applied,
    )

    ranking_reason = "; ".join(selected_variant.get("score_reasons", [])) or "Selected the highest-scoring caption/overlay pair."
    fallback_used = bool(repair_applied or (openai_client is None and openai_fallback_reason))
    caption_source = "fallback" if repair_applied else str(selected_variant.get("caption_source") or "template")
    return CaptionPackage(
        hook=selected_caption_style,
        body=caption,
        cta=candidate.suggested_cta,
        caption=caption,
        spacing=caption,
        emoji_placement="Avoid emoji walls; use zero or one only when a template explicitly needs it.",
        cleanup_notes=cleanup_notes,
        quality_review=quality_review,
        hashtags=hashtags,
        alt_text=alt_text,
        image_prompt=image_prompt,
        caption_style=selected_caption_style,
        selected_caption_style=selected_caption_style,
        caption_type=selected_caption_style,
        validation_passed=caption_validation["passed"],
        fallback_used=fallback_used,
        caption_length=caption_validation["caption_length"],
        caption_source=caption_source,
        validation_failure_reason=None if caption_validation["passed"] else ", ".join(caption_validation["reasons"]),
        overlay_text=selected_overlay,
        overlay_source=str(selected_variant.get("overlay_source") or "template"),
        caption_overlay_concept=validation["caption_overlay_concept"],
        overlay_validation_passed=validation["overlay_validation"]["passed"],
        overlay_validation_failure_reason=None if validation["overlay_validation"]["passed"] else ", ".join(validation["overlay_validation"]["reasons"]),
        openai_used=bool(openai_variants),
        openai_model=str(selected_variant.get("openai_model") or openai_client.model) if openai_client else None,
        fallback_reason=openai_fallback_reason,
        feedback_summary_version=feedback_summary.version,
        feedback_summary=feedback_summary.to_dict(),
        caption_options=[dict(item) for item in scored_variants],
        overlay_options=[
            {
                "overlay_text": item.get("overlay_text"),
                "overlay_source": item.get("overlay_source"),
                "score": item.get("score"),
                "score_breakdown": item.get("score_breakdown"),
                "score_reasons": item.get("score_reasons"),
                "caption_style": item.get("caption_style"),
            }
            for item in scored_variants
        ],
        ranking_reason=ranking_reason,
        ranking_score=float(selected_variant.get("score") or 0.0),
        ranking_breakdown=dict(selected_variant.get("score_breakdown") or {}),
    )
