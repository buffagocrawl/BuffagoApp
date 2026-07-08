from __future__ import annotations

import random
import re
from typing import Any


CAPTION_STYLE_ORDER = (
    "send_to_friend",
    "tag_someone",
    "wing_debt",
    "group_chat",
    "craving_prompt",
    "sauce_debate",
    "wing_night",
    "simple_hype",
    "comment_prompt",
)

CAPTION_STYLE_TEMPLATES: dict[str, tuple[str, ...]] = {
    "send_to_friend": (
        "Send this to someone who owes you wings.",
        "Share this with someone who needs a wing night.",
        "Send this to your wing night crew.",
        "Send this to someone who would say yes immediately.",
        "Share this with the friend who never says no to wings.",
    ),
    "tag_someone": (
        "Tag the friend who would destroy this plate.",
        "Tag the friend who says they're only having one wing.",
        "Tag the person who always orders extra ranch.",
        "Tag the blue cheese defender.",
        "Tag your wing night MVP.",
    ),
    "wing_debt": (
        "If they don't answer in 10 minutes, they owe you wings.",
        "If they ignore this, they're buying wings.",
        "Someone in your group chat owes you a wing night.",
        "If they flake on wing night again, they owe the whole table wings.",
        "You can settle a lot with one properly funded wing night.",
    ),
    "group_chat": (
        "Send this to the group chat and see who folds first.",
        "Someone in your group chat needs wings.",
        "The only group chat decision that matters: wings.",
        "Your group chat needs this kind of pressure.",
        "This plate needs a wing crew.",
    ),
    "craving_prompt": (
        "If this made you hungry, send it to the person you're blaming.",
        "This is your sign to order wings.",
        "Share this with someone who needs a wing night.",
        "Save this for your next wing run.",
        "This is your sign to plan wings.",
    ),
    "sauce_debate": (
        "Tag someone who takes sauce choice way too seriously.",
        "Comment your sauce pick.",
        "Comment your go-to wing order.",
        "Comment the sauce order you would not let your friends mess up.",
        "The answer is wings. The only question is sauce.",
    ),
    "wing_night": (
        "Wing night is calling.",
        "Save this for wing night.",
        "Send this to your wing night crew.",
        "This is your sign to plan wings.",
        "Crispy wings deserve witnesses.",
    ),
    "simple_hype": (
        "Crispy wings deserve witnesses.",
        "Someone you know needs these wings.",
        "Hot wings, no small talk.",
        "The answer is wings.",
        "These wings are not here to be ignored.",
    ),
    "comment_prompt": (
        "Comment flats or drums.",
        "Comment your go-to wing order.",
        "Comment your sauce pick.",
        "Comment the sauce order you would not let your friends mess up.",
        "Comment if you're team flats or team drums.",
    ),
}

CURATED_FALLBACK_CAPTIONS = (
    "Send this to someone who owes you wings.",
    "Tag the friend who would destroy this plate.",
    "If they don't answer in 10 minutes, they owe you wings.",
    "Share this with someone who needs a wing night.",
    "This is your sign to order wings.",
    "Tag someone who takes sauce choice way too seriously.",
    "Send this to the group chat and see who folds first.",
    "Wing night is calling.",
    "Save this for your next wing run.",
    "Someone you know needs these wings.",
    "Comment your go-to wing order.",
    "Tag the person who always says they're only having one.",
    "Send this to your wing night crew.",
    "Crispy, saucy, dangerous.",
    "The group chat needs a wing night.",
)

BANNED_GENERIC_PHRASES = (
    "understood the assignment",
    "main character energy",
    "vibes are immaculate",
    "pov",
    "it's giving",
    "it’s giving",
    "its giving",
    "no crumbs",
    "rent free",
    "core memory",
    "era",
    "lowkey",
    "highkey",
    "chose violence",
    "if this wing had",
    "if this plate had",
    "if this post had",
    "had a voicemail",
    "left a voicemail",
    "called and said",
    "texted and said",
    "this wing called",
    "this plate called",
    "this post called",
    "bring napkins",
    "game changer",
    "foodie fam",
    "must try",
    "you need this",
    "epic",
    "literally",
    "obsessed",
    "chef's kiss",
    "this slaps",
    "craving unlocked",
    "internet is broken",
    "living rent free",
    "sheesh",
    "no notes",
    "elite",
    "midweek mood",
)

CAPTION_STYLE_GUIDANCE: dict[str, str] = {
    "send_to_friend": "Direct send/share CTA aimed at a specific friend, wing split, or plate reaction.",
    "tag_someone": "Tag a recognizable wing personality or friend behavior tied to the plate.",
    "wing_debt": "Play around owing someone wings, getting ghosted, or settling plans with wings.",
    "craving_prompt": "Short craving-led prompt that pushes ordering, saving, or acting on wing hunger.",
    "group_chat": "Make the group chat, crew, or planning thread the joke and the CTA.",
    "sauce_debate": "Invite comments, tags, or debate around sauce choice, flats, drums, ranch, or order style.",
    "wing_night": "Wing-night planning energy with a clear food-first hook.",
    "simple_hype": "Minimal wing-specific hype with one strong image or reaction and no random slang.",
    "comment_prompt": "A direct comment prompt that is short, obvious, and easy to answer.",
}

PRIMARY_WING_SIGNAL_PATTERNS = (
    r"\bwing\b",
    r"\bwings\b",
    r"\bwing night\b",
    r"\bwing run\b",
    r"\bsauce\b",
    r"\bsaucy\b",
    r"\bflats\b",
    r"\bdrums\b",
    r"\branch\b",
    r"\bblue cheese\b",
    r"\bbuffalo\b",
)

SUPPORTING_SIGNAL_PATTERNS = (
    r"\bcraving\b",
    r"\bhungry\b",
    r"\bgroup chat\b",
    r"\bfriend\b",
    r"\bcrew\b",
    r"\bplate\b",
    r"\border\b",
    r"\bsplit\b",
    r"\bowe\b",
    r"\bowes\b",
    r"\btag\b",
    r"\bsend\b",
    r"\bshare\b",
    r"\bcomment\b",
    r"\bsave\b",
    r"\bdebate\b",
)

PERSONIFICATION_PATTERNS = (
    r"\bif this (?:wing|plate|post|photo) had\b",
    r"\bhad a voicemail\b",
    r"\bleft a voicemail\b",
    r"\bcalled and said\b",
    r"\btexted and said\b",
    r"\bthis (?:wing|plate|post|photo) called\b",
)


def normalize_caption_text(text: str) -> str:
    cleaned = text.replace("’", "'").replace("\\n", " ").replace("\r", " ").replace("\n", " ")
    cleaned = re.sub(r"\s+", " ", cleaned)
    cleaned = re.sub(r"\s+([?.!,])", r"\1", cleaned)
    cleaned = re.sub(r"([?.!,])([A-Za-z])", r"\1 \2", cleaned)
    return cleaned.strip()


def style_templates(style: str) -> tuple[str, ...]:
    return CAPTION_STYLE_TEMPLATES.get(style, CAPTION_STYLE_TEMPLATES["simple_hype"])


def style_guidance(style: str) -> str:
    return CAPTION_STYLE_GUIDANCE.get(style, CAPTION_STYLE_GUIDANCE["simple_hype"])


def pick_caption_for_style(style: str, *, seed: str) -> str:
    options = style_templates(style)
    return options[random.Random(seed).randrange(len(options))]


def choose_caption_style(*, seed: str, allowed_styles: list[str] | None = None) -> str:
    styles = [style for style in (allowed_styles or list(CAPTION_STYLE_ORDER)) if style in CAPTION_STYLE_TEMPLATES]
    if not styles:
        styles = list(CAPTION_STYLE_ORDER)
    return styles[random.Random(f"{seed}:style").randrange(len(styles))]


def pick_fallback_caption(*, seed: str, allowed_styles: list[str] | None = None) -> tuple[str, str]:
    style = choose_caption_style(seed=seed, allowed_styles=allowed_styles)
    return style, pick_caption_for_style(style, seed=f"{seed}:caption")


CURATED_CAPTION_LOOKUP = {normalize_caption_text(caption).lower() for caption in CURATED_FALLBACK_CAPTIONS}
for _style_templates in CAPTION_STYLE_TEMPLATES.values():
    for _caption in _style_templates:
        CURATED_CAPTION_LOOKUP.add(normalize_caption_text(_caption).lower())


def _emoji_count(text: str) -> int:
    return sum(1 for char in text if ord(char) >= 0x1F300)


def validate_caption(
    caption: str,
    *,
    max_length: int = 160,
    allow_longer: bool = False,
) -> dict[str, Any]:
    issues: list[str] = []
    normalized = normalize_caption_text(caption)
    lowered = normalized.lower()
    is_curated = lowered in CURATED_CAPTION_LOOKUP

    if not normalized:
        issues.append("empty_caption")
    if not allow_longer and len(normalized) > max_length:
        issues.append(f"caption_too_long:{len(normalized)}")
    if "\\n" in caption:
        issues.append("literal_newline_escape_present")
    if normalized != caption and "\\n" not in caption and ("\n" in caption or "\r" in caption):
        issues.append("contains_actual_newlines")

    for phrase in BANNED_GENERIC_PHRASES:
        if phrase == "pov":
            if re.search(r"\bpov\b", lowered):
                issues.append(f"banned_phrase:{phrase}")
        elif phrase in lowered:
            issues.append(f"banned_phrase:{phrase}")

    for pattern in PERSONIFICATION_PATTERNS:
        if re.search(pattern, lowered):
            issues.append("personifies_wing_or_plate")
            break

    has_primary_signal = any(re.search(pattern, lowered) for pattern in PRIMARY_WING_SIGNAL_PATTERNS)
    has_supporting_signal = any(re.search(pattern, lowered) for pattern in SUPPORTING_SIGNAL_PATTERNS)
    has_friend_or_group_cta = any(
        re.search(pattern, lowered)
        for pattern in (r"\bgroup chat\b", r"\bfriend\b", r"\bcrew\b", r"\bplate\b", r"\border\b", r"\bowe\b", r"\bowes\b")
    )

    if not is_curated and not has_primary_signal and not has_supporting_signal:
        issues.append("missing_buffago_signal")
    if not is_curated and not has_primary_signal and not has_friend_or_group_cta:
        issues.append("missing_wing_specificity")
    if not is_curated and not has_primary_signal and not has_supporting_signal:
        issues.append("too_abstract_or_generic")
    if normalized.count(".") + normalized.count("!") + normalized.count("?") > 2:
        issues.append("too_many_sentences")
    if "#" in normalized:
        issues.append("hashtags_belong_outside_caption")
    if _emoji_count(normalized) > 2:
        issues.append("too_many_emojis")

    validation_passed = not issues
    return {
        "valid": validation_passed,
        "passed": validation_passed,
        "issues": issues,
        "reasons": issues,
        "normalized_caption": normalized,
        "caption_length": len(normalized),
        "caption_source": "template" if is_curated else "openai",
    }


def finalize_caption(
    *,
    seed: str,
    style: str | None = None,
    raw_caption: str | None = None,
    allowed_styles: list[str] | None = None,
    allow_openai_caption: bool = False,
) -> dict[str, Any]:
    selected_style = style or choose_caption_style(seed=seed, allowed_styles=allowed_styles)
    if selected_style not in CAPTION_STYLE_TEMPLATES:
        selected_style = choose_caption_style(seed=seed, allowed_styles=allowed_styles)

    curated_caption = pick_caption_for_style(selected_style, seed=f"{seed}:caption")
    curated_validation = validate_caption(curated_caption)
    raw_validation = validate_caption(raw_caption) if isinstance(raw_caption, str) and raw_caption.strip() else None

    if allow_openai_caption and raw_validation and raw_validation["valid"]:
        normalized_raw = raw_validation["normalized_caption"]
        if normalized_raw.lower() in CURATED_CAPTION_LOOKUP:
            return {
                "caption": normalized_raw,
                "caption_source": "openai",
                "selected_caption_style": selected_style,
                "validation_passed": True,
                "validation_failure_reason": None,
                "fallback_used": False,
                "validation": raw_validation,
            }

    source = "fallback" if raw_caption and raw_validation and not raw_validation["valid"] else "template"
    return {
        "caption": curated_validation["normalized_caption"],
        "caption_source": source,
        "selected_caption_style": selected_style,
        "validation_passed": curated_validation["valid"],
        "validation_failure_reason": None if curated_validation["valid"] else ", ".join(curated_validation["reasons"]),
        "fallback_used": source == "fallback",
        "validation": curated_validation,
    }


def generate_caption_samples(*, count: int = 20, seed: str = "caption-samples") -> list[dict[str, Any]]:
    samples: list[dict[str, Any]] = []
    for index in range(count):
        style = CAPTION_STYLE_ORDER[index % len(CAPTION_STYLE_ORDER)]
        finalized = finalize_caption(
            seed=f"{seed}:{index}",
            style=style,
            allowed_styles=[style],
            allow_openai_caption=False,
        )
        samples.append(
            {
                "caption": finalized["caption"],
                "style": finalized["selected_caption_style"],
                "source": finalized["caption_source"],
                "validation": {
                    "valid": finalized["validation_passed"],
                    "reasons": finalized["validation"]["reasons"],
                    "caption_length": finalized["validation"]["caption_length"],
                },
            }
        )
    return samples
