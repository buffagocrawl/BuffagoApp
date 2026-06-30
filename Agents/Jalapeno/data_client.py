from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

from logging_utils import log_event
from supabase_client import SupabaseClient


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _iso_days_ago(days: int) -> str:
    return (_utcnow() - timedelta(days=days)).isoformat()


def _as_int(value: Any) -> int:
    if isinstance(value, bool) or value is None:
        return 0
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def _as_float(value: Any) -> float:
    if value is None:
        return 0.0
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _normalize_timestamp(value: Any) -> str | None:
    if value is None:
        return None
    return str(value)


@dataclass(frozen=True, slots=True)
class Phase3WindowConfig:
    recent_ratings_days: int = 7
    new_restaurants_days: int = 7
    active_states_days: int = 30
    recent_badges_days: int = 7
    crawl_activity_days: int = 30
    activity_score_threshold: int = 8


class Phase3DataClient:
    def __init__(self, client: SupabaseClient, *, logger=None) -> None:
        self.client = client
        self.logger = logger

    def _table_rows(
        self,
        table_name: str,
        *,
        select: str = "*",
        filters: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        rows = self.client.fetch_rows(table_name, select=select, filters=filters)
        return [row for row in rows if isinstance(row, dict)]

    def load_opted_out_user_ids(self) -> set[str]:
        rows = self._table_rows("users", select="user_id", filters={"social_opt_out": "eq.true", "limit": 1000})
        return {str(row["user_id"]) for row in rows if row.get("user_id")}

    def load_states(self) -> dict[int, dict[str, Any]]:
        rows = self._table_rows("states", select="state_id,state_code,state_name")
        result: dict[int, dict[str, Any]] = {}
        for row in rows:
            state_id = row.get("state_id")
            if state_id is None:
                continue
            result[_as_int(state_id)] = {
                "state_code": str(row.get("state_code") or "").strip() or None,
                "state_name": str(row.get("state_name") or "").strip() or None,
            }
        return result

    def load_destinations(self) -> dict[str, dict[str, Any]]:
        rows = self._table_rows("destinations", select="id,name,city,state_id,created_at")
        result: dict[str, dict[str, Any]] = {}
        for row in rows:
            destination_id = row.get("id")
            if not destination_id:
                continue
            result[str(destination_id)] = row
        return result

    def load_recent_ratings(self, *, window_days: int, destination_map: dict[str, dict[str, Any]], state_map: dict[int, dict[str, Any]], opted_out_ids: set[str]) -> list[dict[str, Any]]:
        rows = self._table_rows(
            "destination_ratings",
            select="id,destination_id,user_id,overall,weight_score,crispiness,sauce,meat,spice_level,wings_eaten,would_order_again,created_at",
            filters={"created_at": f"gte.{_iso_days_ago(window_days)}", "order": "created_at.desc", "limit": 100},
        )
        results: list[dict[str, Any]] = []
        for row in rows:
            user_id = row.get("user_id")
            if user_id and str(user_id) in opted_out_ids:
                continue
            destination = destination_map.get(str(row.get("destination_id") or ""))
            if not destination:
                continue
            state = state_map.get(_as_int(destination.get("state_id")))
            results.append(
                {
                    "restaurant_name": destination.get("name"),
                    "city": destination.get("city"),
                    "state": (state or {}).get("state_code") or (state or {}).get("state_name"),
                    "overall": _as_int(row.get("overall")),
                    "weight_score": round(_as_float(row.get("weight_score")), 2),
                    "created_at": _normalize_timestamp(row.get("created_at")),
                }
            )
        return results

    def load_top_restaurants(self, *, limit: int, state_map: dict[int, dict[str, Any]]) -> list[dict[str, Any]]:
        rows = self._table_rows(
            "analytics_agent_restaurant_summary",
            select="destination_id,destination_name,city,state_id,rating_count,avg_weight_score,avg_overall,last_rated_at",
            filters={"order": "rating_count.desc", "limit": limit},
        )
        results: list[dict[str, Any]] = []
        for row in rows:
            state = state_map.get(_as_int(row.get("state_id")))
            results.append(
                {
                    "restaurant_name": row.get("destination_name"),
                    "city": row.get("city"),
                    "state": (state or {}).get("state_code") or (state or {}).get("state_name"),
                    "rating_count": _as_int(row.get("rating_count")),
                    "avg_weight_score": round(_as_float(row.get("avg_weight_score")), 2),
                    "avg_overall": round(_as_float(row.get("avg_overall")), 2),
                    "last_rated_at": _normalize_timestamp(row.get("last_rated_at")),
                }
            )
        return results

    def load_new_restaurants(self, *, window_days: int, state_map: dict[int, dict[str, Any]]) -> list[dict[str, Any]]:
        rows = self._table_rows(
            "destinations",
            select="id,name,city,state_id,created_at",
            filters={"created_at": f"gte.{_iso_days_ago(window_days)}", "order": "created_at.desc", "limit": 100},
        )
        results: list[dict[str, Any]] = []
        for row in rows:
            state = state_map.get(_as_int(row.get("state_id")))
            results.append(
                {
                    "restaurant_name": row.get("name"),
                    "city": row.get("city"),
                    "state": (state or {}).get("state_code") or (state or {}).get("state_name"),
                    "created_at": _normalize_timestamp(row.get("created_at")),
                }
            )
        return results

    def load_active_states(self, *, window_days: int, state_map: dict[int, dict[str, Any]], opted_out_ids: set[str]) -> list[dict[str, Any]]:
        rows = self._table_rows(
            "user_events",
            select="state_id,user_id,anonymous_id,occurred_at",
            filters={"occurred_at": f"gte.{_iso_days_ago(window_days)}", "order": "occurred_at.desc", "limit": 2000},
        )
        state_counts: Counter[int] = Counter()
        unique_users_by_state: dict[int, set[str]] = defaultdict(set)
        anonymous_counts: Counter[int] = Counter()
        for row in rows:
            state_id = row.get("state_id")
            if state_id is None:
                continue
            normalized_state = _as_int(state_id)
            user_id = row.get("user_id")
            if user_id and str(user_id) in opted_out_ids:
                continue
            state_counts[normalized_state] += 1
            if user_id:
                unique_users_by_state[normalized_state].add(str(user_id))
            elif row.get("anonymous_id"):
                anonymous_counts[normalized_state] += 1
        results: list[dict[str, Any]] = []
        for state_id, count in state_counts.most_common():
            state = state_map.get(state_id, {})
            results.append(
                {
                    "state": state.get("state_code") or state.get("state_name"),
                    "state_name": state.get("state_name"),
                    "event_count": count,
                    "unique_users": len(unique_users_by_state.get(state_id, set())),
                    "anonymous_events": anonymous_counts.get(state_id, 0),
                }
            )
        return results

    def load_recent_badges(self, *, window_days: int, badge_map: dict[int, dict[str, Any]], opted_out_ids: set[str]) -> list[dict[str, Any]]:
        rows = self._table_rows(
            "user_badges",
            select="user_id,badge_id,earned_at",
            filters={"earned_at": f"gte.{_iso_days_ago(window_days)}", "order": "earned_at.desc", "limit": 1000},
        )
        grouped: dict[int, dict[str, Any]] = {}
        for row in rows:
            user_id = row.get("user_id")
            if user_id and str(user_id) in opted_out_ids:
                continue
            badge_id = _as_int(row.get("badge_id"))
            badge = badge_map.get(badge_id, {})
            bucket = grouped.setdefault(
                badge_id,
                {
                    "badge_name": badge.get("name"),
                    "badge_code": badge.get("code"),
                    "badge_category": badge.get("category"),
                    "xp_reward": _as_int(badge.get("xp_reward")),
                    "unlock_count": 0,
                    "latest_unlocked_at": None,
                },
            )
            bucket["unlock_count"] += 1
            earned_at = _normalize_timestamp(row.get("earned_at"))
            if earned_at and (bucket["latest_unlocked_at"] is None or earned_at > bucket["latest_unlocked_at"]):
                bucket["latest_unlocked_at"] = earned_at
        return sorted(
            (value for value in grouped.values() if value.get("badge_name")),
            key=lambda value: (value.get("latest_unlocked_at") or "", value.get("unlock_count", 0)),
            reverse=True,
        )

    def load_xp_streak_milestones(
        self,
        *,
        opted_out_ids: set[str],
        state_map: dict[int, dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        level_rows = self._table_rows("level_thresholds", select="level,xp_required,level_title", filters={"order": "level.asc"})
        user_rows = self._table_rows("user_with_level", select="user_id,xp,level")
        visible_users = [row for row in user_rows if not row.get("user_id") or str(row.get("user_id")) not in opted_out_ids]
        xp_levels: list[dict[str, Any]] = []
        for threshold in level_rows:
            level_value = _as_int(threshold.get("level"))
            xp_required = _as_int(threshold.get("xp_required"))
            xp_levels.append(
                {
                    "level": level_value,
                    "level_title": threshold.get("level_title"),
                    "xp_required": xp_required,
                    "user_count": sum(1 for row in visible_users if _as_int(row.get("level")) >= level_value),
                }
            )

        streak_rows = self._table_rows("crawl_weekly_streak", select="user_id,current_streak_weeks")
        visible_streaks = [row for row in streak_rows if not row.get("user_id") or str(row.get("user_id")) not in opted_out_ids]
        observed_streak_values = sorted({max(1, _as_int(row.get("current_streak_weeks"))) for row in visible_streaks if _as_int(row.get("current_streak_weeks")) > 0})
        if not observed_streak_values:
            observed_streak_values = [1, 2, 4, 8]
        streak_thresholds = sorted({1, 2, 4, 8, *observed_streak_values})
        streak_weeks = [
            {
                "streak_weeks": threshold,
                "user_count": sum(1 for row in visible_streaks if _as_int(row.get("current_streak_weeks")) >= threshold),
            }
            for threshold in streak_thresholds
        ]

        max_xp = max((_as_int(row.get("xp")) for row in visible_users), default=0)
        max_level = max((_as_int(row.get("level")) for row in visible_users), default=0)
        max_streak_weeks = max((_as_int(row.get("current_streak_weeks")) for row in visible_streaks), default=0)

        return {
            "xp_levels": xp_levels,
            "streak_weeks": streak_weeks,
            "max_xp": max_xp,
            "max_level": max_level,
            "max_streak_weeks": max_streak_weeks,
        }

    def load_crawl_activity(
        self,
        *,
        window_days: int,
        state_map: dict[int, dict[str, Any]],
        destination_map: dict[str, dict[str, Any]],
        opted_out_ids: set[str],
    ) -> dict[str, Any]:
        crawl_rows = self._table_rows(
            "socially_visible_crawls",
            select="crawl_id,user_id,route_id,status,start_time,end_time,crawl_type,is_solo",
            filters={"start_time": f"gte.{_iso_days_ago(window_days)}", "order": "start_time.desc", "limit": 500},
        )
        route_rows = self._table_rows("routes", select="id,title,city,stop1_id,stop2_id,stop3_id,stop4_id,stop5_id")
        route_map = {str(row.get("id")): row for row in route_rows if row.get("id")}
        route_stop_rows = self._table_rows("route_ordered_destinations", select="route_id,destination_id,stop_order", filters={"order": "stop_order.asc", "limit": 5000})
        route_stops: dict[str, list[str]] = defaultdict(list)
        for row in route_stop_rows:
            route_id = row.get("route_id")
            destination_id = row.get("destination_id")
            if route_id and destination_id:
                route_stops[str(route_id)].append(str(destination_id))
        filtered_rows = []
        for row in crawl_rows:
            user_id = row.get("user_id")
            if user_id and str(user_id) in opted_out_ids:
                continue
            filtered_rows.append(row)

        by_status: Counter[str] = Counter()
        by_type: Counter[str] = Counter()
        recent_crawls: list[dict[str, Any]] = []
        for row in filtered_rows:
            status = str(row.get("status") or "unknown")
            crawl_type = str(row.get("crawl_type") or "unknown")
            by_status[status] += 1
            by_type[crawl_type] += 1
            route = route_map.get(str(row.get("route_id") or ""))
            route_state_id = None
            if route:
                for stop_key in ("stop1_id", "stop2_id", "stop3_id", "stop4_id", "stop5_id"):
                    stop_destination_id = route.get(stop_key)
                    if not stop_destination_id:
                        continue
                    stop_destination = destination_map.get(str(stop_destination_id))
                    if stop_destination and stop_destination.get("state_id") is not None:
                        route_state_id = _as_int(stop_destination.get("state_id"))
                        break
            if route_state_id is None:
                for stop_destination_id in route_stops.get(str(row.get("route_id") or ""), []):
                    stop_destination = destination_map.get(str(stop_destination_id))
                    if stop_destination and stop_destination.get("state_id") is not None:
                        route_state_id = _as_int(stop_destination.get("state_id"))
                        break
            state = state_map.get(route_state_id) if route_state_id is not None else None
            if len(recent_crawls) < 10:
                recent_crawls.append(
                    {
                        "route_title": (route or {}).get("title"),
                        "city": (route or {}).get("city"),
                        "state": (state or {}).get("state_code") or (state or {}).get("state_name"),
                        "status": status,
                        "crawl_type": crawl_type,
                        "is_solo": bool(row.get("is_solo")),
                        "start_time": _normalize_timestamp(row.get("start_time")),
                    }
                )

        return {
            "total_crawls": len(filtered_rows),
            "by_status": [{"status": status, "count": count} for status, count in by_status.most_common()],
            "by_type": [{"crawl_type": crawl_type, "count": count} for crawl_type, count in by_type.most_common()],
            "recent_crawls": recent_crawls,
        }

    def collect_snapshot_sections(self, *, window_config: Phase3WindowConfig | None = None) -> dict[str, Any]:
        config = window_config or Phase3WindowConfig()
        opted_out_ids = self.load_opted_out_user_ids()
        log_event(self.logger, "opted_out_users_excluded", count=len(opted_out_ids))
        state_map = self.load_states()
        destination_map = self.load_destinations()
        badge_rows = self._table_rows("badge_catalog", select="id,code,name,description,icon,xp_reward,category,tier,is_active")
        badge_map = { _as_int(row.get("id")): row for row in badge_rows if row.get("id") is not None }

        recent_ratings = self.load_recent_ratings(
            window_days=config.recent_ratings_days,
            destination_map=destination_map,
            state_map=state_map,
            opted_out_ids=opted_out_ids,
        )
        top_restaurants = self.load_top_restaurants(limit=10, state_map=state_map)
        new_restaurants = self.load_new_restaurants(window_days=config.new_restaurants_days, state_map=state_map)
        active_states = self.load_active_states(
            window_days=config.active_states_days,
            state_map=state_map,
            opted_out_ids=opted_out_ids,
        )
        recent_badges = self.load_recent_badges(
            window_days=config.recent_badges_days,
            badge_map=badge_map,
            opted_out_ids=opted_out_ids,
        )
        xp_streak_milestones = self.load_xp_streak_milestones(opted_out_ids=opted_out_ids)
        crawl_activity = self.load_crawl_activity(
            window_days=config.crawl_activity_days,
            state_map=state_map,
            destination_map=destination_map,
            opted_out_ids=opted_out_ids,
        )

        return {
            "source": {
                "supabase_available": True,
                "opted_out_user_count": len(opted_out_ids),
            },
            "windows": {
                "recent_ratings_days": config.recent_ratings_days,
                "new_restaurants_days": config.new_restaurants_days,
                "active_states_days": config.active_states_days,
                "crawl_activity_days": config.crawl_activity_days,
                "recent_badges_days": config.recent_badges_days,
            },
            "opted_out_user_count": len(opted_out_ids),
            "recent_ratings": recent_ratings,
            "top_restaurants": top_restaurants,
            "new_restaurants": new_restaurants,
            "active_states": active_states,
            "recent_badges": recent_badges,
            "xp_streak_milestones": xp_streak_milestones,
            "crawl_activity": crawl_activity,
        }


def log_section_counts(logger, *, recent_ratings: int, top_restaurants: int, new_restaurants: int, active_states: int, recent_badges: int, xp_levels: int, streaks: int, crawls: int) -> None:
    log_event(logger, "ratings_loaded", count=recent_ratings)
    log_event(logger, "top_restaurants_loaded", count=top_restaurants)
    log_event(logger, "new_restaurants_loaded", count=new_restaurants)
    log_event(logger, "active_states_loaded", count=active_states)
    log_event(logger, "badges_loaded", count=recent_badges)
    log_event(logger, "xp_streaks_loaded", count=xp_levels, streak_count=streaks)
    log_event(logger, "crawls_loaded", count=crawls)
