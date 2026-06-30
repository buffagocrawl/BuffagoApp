from __future__ import annotations

import calendar
from datetime import date
from typing import Any


def _nth_weekday_of_month(year: int, month: int, weekday: int, occurrence: int) -> date:
    hits = 0
    for day in range(1, 32):
        try:
            candidate = date(year, month, day)
        except ValueError:
            break
        if candidate.weekday() == weekday:
            hits += 1
            if hits == occurrence:
                return candidate
    raise ValueError("Unable to resolve nth weekday for month")


def _last_weekday_of_month(year: int, month: int, weekday: int) -> date:
    last_day = calendar.monthrange(year, month)[1]
    for day in range(last_day, 0, -1):
        candidate = date(year, month, day)
        if candidate.weekday() == weekday:
            return candidate
    raise ValueError("Unable to resolve last weekday for month")


def _seasonal_events(current_date: date) -> list[str]:
    month = current_date.month
    if month in {12, 1, 2}:
        return ["cozy takeout season", "winter comfort-food cravings"]
    if month in {3, 4, 5}:
        return ["spring patio preview", "weekend crawl weather"]
    if month in {6, 7, 8}:
        return ["summer patio season", "road-trip snack stops"]
    return ["tailgate season", "fall comfort-food season"]


def _day_of_week_hooks(current_date: date) -> list[str]:
    weekday = current_date.weekday()
    hooks = {
        0: ["Monday reset", "week-start comfort food"],
        1: ["Tuesday trivia night", "midweek wing fix"],
        2: ["Hump-day cravings", "midweek sauce check"],
        3: ["Pre-weekend planning", "Thursday crawl prep"],
        4: ["Friday wing plans", "weekend kickoff"],
        5: ["Saturday game day wings", "crawl day energy"],
        6: ["Sunday reset", "watch-party leftovers"],
    }
    return hooks.get(weekday, [])


def _major_holidays(current_date: date) -> list[str]:
    year = current_date.year
    holidays: list[str] = []
    if (current_date.month, current_date.day) == (1, 1):
        holidays.append("New Year's Day")
    if current_date == _nth_weekday_of_month(year, 1, calendar.MONDAY, 3):
        holidays.append("Martin Luther King Jr. Day")
    if current_date == _nth_weekday_of_month(year, 2, calendar.MONDAY, 3):
        holidays.append("Presidents' Day")
    if current_date == _last_weekday_of_month(year, 5, calendar.MONDAY):
        holidays.append("Memorial Day")
    if (current_date.month, current_date.day) == (6, 19):
        holidays.append("Juneteenth")
    if (current_date.month, current_date.day) == (7, 4):
        holidays.append("Independence Day")
    if current_date == _nth_weekday_of_month(year, 9, calendar.MONDAY, 1):
        holidays.append("Labor Day")
    if current_date == _nth_weekday_of_month(year, 10, calendar.MONDAY, 2):
        holidays.append("Indigenous Peoples' Day")
    if (current_date.month, current_date.day) == (11, 11):
        holidays.append("Veterans Day")
    if current_date == _nth_weekday_of_month(year, 11, calendar.THURSDAY, 4):
        holidays.append("Thanksgiving")
    if (current_date.month, current_date.day) == (12, 25):
        holidays.append("Christmas Day")
    return holidays


def _minor_holidays(current_date: date) -> list[str]:
    year = current_date.year
    minor: list[str] = []
    if (current_date.month, current_date.day) == (2, 14):
        minor.append("Valentine's Day")
    if (current_date.month, current_date.day) == (3, 17):
        minor.append("St. Patrick's Day")
    if current_date == _nth_weekday_of_month(year, 5, calendar.SUNDAY, 2):
        minor.append("Mother's Day")
    if current_date == _nth_weekday_of_month(year, 6, calendar.SUNDAY, 3):
        minor.append("Father's Day")
    if (current_date.month, current_date.day) == (10, 31):
        minor.append("Halloween")
    if (current_date.month, current_date.day) == (12, 31):
        minor.append("New Year's Eve")
    return minor


def _local_or_national_events(
    current_date: date,
    *,
    major_holidays: list[str],
    minor_holidays: list[str],
    day_of_week_hooks: list[str],
    seasonal_events: list[str],
) -> list[str]:
    events = list(day_of_week_hooks)
    events.extend(seasonal_events)
    if major_holidays:
        events.extend([f"holiday weekend crawl idea for {holiday}" for holiday in major_holidays])
    elif minor_holidays:
        events.extend([f"small holiday tie-in for {holiday}" for holiday in minor_holidays])
    if current_date.weekday() in {4, 5}:
        events.append("weekend crawl idea")
    return events


def build_holiday_context(current_date: date) -> dict[str, Any]:
    major_holidays = _major_holidays(current_date)
    minor_holidays = _minor_holidays(current_date)
    seasonal_events = _seasonal_events(current_date)
    day_of_week_hooks = _day_of_week_hooks(current_date)
    local_or_national_events = _local_or_national_events(
        current_date,
        major_holidays=major_holidays,
        minor_holidays=minor_holidays,
        day_of_week_hooks=day_of_week_hooks,
        seasonal_events=seasonal_events,
    )
    return {
        "is_fallback": False,
        "source_mode": "calendar",
        "major_holidays": major_holidays,
        "minor_holidays": minor_holidays,
        "seasonal_events": seasonal_events,
        "day_of_week_hooks": day_of_week_hooks,
        "local_or_national_events": local_or_national_events,
    }
