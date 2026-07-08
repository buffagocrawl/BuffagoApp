from __future__ import annotations

from typing import Any

from content_engine.candidate_generator import ContentCandidate
from content_engine.visual_prompt_style import (
    STRICT_NEGATIVE_RULES,
    apply_prompt_metadata,
    build_buffago_image_direction,
    build_scene_direction_prompt,
)


def _restaurant_scene(candidate: ContentCandidate, restaurant: str, city: str) -> tuple[str, str, str, str]:
    setting = f"busy neighborhood wing restaurant at {restaurant} in {city}"
    characters = "regulars, servers, and a few friends orbit a basket of wings that has become the center of attention"
    conflict = "someone says this should decide the wing-night plan and the whole table leans in"
    mood = "hungry, local, social, and instantly shareable"
    return setting, characters, conflict, mood


def _meme_scene(candidate: ContentCandidate) -> tuple[str, str, str, str]:
    setting = "packed sports bar during peak wing-night chaos"
    characters = "lifelong friends, a bartender, nearby diners, and one bystander with a phone all react to the same basket of wings"
    conflict = "a flats-versus-drums or sauce debate takes over the table and everyone has picked a side"
    mood = "cinematic, social, food-obsessed, and immediately understandable without a caption"
    return setting, characters, conflict, mood


def _community_scene(candidate: ContentCandidate, city: str) -> tuple[str, str, str, str]:
    setting = f"lively {city} wing crawl meetup inside a warm restaurant"
    characters = "wing-crawl regulars compare route ideas while a heroic platter of wings interrupts the planning"
    conflict = "the group cannot agree on the next stop because the platter just turned into the plan"
    mood = "communal, playful, active, appetizing, and shareable"
    return setting, characters, conflict, mood


def _challenge_scene(candidate: ContentCandidate, city: str) -> tuple[str, str, str, str]:
    setting = f"high-energy wing crawl table in {city}"
    characters = "friends lean over a table packed with wings, sauce cups, napkins, and crawl notes"
    conflict = "one person throws out a wing challenge or hot take and the table reacts immediately"
    mood = "competitive, playful, kinetic, wing-first, and social"
    return setting, characters, conflict, mood


def generate_image_prompt(candidate: ContentCandidate, *, snapshot: dict[str, Any], external_context: dict[str, Any]) -> str:
    restaurant = candidate.restaurants_mentioned[0] if candidate.restaurants_mentioned else "Buffago"
    city = candidate.cities_mentioned[0] if candidate.cities_mentioned else "Buffalo"
    seed = f"{candidate.candidate_id}:{candidate.content_type}:{candidate.working_title}"
    direction = build_buffago_image_direction(seed, content_type=candidate.content_type)
    apply_prompt_metadata(candidate.metadata, direction)

    if candidate.content_type == "meme":
        setting, characters, conflict, mood = _meme_scene(candidate)
    elif candidate.content_type in {"restaurant_spotlight", "hidden_gem", "food_holiday", "sports_tie_in"}:
        setting, characters, conflict, mood = _restaurant_scene(candidate, restaurant, city)
    elif candidate.content_type in {"community_highlight", "xp_milestone", "leaderboard"}:
        setting, characters, conflict, mood = _community_scene(candidate, city)
    else:
        setting, characters, conflict, mood = _challenge_scene(candidate, city)

    prompt = build_scene_direction_prompt(
        setting=setting,
        characters=characters,
        conflict=conflict,
        mood=mood,
        direction=direction,
    )
    if STRICT_NEGATIVE_RULES not in prompt:
        return f"{prompt} {STRICT_NEGATIVE_RULES}."
    return prompt
