from __future__ import annotations

from datetime import datetime, timezone
from typing import Any


def build_fallback_snapshot(*, generated_at: datetime | None = None) -> dict[str, Any]:
    generated = generated_at or datetime.now(timezone.utc)
    return {
        "agent": "Jalapeno",
        "phase": 3,
        "generated_at": generated.isoformat(),
        "is_fallback": True,
        "source": {
            "supabase_available": False,
            "opted_out_user_count": 0,
        },
        "windows": {
            "recent_ratings_days": 7,
            "new_restaurants_days": 7,
            "active_states_days": 30,
            "crawl_activity_days": 30,
            "recent_badges_days": 7,
        },
        "summary": {
            "recent_ratings_count": 3,
            "top_restaurants_count": 3,
            "new_restaurants_count": 3,
            "active_states_count": 3,
            "recent_badges_count": 3,
            "xp_milestones_count": 4,
            "streak_milestones_count": 4,
            "crawl_recent_count": 3,
            "activity_score": 22,
        },
        "recent_ratings": [
            {
                "restaurant_name": "Crispy Corner",
                "city": "Buffalo",
                "state": "NY",
                "overall": 9,
                "weight_score": 8.9,
                "created_at": generated.isoformat(),
            },
            {
                "restaurant_name": "Wing Vault",
                "city": "Rochester",
                "state": "NY",
                "overall": 8,
                "weight_score": 8.4,
                "created_at": generated.isoformat(),
            },
            {
                "restaurant_name": "Sauce Street",
                "city": "Albany",
                "state": "NY",
                "overall": 8,
                "weight_score": 8.1,
                "created_at": generated.isoformat(),
            },
        ],
        "top_restaurants": [
            {
                "restaurant_name": "Crispy Corner",
                "city": "Buffalo",
                "state": "NY",
                "rating_count": 42,
                "avg_weight_score": 8.8,
                "avg_overall": 8.7,
                "last_rated_at": generated.isoformat(),
            },
            {
                "restaurant_name": "Wing Vault",
                "city": "Rochester",
                "state": "NY",
                "rating_count": 31,
                "avg_weight_score": 8.5,
                "avg_overall": 8.3,
                "last_rated_at": generated.isoformat(),
            },
            {
                "restaurant_name": "Sauce Street",
                "city": "Albany",
                "state": "NY",
                "rating_count": 19,
                "avg_weight_score": 8.2,
                "avg_overall": 8.0,
                "last_rated_at": generated.isoformat(),
            },
        ],
        "new_restaurants": [
            {
                "restaurant_name": "Clutch Bar",
                "city": "Buffalo",
                "state": "NY",
                "created_at": generated.isoformat(),
            },
            {
                "restaurant_name": "Sauce Lab",
                "city": "Syracuse",
                "state": "NY",
                "created_at": generated.isoformat(),
            },
            {
                "restaurant_name": "Crunch House",
                "city": "Rochester",
                "state": "NY",
                "created_at": generated.isoformat(),
            },
        ],
        "active_states": [
            {
                "state": "NY",
                "state_name": "New York",
                "event_count": 128,
                "unique_users": 19,
                "anonymous_events": 41,
            },
            {
                "state": "PA",
                "state_name": "Pennsylvania",
                "event_count": 63,
                "unique_users": 11,
                "anonymous_events": 18,
            },
            {
                "state": "OH",
                "state_name": "Ohio",
                "event_count": 51,
                "unique_users": 9,
                "anonymous_events": 14,
            },
        ],
        "recent_badges": [
            {
                "badge_name": "Heat Seeker",
                "badge_code": "heat_seeker",
                "badge_category": "ratings",
                "xp_reward": 25,
                "unlock_count": 6,
                "latest_unlocked_at": generated.isoformat(),
            },
            {
                "badge_name": "Crawl Captain",
                "badge_code": "crawl_captain",
                "badge_category": "crawls",
                "xp_reward": 40,
                "unlock_count": 4,
                "latest_unlocked_at": generated.isoformat(),
            },
            {
                "badge_name": "Streak Starter",
                "badge_code": "streak_starter",
                "badge_category": "streaks",
                "xp_reward": 15,
                "unlock_count": 5,
                "latest_unlocked_at": generated.isoformat(),
            },
        ],
        "xp_streak_milestones": {
            "xp_levels": [
                {"level": 5, "level_title": "Wing Rookie", "xp_required": 250, "user_count": 7},
                {"level": 10, "level_title": "Wing Regular", "xp_required": 750, "user_count": 4},
                {"level": 15, "level_title": "Sauce Scholar", "xp_required": 1500, "user_count": 2},
                {"level": 20, "level_title": "Buffago Legend", "xp_required": 2500, "user_count": 1},
            ],
            "streak_weeks": [
                {"streak_weeks": 1, "user_count": 9},
                {"streak_weeks": 2, "user_count": 6},
                {"streak_weeks": 4, "user_count": 3},
                {"streak_weeks": 8, "user_count": 1},
            ],
            "max_xp": 2875,
            "max_level": 22,
            "max_streak_weeks": 8,
        },
        "crawl_activity": {
            "total_crawls": 18,
            "by_status": [
                {"status": "completed", "count": 12},
                {"status": "in_progress", "count": 4},
                {"status": "planned", "count": 2},
            ],
            "by_type": [
                {"crawl_type": "solo", "count": 11},
                {"crawl_type": "group", "count": 7},
            ],
            "recent_crawls": [
                {
                    "route_title": "Buffalo Heat Trail",
                    "city": "Buffalo",
                    "state": "NY",
                    "status": "completed",
                    "crawl_type": "solo",
                    "is_solo": True,
                    "start_time": generated.isoformat(),
                },
                {
                    "route_title": "Rochester Wing Run",
                    "city": "Rochester",
                    "state": "NY",
                    "status": "in_progress",
                    "crawl_type": "group",
                    "is_solo": False,
                    "start_time": generated.isoformat(),
                },
                {
                    "route_title": "Lake Erie Lap",
                    "city": "Erie",
                    "state": "PA",
                    "status": "planned",
                    "crawl_type": "solo",
                    "is_solo": True,
                    "start_time": generated.isoformat(),
                },
            ],
        },
    }
