from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass
from typing import Any

from caption_rules import pick_fallback_caption
from content_engine.visual_prompt_style import (
    apply_prompt_metadata,
    build_buffago_image_direction,
    build_scene_direction_prompt,
)


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
        "visual_style",
        "camera_angle",
        "scene_type",
        "comedy_beat",
        "character_archetype",
        "wing_focus_level",
        "prompt_version",
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
        "visual_style": {"type": "string"},
        "camera_angle": {"type": "string"},
        "scene_type": {"type": "string"},
        "comedy_beat": {"type": "string"},
        "character_archetype": {"type": "string"},
        "wing_focus_level": {"type": "string"},
        "prompt_version": {"type": "string"},
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

    normalized = {
        "content_slot": content_slot,
        "image_prompt": _require_string(payload.get("image_prompt"), "image_prompt"),
        "style": style,
        "needs_text_overlay": _require_bool(payload.get("needs_text_overlay"), "needs_text_overlay"),
        "text_overlay": text_overlay.strip() if isinstance(text_overlay, str) else None,
        "composition_notes": _require_string(payload.get("composition_notes"), "composition_notes"),
        "negative_prompt_guidance": _require_string(payload.get("negative_prompt_guidance"), "negative_prompt_guidance"),
        "brand_safety_notes": _require_string_list(payload.get("brand_safety_notes"), "brand_safety_notes"),
    }
    for key in (
        "visual_style",
        "camera_angle",
        "scene_type",
        "comedy_beat",
        "character_archetype",
        "wing_focus_level",
        "prompt_version",
    ):
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            normalized[key] = value.strip()
    return normalized


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
        return "The group chat needs a wing night."
    return "Send this to someone who owes you wings."


def _fallback_scene_prompt(content_slot: str, post_type: str) -> tuple[str, dict[str, str]]:
    direction = build_buffago_image_direction(f"fallback:{content_slot}:{post_type}", content_type=post_type)
    metadata: dict[str, str] = {}
    apply_prompt_metadata(metadata, direction)
    if content_slot == "meme_post" or post_type == "meme":
        prompt = build_scene_direction_prompt(
            setting="packed sports bar at peak wing-night noise",
            characters="two lifelong friends, a facepalming bartender, nearby diners, and someone recording on a phone crowd around a basket of wings",
            conflict="one friend stands on a booth pointing a saucy wing like courtroom evidence while the other clutches the basket like treasure",
            mood="absurd, scroll-stopping, mock-serious, and instantly readable without a caption",
            direction=direction,
        )
    else:
        prompt = build_scene_direction_prompt(
            setting="warm neighborhood wing restaurant with a busy counter and full booths",
            characters="regulars and servers react as a steaming platter of wings lands in the foreground",
            conflict="everyone reaches for the crispiest glossy buffalo wing at the same time and freezes in comedic disbelief",
            mood="hungry, cinematic, lively, and local",
            direction=direction,
        )
    return prompt, metadata


def fallback_text_output(
    *,
    content_slot: str,
    internal_snapshot: dict[str, Any],
    external_context: dict[str, Any],
) -> dict[str, Any]:
    signals = _signals_used_from_context(external_context)
    style_seed = f"{content_slot}:{':'.join(signals)}"
    fallback_style, fallback_caption = pick_fallback_caption(seed=style_seed)
    if content_slot == "meme_post" or "sports_events" in signals:
        post_type = "meme"
        caption = fallback_caption
        image_prompt, _metadata = _fallback_scene_prompt(content_slot, post_type)
        content_angle = f"Buffago {fallback_style} caption"
        why_this_post = "A safe wing-specific fallback caption keeps the brand playful without inventing facts."
        hashtags = ["#Buffago", "#WingHumor", "#BuffaloWings", "#LocalFood"]
        confidence = 0.78
    elif any("holiday" in signal for signal in signals):
        post_type = "food_holiday"
        caption = fallback_caption
        image_prompt, _metadata = _fallback_scene_prompt(content_slot, post_type)
        content_angle = f"Food holiday {fallback_style} caption"
        why_this_post = "Food holidays are safe, relevant, and easier to keep wing-first with a curated fallback caption."
        hashtags = ["#Buffago", "#FoodHoliday", "#Wings", "#WingWednesday"]
        confidence = 0.76
    elif content_slot == "buffago_post":
        post_type = "restaurant_spotlight"
        caption = fallback_caption
        image_prompt, _metadata = _fallback_scene_prompt(content_slot, post_type)
        content_angle = f"Restaurant spotlight {fallback_style} caption"
        why_this_post = "Restaurant spotlight stays food-first and tied to the Buffago lane with a curated caption fallback."
        hashtags = ["#Buffago", "#BuffaloWings", "#WingStop", "#LocalEats"]
        confidence = 0.84
    else:
        post_type = "community_update"
        caption = _base_caption(content_slot)
        image_prompt, _metadata = _fallback_scene_prompt(content_slot, post_type)
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
        image_prompt, metadata = _fallback_scene_prompt(content_slot, "meme")
        return {
            "content_slot": content_slot,
            "image_prompt": image_prompt,
            "style": "meme",
            "needs_text_overlay": False,
            "text_overlay": None,
            "composition_notes": "Keep the wings in the foreground or sharp focal plane, make the argument readable through action and reactions, and avoid static table conversation.",
            "negative_prompt_guidance": "Avoid politics, people-facing tragedy jokes, brand logos, alcohol focus, cluttered backgrounds, text inside the generated image, and stock-photo staging.",
            "brand_safety_notes": [
                "Meme tone kept positive and local",
                "No offensive stereotypes",
                "No fake claims",
            ],
            **metadata,
        }
    image_prompt, metadata = _fallback_scene_prompt(content_slot, "restaurant_spotlight")
    return {
        "content_slot": content_slot,
        "image_prompt": image_prompt,
        "style": "realistic",
        "needs_text_overlay": False,
        "text_overlay": None,
        "composition_notes": "Frame the wings as the hero, use shallow depth of field, visible steam, expressive background reactions, and clear motion.",
        "negative_prompt_guidance": "No politics, no tragedy jokes, no alcohol emphasis, no fake endorsements, no private people data, no text inside the generated image, and no overdesigned stock-photo energy.",
        "brand_safety_notes": [
            "Food-first and local",
            "No private user data used",
            "Signals used: " + ", ".join(signals),
        ],
        **metadata,
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
