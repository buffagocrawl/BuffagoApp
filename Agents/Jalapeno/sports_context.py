from __future__ import annotations

from datetime import date
from typing import Any


def _seasonal_sports_context(current_date: date) -> list[str]:
    month = current_date.month
    events: list[str] = []
    if month in {9, 10, 11, 12, 1}:
        events.extend(["football season", "game day wings"])
    if month in {3, 4}:
        events.append("March Madness bracket chatter")
    if month in {4, 5, 6, 7, 8, 9, 10}:
        events.append("MLB summer games")
    if month in {10, 11, 12, 1, 2, 3, 4, 5, 6}:
        events.append("NBA or NHL season")
    if month in {4, 5, 6}:
        events.append("NBA and NHL playoffs")
    if month == 2:
        events.append("Super Bowl week energy")
    return events


def build_sports_context(current_date: date) -> dict[str, Any]:
    sports_events = _seasonal_sports_context(current_date)
    return {
        "is_fallback": False,
        "source_mode": "seasonal_heuristics",
        "sports_events": sports_events,
        "sports_notes": [
            "Keep references generic unless a reliable live game feed is configured.",
            "Use sports season cues, not specific scores or matchups.",
        ],
    }
