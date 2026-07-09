from __future__ import annotations

import random
import re
from typing import Any

from content_engine.candidate_generator import ContentCandidate


BANNED_PHRASES = {
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

LOCATION_TAGS = (
    "#ConnecticutWings",
    "#CTFood",
    "#ConnecticutEats",
    "#BuffaloNY",
    "#NewYorkWings",
    "#NYFood",
    "#LocalEats",
    "#EatLocal",
)

WING_FOOD_TAGS = (
    "#WingLovers",
    "#BuffaloWings",
    "#ChickenWings",
    "#BestWings",
    "#WingNight",
    "#SaucyWings",
    "#WingCrawl",
)

DISCOVERY_TAGS = (
    "#Foodie",
    "#EatLocal",
    "#SupportLocal",
    "#FoodReels",
    "#LocalFood",
    "#WingReels",
)

BRAND_TAGS = (
    "#Buffago",
    "#BuffagoEats",
    "#BuffagoWings",
)

CONTENT_TAGS: dict[str, tuple[str, ...]] = {
    "restaurant_spotlight": ("#WingSpotlight", "#RestaurantFind", "#WorthTheStop"),
    "hidden_gem": ("#HiddenGem", "#LocalFind", "#WorthTheHype"),
    "funny_observation": ("#WingHumor", "#WingThoughts", "#WingTalk"),
    "wing_fact": ("#WingFact", "#FoodFacts", "#WingKnowledge"),
    "community_highlight": ("#BuffagoCommunity", "#LocalWins", "#CommunityEats"),
    "xp_milestone": ("#BuffagoXP", "#WingLevels", "#MilestoneMoment"),
    "leaderboard": ("#WingLeaderboard", "#LocalRanking", "#BestWings"),
    "challenge": ("#WingChallenge", "#BuffagoChallenge", "#WingNight"),
    "food_holiday": ("#FoodHoliday", "#WingHoliday", "#WingWednesday"),
    "sports_tie_in": ("#GameDayWings", "#SportsAndWings", "#GameNightEats"),
    "meme": ("#WingMeme", "#FoodMeme", "#WingReels"),
}

BANLIST = {phrase.lower() for phrase in BANNED_PHRASES}


def _slug(value: str) -> str:
    cleaned = re.sub(r"[^a-z0-9]+", "", value.lower())
    return cleaned


def _normalize_tag(tag: str) -> str:
    cleaned = tag.strip()
    if not cleaned:
        return ""
    cleaned = cleaned if cleaned.startswith("#") else f"#{cleaned}"
    cleaned = re.sub(r"[^#A-Za-z0-9_]+", "", cleaned)
    return cleaned


def _dedupe(tags: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for tag in tags:
        normalized = _normalize_tag(tag)
        if not normalized:
            continue
        lowered = normalized.lower()
        if lowered in seen:
            continue
        if lowered.lstrip("#") in BANLIST:
            continue
        seen.add(lowered)
        result.append(normalized)
    return result


def _seed_value(*parts: Any) -> str:
    return ":".join(str(part) for part in parts if str(part).strip())


def _pick_from(pool: list[str], *, seed: str) -> str | None:
    options = _dedupe(pool)
    if not options:
        return None
    return options[random.Random(seed).randrange(len(options))]


def _location_pools(candidate: ContentCandidate) -> list[str]:
    restaurant = candidate.restaurants_mentioned[0] if candidate.restaurants_mentioned else None
    city = candidate.cities_mentioned[0] if candidate.cities_mentioned else None
    state = candidate.states_mentioned[0] if candidate.states_mentioned else None

    pools: list[str] = []
    if city and state:
        city_slug = _slug(city)
        state_slug = _slug(state)
        if city_slug and state_slug:
            pools.extend(
                [
                    f"#{city_slug.title()}{state_slug.upper()}",
                    f"#{city_slug.title()}Eats",
                    f"#{state_slug.upper()}Food",
                    f"#{state_slug.upper()}Eats",
                ]
            )
    if state:
        state_slug = _slug(state)
        if state_slug == "ct":
            pools.extend(["#ConnecticutWings", "#CTFood", "#ConnecticutEats"])
        elif state_slug == "ny":
            pools.extend(["#NewYorkWings", "#NYFood", "#NewYorkEats"])
        else:
            pools.extend([f"#{state_slug.title()}Wings", f"#{state_slug.upper()}Food", f"#{state_slug.upper()}Eats"])
    if city:
        city_slug = _slug(city)
        if city_slug:
            pools.extend([f"#{city_slug.title()}Wings", f"#{city_slug.title()}Eats"])
    if restaurant:
        restaurant_slug = _slug(restaurant)
        if restaurant_slug:
            pools.append(f"#{restaurant_slug.title()}Spot")
    pools.extend(LOCATION_TAGS)
    return pools


def _wing_food_pools(candidate: ContentCandidate) -> list[str]:
    pools = list(WING_FOOD_TAGS)
    for food in candidate.food_categories:
        slug = _slug(food)
        if slug:
            pools.append(f"#{slug.title()}")
    if candidate.content_type in CONTENT_TAGS:
        pools.extend(CONTENT_TAGS[candidate.content_type])
    return pools


def _discovery_pools(candidate: ContentCandidate) -> list[str]:
    pools = list(DISCOVERY_TAGS)
    if candidate.primary_theme:
        slug = _slug(candidate.primary_theme)
        if slug:
            pools.append(f"#{slug.title()}")
    if candidate.secondary_theme:
        slug = _slug(candidate.secondary_theme)
        if slug:
            pools.append(f"#{slug.title()}")
    return pools


def _build_hashtag_mix(candidate: ContentCandidate, *, seed: str, limit: int = 5) -> list[str]:
    pools = {
        "brand": list(BRAND_TAGS),
        "location": _location_pools(candidate),
        "wing": _wing_food_pools(candidate),
        "discovery": _discovery_pools(candidate),
        "content": list(CONTENT_TAGS.get(candidate.content_type, ())),
    }
    chosen: list[str] = []
    order = ["brand", "location", "wing", "discovery", "wing"]
    for index, category in enumerate(order):
        pool = pools.get(category, [])
        pick = _pick_from(pool, seed=f"{seed}:{category}:{index}")
        if pick and pick.lower() not in {tag.lower() for tag in chosen}:
            chosen.append(pick)
    if len(chosen) < limit:
        fallback_pool = pools["content"] + pools["wing"] + pools["discovery"] + pools["location"] + pools["brand"]
        randomized = list(_dedupe(fallback_pool))
        random.Random(f"{seed}:fill").shuffle(randomized)
        for tag in randomized:
            if len(chosen) >= limit:
                break
            if tag.lower() not in {item.lower() for item in chosen}:
                chosen.append(tag)
    return chosen[:limit]


def generate_hashtags(
    candidate: ContentCandidate,
    *,
    snapshot: dict[str, Any],
    external_context: dict[str, Any],
    limit: int = 5,
) -> list[str]:
    seed = _seed_value(
        candidate.candidate_id,
        candidate.content_type,
        external_context.get("date") or external_context.get("day_of_week") or "no-date",
        snapshot.get("snapshot_date") or snapshot.get("generated_at") or "snapshot",
    )
    return _build_hashtag_mix(candidate, seed=seed, limit=limit)


def generate_fallback_hashtags(*, content_slot: str, signals: list[str], seed: str | None = None) -> list[str]:
    synthetic_candidate = ContentCandidate(
        candidate_id=seed or content_slot,
        content_type="restaurant_spotlight" if content_slot == "buffago_post" else "meme",
        reason_chosen="fallback hashtags",
        working_title="fallback hashtags",
        short_summary="fallback hashtags",
        target_emotion="Curious",
        suggested_cta="Send this to your wing crew.",
        suggested_image_concept="Wings and sauce.",
        suggested_caption_angle="Keep it social and local.",
        primary_theme="local food",
        secondary_theme="wing night",
        mood="Friendly",
        hook_style="direct",
        cta_category="send",
        food_categories=["wings", "sauce"],
        source_signals=signals,
        visual_style="realistic",
    )
    fallback_seed = _seed_value(content_slot, ":".join(signals) or "fallback", seed or "hashtags")
    return _build_hashtag_mix(synthetic_candidate, seed=fallback_seed, limit=5)
