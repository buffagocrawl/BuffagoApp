from __future__ import annotations

from dataclasses import asdict, dataclass, field, replace
from datetime import datetime
import random
from typing import Any
from uuid import uuid4

from content_engine.settings import ContentEngineSettings
from content_engine.visual_prompt_style import apply_prompt_metadata, build_buffago_image_direction


@dataclass(frozen=True, slots=True)
class ContentCandidate:
    candidate_id: str
    content_type: str
    reason_chosen: str
    working_title: str
    short_summary: str
    target_emotion: str
    suggested_cta: str
    suggested_image_concept: str
    suggested_caption_angle: str
    primary_theme: str
    secondary_theme: str
    mood: str
    hook_style: str
    cta_category: str
    creative_style: str = ""
    hook_text: str = ""
    overlay_text: str = ""
    caption_style: str = ""
    prompt_template_name: str = ""
    restaurants_mentioned: list[str] = field(default_factory=list)
    cities_mentioned: list[str] = field(default_factory=list)
    states_mentioned: list[str] = field(default_factory=list)
    food_categories: list[str] = field(default_factory=list)
    holiday_references: list[str] = field(default_factory=list)
    sports_references: list[str] = field(default_factory=list)
    current_event_references: list[str] = field(default_factory=list)
    source_signals: list[str] = field(default_factory=list)
    visual_style: str = ""
    image_composition: str = ""
    platform: str = "instagram"
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _unique(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        normalized = value.strip()
        if not normalized or normalized.lower() in seen:
            continue
        seen.add(normalized.lower())
        result.append(normalized)
    return result


def _normalize_restaurant(item: Any) -> str | None:
    if not isinstance(item, dict):
        return None
    name = str(item.get("restaurant_name") or item.get("name") or "").strip()
    return name or None


def _normalize_location(item: Any) -> tuple[str | None, str | None]:
    if not isinstance(item, dict):
        return None, None
    city = str(item.get("city") or "").strip() or None
    state = str(item.get("state") or item.get("state_name") or "").strip() or None
    return city, state


QUESTION_OVERLAY_TEMPLATES = (
    "BEST WINGS IN {location}?",
    "WHO HAS THE BEST WINGS IN {state}?",
    "WHERE ARE {state}'S BEST WINGS?",
    "BEST WINGS IN {city}?",
    "WHO HAS THE BEST WINGS HERE?",
)

SHARE_OVERLAY_TEMPLATES = (
    "SEND THIS TO YOUR WING BUDDY",
    "TAG YOUR WING CREW",
    "WHO ARE YOU BRINGING HERE?",
)

OPINION_OVERLAY_TEMPLATES = (
    "WHO GETS THE LAST WING?",
    "RANCH OR BLUE CHEESE?",
    "CRISPY OR SAUCY?",
)

RESTAURANT_OVERLAY_TEMPLATES = (
    "{restaurant} WORTH THE HYPE?",
    "HIDDEN GEM?",
    "WOULD YOU STOP HERE?",
)


def _state_label(state: str | None) -> str:
    if not state:
        return "CT"
    normalized = state.strip().upper()
    if normalized == "CT":
        return "CONNECTICUT"
    if normalized == "NY":
        return "NEW YORK"
    return state.strip()


def _overlay_family_seed(candidate: ContentCandidate, external_context: dict[str, Any], suffix: str) -> str:
    return f"{candidate.candidate_id}:{candidate.content_type}:{external_context.get('date') or external_context.get('day_of_week') or 'no-date'}:{suffix}"


def _overlay_text_for_parts(
    *,
    content_type: str,
    cta_category: str,
    restaurant: str | None,
    city: str | None,
    state: str | None,
    external_context: dict[str, Any],
) -> str:
    candidate = ContentCandidate(
        candidate_id=f"{content_type}:{cta_category}:{restaurant or city or state or 'local'}",
        content_type=content_type,
        reason_chosen="overlay rotation",
        working_title=restaurant or city or state or "local wing post",
        short_summary="overlay rotation helper",
        target_emotion="Curious",
        suggested_cta="Send this to your wing crew.",
        suggested_image_concept="Wings and sauce.",
        suggested_caption_angle="Keep it social and local.",
        primary_theme="restaurant focus" if restaurant else "local food",
        secondary_theme="wing culture",
        mood="Friendly",
        hook_style="direct local hook",
        cta_category=cta_category,
        restaurants_mentioned=[restaurant] if restaurant else [],
        cities_mentioned=[city] if city else [],
        states_mentioned=[state] if state else [],
        food_categories=["wings", "sauce"],
    )
    return _overlay_text_for_candidate(candidate, external_context)


def _overlay_text_for_candidate(candidate: ContentCandidate, external_context: dict[str, Any]) -> str:
    city = candidate.cities_mentioned[0] if candidate.cities_mentioned else None
    state = candidate.states_mentioned[0] if candidate.states_mentioned else None
    restaurant = candidate.restaurants_mentioned[0] if candidate.restaurants_mentioned else None
    available_families = ["question", "share", "opinion", "restaurant"]
    family_weights = [40, 30, 20, 10]
    if candidate.content_type in {"restaurant_spotlight", "hidden_gem"}:
        family_weights = [45, 20, 15, 20]
    elif candidate.content_type in {"meme", "funny_observation", "challenge"}:
        family_weights = [20, 35, 30, 15]
    elif candidate.cta_category == "question":
        family_weights = [55, 20, 15, 10]
    family = random.Random(_overlay_family_seed(candidate, external_context, "family")).choices(available_families, weights=family_weights, k=1)[0]

    if family == "question":
        location = city or _state_label(state)
        templates = []
        if city and state:
            templates.extend(
                [
                    f"BEST WINGS IN {city}?",
                    f"WHO HAS THE BEST WINGS IN {_state_label(state)}?",
                    f"WHERE ARE {_state_label(state)}'S BEST WINGS?",
                    f"BEST WINGS IN {city}?",
                ]
            )
        elif city:
            templates.extend([f"BEST WINGS IN {city}?", f"WHO HAS THE BEST WINGS IN {city}?"])
        elif state:
            templates.extend([f"BEST WINGS IN {_state_label(state)}?", f"WHO HAS THE BEST WINGS IN {_state_label(state)}?"])
        else:
            templates.extend(["BEST WINGS IN TOWN?", "WHO HAS THE BEST WINGS HERE?"])
        templates.extend(
            template.format(location=location or "TOWN", state=_state_label(state), city=city or "TOWN")
            for template in QUESTION_OVERLAY_TEMPLATES
        )
        return random.Random(_overlay_family_seed(candidate, external_context, "question")).choice(_unique(templates))

    if family == "share":
        return random.Random(_overlay_family_seed(candidate, external_context, "share")).choice(list(SHARE_OVERLAY_TEMPLATES))
    if family == "opinion":
        return random.Random(_overlay_family_seed(candidate, external_context, "opinion")).choice(list(OPINION_OVERLAY_TEMPLATES))

    templates = list(RESTAURANT_OVERLAY_TEMPLATES)
    if restaurant:
        templates.insert(0, f"{restaurant} WORTH THE HYPE?")
    return random.Random(_overlay_family_seed(candidate, external_context, "restaurant")).choice(_unique(templates))


class CandidateGenerator:
    def __init__(self, settings: ContentEngineSettings) -> None:
        self.settings = settings

    def _restaurant_pool(self, snapshot: dict[str, Any]) -> list[tuple[str, str | None, str | None]]:
        restaurants: list[tuple[str, str | None, str | None]] = []
        for section in ("recent_ratings", "top_restaurants", "new_restaurants"):
            for item in snapshot.get(section, []) or []:
                restaurant = _normalize_restaurant(item)
                if not restaurant:
                    continue
                city, state = _normalize_location(item)
                restaurants.append((restaurant, city, state))
        return restaurants

    def _candidate_pool(self, snapshot: dict[str, Any], external_context: dict[str, Any], memory_summary: dict[str, Any]) -> list[ContentCandidate]:
        restaurants = self._restaurant_pool(snapshot)
        primary_restaurant = restaurants[0] if restaurants else ("Buffago favorites", "Buffalo", "NY")
        secondary_restaurant = restaurants[1] if len(restaurants) > 1 else primary_restaurant
        trend_topics = list(external_context.get("trend_topics", []) or [])
        news_topics = list(external_context.get("news_topics", []) or [])
        recommended_angles = list(external_context.get("recommended_content_angles", []) or [])
        sports_events = list(external_context.get("sports_events", []) or [])
        holidays = list(external_context.get("major_holidays", []) or []) + list(external_context.get("minor_holidays", []) or [])
        food_holidays = list(external_context.get("food_holidays", []) or [])
        active_states = [str(item.get("state") or item.get("state_name") or "").strip() for item in snapshot.get("active_states", []) or [] if isinstance(item, dict)]
        recent_crawls = list(snapshot.get("crawl_activity", {}).get("recent_crawls", []) or [])
        badge_names = [str(item.get("badge_name") or "").strip() for item in snapshot.get("recent_badges", []) or [] if isinstance(item, dict)]
        xp_levels = list(snapshot.get("xp_streak_milestones", {}).get("xp_levels", []) or [])
        underused_themes = list(memory_summary.get("underused_themes", []) or [])
        recent_ctas = list(memory_summary.get("recent_ctas", []) or [])
        performance_context = memory_summary.get("performance_context") if isinstance(memory_summary.get("performance_context"), dict) else {}
        weak_styles = {
            str(item.get("name") or "").strip().lower()
            for item in performance_context.get("worst_image_styles", [])[:3]
            if isinstance(item, dict)
        }
        strong_categories = [
            str(item.get("name") or "").strip().lower()
            for item in performance_context.get("best_categories", [])[:3]
            if isinstance(item, dict)
        ]

        candidates = [
            ContentCandidate(
                candidate_id=str(uuid4()),
                content_type="restaurant_spotlight",
                creative_style="realistic_food",
                reason_chosen="Top restaurant signal plus recent ratings make this the safest food-first anchor.",
                working_title=f"Why {primary_restaurant[0]} keeps showing up",
                short_summary=f"Spotlight {primary_restaurant[0]} in {primary_restaurant[1] or 'Buffalo'} as a high-signal favorite from recent Buffago activity.",
                hook_text="WHO'S EATING THIS WITH YOU?",
                overlay_text="",
                target_emotion="Curious",
                suggested_cta="Drop your go-to wing spot in the comments.",
                suggested_image_concept=f"Close-up wing tray at {primary_restaurant[0]} with crisp texture and warm restaurant lighting.",
                suggested_caption_angle="Lead with the restaurant name, then a quick local opinion that invites replies.",
                caption_style="food-first-local-opinion",
                prompt_template_name="buffago_post",
                primary_theme="restaurant focus",
                secondary_theme="recent ratings",
                mood="Friendly",
                hook_style="direct local hook",
                cta_category="comment",
                restaurants_mentioned=[primary_restaurant[0]],
                cities_mentioned=[primary_restaurant[1]] if primary_restaurant[1] else [],
                states_mentioned=[primary_restaurant[2]] if primary_restaurant[2] else [],
                food_categories=["wings", "sauce"],
                source_signals=["recent_ratings", "top_restaurants"],
                visual_style="realistic",
                image_composition="single hero plate with short caption space",
                metadata={"prompt_anchors": ["food-first", "local credibility"]},
            ),
            ContentCandidate(
                candidate_id=str(uuid4()),
                content_type="hidden_gem",
                creative_style="realistic_food",
                reason_chosen="A second restaurant lets the feed feel curated instead of repetitive.",
                working_title=f"Hidden gem: {secondary_restaurant[0]}",
                short_summary=f"Frame {secondary_restaurant[0]} as the quieter pick worth saving for later.",
                hook_text="SEND THIS TO YOUR WING CREW",
                overlay_text="",
                target_emotion="Encouraged",
                suggested_cta="Save this for your next crawl.",
                suggested_image_concept=f"Moody but bright table shot of {secondary_restaurant[0]} with wings, celery, and sauce cups.",
                suggested_caption_angle="Make the post feel like a friendly local tip instead of an ad.",
                caption_style="save-worthy-local-tip",
                prompt_template_name="buffago_post",
                primary_theme="hidden gem",
                secondary_theme="restaurant discovery",
                mood="Friendly",
                hook_style="secret tip",
                cta_category="save",
                restaurants_mentioned=[secondary_restaurant[0]],
                cities_mentioned=[secondary_restaurant[1]] if secondary_restaurant[1] else [],
                states_mentioned=[secondary_restaurant[2]] if secondary_restaurant[2] else [],
                food_categories=["wings", "local eats"],
                source_signals=["new_restaurants", "top_restaurants"],
                visual_style="realistic",
                image_composition="tight composition with subtle depth of field",
                metadata={"prompt_anchors": ["curated", "local insider"]},
            ),
            ContentCandidate(
                candidate_id=str(uuid4()),
                content_type="funny_observation",
                creative_style="funny_meme",
                reason_chosen="Humor keeps the brand human and is less likely to feel overproduced.",
                working_title="The wing napkin math problem",
                short_summary="A playful observation about how wings quietly multiply napkins, opinions, and group chat energy.",
                hook_text="FIRST REPLY BUYS THE WINGS",
                overlay_text="",
                target_emotion="Amused",
                suggested_cta="Tell us your most chaotic wing order.",
                suggested_image_concept="Meme-style table scene with wings, napkins, and a mildly dramatic reaction shot.",
                suggested_caption_angle="Use observational humor with a Buffago-local twist.",
                caption_style="observational-joke",
                prompt_template_name="meme",
                primary_theme="humor",
                secondary_theme="wing culture",
                mood="Funny",
                hook_style="observational joke",
                cta_category="comment",
                food_categories=["wings"],
                source_signals=["trend_topics", "recommended_content_angles"],
                visual_style="meme",
                image_composition="split-panel or punchline-forward composition",
                metadata={"prompt_anchors": ["lightly sarcastic", "community banter"]},
            ),
            ContentCandidate(
                candidate_id=str(uuid4()),
                content_type="wing_fact",
                creative_style="app_feature_graphic",
                reason_chosen="Educational posts diversify the feed and give people a reason to save or share.",
                working_title="Wing fact worth knowing",
                short_summary="A clean, snackable fact about wings, sauce, or ordering behavior that feels useful without sounding preachy.",
                hook_text="WHO GETS THE LAST WING?",
                overlay_text="",
                target_emotion="Informed",
                suggested_cta="Save this for the next debate.",
                suggested_image_concept="Graphic-led food fact card with wings and a minimal Buffago color palette.",
                suggested_caption_angle="Keep the wording short and give the post one clear takeaway.",
                caption_style="educational-saveable",
                prompt_template_name="buffago_post",
                primary_theme="education",
                secondary_theme="wing trivia",
                mood="Educational",
                hook_style="fact hook",
                cta_category="save",
                food_categories=["wings", "sauce"],
                source_signals=["trend_topics"],
                visual_style="app_marketing",
                image_composition="clean graphic layout with one hero detail",
                metadata={"prompt_anchors": ["educational", "easy to scan"]},
            ),
            ContentCandidate(
                candidate_id=str(uuid4()),
                content_type="community_highlight",
                creative_style="sports_map_graphic",
                reason_chosen="Community content broadens the account beyond restaurants and signals real local activity.",
                working_title=f"Buffago in {active_states[0] if active_states else 'New York'}",
                short_summary="Highlight the people, states, or local energy behind the Buffago ecosystem without over-explaining it.",
                hook_text="WHO'S DOWN FOR WING NIGHT?",
                overlay_text="",
                target_emotion="Connected",
                suggested_cta="Which city should get the next spotlight?",
                suggested_image_concept="Community map graphic with local pins and wing markers across active states.",
                suggested_caption_angle="Focus on the map, the community, and the playful competition between cities.",
                caption_style="question-led-community",
                prompt_template_name="buffago_post",
                primary_theme="community",
                secondary_theme="local activity",
                mood="Friendly",
                hook_style="community opener",
                cta_category="question",
                cities_mentioned=[item.get("city") for item in snapshot.get("recent_ratings", [])[:2] if isinstance(item, dict) and item.get("city")],
                states_mentioned=[state for state in active_states if state],
                source_signals=["active_states", "crawl_activity"],
                visual_style="illustration",
                image_composition="map-forward layout with playful route cues",
                metadata={"prompt_anchors": ["community", "local competition"]},
            ),
            ContentCandidate(
                candidate_id=str(uuid4()),
                content_type="xp_milestone",
                creative_style="app_demo",
                reason_chosen="Gamified content helps the feed feel like it belongs to the product, not just the marketing team.",
                working_title="Someone just crossed a big XP line",
                short_summary="Use the XP and streak context to frame a milestone post that rewards participation.",
                hook_text="TAG YOUR WING MVP",
                overlay_text="",
                target_emotion="Motivated",
                suggested_cta="Who is closest to the next level?",
                suggested_image_concept="Badge-style XP milestone graphic with a wing reward and bold level callout.",
                suggested_caption_angle="Make it feel like a celebration, not a stat dump.",
                caption_style="app-feature-celebration",
                prompt_template_name="buffago_post",
                primary_theme="gamification",
                secondary_theme="XP",
                mood="Exciting",
                hook_style="achievement hook",
                cta_category="question",
                food_categories=["wings"],
                source_signals=["xp_streak_milestones", "recent_badges"],
                visual_style="app_marketing",
                image_composition="bold badge-centered layout",
                metadata={"prompt_anchors": ["achievement", "community progress"]},
            ),
            ContentCandidate(
                candidate_id=str(uuid4()),
                content_type="leaderboard",
                creative_style="app_demo",
                reason_chosen="Leaderboards create natural comparison and comments without needing a hard sell.",
                working_title="The current wing leaderboard mood",
                short_summary="Turn ratings or crawl activity into a playful comparison format that invites debate.",
                hook_text="WHO GETS THE LAST WING?",
                overlay_text="",
                target_emotion="Competitive",
                suggested_cta="Who would you move up the board?",
                suggested_image_concept="Leaderboard graphic with wing spots and local city cues.",
                suggested_caption_angle="Frame it as a friendly debate rather than a rigid ranking claim.",
                caption_style="debate-starter",
                prompt_template_name="buffago_post",
                primary_theme="competition",
                secondary_theme="local ranking",
                mood="Competitive",
                hook_style="ranking hook",
                cta_category="comment",
                restaurants_mentioned=[primary_restaurant[0], secondary_restaurant[0]],
                cities_mentioned=[city for city in [primary_restaurant[1], secondary_restaurant[1]] if city],
                states_mentioned=[state for state in [primary_restaurant[2], secondary_restaurant[2]] if state],
                source_signals=["recent_ratings", "crawl_activity"],
                visual_style="app_marketing",
                image_composition="stacked board with bold labels",
                metadata={"prompt_anchors": ["comparison", "debate starter"]},
            ),
            ContentCandidate(
                candidate_id=str(uuid4()),
                content_type="challenge",
                creative_style="poll_question",
                reason_chosen="Challenges are a good bridge between product, humor, and comments.",
                working_title="One more wing stop challenge",
                short_summary="Challenge the audience to build the most disciplined or least disciplined crawl route possible.",
                hook_text="START THE TIMER",
                overlay_text="",
                target_emotion="Playful",
                suggested_cta="Drop your crawl version in the comments.",
                suggested_image_concept="Challenge card with route lines, wings, and a playful scorecard.",
                suggested_caption_angle="Use a light dare that sounds like Buffago, not a brand slogan.",
                caption_style="question-led-challenge",
                prompt_template_name="buffago_post",
                primary_theme="challenge",
                secondary_theme="crawl planning",
                mood="Exciting",
                hook_style="challenge hook",
                cta_category="comment",
                cities_mentioned=[item.get("city") for item in recent_crawls if isinstance(item, dict) and item.get("city")],
                states_mentioned=[item.get("state") for item in recent_crawls if isinstance(item, dict) and item.get("state")],
                source_signals=["crawl_activity", "trend_topics"],
                visual_style="illustration",
                image_composition="route-based graphic with score cues",
                metadata={"prompt_anchors": ["interactive", "shareable"]},
            ),
            ContentCandidate(
                candidate_id=str(uuid4()),
                content_type="sports_tie_in",
                creative_style="sports",
                reason_chosen="Sports make sense today and give the post a timely, communal rhythm.",
                working_title="Game day wings, no complicated analysis",
                short_summary="Tie wing energy to the current sports mood without pretending to know specific scores.",
                hook_text="SEND THIS TO THE GROUP CHAT",
                overlay_text="",
                target_emotion="Ready",
                suggested_cta="Game day order: what are you picking?",
                suggested_image_concept="Game-day wings on a table with jersey colors and a cozy watch-party setup.",
                suggested_caption_angle="Keep the sports mention broad and the food focus obvious.",
                caption_style="game-day-question",
                prompt_template_name="buffago_post",
                primary_theme="sports",
                secondary_theme="watch party",
                mood="Exciting",
                hook_style="game day hook",
                cta_category="question",
                sports_references=sports_events,
                current_event_references=trend_topics[:2] + news_topics[:2],
                source_signals=["sports_events", "trend_topics", "news_topics"],
                visual_style="realistic",
                image_composition="table spread with layered props",
                metadata={"prompt_anchors": ["timely", "broad sports tie-in"]},
            ),
            ContentCandidate(
                candidate_id=str(uuid4()),
                content_type="food_holiday",
                creative_style="realistic_food",
                reason_chosen="Food holiday posts are reliable, relevant, and easy to keep visually sharp.",
                working_title="If today is a food holiday, wings are answering the call",
                short_summary="Lean into the food holiday frame while keeping the tone playful and direct.",
                hook_text="CANCEL YOUR PLANS. GET WINGS.",
                overlay_text="",
                target_emotion="Hungry",
                suggested_cta="Which sauce would you pair with it?",
                suggested_image_concept="Celebratory wing platter with festive accents and bright color contrast.",
                suggested_caption_angle="Make the holiday feel like an obvious excuse to post wings.",
                caption_style="seasonal-question",
                prompt_template_name="buffago_post",
                primary_theme="holiday",
                secondary_theme="food celebration",
                mood="Curious",
                hook_style="holiday hook",
                cta_category="question",
                holiday_references=holidays + food_holidays,
                source_signals=["major_holidays", "food_holidays", "local_or_national_events"],
                visual_style="realistic",
                image_composition="hero platter with festive props",
                metadata={"prompt_anchors": ["seasonal", "craveable"]},
            ),
            ContentCandidate(
                candidate_id=str(uuid4()),
                content_type="meme",
                creative_style="funny_meme",
                reason_chosen="A meme is the best counterweight if the feed has recently leaned too promotional.",
                working_title="When the wing debate gets out of hand",
                short_summary="Use a playful meme structure to keep the feed unexpected and comment-friendly.",
                hook_text="WHO GETS THE LAST WING?",
                overlay_text="",
                target_emotion="Amused",
                suggested_cta="What side are you on?",
                suggested_image_concept="High-contrast meme with a dramatic wing moment and a clear joke setup.",
                suggested_caption_angle="Light sarcasm, short text, and one obvious punchline.",
                caption_style="meme-debate",
                prompt_template_name="meme",
                primary_theme="humor",
                secondary_theme="debate",
                mood="Funny",
                hook_style="meme hook",
                cta_category="question",
                food_categories=["wings", "sauce"],
                source_signals=["trend_topics", "recommended_content_angles"],
                visual_style="meme",
                image_composition="two-panel meme with strong crop safety",
                metadata={"prompt_anchors": ["unexpected", "shareable"]},
            ),
        ]

        if not food_holidays:
            candidates = [candidate for candidate in candidates if candidate.content_type != "food_holiday"]
        if not sports_events:
            candidates = [candidate for candidate in candidates if candidate.content_type != "sports_tie_in"]

        if underused_themes:
            for candidate in candidates:
                if candidate.primary_theme in underused_themes:
                    candidate.metadata["diversity_hint"] = "boost"

        if recent_ctas:
            for candidate in candidates:
                if candidate.suggested_cta in recent_ctas:
                    candidate.metadata["cta_repeat_risk"] = True

        for candidate in candidates:
            seed = f"{candidate.candidate_id}:{candidate.content_type}:{candidate.working_title}"
            apply_prompt_metadata(
                candidate.metadata,
                build_buffago_image_direction(seed, content_type=candidate.content_type),
            )
            if candidate.visual_style.lower() in weak_styles:
                candidate.metadata["poor_image_style_risk"] = True
            if candidate.content_type.lower() in strong_categories or candidate.primary_theme.lower() in strong_categories:
                candidate.metadata["performance_pattern_match"] = True
            if performance_context.get("prompt_guidance"):
                candidate.metadata["learning_prompt_guidance"] = performance_context["prompt_guidance"]
            active_strategy = performance_context.get("active_strategy") if isinstance(performance_context.get("active_strategy"), dict) else {}
            strategy_config = active_strategy.get("strategy") if isinstance(active_strategy.get("strategy"), dict) else {}
            if candidate.creative_style in strategy_config.get("use_more_creative_styles", []):
                candidate.metadata["strategy_preferred_style"] = True
            if candidate.creative_style in strategy_config.get("reduce_creative_styles", []):
                candidate.metadata["strategy_reduce_style"] = True
            if candidate.hook_text in strategy_config.get("preferred_hook_patterns", []):
                candidate.metadata["strategy_preferred_hook"] = True
            if candidate.caption_style in strategy_config.get("preferred_caption_styles", []):
                candidate.metadata["strategy_preferred_caption_style"] = True

        candidates = [replace(candidate, overlay_text=_overlay_text_for_candidate(candidate, external_context)) for candidate in candidates]
        return candidates

    def generate_candidates(
        self,
        *,
        snapshot: dict[str, Any],
        external_context: dict[str, Any],
        memory_summary: dict[str, Any],
        scheduled_post_type: str | None = None,
    ) -> list[ContentCandidate]:
        pool = self._candidate_pool(snapshot, external_context, memory_summary)
        if scheduled_post_type == "meme_post":
            pool = [candidate for candidate in pool if candidate.content_type == "meme"]
        elif scheduled_post_type == "buffago_post":
            pool = [candidate for candidate in pool if candidate.content_type not in {"meme", "funny_observation"}]
        limit = self.settings.candidate_count()
        if len(pool) < self.settings.candidate_count_min:
            return pool[: self.settings.candidate_count_min]
        return pool[: max(self.settings.candidate_count_min, min(limit, len(pool)))]
