from __future__ import annotations

import random
import re
from typing import Any


SHAREABLE_FOOD_POST_RULES = (
    "Every Buffago post should feel like something a user would send, tag, comment on, debate, or use to make wing plans.",
    "Use direct social triggers: send this, tag a friend, settle flats versus drums, debate sauce or heat, make wing plans, or challenge someone.",
    "Ban surreal AI joke formats, wing personification, abstract punchlines, and unrelated meme language.",
    "Image text should usually be 3 to 8 words and no more than two short lines.",
    "Caption and image text must work together as one post and point at the same social action or debate.",
)

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
        "Send this to your wing night crew.",
        "Share this with the friend who never says no to wings.",
        "Send this to the person picking dinner tonight.",
        "Share this with the one who is always down for wings.",
    ),
    "tag_someone": (
        "Tag the friend who would destroy this plate.",
        "Tag the friend who never says no to wings.",
        "Tag the person who always orders extra ranch.",
        "Tag your wing night MVP.",
        "Tag the friend you would split this with.",
    ),
    "wing_debt": (
        "If they don't answer in 10 minutes, they owe you wings.",
        "If they ignore this, they're buying wings.",
        "First reply buys the wings.",
        "Send this and start the timer.",
        "If they flake again, they owe the whole table wings.",
    ),
    "group_chat": (
        "Send this to the group chat and see who folds first.",
        "Send this to the group chat right now.",
        "Send this to the group chat right now.",
        "Send this to the group chat and start the timer.",
        "Drop this in the group chat and wait.",
    ),
    "craving_prompt": (
        "This is your sign to get wings.",
        "Cancel your plans. Get wings.",
        "This is your sign to plan wing night.",
        "Save this for the next wing run.",
        "Send this to the person you're getting wings with.",
    ),
    "sauce_debate": (
        "Flats or drums. Pick a side.",
        "Comment your sauce pick.",
        "Settle the sauce debate in the comments.",
        "Tag someone who takes sauce choice way too seriously.",
        "How hot is too hot? Comment your answer.",
    ),
    "wing_night": (
        "Who's down for wing night?",
        "Send this to whoever is down for wing night.",
        "Make the plans. Get wings.",
        "Send this to your wing crew.",
        "Who is pulling up for wings?",
    ),
    "simple_hype": (
        "Who is eating this with you?",
        "Send this to your wing crew.",
        "Who is pulling up for wings?",
        "Make the plans. Get wings.",
        "Drop your order in the comments.",
    ),
    "comment_prompt": (
        "Comment flats or drums.",
        "Drop your go-to sauce order.",
        "Settle it in the comments.",
        "Comment your heat level.",
        "Who gets the last wing? Comment below.",
    ),
}

OVERLAY_STYLE_TEMPLATES: dict[str, tuple[str, ...]] = {
    "send_to_friend": (
        "SEND THIS TO\nYOUR WING CREW",
        "SEND THIS TO\nTHE GROUP CHAT",
        "SEND THIS TO\nYOUR WING FRIEND",
    ),
    "tag_someone": (
        "WHO'S EATING\nTHIS WITH YOU?",
        "TAG YOUR\nWING MVP",
        "CALL OUT YOUR\nWING FRIEND",
    ),
    "wing_debt": (
        "IF THEY DON'T REPLY\nTHEY OWE WINGS",
        "FIRST REPLY\nBUYS THE WINGS",
        "START THE TIMER.\nWINGS ARE ON THEM.",
    ),
    "group_chat": (
        "GROUP CHAT\nWING CHECK",
        "SEND THIS TO\nTHE GROUP CHAT",
        "WHO'S DOWN FOR\nWING NIGHT?",
    ),
    "craving_prompt": (
        "CANCEL YOUR PLANS.\nGET WINGS.",
        "THIS IS YOUR SIGN.\nGET WINGS.",
        "MAKE THE PLANS.\nGET WINGS.",
    ),
    "sauce_debate": (
        "FLATS OR DRUMS?\nPICK A SIDE.",
        "RANCH OR\nBLUE CHEESE?",
        "HOW HOT IS\nTOO HOT?",
    ),
    "wing_night": (
        "WHO'S DOWN FOR\nWING NIGHT?",
        "WING NIGHT\nROLL CALL",
        "MAKE THE PLANS.\nGET WINGS.",
    ),
    "simple_hype": (
        "WHO'S PULLING UP?",
        "WING NIGHT\nROLL CALL",
        "SEND THIS TO\nYOUR WING CREW",
        "DROP YOUR\nORDER BELOW",
    ),
    "comment_prompt": (
        "FLATS OR DRUMS?",
        "DROP YOUR\nSAUCE ORDER",
        "SETTLE IT IN\nTHE COMMENTS",
    ),
}

CURATED_FALLBACK_CAPTIONS = (
    "Send this to someone who owes you wings.",
    "Tag the friend who would destroy this plate.",
    "If they don't answer in 10 minutes, they owe you wings.",
    "Share this with someone who needs a wing night.",
    "This is your sign to get wings.",
    "Tag someone who takes sauce choice way too seriously.",
    "Send this to the group chat and see who folds first.",
    "Who's down for wing night?",
    "Save this for the next wing run.",
    "Comment flats or drums.",
    "Send this to your wing night crew.",
    "Send this to the group chat right now.",
)

CURATED_FALLBACK_OVERLAYS = (
    "SEND THIS TO\nYOUR WING CREW",
    "WHO'S EATING\nTHIS WITH YOU?",
    "IF THEY DON'T REPLY\nTHEY OWE WINGS",
    "FLATS OR DRUMS?\nPICK A SIDE.",
    "CANCEL YOUR PLANS.\nGET WINGS.",
    "FIRST REPLY\nBUYS THE WINGS",
)

BANNED_GENERIC_PHRASES = (
    "understood the assignment",
    "main character",
    "main character energy",
    "vibes are immaculate",
    "pov",
    "it's giving",
    "itâ€™s giving",
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
    "voicemail",
    "called and said",
    "texted and said",
    "this wing called",
    "this plate called",
    "this post called",
    "had a job",
    "paid rent",
    "brought receipts",
    "illegal levels",
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
    "group_chat": "Make the group chat, crew, or planning thread the CTA.",
    "sauce_debate": "Invite comments, tags, or debate around sauce choice, flats, drums, ranch, or heat.",
    "wing_night": "Wing-night planning energy with a clear food-first hook.",
    "simple_hype": "Minimal wing-specific hype with one strong social prompt and no random slang.",
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
    r"\bowe\b",
    r"\bowes\b",
    r"\btag\b",
    r"\bsend\b",
    r"\bshare\b",
    r"\bcomment\b",
    r"\bsave\b",
    r"\bdebate\b",
    r"\bplans\b",
)

PERSONIFICATION_PATTERNS = (
    r"\bif this (?:wing|plate|post|photo) had\b",
    r"\bhad a voicemail\b",
    r"\bleft a voicemail\b",
    r"\bcalled and said\b",
    r"\btexted and said\b",
    r"\bthis (?:wing|plate|post|photo) called\b",
    r"\b(?:wing|wings|plate|sauce|post|photo)\s+(?:said|says|thinks|think|talks|talking|knows|knowing|wants|wanting|needs|needed|feels|feeling|understood)\b",
)

SOCIAL_ANGLE_PATTERNS: dict[str, tuple[str, ...]] = {
    "send_share": (r"\bsend\b", r"\bshare\b", r"\bgroup chat\b", r"\btext this\b"),
    "tag_callout": (r"\btag\b", r"\bfriend\b", r"\bcrew\b", r"\bwho(?:'s| is) eating\b", r"\bcall out\b", r"\bfirst @\b", r"@"),
    "debate": (r"\bflats\b", r"\bdrums\b", r"\bsauce\b", r"\bheat\b", r"\branch\b", r"\bblue cheese\b", r"\bpick a side\b", r"\bsettle it\b"),
    "plans": (r"\bwing night\b", r"\bget wings\b", r"\border wings\b", r"\bmake the plans\b", r"\bdown for wings\b", r"\bpulling up\b", r"\byour sign\b", r"\bsave\b"),
    "challenge": (r"\bowe\b", r"\bowes\b", r"\btimer\b", r"\breply\b", r"\b10 minutes\b", r"\bbuys the wings\b", r"\bbuying wings\b", r"\bchallenge\b", r"\bignore this\b"),
    "comment": (r"\bcomment\b", r"\bcomments\b", r"\bdrop your\b", r"\bpick a side\b"),
}

DIRECT_CTA_PATTERNS = (
    r"\bsend\b",
    r"\bshare\b",
    r"\btag\b",
    r"\bcomment\b",
    r"\bsave\b",
    r"\bdrop your\b",
    r"\bdrop this\b",
    r"\bpick a side\b",
    r"\bsettle\b",
    r"\bsettle it\b",
    r"\bwho(?:'s| is)\b",
    r"\bget wings\b",
    r"\bmake the plans\b",
    r"\byour sign\b",
    r"\broll call\b",
    r"\bbuys the wings\b",
    r"\bowe\b",
    r"\bignore this\b",
)


def normalize_caption_text(text: str) -> str:
    cleaned = text.replace("â€™", "'").replace("\\n", " ").replace("\r", " ").replace("\n", " ")
    cleaned = re.sub(r"\s+", " ", cleaned)
    cleaned = re.sub(r"\s+([?.!,])", r"\1", cleaned)
    cleaned = re.sub(r"([?.!,])([A-Za-z])", r"\1 \2", cleaned)
    return cleaned.strip()


def style_templates(style: str) -> tuple[str, ...]:
    return CAPTION_STYLE_TEMPLATES.get(style, CAPTION_STYLE_TEMPLATES["simple_hype"])


def style_overlay_templates(style: str) -> tuple[str, ...]:
    return OVERLAY_STYLE_TEMPLATES.get(style, OVERLAY_STYLE_TEMPLATES["simple_hype"])


def style_guidance(style: str) -> str:
    return CAPTION_STYLE_GUIDANCE.get(style, CAPTION_STYLE_GUIDANCE["simple_hype"])


def pick_caption_for_style(style: str, *, seed: str) -> str:
    options = style_templates(style)
    return options[random.Random(seed).randrange(len(options))]


def pick_overlay_for_style(style: str, *, seed: str) -> str:
    options = style_overlay_templates(style)
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

CURATED_OVERLAY_LOOKUP = {normalize_caption_text(overlay).lower() for overlay in CURATED_FALLBACK_OVERLAYS}
for _style_templates in OVERLAY_STYLE_TEMPLATES.values():
    for _overlay in _style_templates:
        CURATED_OVERLAY_LOOKUP.add(normalize_caption_text(_overlay).lower())


def _emoji_count(text: str) -> int:
    return sum(1 for char in text if ord(char) >= 0x1F300)


def _detect_social_angles(text: str) -> set[str]:
    lowered = normalize_caption_text(text).lower()
    matches: set[str] = set()
    for name, patterns in SOCIAL_ANGLE_PATTERNS.items():
        if any(re.search(pattern, lowered) for pattern in patterns):
            matches.add(name)
    return matches


def _has_direct_social_cta(text: str) -> bool:
    lowered = normalize_caption_text(text).lower()
    return any(re.search(pattern, lowered) for pattern in DIRECT_CTA_PATTERNS)


def _line_word_counts(text: str) -> list[int]:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    return [len(re.findall(r"[A-Za-z0-9@']+", line)) for line in lines]


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
    social_angles = _detect_social_angles(normalized)
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
    if not social_angles:
        issues.append("missing_social_share_angle")
    if not _has_direct_social_cta(normalized):
        issues.append("caption_not_direct_enough")
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
        "social_angles": sorted(social_angles),
    }


def validate_overlay_text(text: str, *, max_words: int = 8, preferred_min_words: int = 3) -> dict[str, Any]:
    issues: list[str] = []
    normalized = text.replace("\r", "\n").strip()
    normalized = re.sub(r"\n{3,}", "\n\n", normalized)
    normalized = re.sub(r"[ \t]+", " ", normalized)
    lowered = normalize_caption_text(normalized).lower()
    is_curated = lowered in CURATED_OVERLAY_LOOKUP
    lines = [line.strip() for line in normalized.splitlines() if line.strip()]
    word_count = len(re.findall(r"[A-Za-z0-9@']+", normalized))

    if not normalized:
        issues.append("empty_overlay_text")
    if len(lines) > 2:
        issues.append("overlay_too_many_lines")
    if word_count > max_words:
        issues.append(f"overlay_too_long:{word_count}")
    if 0 < word_count < preferred_min_words:
        issues.append(f"overlay_too_short:{word_count}")
    if any(count > 5 for count in _line_word_counts(normalized)):
        issues.append("overlay_line_too_long")

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

    angles = _detect_social_angles(normalized)
    if not angles:
        issues.append("overlay_missing_share_trigger")
    if not _has_direct_social_cta(normalized):
        issues.append("overlay_not_direct_enough")
    if not is_curated and not any(re.search(pattern, lowered) for pattern in PRIMARY_WING_SIGNAL_PATTERNS + SUPPORTING_SIGNAL_PATTERNS):
        issues.append("overlay_missing_food_or_social_signal")

    passed = not issues
    return {
        "valid": passed,
        "passed": passed,
        "issues": issues,
        "reasons": issues,
        "normalized_overlay": normalized,
        "word_count": word_count,
        "line_count": len(lines),
        "social_angles": sorted(angles),
        "overlay_source": "template" if is_curated else "openai",
    }


def validate_post_pair(caption: str, overlay_text: str | None) -> dict[str, Any]:
    issues: list[str] = []
    caption_validation = validate_caption(caption)
    overlay_validation = validate_overlay_text(overlay_text) if isinstance(overlay_text, str) and overlay_text.strip() else None
    caption_angles = set(caption_validation["social_angles"])
    overlay_angles = set(overlay_validation["social_angles"]) if overlay_validation is not None else set()

    if not caption_validation["passed"]:
        issues.extend(f"caption:{issue}" for issue in caption_validation["issues"])
    if overlay_validation is not None and not overlay_validation["passed"]:
        issues.extend(f"overlay:{issue}" for issue in overlay_validation["issues"])
    if overlay_validation is not None and caption_angles and overlay_angles and not (caption_angles & overlay_angles):
        issues.append("caption_overlay_mismatch")

    passed = not issues
    return {
        "valid": passed,
        "passed": passed,
        "issues": issues,
        "reasons": issues,
        "caption_validation": caption_validation,
        "overlay_validation": overlay_validation,
        "caption_angles": sorted(caption_angles),
        "overlay_angles": sorted(overlay_angles),
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


def finalize_overlay_text(
    *,
    seed: str,
    style: str | None = None,
    caption: str,
    raw_overlay: str | None = None,
) -> dict[str, Any]:
    selected_style = style or choose_caption_style(seed=seed)
    raw_pair_validation = validate_post_pair(caption, raw_overlay) if isinstance(raw_overlay, str) and raw_overlay.strip() else None

    if raw_pair_validation and raw_pair_validation["passed"]:
        overlay_validation = validate_overlay_text(raw_overlay or "")
        return {
            "overlay_text": overlay_validation["normalized_overlay"],
            "overlay_source": "openai",
            "selected_caption_style": selected_style,
            "validation_passed": True,
            "validation_failure_reason": None,
            "fallback_used": False,
            "validation": raw_pair_validation,
        }

    curated_options = list(style_overlay_templates(selected_style))
    random.Random(f"{seed}:overlay-order").shuffle(curated_options)
    curated_overlay = curated_options[0]
    curated_pair_validation = validate_post_pair(caption, curated_overlay)
    for option in curated_options:
        candidate_validation = validate_post_pair(caption, option)
        if candidate_validation["passed"]:
            curated_overlay = option
            curated_pair_validation = candidate_validation
            break

    overlay_validation = validate_overlay_text(curated_overlay)
    source = "fallback" if raw_overlay and raw_pair_validation and not raw_pair_validation["passed"] else "template"
    return {
        "overlay_text": overlay_validation["normalized_overlay"],
        "overlay_source": source,
        "selected_caption_style": selected_style,
        "validation_passed": curated_pair_validation["passed"],
        "validation_failure_reason": None if curated_pair_validation["passed"] else ", ".join(curated_pair_validation["reasons"]),
        "fallback_used": source == "fallback",
        "validation": curated_pair_validation,
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
        overlay = finalize_overlay_text(
            seed=f"{seed}:{index}",
            style=style,
            caption=finalized["caption"],
        )
        samples.append(
            {
                "caption": finalized["caption"],
                "overlay_text": overlay["overlay_text"],
                "style": finalized["selected_caption_style"],
                "source": finalized["caption_source"],
                "validation": {
                    "valid": finalized["validation_passed"] and overlay["validation_passed"],
                    "reasons": finalized["validation"]["reasons"] + overlay["validation"]["reasons"],
                    "caption_length": finalized["validation"]["caption_length"],
                },
            }
        )
    return samples
