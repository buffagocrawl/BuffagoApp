from __future__ import annotations

import random

from .geography import Group


def select(groups: list[Group], history: list[dict], seed: str):
    if not groups:
        return None
    rng = random.Random(seed)
    # Plans/skips/failures do not count as generated exposure. Publication is
    # separate; local previews influence generation rotation, never publication.
    history = [h for h in history if h.get("generation_status") == "preview_generated"]

    def last(predicate):
        return max((h.get("run_time", "") for h in history if predicate(h)), default="")

    states = sorted({g.state_code for g in groups})
    state_last = {s: last(lambda h: h.get("geography", {}).get("state_code") == s) for s in states}
    oldest = min(state_last.values())
    state = rng.choice([s for s in states if state_last[s] == oldest])
    local = [g for g in groups if g.state_code == state]
    tier = min({"town": 0, "county": 1, "state": 2}[g.level] for g in local)
    local = [g for g in local if {"town": 0, "county": 1, "state": 2}[g.level] == tier]
    area_last = {g.key: last(lambda h: h.get("geography", {}).get("key") == g.key) for g in local}
    oldest_area = min(area_last.values())
    group = rng.choice(sorted((g for g in local if area_last[g.key] == oldest_area), key=lambda g: g.key))
    by_location = {}
    for photo in group.photos:
        by_location.setdefault(photo.physical_key, []).append(photo)

    def source_last(photo_id):
        return last(lambda h: any(p.get("photo_id") == photo_id for p in h.get("sources", [])))

    locations = sorted(by_location)
    rng.shuffle(locations)
    # Reuse changes preference only; even a three-location pool always works.
    locations.sort(key=lambda loc: min(source_last(p.photo.id) for p in by_location[loc]))
    selected = []
    for location in locations[:3]:
        options = sorted(by_location[location], key=lambda p: p.photo.id)
        rng.shuffle(options)
        options.sort(key=lambda p: source_last(p.photo.id))
        selected.append(options[0])
    return group, selected, {
        "policy": "least_recent_state_then_town_county_state_then_least_recent_area",
        "state_last_generated": state_last, "area_last_generated": area_last,
        "selected_state": state, "selected_level": group.level,
        "reason": "Selected a least recently generated eligible state (seeded ties), then its most local eligible tier and least recently generated area. Prior source use is a soft preference only.",
        "eligible_groups_considered": [g.summary() for g in groups],
    }
