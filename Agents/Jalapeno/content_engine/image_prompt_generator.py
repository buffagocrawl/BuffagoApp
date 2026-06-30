from __future__ import annotations

from typing import Any

from content_engine.candidate_generator import ContentCandidate


def generate_image_prompt(candidate: ContentCandidate, *, snapshot: dict[str, Any], external_context: dict[str, Any]) -> str:
    restaurant = candidate.restaurants_mentioned[0] if candidate.restaurants_mentioned else "Buffago"
    city = candidate.cities_mentioned[0] if candidate.cities_mentioned else "Buffalo"
    subject = f"{candidate.working_title} featuring {restaurant}"
    composition = candidate.image_composition or "balanced Instagram-friendly composition"
    lighting = "bright natural light with crisp highlights on the food"
    camera_angle = "slightly above eye level for a craveable, mobile-friendly crop"
    food_realism = "ultra-realistic wings with glossy sauce, crisp texture, celery, and sauce cups"
    background = f"local restaurant or regional food setting anchored in {city}"
    palette = "Buffago-inspired spicy orange, sauce red, cream, black, and warm golden tones"
    negative = (
        "No text unless intentional, no fake logos, no alcohol focus, no distorted food, no blurry plates, "
        "no extra fingers, no uncanny faces, no political symbols, and no cluttered stock-photo energy."
    )
    return (
        f"Create an Instagram-quality image of {subject}. "
        f"Composition: {composition}. "
        f"Lighting: {lighting}. "
        f"Camera angle: {camera_angle}. "
        f"Food realism: {food_realism}. "
        f"Background: {background}. "
        f"Color palette: {palette}. "
        f"Make it polished, modern, and highly readable on mobile. "
        f"Negative prompt guidance: {negative}"
    )

