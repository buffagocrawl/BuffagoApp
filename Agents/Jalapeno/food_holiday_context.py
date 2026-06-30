from __future__ import annotations

from datetime import date
from typing import Any


FOOD_HOLIDAYS: dict[tuple[int, int], list[dict[str, str]]] = {
    (1, 22): [{"name": "National Hot Sauce Day", "priority": "high", "fit": "excellent"}],
    (2, 9): [{"name": "National Pizza Day", "priority": "medium", "fit": "broad"}],
    (7, 6): [{"name": "National Fried Chicken Day", "priority": "high", "fit": "strong"}],
    (7, 12): [{"name": "National French Fry Day", "priority": "medium", "fit": "broad"}],
    (7, 29): [
        {"name": "National Chicken Wing Day", "priority": "high", "fit": "excellent"},
        {"name": "National Buffalo Wings Day", "priority": "high", "fit": "excellent"},
    ],
    (10, 14): [{"name": "National Dessert Day", "priority": "low", "fit": "light"}],
}


def build_food_holiday_context(current_date: date) -> dict[str, Any]:
    matches = FOOD_HOLIDAYS.get((current_date.month, current_date.day), [])
    food_holidays = [match["name"] for match in matches]
    return {
        "is_fallback": False,
        "source_mode": "dictionary",
        "food_holidays": food_holidays,
        "holiday_details": matches,
        "priority": matches[0]["priority"] if matches else "none",
    }
