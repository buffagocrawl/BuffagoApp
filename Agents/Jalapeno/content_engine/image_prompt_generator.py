from __future__ import annotations

from typing import Any

from content_engine.candidate_generator import ContentCandidate


STRICT_NEGATIVE_RULES = (
    "no visible words, no captions, no meme text, no logos, no signage, no screenshots, "
    "no UI, no prompt text, no fake app screens, no abstract placeholder shapes"
)


def _restaurant_scene(candidate: ContentCandidate, restaurant: str, city: str) -> str:
    return (
        f"A photorealistic casual wing restaurant scene centered on crispy, saucy chicken wings at {restaurant}, "
        f"set in {city}, warm natural restaurant lighting, glossy sauce texture, celery and blue cheese nearby, "
        "real plates and tables, natural human energy in the background, appetizing food detail, mobile-friendly framing"
    )


def _meme_scene(candidate: ContentCandidate) -> str:
    return (
        "A funny photorealistic scene at a casual wing restaurant: two friends dramatically arguing over flats versus drums, "
        "baskets of saucy chicken wings on the table, blue cheese and celery nearby, expressive but natural faces, "
        "warm restaurant lighting, candid energy, realistic food textures"
    )


def _community_scene(candidate: ContentCandidate, city: str) -> str:
    return (
        f"An illustrated Buffago-style community scene inspired by {city}: wing lovers comparing routes, badges, maps, and discovery moments, "
        "clean layered composition, energetic but grounded, warm reds and oranges, polished product-marketing art direction"
    )


def _challenge_scene(candidate: ContentCandidate, city: str) -> str:
    return (
        f"An illustrated route-planning scene inspired by a wing crawl in {city}, with baskets of wings, map pins, route lines, and playful competition energy, "
        "clean composition, bright highlights, polished social-post framing"
    )


def generate_image_prompt(candidate: ContentCandidate, *, snapshot: dict[str, Any], external_context: dict[str, Any]) -> str:
    restaurant = candidate.restaurants_mentioned[0] if candidate.restaurants_mentioned else "Buffago"
    city = candidate.cities_mentioned[0] if candidate.cities_mentioned else "Buffalo"
    if candidate.content_type == "meme":
        scene = _meme_scene(candidate)
    elif candidate.content_type in {"restaurant_spotlight", "hidden_gem", "food_holiday", "sports_tie_in"}:
        scene = _restaurant_scene(candidate, restaurant, city)
    elif candidate.content_type in {"community_highlight", "xp_milestone", "leaderboard"}:
        scene = _community_scene(candidate, city)
    else:
        scene = _challenge_scene(candidate, city)

    return (
        f"{scene}, no alcohol focus, no distorted anatomy, no uncanny faces, no cluttered stock-photo energy, "
        f"{STRICT_NEGATIVE_RULES}."
    )
