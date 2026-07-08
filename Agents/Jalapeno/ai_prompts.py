from __future__ import annotations

from functools import lru_cache
from typing import Any

from caption_rules import CAPTION_STYLE_ORDER, style_guidance
from prompt_library_loader import PROMPT_LIBRARY_VERSION, load_prompt_library, load_prompt_text


DEFAULT_BRAND_RULES: dict[str, Any] = {
    "tone": [
        "fun",
        "lightly sarcastic",
        "wing-obsessed",
        "community-focused",
        "not mean",
        "not corporate",
        "avoid generic AI marketing copy",
    ],
    "must_not": [
        "No politics",
        "No tragedy or current disaster jokes",
        "No offensive stereotypes",
        "No sexual content",
        "No hate or harassment",
        "No private user info",
        "No opted-out user references",
        "No fake claims about Buffago metrics",
        "No fake restaurant endorsements",
        "No alcohol-centered content unless intentionally allowed later",
    ],
    "must": [
        "Stay funny, positive, local, and food-first",
        "Keep the voice Buffago-branded",
        "Prefer real restaurant, crawl, or wing-related signals over generic filler",
    ],
}


def _brand_rules_text(brand_rules: dict[str, Any] | None = None) -> str:
    rules = brand_rules or DEFAULT_BRAND_RULES
    tone = "\n".join(f"- {item}" for item in rules.get("tone", []))
    must_not = "\n".join(f"- {item}" for item in rules.get("must_not", []))
    must = "\n".join(f"- {item}" for item in rules.get("must", []))
    return f"Tone:\n{tone}\n\nMust not:\n{must_not}\n\nMust:\n{must}"


@lru_cache(maxsize=1)
def load_prompt_bundle() -> dict[str, str]:
    return load_prompt_library()


def _prompt_sections(*keys: str) -> str:
    bundle = load_prompt_bundle()
    return "\n\n".join(bundle[key] for key in keys if key in bundle)


def _slot_prompt(content_slot: str) -> str:
    if content_slot == "meme_post":
        return load_prompt_text("meme")
    return load_prompt_text("buffago_post")


def _caption_style_system_text() -> str:
    lines = [f"- {style}: {style_guidance(style)}" for style in CAPTION_STYLE_ORDER]
    return "\n".join(lines)


def build_brand_validation_prompt(
    *,
    request_type: str,
    content_slot: str,
    internal_snapshot: dict[str, Any],
    external_context: dict[str, Any],
    brand_rules: dict[str, Any] | None = None,
) -> str:
    return (
        "You are Jalapeno's brand safety validator. Review the request context only, not raw private identifiers. "
        "Return the safest possible assessment for Buffago's Instagram voice.\n\n"
        f"Prompt library version: {PROMPT_LIBRARY_VERSION}\n\n"
        f"{_prompt_sections('brand', 'voice', 'content_rules', 'banned_phrases', 'quality_review')}\n\n"
        f"Request type: {request_type}\n"
        f"Content slot: {content_slot}\n\n"
        f"Brand rules:\n{_brand_rules_text(brand_rules)}\n\n"
        f"Privacy-safe internal snapshot:\n{internal_snapshot}\n\n"
        f"Privacy-safe external context:\n{external_context}\n\n"
        "Checks required:\n"
        "- No politics\n"
        "- No tragedy or current disaster jokes\n"
        "- No offensive stereotypes\n"
        "- No sexual content\n"
        "- No hate or harassment\n"
        "- No private user info\n"
        "- No opted-out user references\n"
        "- No fake claims about Buffago metrics\n"
        "- No fake restaurant endorsements\n"
        "- No alcohol-centered content unless intentionally allowed later\n"
        "- Tone should be funny, positive, local, food-first, and Buffago-branded\n\n"
        "If anything is questionable, mark it as risky and explain why."
    )


def build_text_generation_prompt(
    *,
    content_slot: str,
    internal_snapshot: dict[str, Any],
    external_context: dict[str, Any],
    brand_rules: dict[str, Any] | None = None,
) -> str:
    slot_prompt = _slot_prompt(content_slot)
    return (
        "You are Jalapeno, Buffago's Instagram agent. Generate a ready-to-post caption package. "
        "Keep the voice wing-specific, short, playful, human, community-focused, not mean, not corporate, and never generic AI marketing copy.\n\n"
        f"Prompt library version: {PROMPT_LIBRARY_VERSION}\n\n"
        f"{_prompt_sections('brand', 'voice', 'content_rules', 'banned_phrases', 'required_ctas')}\n\n"
        f"Slot prompt:\n{slot_prompt}\n\n"
        f"Content slot: {content_slot}\n\n"
        f"Brand rules:\n{_brand_rules_text(brand_rules)}\n\n"
        f"Privacy-safe internal snapshot:\n{internal_snapshot}\n\n"
        f"Privacy-safe external context:\n{external_context}\n\n"
        "Use only the provided context. Do not invent metrics, endorsements, or private user details. "
        "Write a strong caption, a focused image prompt, and concise helper metadata.\n\n"
        "Caption rules:\n"
        "- Caption must stay in Buffago's lane: wings, wing night, sauce, crispiness, cravings, ordering wings, friends, crew, or the group chat\n"
        "- Usually 1 sentence, max 2 short sentences\n"
        "- Keep the caption under 160 characters unless the context absolutely requires more\n"
        "- Make it sound naturally shareable with prompts like Send this to..., Tag..., Share this with..., Comment..., or Save this for wing night\n"
        "- Use exactly one of these caption styles as the lane for the caption:\n"
        f"{_caption_style_system_text()}\n"
        "- Do not be clever\n"
        "- Do not use internet slang\n"
        "- Do not personify wings, plates, photos, or posts\n"
        "- Do not use metaphor joke formats\n"
        "- Write one simple shareable wing caption\n"
        "- Prefer tag/send/comment/share prompts\n"
        "- Keep under 120 characters when possible\n"
        "- Mention or clearly imply wings, wing night, sauce, flats/drums, cravings, friends, group chat, or someone owing wings\n"
        "- Hashtags must stay separate from the caption field\n"
        "- Do not include literal \\n in the caption\n"
        "- Do not use understood the assignment, main character energy, vibes are immaculate, POV unless it literally makes sense, or random slang that could fit any food post\n"
        "- Do not write captions that are generic, overly clever, corporate, or unrelated to wings\n"
        "- Do not sound like a random meme account, a chain restaurant ad, or a generic foodie page\n"
        "- Avoid captions that could work for pizza, burgers, tacos, or any plate with no changes\n"
        "- Prefer direct, plain wording over clever nonsense"
    )


def build_image_prompt_prompt(
    *,
    content_slot: str,
    internal_snapshot: dict[str, Any],
    external_context: dict[str, Any],
    brand_rules: dict[str, Any] | None = None,
) -> str:
    return (
        "You are Jalapeno, Buffago's Instagram creative director. Generate a production-ready image prompt, not the image itself. "
        "Keep the result local, food-first, visually specific, and Buffago-branded.\n\n"
        f"Prompt library version: {PROMPT_LIBRARY_VERSION}\n\n"
        f"{_prompt_sections('brand', 'voice', 'content_rules', 'banned_phrases', 'image_generation')}\n\n"
        f"Content slot: {content_slot}\n\n"
        f"Brand rules:\n{_brand_rules_text(brand_rules)}\n\n"
        f"Privacy-safe internal snapshot:\n{internal_snapshot}\n\n"
        f"Privacy-safe external context:\n{external_context}\n\n"
        "Avoid politics, tragedy, offensive stereotypes, sexual content, hate, harassment, private user info, opted-out references, fake metrics, fake endorsements, and alcohol-centered framing."
    )
