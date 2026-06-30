from __future__ import annotations

from datetime import date
from typing import Any


FALLBACK_TREND_TOPICS: tuple[str, ...] = (
    "weekend plans",
    "local food",
    "game day",
    "road trips",
    "rankings",
    "spicy food memes",
    "where should we crawl next?",
)

FALLBACK_NEWS_TOPICS: tuple[str, ...] = (
    "new restaurant openings",
    "seasonal menu launches",
    "community food events",
    "local roundup posts",
)


def _seasonal_trend_notes(current_date: date) -> list[str]:
    month = current_date.month
    notes: list[str] = []
    if month in {6, 7, 8}:
        notes.append("summer patio and road-trip energy")
    if month in {9, 10}:
        notes.append("tailgate and fall crawl energy")
    if month in {11, 12}:
        notes.append("holiday-party and comfort-food energy")
    if month in {3, 4, 5}:
        notes.append("spring break and patio preview energy")
    if current_date.weekday() in {4, 5}:
        notes.append("weekend planning energy")
    return notes


def build_trends_context(current_date: date) -> dict[str, Any]:
    trend_topics = list(FALLBACK_TREND_TOPICS)
    news_topics = list(FALLBACK_NEWS_TOPICS)
    seasonal_notes = _seasonal_trend_notes(current_date)
    if current_date.weekday() == 4:
        trend_topics.insert(0, "Friday night plans")
    elif current_date.weekday() == 5:
        trend_topics.insert(0, "Saturday crawl ideas")
    elif current_date.weekday() == 6:
        trend_topics.insert(0, "Sunday reset food posts")
    return {
        "is_fallback": True,
        "source_mode": "fallback",
        "trend_topics": trend_topics,
        "news_topics": news_topics,
        "trend_notes": seasonal_notes,
        "source_hint": "No live trend/news API configured; using evergreen content categories.",
    }
