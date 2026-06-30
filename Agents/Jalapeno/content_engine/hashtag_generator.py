from __future__ import annotations

import re
from typing import Any

from content_engine.candidate_generator import ContentCandidate


BANLIST = {
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
}


def _slug(value: str) -> str:
    cleaned = re.sub(r"[^a-z0-9]+", "", value.lower())
    return cleaned


def generate_hashtags(candidate: ContentCandidate, *, snapshot: dict[str, Any], external_context: dict[str, Any], limit: int = 12) -> list[str]:
    restaurant = candidate.restaurants_mentioned[0] if candidate.restaurants_mentioned else None
    city = candidate.cities_mentioned[0] if candidate.cities_mentioned else None
    state = candidate.states_mentioned[0] if candidate.states_mentioned else None
    base_tags = ["Buffago", "BuffaloWings", "WingCrawl", "LocalFood", "WingCulture"]
    content_tags = {
        "restaurant_spotlight": ["WingSpotlight", "RestaurantFind"],
        "hidden_gem": ["HiddenGem", "LocalFind"],
        "funny_observation": ["WingHumor", "WingThoughts"],
        "wing_fact": ["WingFact", "FoodFacts"],
        "community_highlight": ["BuffagoCommunity", "LocalWins"],
        "xp_milestone": ["BuffagoXP", "WingLevels"],
        "leaderboard": ["WingLeaderboard", "LocalRanking"],
        "challenge": ["WingChallenge", "BuffagoChallenge"],
        "food_holiday": ["FoodHoliday", "WingHoliday"],
        "sports_tie_in": ["GameDayWings", "SportsAndWings"],
        "meme": ["WingMeme", "FoodMeme"],
    }.get(candidate.content_type, [])
    location_tags = [tag for tag in [city and f"{_slug(city)}", state and f"{_slug(state)}"] if tag]
    wing_tags = ["Wings", "Sauce", "BlueCheese", "WingLove"]
    restaurant_tags = [f"{_slug(restaurant)}" if restaurant else None]
    dynamic_tags = []
    for item in [
        candidate.primary_theme,
        candidate.secondary_theme,
        *candidate.food_categories,
        *candidate.holiday_references,
        *candidate.sports_references,
        *candidate.current_event_references,
    ]:
        slug = _slug(str(item))
        if slug:
            dynamic_tags.append(slug)

    tags = []
    for pool in (base_tags, content_tags, location_tags, wing_tags, [tag for tag in restaurant_tags if tag], dynamic_tags):
        for tag in pool:
            if not tag:
                continue
            normalized = tag if tag.startswith("#") else f"#{tag}"
            if normalized.lower().lstrip("#") in BANLIST:
                continue
            if normalized.lower() not in {item.lower() for item in tags}:
                tags.append(normalized)
            if len(tags) >= limit:
                break
        if len(tags) >= limit:
            break

    # Ensure a branded, local mix even when source data is thin.
    fallback = ["#Buffago", "#BuffaloWings", "#WingCrawl", "#LocalEats", "#WingSpot"]
    for tag in fallback:
        if len(tags) >= max(10, min(limit, 15)):
            break
        if tag.lower() not in {item.lower() for item in tags}:
            tags.append(tag)
    return tags[:max(10, min(limit, 15))]
