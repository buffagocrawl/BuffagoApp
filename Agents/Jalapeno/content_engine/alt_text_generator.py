from __future__ import annotations

from typing import Any

from content_engine.candidate_generator import ContentCandidate


def generate_alt_text(candidate: ContentCandidate, *, image_prompt: str, snapshot: dict[str, Any], external_context: dict[str, Any]) -> str:
    restaurant = candidate.restaurants_mentioned[0] if candidate.restaurants_mentioned else "a Buffago wing spot"
    city = candidate.cities_mentioned[0] if candidate.cities_mentioned else None
    mood = candidate.target_emotion.lower()
    scene_parts = [
        f"{candidate.visual_style} Instagram image",
        f"centered on {restaurant}",
        f"with a {mood} mood",
        "crispy wings and sauce",
    ]
    if city:
        scene_parts.append(f"hinting at {city}")
    if candidate.states_mentioned:
        scene_parts.append(f"local New York food scene")
    if candidate.content_type in {"sports_tie_in", "challenge"}:
        scene_parts.append("with playful game-day or challenge energy")
    if candidate.content_type in {"meme", "funny_observation"}:
        scene_parts.append("with a humorous social media layout")
    if candidate.food_categories:
        scene_parts.append(f"featuring {' and '.join(candidate.food_categories[:2])}")
    scene_parts.append("in Buffago colors with readable composition for screen readers")
    return ", ".join(scene_parts) + "."

