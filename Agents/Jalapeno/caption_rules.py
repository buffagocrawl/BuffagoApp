from __future__ import annotations

import random
import re
from typing import Any


# Shared caption rules for both local content-engine captions and AI fallbacks.
CAPTION_STYLE_ORDER = (
    "send_to_friend",
    "tag_someone",
    "wing_debt",
    "craving_prompt",
    "group_chat",
    "sauce_debate",
    "weekend_wings",
    "simple_hype",
)

CAPTION_STYLE_TEMPLATES: dict[str, tuple[str, ...]] = {
    "send_to_friend": (
        "Send this to someone who owes you wings.",
        "Share this with someone who would destroy this plate.",
        "Send this to the person you'd split these wings with.",
        "Share this with the friend who never says no to wings.",
    ),
    "tag_someone": (
        "Tag the friend who says they're only having one wing.",
        "Tag someone who takes sauce choice way too seriously.",
        "Tag the friend who would clear this plate fast.",
        "Tag the person who always orders extra ranch with wings.",
    ),
    "wing_debt": (
        "If they don't respond in 10 minutes, they owe you wings.",
        "Someone in your contacts owes you a wing night.",
        "This plate just added one more wing debt to the group chat.",
        "If they flake on wing night again, they owe the whole table wings.",
    ),
    "craving_prompt": (
        "If this made you hungry, you know what to do.",
        "This is your sign to order wings.",
        "Save this for the next wing craving.",
        "Craving wings now is the correct reaction.",
    ),
    "group_chat": (
        "Someone in your group chat needs to see these wings.",
        "Send this to the group chat and see who folds first.",
        "The group chat needs a wing night.",
        "Drop this in the group chat and start the wing plan.",
    ),
    "sauce_debate": (
        "Comment your go-to wing order.",
        "Tag someone who thinks sauce choice is a personality trait.",
        "Comment the sauce pick you'd defend with your life.",
        "This is a flats, drums, and sauce debate waiting to happen.",
    ),
    "weekend_wings": (
        "Weekend wings were always the plan.",
        "Save this for wing night.",
        "This is your sign to plan a wing night.",
        "Friday, Saturday, or Sunday, wings still win.",
    ),
    "simple_hype": (
        "Wing night is calling.",
        "Someone you know needs these wings.",
        "Crispy, saucy, dangerous.",
        "These wings are not here to be ignored.",
    ),
}

CURATED_FALLBACK_CAPTIONS = (
    "Send this to someone who owes you wings.",
    "Tag the friend who would destroy this plate.",
    "If they don't respond in 10 minutes, they owe you wings.",
    "Share this with someone who needs a wing night.",
    "This is your sign to order wings.",
    "Tag someone who takes sauce choice seriously.",
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
)

WING_SIGNAL_PATTERNS = (
    r"\bwing\b",
    r"\bwings\b",
    r"\bwing night\b",
    r"\bwing run\b",
    r"\bsauce\b",
    r"\bsaucy\b",
    r"\bcrispy\b",
    r"\bcraving\b",
    r"\bhungry\b",
    r"\bgroup chat\b",
    r"\bfriend\b",
    r"\bcrew\b",
)


def normalize_caption_text(text: str) -> str:
    cleaned = text.replace("\\n", " ").replace("\r", " ").replace("\n", " ")
    cleaned = re.sub(r"\s+", " ", cleaned)
    cleaned = re.sub(r"\s+([?.!,])", r"\1", cleaned)
    cleaned = re.sub(r"([?.!,])([A-Za-z])", r"\1 \2", cleaned)
    return cleaned.strip()


def style_templates(style: str) -> tuple[str, ...]:
    return CAPTION_STYLE_TEMPLATES.get(style, CAPTION_STYLE_TEMPLATES["simple_hype"])


def pick_caption_for_style(style: str, *, seed: str) -> str:
    options = style_templates(style)
    return options[random.Random(seed).randrange(len(options))]


def pick_fallback_caption(*, seed: str, allowed_styles: list[str] | None = None) -> tuple[str, str]:
    styles = [style for style in (allowed_styles or list(CAPTION_STYLE_ORDER)) if style in CAPTION_STYLE_TEMPLATES]
    if not styles:
        styles = list(CAPTION_STYLE_ORDER)
    style = styles[random.Random(f"{seed}:style").randrange(len(styles))]
    return style, pick_caption_for_style(style, seed=f"{seed}:caption")


def validate_caption(
    caption: str,
    *,
    max_length: int = 160,
    allow_longer: bool = False,
) -> dict[str, Any]:
    issues: list[str] = []
    normalized = normalize_caption_text(caption)
    lowered = normalized.lower()
    original_lowered = caption.lower()

    if not allow_longer and len(normalized) > max_length:
        issues.append(f"caption_too_long:{len(normalized)}")
    if "\\n" in caption:
        issues.append("literal_newline_escape_present")
    for phrase in BANNED_GENERIC_PHRASES:
        if phrase == "pov":
            if re.search(r"\bpov\b", lowered):
                issues.append(f"banned_phrase:{phrase}")
        elif phrase in lowered:
            issues.append(f"banned_phrase:{phrase}")
    if not any(re.search(pattern, lowered) for pattern in WING_SIGNAL_PATTERNS):
        issues.append("missing_wing_signal")
    if normalized.count(".") + normalized.count("!") + normalized.count("?") > 2:
        issues.append("too_many_sentences")
    if not normalized:
        issues.append("empty_caption")
    if normalized != caption and "\\n" not in caption and ("\n" in caption or "\r" in caption):
        issues.append("contains_actual_newlines")
    if original_lowered != lowered and "\\n" in caption:
        pass
    return {
        "passed": not issues,
        "issues": issues,
        "normalized_caption": normalized,
        "caption_length": len(normalized),
    }
