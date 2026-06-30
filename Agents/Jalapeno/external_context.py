from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from config import JalapenoConfig
from external_cache import (
    DEFAULT_EXTERNAL_CONTEXT_DIR,
    get_daily_external_context_path,
    get_latest_external_context_path,
    read_external_context,
    write_external_context,
)
from food_holiday_context import build_food_holiday_context
from holiday_context import build_holiday_context
from logging_utils import log_event
from sports_context import build_sports_context
from trends_context import build_trends_context


DEFAULT_EXTERNAL_CONTEXT_PATH: Path = get_latest_external_context_path()


@dataclass(frozen=True, slots=True)
class ExternalContextResult:
    context: dict[str, Any]
    output_path: Path
    cache_path: Path
    is_fallback: bool
    is_cached: bool
    signals_used: list[str]


def _current_datetime(config: JalapenoConfig, current_datetime: datetime | None) -> datetime:
    if current_datetime is not None:
        if current_datetime.tzinfo is None:
            return current_datetime.replace(tzinfo=ZoneInfo(config.timezone))
        return current_datetime.astimezone(ZoneInfo(config.timezone))
    return datetime.now(ZoneInfo(config.timezone))


def _safe_unique(values: list[str]) -> list[str]:
    seen: set[str] = set()
    unique: list[str] = []
    for value in values:
        normalized = value.strip()
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        unique.append(normalized)
    return unique


def _selected_signal_tags(context: dict[str, Any]) -> list[str]:
    tags: list[str] = []
    if context.get("major_holidays"):
        tags.append("major_holidays")
    if context.get("minor_holidays"):
        tags.append("minor_holidays")
    if context.get("food_holidays"):
        tags.append("food_holidays")
    if context.get("local_or_national_events"):
        tags.append("local_or_national_events")
    if context.get("sports_events"):
        tags.append("sports_events")
    if context.get("trend_topics"):
        tags.append("trend_topics")
    if context.get("news_topics"):
        tags.append("news_topics")
    if context.get("signal_sections", {}).get("weather_context", {}).get("weather_available"):
        tags.append("weather_available")
    return _safe_unique(tags)


def _build_recommended_content_angles(context: dict[str, Any]) -> list[str]:
    angles: list[str] = []
    day_of_week = context["day_of_week"]
    major_holidays = context["major_holidays"]
    minor_holidays = context["minor_holidays"]
    food_holidays = context["food_holidays"]
    local_or_national_events = context["local_or_national_events"]
    sports_events = context["sports_events"]
    trend_topics = context["trend_topics"]
    seasonal_events = context["signal_sections"]["holiday_context"]["seasonal_events"]

    if day_of_week == "Friday":
        angles.append("Friday wing plans")
    elif day_of_week in {"Saturday", "Sunday"}:
        angles.append("Game day wings")
        angles.append("Weekend crawl idea")
    elif day_of_week == "Monday":
        angles.append("Monday comfort-food reset")
    elif day_of_week == "Thursday":
        angles.append("Pre-weekend crawl planning")

    if major_holidays:
        angles.append("Holiday weekend crawl idea")
    if food_holidays:
        angles.append("Food holiday special")
    if sports_events:
        angles.append("Game day wings")
        angles.append("Tailgate or watch-party angle")
    if any("summer" in event for event in seasonal_events):
        angles.append("Patio season wing post")
    if any("winter" in event or "cozy" in event for event in seasonal_events):
        angles.append("Comfort-food closeup")
    if any("road trip" in event for event in seasonal_events):
        angles.append("Road-trip snack stop")
    if trend_topics:
        angles.append("What are people talking about right now?")
    if "rankings" in trend_topics:
        angles.append("Best wings near you")
    if "where should we crawl next?" in trend_topics:
        angles.append("Where should we crawl next?")
    if minor_holidays and not major_holidays:
        angles.append("Small-holiday tie-in")
    if local_or_national_events:
        angles.append("Local culture angle")

    return _safe_unique(angles)[:6]


def _build_context_payload(
    *,
    current_datetime: datetime,
    holiday_context: dict[str, Any],
    food_context: dict[str, Any],
    sports_context: dict[str, Any],
    trends_context: dict[str, Any],
) -> dict[str, Any]:
    current_date = current_datetime.date()
    day_of_week = current_datetime.strftime("%A")
    weather_context = {
        "weather_available": False,
        "weather_summary": None,
        "future_use": "Could support rainy day / patio / hot weather wing posts later",
        "is_fallback": True,
        "source_mode": "stub",
    }
    context: dict[str, Any] = {
        "agent": "Jalapeno",
        "phase": 4,
        "generated_at": current_datetime.astimezone(timezone.utc).isoformat(),
        "date": current_date.isoformat(),
        "day_of_week": day_of_week,
        "timezone": current_datetime.tzinfo.key if hasattr(current_datetime.tzinfo, "key") else str(current_datetime.tzinfo),
        "is_cached": False,
        "cache_created_at": current_datetime.astimezone(timezone.utc).isoformat(),
        "is_fallback": bool(trends_context.get("is_fallback", False)),
        "major_holidays": holiday_context["major_holidays"],
        "minor_holidays": holiday_context["minor_holidays"],
        "food_holidays": food_context["food_holidays"],
        "local_or_national_events": holiday_context["local_or_national_events"],
        "sports_events": sports_context["sports_events"],
        "trend_topics": trends_context["trend_topics"],
        "news_topics": trends_context["news_topics"],
        "recommended_content_angles": [],
        "weather": weather_context,
        "signal_sections": {
            "holiday_context": holiday_context,
            "food_holiday_context": food_context,
            "sports_context": sports_context,
            "trends_context": trends_context,
            "weather_context": weather_context,
        },
    }
    context["recommended_content_angles"] = _build_recommended_content_angles(context)
    signal_tags = _selected_signal_tags(context)
    context["source_summary"] = {
        "signal_sections": [
            {
                "name": "holiday_context",
                "source_mode": holiday_context.get("source_mode", "calendar"),
                "is_fallback": holiday_context.get("is_fallback", False),
                "count": len(holiday_context["major_holidays"]) + len(holiday_context["minor_holidays"]),
            },
            {
                "name": "food_holiday_context",
                "source_mode": food_context.get("source_mode", "dictionary"),
                "is_fallback": food_context.get("is_fallback", False),
                "count": len(food_context["food_holidays"]),
            },
            {
                "name": "sports_context",
                "source_mode": sports_context.get("source_mode", "seasonal_heuristics"),
                "is_fallback": sports_context.get("is_fallback", False),
                "count": len(sports_context["sports_events"]),
            },
            {
                "name": "trends_context",
                "source_mode": trends_context.get("source_mode", "fallback"),
                "is_fallback": trends_context.get("is_fallback", True),
                "count": len(trends_context["trend_topics"]) + len(trends_context["news_topics"]),
            },
            {
                "name": "weather_context",
                "source_mode": weather_context["source_mode"],
                "is_fallback": weather_context["is_fallback"],
                "count": 0,
            },
        ],
        "signals_used": signal_tags,
        "recommended_content_angles": context["recommended_content_angles"],
        "fallback_used": context["is_fallback"],
    }
    return context


def _build_fallback_context(current_datetime: datetime) -> dict[str, Any]:
    current_date = current_datetime.date()
    day_of_week = current_datetime.strftime("%A")
    weather_context = {
        "weather_available": False,
        "weather_summary": None,
        "future_use": "Could support rainy day / patio / hot weather wing posts later",
        "is_fallback": True,
        "source_mode": "stub",
    }
    context = {
        "agent": "Jalapeno",
        "phase": 4,
        "generated_at": current_datetime.astimezone(timezone.utc).isoformat(),
        "date": current_date.isoformat(),
        "day_of_week": day_of_week,
        "timezone": current_datetime.tzinfo.key if hasattr(current_datetime.tzinfo, "key") else str(current_datetime.tzinfo),
        "is_cached": False,
        "cache_created_at": current_datetime.astimezone(timezone.utc).isoformat(),
        "is_fallback": True,
        "major_holidays": [],
        "minor_holidays": [],
        "food_holidays": [],
        "local_or_national_events": [f"{day_of_week} safe fallback content"],
        "sports_events": [],
        "trend_topics": [
            "weekend plans",
            "local food",
            "game day",
            "road trips",
            "rankings",
            "spicy food memes",
            "where should we crawl next?",
        ],
        "news_topics": [
            "new restaurant openings",
            "seasonal menu launches",
            "community food events",
            "local roundup posts",
        ],
        "recommended_content_angles": [
            "Safe fallback wing post",
            "Local food spotlight",
            "Weekend crawl idea",
        ],
        "weather": weather_context,
        "signal_sections": {
            "holiday_context": {
                "is_fallback": True,
                "source_mode": "fallback",
                "major_holidays": [],
                "minor_holidays": [],
                "seasonal_events": [],
                "day_of_week_hooks": [],
                "local_or_national_events": [f"{day_of_week} safe fallback content"],
            },
            "food_holiday_context": {
                "is_fallback": True,
                "source_mode": "fallback",
                "food_holidays": [],
                "holiday_details": [],
                "priority": "none",
            },
            "sports_context": {
                "is_fallback": True,
                "source_mode": "fallback",
                "sports_events": [],
                "sports_notes": ["Safe fallback sports context only."],
            },
            "trends_context": {
                "is_fallback": True,
                "source_mode": "fallback",
                "trend_topics": context["trend_topics"],
                "news_topics": context["news_topics"],
                "trend_notes": [],
                "source_hint": "Fallback context only.",
            },
            "weather_context": weather_context,
        },
    }
    context["source_summary"] = {
        "signal_sections": [
            {
                "name": "holiday_context",
                "source_mode": "fallback",
                "is_fallback": True,
                "count": 0,
            },
            {
                "name": "food_holiday_context",
                "source_mode": "fallback",
                "is_fallback": True,
                "count": 0,
            },
            {
                "name": "sports_context",
                "source_mode": "fallback",
                "is_fallback": True,
                "count": 0,
            },
            {
                "name": "trends_context",
                "source_mode": "fallback",
                "is_fallback": True,
                "count": len(context["trend_topics"]) + len(context["news_topics"]),
            },
            {
                "name": "weather_context",
                "source_mode": "stub",
                "is_fallback": True,
                "count": 0,
            },
        ],
        "signals_used": ["fallback_context"],
        "recommended_content_angles": context["recommended_content_angles"],
        "fallback_used": True,
    }
    return context


def _load_cached_context(cache_path: Path) -> dict[str, Any]:
    cached = read_external_context(cache_path)
    if cached.get("phase") != 4 or "date" not in cached:
        raise ValueError("Cached external context has an unexpected shape")
    return cached


def generate_external_context(
    config: JalapenoConfig,
    *,
    logger=None,
    output_path: Path = DEFAULT_EXTERNAL_CONTEXT_PATH,
    cache_directory: Path = DEFAULT_EXTERNAL_CONTEXT_DIR,
    refresh: bool = False,
    current_datetime: datetime | None = None,
) -> ExternalContextResult:
    output_path = Path(output_path)
    cache_directory = Path(cache_directory)
    active_datetime = _current_datetime(config, current_datetime)
    current_date = active_datetime.date()
    cache_path = get_daily_external_context_path(current_date, cache_directory)
    log_event(logger, "external_context_started", date=current_date.isoformat(), timezone=config.timezone)
    log_event(logger, "external_cache_checked", cache_path=cache_path, refresh_requested=refresh)

    context: dict[str, Any] | None = None
    is_cached = False

    if refresh:
        log_event(logger, "external_cache_refresh_requested", cache_path=cache_path)
    elif cache_path.exists():
        try:
            context = _load_cached_context(cache_path)
            is_cached = True
            log_event(logger, "external_cache_hit", cache_path=cache_path, cache_created_at=context.get("cache_created_at"))
        except (OSError, ValueError, json.JSONDecodeError) as exc:
            log_event(logger, "external_cache_miss", level="warning", cache_path=cache_path, message=str(exc))
            context = None
    else:
        log_event(logger, "external_cache_miss", cache_path=cache_path)

    fallback_used = False
    if context is None:
        try:
            holiday_context = build_holiday_context(current_date)
            log_event(logger, "holiday_context_loaded", major_holidays=holiday_context["major_holidays"], minor_holidays=holiday_context["minor_holidays"], day_of_week_hooks=holiday_context["day_of_week_hooks"])
            food_context = build_food_holiday_context(current_date)
            log_event(logger, "food_holiday_context_loaded", food_holidays=food_context["food_holidays"], priority=food_context["priority"])
            sports_context = build_sports_context(current_date)
            log_event(logger, "sports_context_loaded", sports_events=sports_context["sports_events"], source_mode=sports_context["source_mode"])
            trends_context = build_trends_context(current_date)
            log_event(logger, "trends_context_loaded", trend_topics=trends_context["trend_topics"], news_topics=trends_context["news_topics"], source_mode=trends_context["source_mode"])
            log_event(logger, "weather_context_skipped", weather_available=False)
            context = _build_context_payload(
                current_datetime=active_datetime,
                holiday_context=holiday_context,
                food_context=food_context,
                sports_context=sports_context,
                trends_context=trends_context,
            )
            fallback_used = bool(context.get("is_fallback", False))
        except Exception as exc:  # pragma: no cover - defensive guard
            log_event(logger, "external_context_failed", level="error", message=str(exc))
            context = _build_fallback_context(active_datetime)
            fallback_used = True
    else:
        context["is_cached"] = True

    if context is None:
        context = _build_fallback_context(active_datetime)
        fallback_used = True

    context["is_cached"] = is_cached
    context.setdefault("cache_created_at", active_datetime.astimezone(timezone.utc).isoformat())
    context.setdefault("generated_at", active_datetime.astimezone(timezone.utc).isoformat())
    context.setdefault("date", current_date.isoformat())
    context.setdefault("day_of_week", active_datetime.strftime("%A"))
    context.setdefault("timezone", config.timezone)
    context.setdefault("phase", 4)
    context.setdefault("agent", "Jalapeno")
    context.setdefault("recommended_content_angles", [])
    context.setdefault("source_summary", {})
    context["source_summary"].setdefault("signals_used", _selected_signal_tags(context))
    context["source_summary"]["recommended_content_angles"] = context.get("recommended_content_angles", [])
    context["source_summary"]["fallback_used"] = bool(context.get("is_fallback", False))

    signals_used = context["source_summary"].get("signals_used", [])
    log_event(logger, "external_signals_selected", signals_used=signals_used)
    if fallback_used or context.get("is_fallback", False):
        log_event(logger, "external_context_fallback_used", is_fallback=True, fallback_reason="deterministic_context_or_lookup_failure")

    if not is_cached or refresh:
        write_external_context(context, cache_path)
    write_external_context(context, output_path)
    log_event(logger, "external_context_written", output_path=output_path, cache_path=cache_path, is_cached=is_cached)

    return ExternalContextResult(
        context=context,
        output_path=output_path,
        cache_path=cache_path,
        is_fallback=bool(context.get("is_fallback", False)),
        is_cached=is_cached,
        signals_used=list(signals_used),
    )
