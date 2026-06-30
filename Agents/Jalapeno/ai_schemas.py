from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass
from typing import Any


ALLOWED_CONTENT_SLOTS = ("buffago_post", "meme_post")
ALLOWED_POST_TYPES = (
    "restaurant_spotlight",
    "crawl_prompt",
    "community_update",
    "food_holiday",
    "sports_hook",
    "meme",
)
ALLOWED_IMAGE_STYLES = ("realistic", "meme", "illustration", "app_marketing")
ALLOWED_RISK_LEVELS = ("low", "medium", "high")

TEXT_CONTENT_OUTPUT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": [
        "content_slot",
        "post_type",
        "caption",
        "hashtags",
        "image_prompt",
        "alt_text",
        "content_angle",
        "source_signals_used",
        "why_this_post",
        "brand_safety_notes",
        "confidence_score",
    ],
    "properties": {
        "content_slot": {"type": "string", "enum": list(ALLOWED_CONTENT_SLOTS)},
        "post_type": {"type": "string", "enum": list(ALLOWED_POST_TYPES)},
        "caption": {"type": "string"},
        "hashtags": {"type": "array", "items": {"type": "string"}},
        "image_prompt": {"type": "string"},
        "alt_text": {"type": "string"},
        "content_angle": {"type": "string"},
        "source_signals_used": {"type": "array", "items": {"type": "string"}},
        "why_this_post": {"type": "string"},
        "brand_safety_notes": {"type": "array", "items": {"type": "string"}},
        "confidence_score": {"type": "number", "minimum": 0.0, "maximum": 1.0},
    },
}

IMAGE_PROMPT_OUTPUT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": [
        "content_slot",
        "image_prompt",
        "style",
        "needs_text_overlay",
        "text_overlay",
        "composition_notes",
        "negative_prompt_guidance",
        "brand_safety_notes",
    ],
    "properties": {
        "content_slot": {"type": "string", "enum": list(ALLOWED_CONTENT_SLOTS)},
        "image_prompt": {"type": "string"},
        "style": {"type": "string", "enum": list(ALLOWED_IMAGE_STYLES)},
        "needs_text_overlay": {"type": "boolean"},
        "text_overlay": {"type": ["string", "null"]},
        "composition_notes": {"type": "string"},
        "negative_prompt_guidance": {"type": "string"},
        "brand_safety_notes": {"type": "array", "items": {"type": "string"}},
    },
}

BRAND_VALIDATION_OUTPUT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": ["passed", "risk_level", "reasons", "notes"],
    "properties": {
        "passed": {"type": "boolean"},
        "risk_level": {"type": "string", "enum": list(ALLOWED_RISK_LEVELS)},
        "reasons": {"type": "array", "items": {"type": "string"}},
        "notes": {"type": "array", "items": {"type": "string"}},
    },
}

SENSITIVE_KEY_MARKERS = (
    "access_token",
    "api_key",
    "email",
    "password",
    "phone",
    "refresh_token",
    "secret",
    "session",
    "token",
    "user_id",
    "anonymous_id",
)


@dataclass(frozen=True, slots=True)
class SchemaValidationError(ValueError):
    message: str

    def __str__(self) -> str:
        return self.message


def sanitize_for_ai(value: Any) -> Any:
    if isinstance(value, dict):
        sanitized: dict[str, Any] = {}
        for key, item in value.items():
            lower_key = str(key).lower()
            if any(marker in lower_key for marker in SENSITIVE_KEY_MARKERS):
                continue
            sanitized[key] = sanitize_for_ai(item)
        return sanitized
    if isinstance(value, list):
        return [sanitize_for_ai(item) for item in value]
    if isinstance(value, tuple):
        return [sanitize_for_ai(item) for item in value]
    if isinstance(value, set):
        return [sanitize_for_ai(item) for item in sorted(value, key=lambda item: str(item))]
    return deepcopy(value)


def _require_string(value: Any, field_name: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise SchemaValidationError(f"Missing or invalid string field: {field_name}")
    return value.strip()


def _require_bool(value: Any, field_name: str) -> bool:
    if not isinstance(value, bool):
        raise SchemaValidationError(f"Missing or invalid boolean field: {field_name}")
    return value


def _require_number(value: Any, field_name: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise SchemaValidationError(f"Missing or invalid numeric field: {field_name}")
    return float(value)


def _require_string_list(value: Any, field_name: str) -> list[str]:
    if not isinstance(value, list):
        raise SchemaValidationError(f"Missing or invalid list field: {field_name}")
    result: list[str] = []
    for item in value:
        if not isinstance(item, str) or not item.strip():
            raise SchemaValidationError(f"Missing or invalid string item in field: {field_name}")
        result.append(item.strip())
    return result


def normalize_text_output(payload: dict[str, Any]) -> dict[str, Any]:
    content_slot = _require_string(payload.get("content_slot"), "content_slot")
    if content_slot not in ALLOWED_CONTENT_SLOTS:
        raise SchemaValidationError("Invalid content_slot")
    post_type = _require_string(payload.get("post_type"), "post_type")
    if post_type not in ALLOWED_POST_TYPES:
        raise SchemaValidationError("Invalid post_type")

    confidence_score = _require_number(payload.get("confidence_score"), "confidence_score")
    if confidence_score < 0.0 or confidence_score > 1.0:
        raise SchemaValidationError("confidence_score must be between 0 and 1")

    return {
        "content_slot": content_slot,
        "post_type": post_type,
        "caption": _require_string(payload.get("caption"), "caption"),
        "hashtags": _require_string_list(payload.get("hashtags"), "hashtags"),
        "image_prompt": _require_string(payload.get("image_prompt"), "image_prompt"),
        "alt_text": _require_string(payload.get("alt_text"), "alt_text"),
        "content_angle": _require_string(payload.get("content_angle"), "content_angle"),
        "source_signals_used": _require_string_list(payload.get("source_signals_used"), "source_signals_used"),
        "why_this_post": _require_string(payload.get("why_this_post"), "why_this_post"),
        "brand_safety_notes": _require_string_list(payload.get("brand_safety_notes"), "brand_safety_notes"),
        "confidence_score": round(confidence_score, 3),
    }


def normalize_image_output(payload: dict[str, Any]) -> dict[str, Any]:
    content_slot = _require_string(payload.get("content_slot"), "content_slot")
    if content_slot not in ALLOWED_CONTENT_SLOTS:
        raise SchemaValidationError("Invalid content_slot")

    style = _require_string(payload.get("style"), "style")
    if style not in ALLOWED_IMAGE_STYLES:
        raise SchemaValidationError("Invalid style")

    text_overlay = payload.get("text_overlay")
    if text_overlay is not None and (not isinstance(text_overlay, str) or not text_overlay.strip()):
        raise SchemaValidationError("text_overlay must be a string or null")

    return {
        "content_slot": content_slot,
        "image_prompt": _require_string(payload.get("image_prompt"), "image_prompt"),
        "style": style,
        "needs_text_overlay": _require_bool(payload.get("needs_text_overlay"), "needs_text_overlay"),
        "text_overlay": text_overlay.strip() if isinstance(text_overlay, str) else None,
        "composition_notes": _require_string(payload.get("composition_notes"), "composition_notes"),
        "negative_prompt_guidance": _require_string(payload.get("negative_prompt_guidance"), "negative_prompt_guidance"),
        "brand_safety_notes": _require_string_list(payload.get("brand_safety_notes"), "brand_safety_notes"),
    }


def normalize_brand_validation_output(payload: dict[str, Any]) -> dict[str, Any]:
    risk_level = _require_string(payload.get("risk_level"), "risk_level")
    if risk_level not in ALLOWED_RISK_LEVELS:
        raise SchemaValidationError("Invalid risk_level")
    return {
        "passed": _require_bool(payload.get("passed"), "passed"),
        "risk_level": risk_level,
        "reasons": _require_string_list(payload.get("reasons"), "reasons"),
        "notes": _require_string_list(payload.get("notes"), "notes"),
    }


def _signals_used_from_context(external_context: dict[str, Any]) -> list[str]:
    source_summary = external_context.get("source_summary")
    if isinstance(source_summary, dict):
        signals = source_summary.get("signals_used")
        if isinstance(signals, list):
            return [str(signal).strip() for signal in signals if str(signal).strip()]
    return ["fallback_context"]


def _base_caption(content_slot: str) -> str:
    if content_slot == "meme_post":
        return "When the wings hit the table and suddenly everyone develops strong opinions."
    return "Buffago said wings first, and honestly, that was the correct decision."


def fallback_text_output(
    *,
    content_slot: str,
    internal_snapshot: dict[str, Any],
    external_context: dict[str, Any],
) -> dict[str, Any]:
    signals = _signals_used_from_context(external_context)
    if content_slot == "meme_post" or "sports_events" in signals:
        post_type = "meme"
        caption = "Hot take: if wings aren't involved, is it even worth the napkins?"
        image_prompt = "A funny, bold meme-style wing post with exaggerated sauce, a local diner vibe, and room for witty text overlay."
        content_angle = "Buffago meme energy"
        why_this_post = "A safe meme-style post keeps the brand playful without inventing facts."
        hashtags = ["#Buffago", "#WingHumor", "#BuffaloWings", "#LocalFood"]
        confidence = 0.78
    elif any("holiday" in signal for signal in signals):
        post_type = "food_holiday"
        caption = "A food holiday is basically a public service announcement for wings."
        image_prompt = "A polished, realistic wing platter with a festive local food-holiday feel, warm lighting, and fresh sauce gloss."
        content_angle = "Food holiday wing feature"
        why_this_post = "Food holidays are safe, relevant, and easy to keep brand-first."
        hashtags = ["#Buffago", "#FoodHoliday", "#Wings", "#WingWednesday"]
        confidence = 0.76
    elif content_slot == "buffago_post":
        post_type = "restaurant_spotlight"
        caption = _base_caption(content_slot)
        image_prompt = "A mouthwatering close-up of Buffalo wings on a local table, bright sauce sheen, crisp texture, and a warm neighborhood restaurant mood."
        content_angle = "Restaurant spotlight"
        why_this_post = "Restaurant spotlight keeps the post food-first and tied to the Buffago lane."
        hashtags = ["#Buffago", "#BuffaloWings", "#WingStop", "#LocalEats"]
        confidence = 0.84
    else:
        post_type = "community_update"
        caption = "Buffago is here for the wings, the neighborhood, and the people who know a good plate when they see one."
        image_prompt = "A community-focused wing scene with a friendly local restaurant counter, inviting textures, and a warm Buffago-branded feel."
        content_angle = "Community update"
        why_this_post = "Community updates keep the account local and positive without leaning on risky claims."
        hashtags = ["#Buffago", "#LocalFood", "#Wings", "#CommunityEats"]
        confidence = 0.8

    return {
        "content_slot": content_slot,
        "post_type": post_type,
        "caption": caption,
        "hashtags": hashtags,
        "image_prompt": image_prompt,
        "alt_text": "A Buffago-style wing post with a local, food-first tone.",
        "content_angle": content_angle,
        "source_signals_used": signals,
        "why_this_post": why_this_post,
        "brand_safety_notes": [
            "No politics or disaster humor",
            "No private user data used",
            "No fake metrics or endorsements",
        ],
        "confidence_score": confidence,
    }


def fallback_image_output(
    *,
    content_slot: str,
    internal_snapshot: dict[str, Any],
    external_context: dict[str, Any],
) -> dict[str, Any]:
    signals = _signals_used_from_context(external_context)
    if content_slot == "meme_post":
        return {
            "content_slot": content_slot,
            "image_prompt": "A meme-style wing graphic with bold sauce splash, high contrast, a clean central subject, and room for punchy text overlay.",
            "style": "meme",
            "needs_text_overlay": True,
            "text_overlay": "Wings are the point",
            "composition_notes": "Keep the main subject centered, the sauce dramatic, and the text readable on mobile.",
            "negative_prompt_guidance": "Avoid politics, people-facing tragedy jokes, brand logos, alcohol focus, and cluttered backgrounds.",
            "brand_safety_notes": [
                "Meme tone kept positive and local",
                "No offensive stereotypes",
                "No fake claims",
            ],
        }
    return {
        "content_slot": content_slot,
        "image_prompt": "A realistic, craveable close-up of Buffalo wings on a plate, warm restaurant lighting, visible crisp texture, and a local neighborhood feel.",
        "style": "realistic",
        "needs_text_overlay": False,
        "text_overlay": None,
        "composition_notes": "Frame the wings as the hero, leave negative space for social crops, and keep the scene appetizing.",
        "negative_prompt_guidance": "No politics, no tragedy jokes, no alcohol emphasis, no fake endorsements, no private people data, and no overdesigned stock-photo energy.",
        "brand_safety_notes": [
            "Food-first and local",
            "No private user data used",
            "Signals used: " + ", ".join(signals),
        ],
    }


def fallback_brand_validation_output(
    *,
    request_type: str,
    content_slot: str,
) -> dict[str, Any]:
    return {
        "passed": True,
        "risk_level": "low",
        "reasons": [
            f"Fallback validation used for {request_type}",
            f"Content slot {content_slot} stays in the food-first lane",
        ],
        "notes": [
            "No model call was required for this fallback result",
            "Safe to continue validation with generated fallback content",
        ],
    }
