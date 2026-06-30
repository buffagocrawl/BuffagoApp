from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from logging_utils import log_event
from supabase_client import SupabaseClient, SupabaseError


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _split_values(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if isinstance(value, dict):
        out: list[str] = []
        for item in value.values():
            out.extend(_split_values(item))
        return out
    text = str(value).strip()
    return [text] if text else []


@dataclass(frozen=True, slots=True)
class ContentMemoryEntry:
    post_id: str
    run_id: str | None
    timestamp: str
    platform: str
    post_type: str | None
    primary_theme: str | None
    secondary_theme: str | None
    mood: str | None
    target_emotion: str | None
    restaurants_mentioned: list[str] = field(default_factory=list)
    cities_mentioned: list[str] = field(default_factory=list)
    states_mentioned: list[str] = field(default_factory=list)
    food_categories: list[str] = field(default_factory=list)
    holiday_references: list[str] = field(default_factory=list)
    sports_references: list[str] = field(default_factory=list)
    current_event_references: list[str] = field(default_factory=list)
    hook_style: str | None = None
    cta_category: str | None = None
    specific_cta: str | None = None
    hashtags: list[str] = field(default_factory=list)
    dominant_image_colors: list[str] = field(default_factory=list)
    image_style: str | None = None
    image_composition: str | None = None
    caption_length: int | None = None
    emoji_count: int | None = None
    question_included: bool | None = None
    carousel: bool | None = None
    publishing_time: str | None = None
    likes: int | None = None
    comments: int | None = None
    shares: int | None = None
    saves: int | None = None
    reach: int | None = None
    impressions: int | None = None
    engagement_rate: float | None = None
    follower_growth: int | None = None
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True, slots=True)
class ContentMemorySummary:
    total_entries: int
    recent_themes: list[str]
    underused_themes: list[str]
    recent_ctas: list[str]
    recent_restaurants: list[str]
    recent_hooks: list[str]
    recent_visual_styles: list[str]
    recent_image_compositions: list[str]
    recent_post_types: list[str]
    theme_counts: dict[str, int]
    cta_counts: dict[str, int]
    restaurant_counts: dict[str, int]
    hook_counts: dict[str, int]
    visual_style_counts: dict[str, int]
    image_composition_counts: dict[str, int]
    community_activity_score: int
    theme_rotation_needed: bool
    reasoning: list[str] = field(default_factory=list)


def _content_memory_table_rows(client: SupabaseClient, table_name: str, limit: int = 30) -> list[dict[str, Any]]:
    try:
        rows = client.fetch_rows(table_name, select="*", filters={"order": "timestamp.desc", "limit": limit})
        return [row for row in rows if isinstance(row, dict)]
    except SupabaseError:
        return []


def _recent_posts_rows(client: SupabaseClient, limit: int = 30) -> list[dict[str, Any]]:
    try:
        rows = client.fetch_rows(
            "jalapeno_posts",
            select="*",
            filters={"publish_status": "eq.published", "order": "published_at.desc", "limit": limit},
        )
        parsed = [row for row in rows if isinstance(row, dict)]
        if parsed:
            return parsed
        rows = client.fetch_rows("jalapeno_posts", select="*", filters={"order": "created_at.desc", "limit": limit})
        return [row for row in rows if isinstance(row, dict)]
    except SupabaseError:
        return []


def infer_memory_entry_from_post(post: dict[str, Any]) -> ContentMemoryEntry:
    metadata = post.get("metadata") if isinstance(post.get("metadata"), dict) else {}
    caption = str(post.get("generated_caption") or post.get("caption") or "")
    hashtags = _split_values(post.get("hashtags") or metadata.get("hashtags"))
    restaurants = _split_values(metadata.get("restaurants_mentioned") or post.get("restaurants_mentioned"))
    cities = _split_values(metadata.get("cities_mentioned") or post.get("cities_mentioned"))
    states = _split_values(metadata.get("states_mentioned") or post.get("states_mentioned"))
    content_type = str(post.get("post_type") or metadata.get("content_type") or "").strip() or None
    hook_style = str(metadata.get("hook_style") or post.get("hook_style") or "").strip() or None
    cta = str(metadata.get("specific_cta") or metadata.get("cta") or post.get("cta") or "").strip() or None
    cta_category = str(metadata.get("cta_category") or post.get("cta_category") or "").strip() or None
    image_style = str(metadata.get("image_style") or post.get("image_style") or "").strip() or None
    image_composition = str(metadata.get("image_composition") or post.get("image_composition") or "").strip() or None
    emoji_count = caption.count("🙂") + caption.count("😂") + caption.count("🔥") + caption.count("🍗") + caption.count("🎉") + caption.count("😄")
    return ContentMemoryEntry(
        post_id=str(post.get("id") or uuid4()),
        run_id=str(post.get("run_id")) if post.get("run_id") else None,
        timestamp=str(post.get("published_at") or post.get("created_at") or _utcnow().isoformat()),
        platform=str(post.get("platform") or "instagram"),
        post_type=content_type,
        primary_theme=str(metadata.get("primary_theme") or post.get("primary_theme") or content_type or "").strip() or None,
        secondary_theme=str(metadata.get("secondary_theme") or post.get("secondary_theme") or "").strip() or None,
        mood=str(metadata.get("mood") or post.get("mood") or "").strip() or None,
        target_emotion=str(metadata.get("target_emotion") or post.get("target_emotion") or "").strip() or None,
        restaurants_mentioned=restaurants,
        cities_mentioned=cities,
        states_mentioned=states,
        food_categories=_split_values(metadata.get("food_categories") or post.get("food_categories")),
        holiday_references=_split_values(metadata.get("holiday_references") or post.get("holiday_references")),
        sports_references=_split_values(metadata.get("sports_references") or post.get("sports_references")),
        current_event_references=_split_values(metadata.get("current_event_references") or post.get("current_event_references")),
        hook_style=hook_style,
        cta_category=cta_category,
        specific_cta=cta,
        hashtags=hashtags,
        dominant_image_colors=_split_values(metadata.get("dominant_image_colors") or post.get("dominant_image_colors")),
        image_style=image_style,
        image_composition=image_composition,
        caption_length=len(caption),
        emoji_count=emoji_count,
        question_included="?" in caption,
        carousel=bool(metadata.get("carousel") or post.get("carousel")) if metadata.get("carousel") is not None or post.get("carousel") is not None else None,
        publishing_time=str(metadata.get("publishing_time") or post.get("publishing_time") or "").strip() or None,
        likes=post.get("likes"),
        comments=post.get("comments"),
        shares=post.get("shares"),
        saves=post.get("saves"),
        reach=post.get("reach"),
        impressions=post.get("impressions"),
        engagement_rate=post.get("engagement_rate"),
        follower_growth=post.get("follower_growth"),
        metadata=metadata,
    )


def _count_top(values: list[str], limit: int = 5) -> list[str]:
    counts: dict[str, int] = {}
    order: list[str] = []
    for value in values:
        normalized = value.strip()
        if not normalized:
            continue
        if normalized not in counts:
            order.append(normalized)
            counts[normalized] = 0
        counts[normalized] += 1
    ordered = sorted(order, key=lambda item: counts[item], reverse=True)
    return ordered[:limit]


def analyze_content_memory(entries: list[ContentMemoryEntry]) -> ContentMemorySummary:
    theme_counts: dict[str, int] = {}
    cta_counts: dict[str, int] = {}
    restaurant_counts: dict[str, int] = {}
    hook_counts: dict[str, int] = {}
    visual_style_counts: dict[str, int] = {}
    image_composition_counts: dict[str, int] = {}
    post_types: list[str] = []
    reasoning: list[str] = []
    for entry in entries:
        if entry.primary_theme:
            theme_counts[entry.primary_theme] = theme_counts.get(entry.primary_theme, 0) + 1
        if entry.specific_cta:
            cta_counts[entry.specific_cta] = cta_counts.get(entry.specific_cta, 0) + 1
        for restaurant in entry.restaurants_mentioned:
            restaurant_counts[restaurant] = restaurant_counts.get(restaurant, 0) + 1
        if entry.hook_style:
            hook_counts[entry.hook_style] = hook_counts.get(entry.hook_style, 0) + 1
        if entry.image_style:
            visual_style_counts[entry.image_style] = visual_style_counts.get(entry.image_style, 0) + 1
        if entry.image_composition:
            image_composition_counts[entry.image_composition] = image_composition_counts.get(entry.image_composition, 0) + 1
        if entry.post_type:
            post_types.append(entry.post_type)

    recent_themes = [entry.primary_theme for entry in entries[:8] if entry.primary_theme]
    recent_ctas = [entry.specific_cta for entry in entries[:8] if entry.specific_cta]
    recent_restaurants = [restaurant for entry in entries[:8] for restaurant in entry.restaurants_mentioned]
    recent_hooks = [entry.hook_style for entry in entries[:8] if entry.hook_style]
    recent_visual_styles = [entry.image_style for entry in entries[:8] if entry.image_style]
    recent_image_compositions = [entry.image_composition for entry in entries[:8] if entry.image_composition]
    recent_post_types = [entry.post_type for entry in entries[:8] if entry.post_type]

    underused_themes = [theme for theme, count in sorted(theme_counts.items(), key=lambda item: item[1])[:4]]
    community_activity_score = sum(1 for entry in entries[:10] if entry.post_type in {"community_highlight", "leaderboard", "challenge", "xp_milestone"})
    theme_rotation_needed = bool(recent_themes) and len(set(recent_themes[:5])) < max(2, len(recent_themes[:5]))
    if len(set(recent_themes[:5])) == 1:
        reasoning.append("The last five posts are concentrated around one theme.")
    if theme_rotation_needed:
        reasoning.append("Theme rotation bonus should encourage diversification.")
    if community_activity_score >= 3:
        reasoning.append("Community-driven posts have been active recently.")

    return ContentMemorySummary(
        total_entries=len(entries),
        recent_themes=recent_themes,
        underused_themes=underused_themes,
        recent_ctas=recent_ctas,
        recent_restaurants=recent_restaurants,
        recent_hooks=recent_hooks,
        recent_visual_styles=recent_visual_styles,
        recent_image_compositions=recent_image_compositions,
        recent_post_types=recent_post_types,
        theme_counts=theme_counts,
        cta_counts=cta_counts,
        restaurant_counts=restaurant_counts,
        hook_counts=hook_counts,
        visual_style_counts=visual_style_counts,
        image_composition_counts=image_composition_counts,
        community_activity_score=community_activity_score,
        theme_rotation_needed=theme_rotation_needed,
        reasoning=reasoning,
    )


def load_content_memory(
    client: SupabaseClient | None,
    *,
    logger=None,
    run_id: str | None = None,
    limit: int = 30,
) -> tuple[list[ContentMemoryEntry], ContentMemorySummary, list[dict[str, Any]]]:
    log_event(logger, "content_memory_loaded", run_id=run_id, requested_limit=limit, supabase_available=client is not None)
    if client is None:
        entries: list[ContentMemoryEntry] = []
        summary = analyze_content_memory(entries)
        log_event(logger, "content_memory_analyzed", run_id=run_id, total_entries=0, theme_rotation_detected=False)
        return entries, summary, []

    rows = _content_memory_table_rows(client, "jalapeno_content_memory", limit=limit)
    if not rows:
        rows = _recent_posts_rows(client, limit=limit)
    entries = [infer_memory_entry_from_post(row) for row in rows]
    summary = analyze_content_memory(entries)
    log_event(logger, "content_memory_analyzed", run_id=run_id, total_entries=summary.total_entries, theme_rotation_detected=summary.theme_rotation_needed, community_activity_score=summary.community_activity_score)
    return entries, summary, rows


def load_recent_published_posts(client: SupabaseClient | None, *, limit: int = 30) -> list[dict[str, Any]]:
    if client is None:
        return []
    rows = _recent_posts_rows(client, limit=limit)
    return rows[:limit]


def persist_memory_entry(client: SupabaseClient, entry: ContentMemoryEntry) -> dict[str, Any]:
    payload = entry.to_dict()
    rows = client.upsert_rows("jalapeno_content_memory", payload, on_conflict="post_id")
    return rows[0] if rows else payload
