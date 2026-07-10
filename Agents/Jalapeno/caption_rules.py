from __future__ import annotations

from dataclasses import dataclass
import random
import re
from typing import Any, Sequence


HASHTAG_PATTERN = re.compile(r"(?<!\w)#([A-Za-z0-9_]+)")

DEFAULT_PUBLISH_HASHTAG_POOL = (
    "#Buffago",
    "#BuffaloWings",
    "#WingNight",
    "#ChickenWings",
    "#Foodie",
    "#Wings",
    "#ConnecticutFood",
    "#CTEats",
    "#FoodTok",
    "#WingLovers",
)

SHAREABLE_FOOD_POST_RULES = (
    "Every Buffago post should feel like something a user would send, tag, comment on, debate, or use to make wing plans.",
    "Use direct social triggers: send this, tag a friend, settle flats versus drums, debate sauce or heat, make wing plans, or challenge someone.",
    "Ban surreal AI joke formats, wing personification, abstract punchlines, and unrelated meme language.",
    "Image text should usually be 3 to 8 words and no more than two short lines.",
    "Caption and image text must work together as one post and point at the same social action or debate.",
)

ENGAGEMENT_ACTION_PATTERNS = (
    r"\bsend\b",
    r"\bshare\b",
    r"\btag\b",
    r"\bcomment\b",
    r"\blike\b",
    r"\breply\b",
    r"\bgroup chat\b",
    r"\bowe\b",
    r"\bowes\b",
    r"\bvote\b",
    r"\bpick\b",
    r"\bchoose\b",
    r"\bwho(?:'s| is)\b",
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
        "Reply in 10 minutes or you owe wings.",
        "First reply buys the wings.",
        "Send this and start the timer.",
        "If they flake again, they owe the whole table wings.",
    ),
    "group_chat": (
        "Send this to the group chat and see who folds first.",
        "Send this to the group chat right now.",
        "Send this to the group chat and start the timer.",
        "Drop this in the group chat and wait.",
        "Drop this in the group chat and make the call.",
    ),
    "craving_prompt": (
        "Send this to the person you're getting wings with.",
        "Tag the friend who needs a wing run.",
        "Share this with the friend who owes you wings.",
        "Send this to your wing crew.",
        "Comment if wing night is happening.",
    ),
    "sauce_debate": (
        "Comment flats or drums.",
        "Comment your sauce pick.",
        "Vote flats or drums.",
        "Tag someone who takes sauce choice way too seriously.",
        "Like if ranch wins.",
    ),
    "wing_night": (
        "Who's down for wing night?",
        "Send this to whoever is down for wing night.",
        "Send this to your wing crew.",
        "Comment if wing night is happening.",
        "Tag the friend who needs wing night.",
    ),
    "simple_hype": (
        "Who is eating this with you?",
        "Send this to your wing crew.",
        "Who is pulling up for wings?",
        "Like if this counts as dinner.",
        "Comment your wing order.",
    ),
    "comment_prompt": (
        "Comment flats or drums.",
        "Drop your go-to sauce order.",
        "Vote for flats or drums.",
        "Comment your heat level.",
        "Who gets the last wing? Comment below.",
    ),
}

OVERLAY_STYLE_TEMPLATES: dict[str, tuple[str, ...]] = {
    "send_to_friend": (
        "SEND THIS TO\nYOUR WING CREW",
        "SEND THIS TO\nTHE GROUP CHAT",
        "SEND THIS TO\nSOMEONE WHO OWES WINGS",
    ),
    "tag_someone": (
        "TAG YOUR\nWING NIGHT FRIEND",
        "TAG YOUR\nWING MVP",
        "TAG YOUR\nWING FRIEND",
    ),
    "wing_debt": (
        "IF THEY DON'T REPLY\nTHEY OWE WINGS",
        "FIRST REPLY\nBUYS THE WINGS",
        "NO REPLY IN 10 MIN\n= THEY OWE WINGS",
    ),
    "group_chat": (
        "GROUP CHAT\nWING CHECK",
        "SEND THIS TO\nTHE GROUP CHAT",
        "DROP THIS IN\nTHE GROUP CHAT",
    ),
    "craving_prompt": (
        "CANCEL YOUR PLANS.\nGET WINGS.",
        "THIS IS YOUR SIGN.\nGET WINGS.",
        "MAKE THE PLANS.\nGET WINGS.",
    ),
    "sauce_debate": (
        "WHO GETS THE\nLAST WING? VOTE.",
        "VOTE RANCH OR\nBLUE CHEESE",
        "COMMENT YOUR\nSAUCE PICK",
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
        "WHO GETS THE\nLAST WING? VOTE.",
        "DROP YOUR\nSAUCE ORDER",
        "SETTLE IT IN\nTHE COMMENTS",
    ),
}

CURATED_FALLBACK_CAPTIONS = (
    "Send this to someone who owes you wings.",
    "Tag the friend who would destroy this plate.",
    "If they don't answer in 10 minutes, they owe you wings.",
    "Share this with someone who needs a wing night.",
    "Send this to the friend who needs wings.",
    "Tag someone who takes sauce choice way too seriously.",
    "Send this to the group chat and see who folds first.",
    "Who's down for wing night?",
    "Send this to the friend who needs a wing run.",
    "Comment flats or drums.",
    "Send this to your wing night crew.",
    "Send this to the group chat right now.",
)

CURATED_FALLBACK_OVERLAYS = (
    "SEND THIS TO\nYOUR WING CREW",
    "WHO'S EATING\nTHIS WITH YOU?",
    "IF THEY DON'T REPLY\nTHEY OWE WINGS",
    "WHO GETS THE\nLAST WING? VOTE.",
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
    "comment": (r"\bcomment\b", r"\bcomments\b", r"\bdrop your\b", r"\bpick a side\b", r"\bvote\b", r"\bchoose\b", r"\bpick\b"),
}

DIRECT_CTA_PATTERNS = (
    r"\bsend\b",
    r"\bshare\b",
    r"\btag\b",
    r"\bcomment\b",
    r"\blike\b",
    r"\breply\b",
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
    r"\bvote\b",
    r"\bvotes?\b",
    r"\bvoting\b",
    r"\bpick\b",
    r"\bchoose\b",
)


def normalize_caption_text(text: str) -> str:
    cleaned = text.replace("â€™", "'").replace("\\n", " ").replace("\r", " ").replace("\n", " ")
    cleaned = re.sub(r"\s+", " ", cleaned)
    cleaned = re.sub(r"\s+([?.!,])", r"\1", cleaned)
    cleaned = re.sub(r"([?.!,])([A-Za-z])", r"\1 \2", cleaned)
    return cleaned.strip()


def _normalize_caption_line(text: str) -> str:
    cleaned = text.replace("Ã¢â‚¬â„¢", "'").replace("\\n", " ").replace("\r", " ").replace("\n", " ")
    cleaned = re.sub(r"\s+", " ", cleaned)
    cleaned = re.sub(r"\s+([?.!,])", r"\1", cleaned)
    cleaned = re.sub(r"([?.!,])([A-Za-z])", r"\1 \2", cleaned)
    return cleaned.strip()


def normalize_caption_body_text(text: str) -> str:
    normalized_lines = [_normalize_caption_line(line) for line in text.replace("\r\n", "\n").replace("\r", "\n").split("\n")]
    body = "\n".join(normalized_lines)
    body = re.sub(r"\n{3,}", "\n\n", body)
    body = re.sub(r"[ \t]+\n", "\n", body)
    body = re.sub(r"\n[ \t]+", "\n", body)
    return body.strip()


def normalize_hashtag_text(tag: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9_]+", "", tag.strip().lstrip("#"))
    return f"#{cleaned}" if cleaned else ""


def normalize_hashtag_list(hashtags: list[str], *, expected_count: int | None = None) -> list[str]:
    normalized: list[str] = []
    seen: set[str] = set()
    for tag in hashtags:
        cleaned = normalize_hashtag_text(tag)
        if not cleaned:
            continue
        lowered = cleaned.lower()
        if lowered in seen:
            continue
        seen.add(lowered)
        normalized.append(cleaned)
    if expected_count is not None and len(normalized) != expected_count:
        raise ValueError(f"Expected exactly {expected_count} hashtags, received {len(normalized)}")
    return normalized


@dataclass(frozen=True, slots=True)
class HashtagRepairResult:
    hashtags: list[str]
    original_count: int
    repaired_count: int
    added_hashtags: list[str]
    removed_hashtags: list[str]
    location_hashtag: str | None = None

    @property
    def changed(self) -> bool:
        return bool(self.added_hashtags or self.removed_hashtags or self.original_count != self.repaired_count)


def split_caption_and_hashtags(caption: str) -> tuple[str, list[str]]:
    raw = caption.replace("\r\n", "\n").replace("\r", "\n")
    hashtags = [f"#{match.group(1)}" for match in HASHTAG_PATTERN.finditer(raw)]
    body = HASHTAG_PATTERN.sub("", raw) if hashtags else raw
    body = normalize_caption_body_text(body).strip(" ,")
    return body, normalize_hashtag_list(hashtags)


def _title_hashtag(value: str) -> str:
    parts = re.findall(r"[A-Za-z0-9]+", value)
    return f"#{''.join(part[:1].upper() + part[1:] for part in parts)}" if parts else ""


def _context_string_values(context: Any, keys: tuple[str, ...]) -> list[str]:
    if not isinstance(context, dict):
        return []
    values: list[str] = []
    for key in keys:
        value = context.get(key)
        if isinstance(value, str) and value.strip():
            values.append(value.strip())
        elif isinstance(value, list):
            for item in value:
                if isinstance(item, str) and item.strip():
                    values.append(item.strip())
        elif isinstance(value, dict):
            for nested in _context_string_values(value, keys):
                values.append(nested)
    return values


def _location_hashtag_candidates(context: dict[str, Any] | None = None) -> list[str]:
    if not isinstance(context, dict):
        return []

    city_values = _context_string_values(context, ("town", "city", "cities_mentioned"))
    state_values = _context_string_values(context, ("state", "state_name", "states_mentioned"))
    restaurant_values = _context_string_values(context, ("restaurant", "restaurant_name", "restaurants_mentioned"))
    crawl_values = _context_string_values(context, ("crawl_context", "crawl_name", "crawl_title"))

    candidates: list[str] = []
    for city in city_values:
        candidates.append(_title_hashtag(f"{city} Eats"))
    for state in state_values:
        normalized = state.strip().lower()
        if normalized in {"ct", "connecticut"}:
            candidates.extend(["#ConnecticutFood", "#CTEats"])
        else:
            candidates.append(_title_hashtag(f"{state} Eats"))
    for restaurant in restaurant_values:
        candidates.append(_title_hashtag(restaurant))
    for crawl in crawl_values:
        candidates.append(_title_hashtag(crawl))
    return normalize_hashtag_list(candidates)


def repair_hashtag_list(
    hashtags: list[str],
    *,
    expected_count: int = 5,
    caption: str | None = None,
    context: dict[str, Any] | None = None,
) -> HashtagRepairResult:
    merged = list(hashtags)
    if caption:
        _body, caption_hashtags = split_caption_and_hashtags(caption)
        merged.extend(caption_hashtags)

    original = normalize_hashtag_list(merged)
    location_candidates = _location_hashtag_candidates(context)
    location_set = {tag.lower() for tag in location_candidates}
    location_hashtag = next((tag for tag in location_candidates if tag.lower() not in {item.lower() for item in original}), None)

    repaired = list(original)
    if len(repaired) < expected_count:
        fill_pool = list(location_candidates) + list(DEFAULT_PUBLISH_HASHTAG_POOL)
        seen = {tag.lower() for tag in repaired}
        for tag in normalize_hashtag_list(fill_pool):
            lowered = tag.lower()
            if lowered in seen:
                continue
            repaired.append(tag)
            seen.add(lowered)
            if len(repaired) == expected_count:
                break

    repaired = repaired[:expected_count]
    if location_candidates and not any(tag.lower() in location_set for tag in repaired):
        location_from_original = next((tag for tag in original if tag.lower() in location_set), None)
        forced_location = location_from_original or location_hashtag or location_candidates[0]
        if repaired:
            repaired[-1] = forced_location
        else:
            repaired = [forced_location]

    if len(repaired) < expected_count:
        seen = {tag.lower() for tag in repaired}
        for tag in normalize_hashtag_list(list(DEFAULT_PUBLISH_HASHTAG_POOL)):
            lowered = tag.lower()
            if lowered in seen:
                continue
            repaired.append(tag)
            seen.add(lowered)
            if len(repaired) == expected_count:
                break

    repaired = normalize_hashtag_list(repaired)[:expected_count]
    added = [tag for tag in repaired if tag.lower() not in {item.lower() for item in original}]
    removed = [tag for tag in original if tag.lower() not in {item.lower() for item in repaired}]
    return HashtagRepairResult(
        hashtags=repaired,
        original_count=len(original),
        repaired_count=len(repaired),
        added_hashtags=added,
        removed_hashtags=removed,
        location_hashtag=next((tag for tag in repaired if tag.lower() in location_set), None),
    )


def extract_caption_body(caption: str) -> str:
    body, _hashtags = split_caption_and_hashtags(caption)
    return body


def ensure_exactly_five_hashtags(
    caption_body: str,
    hashtags: Sequence[str] | str | None,
    *,
    context: dict[str, Any] | None = None,
) -> tuple[str, list[str]]:
    if isinstance(hashtags, str):
        raw_hashtags = [f"#{match.group(1)}" for match in HASHTAG_PATTERN.finditer(hashtags)]
    elif hashtags is None:
        raw_hashtags = []
    else:
        raw_hashtags = [str(tag) for tag in hashtags]
    normalized_body = extract_caption_body(caption_body)
    repaired = repair_hashtag_list(raw_hashtags, expected_count=5, caption=caption_body, context=context)
    return normalized_body, repaired.hashtags


def compose_caption_with_hashtags(
    caption: str,
    hashtags: list[str],
    *,
    context: dict[str, Any] | None = None,
) -> str:
    body, repaired_hashtags = ensure_exactly_five_hashtags(caption, hashtags, context=context)
    if not body:
        raise ValueError("Caption body cannot be empty")
    return f"{body}\n\n{' '.join(repaired_hashtags)}"


def style_templates(style: str) -> tuple[str, ...]:
    return CAPTION_STYLE_TEMPLATES.get(style, CAPTION_STYLE_TEMPLATES["simple_hype"])


def style_overlay_templates(style: str) -> tuple[str, ...]:
    return OVERLAY_STYLE_TEMPLATES.get(style, OVERLAY_STYLE_TEMPLATES["simple_hype"])


def style_guidance(style: str) -> str:
    return CAPTION_STYLE_GUIDANCE.get(style, CAPTION_STYLE_GUIDANCE["simple_hype"])


def _engagement_action_patterns() -> tuple[str, ...]:
    return ENGAGEMENT_ACTION_PATTERNS


def _detect_engagement_actions(text: str) -> set[str]:
    lowered = normalize_caption_text(text).lower()
    matches: set[str] = set()
    for pattern in _engagement_action_patterns():
        if re.search(pattern, lowered):
            matches.add(pattern)
    return matches


def _style_for_caption(caption: str, *, seed: str, allowed_styles: list[str] | None = None) -> str:
    lowered = normalize_caption_text(caption).lower()
    matching_styles: list[str] = []
    for style, patterns in SOCIAL_ANGLE_PATTERNS.items():
        if any(re.search(pattern, lowered) for pattern in patterns):
            if style == "send_share":
                matching_styles.extend(["send_to_friend", "group_chat"])
            elif style == "tag_callout":
                matching_styles.append("tag_someone")
            elif style == "debate":
                matching_styles.extend(["sauce_debate", "comment_prompt"])
            elif style == "plans":
                matching_styles.extend(["wing_night", "craving_prompt", "simple_hype"])
            elif style == "challenge":
                matching_styles.append("wing_debt")
            elif style == "comment":
                matching_styles.append("comment_prompt")
    if not matching_styles:
        matching_styles = list(allowed_styles or CAPTION_STYLE_ORDER)
    filtered = [style for style in matching_styles if style in CAPTION_STYLE_TEMPLATES and (allowed_styles is None or style in allowed_styles)]
    return choose_caption_style(seed=seed, allowed_styles=filtered or allowed_styles)


def _caption_overlay_concept(caption: str, overlay_text: str | None = None) -> str | None:
    caption_angles = _detect_social_angles(caption)
    overlay_angles = _detect_social_angles(overlay_text or "") if overlay_text else set()
    shared = sorted(caption_angles & overlay_angles)
    if shared:
        return shared[0]
    if caption_angles:
        return sorted(caption_angles)[0]
    if overlay_angles:
        return sorted(overlay_angles)[0]
    return None


def infer_overlay_concept(caption: str, overlay_text: str | None = None) -> str | None:
    return _caption_overlay_concept(caption, overlay_text)


def _overlay_reinforces_caption(caption: str, overlay_text: str) -> bool:
    caption_lower = normalize_caption_text(caption).lower()
    overlay_lower = normalize_caption_text(overlay_text).lower()
    caption_angles = _detect_social_angles(caption)
    overlay_angles = _detect_social_angles(overlay_text)
    if caption_angles & overlay_angles:
        return True
    if "send_share" in caption_angles and any(
        term in overlay_lower
        for term in ("send", "share", "group chat", "wing crew", "crew", "friend", "who's", "who is")
    ):
        return True
    if "tag_callout" in caption_angles and any(term in overlay_lower for term in ("tag", "friend", "crew", "wing night friend", "mvp")):
        return True
    if "debate" in caption_angles and any(term in overlay_lower for term in ("flats", "drums", "sauce", "heat", "ranch", "blue cheese")):
        return True
    if "plans" in caption_angles and any(term in overlay_lower for term in ("wing night", "plans", "get wings", "pulling up", "crew", "wing night crew")):
        return True
    if "challenge" in caption_angles and any(term in overlay_lower for term in ("owe", "reply", "timer", "ignore this", "buys the wings")):
        return True
    if "comment" in caption_angles and any(term in overlay_lower for term in ("comment", "drop", "pick a side", "flats or drums")):
        return True
    return False


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
    require_hashtags: bool = False,
) -> dict[str, Any]:
    issues: list[str] = []
    normalized = normalize_caption_text(caption)
    hashtags = [f"#{match.group(1)}" for match in HASHTAG_PATTERN.finditer(normalized)]
    body = re.sub(r"(?:\s*#\w+)+\s*$", "", normalized).strip() if hashtags else normalized
    lowered = body.lower()
    is_curated = lowered in CURATED_CAPTION_LOOKUP

    if not body:
        issues.append("empty_caption")
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

    for pattern in PERSONIFICATION_PATTERNS:
        if re.search(pattern, lowered):
            issues.append("personifies_wing_or_plate")
            break

    has_primary_signal = any(re.search(pattern, lowered) for pattern in PRIMARY_WING_SIGNAL_PATTERNS)
    has_supporting_signal = any(re.search(pattern, lowered) for pattern in SUPPORTING_SIGNAL_PATTERNS)
    engagement_actions = _detect_engagement_actions(body)
    social_angles = _detect_social_angles(body)
    has_friend_or_group_cta = any(
        re.search(pattern, lowered)
        for pattern in (r"\bgroup chat\b", r"\bfriend\b", r"\bcrew\b", r"\bplate\b", r"\border\b", r"\bowe\b", r"\bowes\b")
    )

    if not is_curated and not has_primary_signal and not has_supporting_signal and not engagement_actions:
        issues.append("missing_buffago_signal")
    if not is_curated and not has_primary_signal and not has_friend_or_group_cta and not engagement_actions:
        issues.append("missing_wing_specificity")
    if not is_curated and not has_primary_signal and not has_supporting_signal and not engagement_actions:
        issues.append("too_abstract_or_generic")
    if not engagement_actions:
        issues.append("missing_engagement_action")
    if not social_angles and not engagement_actions:
        issues.append("missing_social_share_angle")
    if not _has_direct_social_cta(normalized):
        issues.append("caption_not_direct_enough")
    if normalized.count(".") + normalized.count("!") + normalized.count("?") > 2:
        issues.append("too_many_sentences")
    if require_hashtags:
        if not hashtags:
            issues.append("missing_hashtags")
        elif len(hashtags) != 5:
            issues.append(f"hashtag_count_not_equal_5:{len(hashtags)}")
        elif len(normalize_hashtag_list(hashtags)) != 5:
            issues.append("hashtag_count_not_equal_5")
        if HASHTAG_PATTERN.search(body):
            issues.append("hashtags_must_be_at_end")
    elif hashtags:
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
        "engagement_actions": sorted(engagement_actions),
        "hashtag_count": len(hashtags),
    }


def validate_overlay_text(
    text: str,
    *,
    max_words: int = 8,
    preferred_min_words: int = 3,
    max_chars: int = 42,
) -> dict[str, Any]:
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
    if "\\n" in text:
        issues.append("literal_newline_escape_present")
    if len(lines) > 2:
        issues.append("overlay_too_many_lines")
    if word_count > max_words:
        issues.append(f"overlay_too_long:{word_count}")
    if 0 < word_count < preferred_min_words:
        issues.append(f"overlay_too_short:{word_count}")
    if len(normalized) > max_chars:
        issues.append(f"overlay_text_too_long:{len(normalized)}")
    if any(count > 8 for count in _line_word_counts(normalized)):
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

    engagement_actions = _detect_engagement_actions(normalized)
    angles = _detect_social_angles(normalized)
    if not angles and not engagement_actions:
        issues.append("overlay_missing_share_trigger")
    if not engagement_actions and not _has_direct_social_cta(normalized):
        issues.append("overlay_not_direct_enough")
    if not is_curated and not any(re.search(pattern, lowered) for pattern in PRIMARY_WING_SIGNAL_PATTERNS + SUPPORTING_SIGNAL_PATTERNS) and not engagement_actions:
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
        "engagement_actions": sorted(engagement_actions),
        "overlay_source": "template" if is_curated else "openai",
    }


def validate_post_pair(caption: str, overlay_text: str | None) -> dict[str, Any]:
    issues: list[str] = []
    caption_hashtags = HASHTAG_PATTERN.findall(normalize_caption_text(caption))
    caption_validation = validate_caption(caption, require_hashtags=bool(caption_hashtags))
    overlay_validation = validate_overlay_text(overlay_text) if isinstance(overlay_text, str) and overlay_text.strip() else None
    caption_angles = set(caption_validation["social_angles"])
    overlay_angles = set(overlay_validation["social_angles"]) if overlay_validation is not None else set()
    caption_overlay_concept = _caption_overlay_concept(caption, overlay_text if isinstance(overlay_text, str) else None)
    overlay_reinforces_caption = bool(overlay_text and _overlay_reinforces_caption(caption, overlay_text))

    if not caption_validation["passed"]:
        issues.extend(f"caption:{issue}" for issue in caption_validation["issues"])
    if overlay_validation is not None and not overlay_validation["passed"]:
        if overlay_reinforces_caption and set(overlay_validation["issues"]).issubset({"overlay_not_direct_enough", "overlay_missing_share_trigger"}):
            pass
        else:
            issues.extend(f"overlay:{issue}" for issue in overlay_validation["issues"])
    if overlay_validation is not None and caption_angles and overlay_angles and not (caption_angles & overlay_angles) and not overlay_reinforces_caption:
        issues.append("caption_overlay_mismatch")
    elif overlay_validation is not None and not overlay_reinforces_caption and not (caption_angles & overlay_angles):
        issues.append("caption_overlay_concept_unrelated")

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
        "caption_overlay_concept": caption_overlay_concept,
        "overlay_reinforces_caption": overlay_reinforces_caption,
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
    selected_style = style or _style_for_caption(caption, seed=seed)
    raw_pair_validation = validate_post_pair(caption, raw_overlay) if isinstance(raw_overlay, str) and raw_overlay.strip() else None

    if raw_pair_validation and raw_pair_validation["passed"]:
        overlay_validation = validate_overlay_text(raw_overlay or "")
        return {
            "overlay_text": overlay_validation["normalized_overlay"],
            "overlay_source": "openai",
            "selected_caption_style": selected_style,
            "caption_overlay_concept": raw_pair_validation["caption_overlay_concept"],
            "validation_passed": True,
            "validation_failure_reason": None,
            "fallback_used": False,
            "validation": raw_pair_validation,
        }

    candidate_styles = [selected_style] if selected_style in CAPTION_STYLE_TEMPLATES else []
    for candidate_style in CAPTION_STYLE_ORDER:
        if candidate_style not in candidate_styles:
            candidate_styles.append(candidate_style)
    curated_overlay = None
    curated_pair_validation = None
    for candidate_style in candidate_styles:
        curated_options = list(style_overlay_templates(candidate_style))
        random.Random(f"{seed}:{candidate_style}:overlay-order").shuffle(curated_options)
        for option in curated_options:
            candidate_validation = validate_post_pair(caption, option)
            if candidate_validation["passed"]:
                curated_overlay = option
                curated_pair_validation = candidate_validation
                selected_style = candidate_style
                break
        if curated_overlay is not None:
            break
    if curated_overlay is None:
        curated_overlay = CURATED_FALLBACK_OVERLAYS[0]
        curated_pair_validation = validate_post_pair(caption, curated_overlay)

    overlay_validation = validate_overlay_text(curated_overlay)
    source = "fallback" if raw_overlay and raw_pair_validation and not raw_pair_validation["passed"] else "template"
    return {
        "overlay_text": overlay_validation["normalized_overlay"],
        "overlay_source": source,
        "selected_caption_style": selected_style,
        "caption_overlay_concept": curated_pair_validation["caption_overlay_concept"] if curated_pair_validation else None,
        "validation_passed": curated_pair_validation["passed"],
        "validation_failure_reason": None if curated_pair_validation["passed"] else ", ".join(curated_pair_validation["reasons"]),
        "fallback_used": source == "fallback",
        "validation": curated_pair_validation,
    }


def finalize_caption_overlay_pair(
    *,
    seed: str,
    caption_style: str | None = None,
    raw_caption: str | None = None,
    raw_overlay: str | None = None,
    allowed_styles: list[str] | None = None,
    allow_openai_caption: bool = False,
) -> dict[str, Any]:
    attempts = 3
    last_caption_plan: dict[str, Any] | None = None
    last_overlay_plan: dict[str, Any] | None = None
    for attempt in range(attempts):
        attempt_seed = f"{seed}:attempt:{attempt}"
        selected_style = caption_style
        if selected_style is None:
            selected_style = choose_caption_style(seed=attempt_seed, allowed_styles=allowed_styles)
        caption_plan = finalize_caption(
            seed=attempt_seed,
            style=selected_style,
            raw_caption=raw_caption if attempt == 0 else None,
            allowed_styles=[selected_style] if selected_style else allowed_styles,
            allow_openai_caption=allow_openai_caption if attempt == 0 else False,
        )
        overlay_plan = finalize_overlay_text(
            seed=f"{attempt_seed}:overlay",
            style=caption_plan["selected_caption_style"],
            caption=caption_plan["caption"],
            raw_overlay=raw_overlay if attempt == 0 else None,
        )
        pair_validation = validate_post_pair(caption_plan["caption"], overlay_plan["overlay_text"])
        last_caption_plan = caption_plan
        last_overlay_plan = overlay_plan
        if pair_validation["passed"]:
            return {
                "caption": caption_plan["caption"],
                "overlay_text": overlay_plan["overlay_text"],
                "selected_caption_style": caption_plan["selected_caption_style"],
                "caption_source": caption_plan["caption_source"],
                "overlay_source": overlay_plan["overlay_source"],
                "caption_overlay_concept": pair_validation["caption_overlay_concept"],
                "validation_passed": True,
                "validation_failure_reason": None,
                "fallback_used": bool(caption_plan["fallback_used"] or overlay_plan["fallback_used"]),
                "caption_validation": caption_plan["validation"],
                "overlay_validation": overlay_plan["validation"],
                "pair_validation": pair_validation,
            }
    assert last_caption_plan is not None and last_overlay_plan is not None
    pair_validation = validate_post_pair(last_caption_plan["caption"], last_overlay_plan["overlay_text"])
    return {
        "caption": last_caption_plan["caption"],
        "overlay_text": last_overlay_plan["overlay_text"],
        "selected_caption_style": last_caption_plan["selected_caption_style"],
        "caption_source": last_caption_plan["caption_source"],
        "overlay_source": last_overlay_plan["overlay_source"],
        "caption_overlay_concept": pair_validation["caption_overlay_concept"],
        "validation_passed": pair_validation["passed"],
        "validation_failure_reason": None if pair_validation["passed"] else ", ".join(pair_validation["reasons"]),
        "fallback_used": bool(last_caption_plan["fallback_used"] or last_overlay_plan["fallback_used"]),
        "caption_validation": last_caption_plan["validation"],
        "overlay_validation": last_overlay_plan["validation"],
        "pair_validation": pair_validation,
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
