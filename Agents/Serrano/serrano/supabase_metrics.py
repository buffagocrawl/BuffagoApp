from __future__ import annotations

import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from .logging_config import log_event


def _load_jalapeno_supabase():
    repo_root = Path(__file__).resolve().parents[3]
    jalapeno_dir = repo_root / "Agents" / "Jalapeno"
    if str(jalapeno_dir) not in sys.path:
        sys.path.insert(0, str(jalapeno_dir))
    from supabase_client import SupabaseClient, SupabaseConfig, SupabaseError  # type: ignore

    return SupabaseClient, SupabaseConfig, SupabaseError


def _iso_days_ago(days: int) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=days)).replace(microsecond=0).isoformat()


class SupabaseMetricsCollector:
    def __init__(self, url_env: str, read_key_env: str, allow_service_role_fallback: bool) -> None:
        self.url_env = url_env
        self.read_key_env = read_key_env
        self.allow_service_role_fallback = allow_service_role_fallback

    def create_client(self):
        url = os.getenv(self.url_env, "").strip()
        read_key = os.getenv(self.read_key_env, "").strip()
        if not read_key and self.allow_service_role_fallback:
            read_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
        if not url or not read_key:
            return None
        SupabaseClient, SupabaseConfig, _ = _load_jalapeno_supabase()
        return SupabaseClient(SupabaseConfig(url=url, service_role_key=read_key))

    def collect(self, *, lookback_days: int, retention_days: int, logger=None) -> dict[str, Any]:
        client = self.create_client()
        if client is None:
            return {
                "connected": False,
                "available_tables": {},
                "product_metrics": {},
                "marketing_metrics": {},
                "evidence_gaps": ["Safe Supabase read credentials were not available."],
            }
        available_tables: dict[str, bool] = {}
        for table in (
            "user_events",
            "onboarding_analytics",
            "destination_ratings",
            "crawls",
            "v_social_feed",
            "jalapeno_instagram_posts",
            "jalapeno_post_metrics",
            "jalapeno_content_decisions",
        ):
            try:
                available_tables[table] = client.table_exists(table)
            except Exception:
                available_tables[table] = False

        metrics = {
            "connected": True,
            "available_tables": available_tables,
            "product_metrics": self._collect_product_metrics(client, lookback_days, retention_days, available_tables, logger=logger),
            "marketing_metrics": self._collect_marketing_metrics(client, lookback_days, available_tables, logger=logger),
            "evidence_gaps": self._collect_gaps(available_tables),
        }
        return metrics

    def _collect_product_metrics(self, client, lookback_days: int, retention_days: int, available_tables: dict[str, bool], logger=None) -> dict[str, Any]:
        metrics: dict[str, Any] = {"lookback_days": lookback_days, "retention_days": retention_days}
        since = _iso_days_ago(lookback_days)
        if available_tables.get("user_events"):
            rows = client.fetch_rows(
                "user_events",
                select="event_name,occurred_at,screen,metadata,user_id,anonymous_id,session_id",
                filters={"occurred_at": f"gte.{since}", "limit": 5000},
            )
            metrics["user_events"] = self._aggregate_user_events(rows)
        if available_tables.get("onboarding_analytics"):
            rows = client.fetch_rows(
                "onboarding_analytics",
                select="started_at,finished_at,skipped,created_account,step,user_id",
                filters={"started_at": f"gte.{since}", "limit": 2000},
            )
            metrics["onboarding"] = {
                "rows": len(rows),
                "completed": sum(1 for row in rows if row.get("finished_at")),
                "skipped": sum(1 for row in rows if row.get("skipped")),
                "created_account": sum(1 for row in rows if row.get("created_account")),
            }
        if available_tables.get("destination_ratings"):
            rows = client.fetch_rows(
                "destination_ratings",
                select="id,user_id,destination_id,crawl_id,created_at,overall,would_order_again",
                filters={"created_at": f"gte.{since}", "limit": 5000},
            )
            unique_users = {row.get("user_id") for row in rows if row.get("user_id")}
            metrics["ratings"] = {
                "rows": len(rows),
                "unique_users": len(unique_users),
                "would_order_again_yes": sum(1 for row in rows if row.get("would_order_again") is True),
                "crawl_linked": sum(1 for row in rows if row.get("crawl_id")),
            }
        if available_tables.get("crawls"):
            rows = client.fetch_rows(
                "crawls",
                select="crawl_id,user_id,status,start_time,end_time,route_id,is_solo",
                filters={"start_time": f"gte.{since}", "limit": 5000},
            )
            metrics["crawls"] = {
                "rows": len(rows),
                "started": sum(1 for row in rows if row.get("start_time")),
                "completed": sum(1 for row in rows if row.get("status") == "completed"),
                "solo": sum(1 for row in rows if row.get("is_solo") is True),
            }
        if available_tables.get("v_social_feed"):
            rows = client.fetch_rows(
                "v_social_feed",
                select="user_id,destination_id,created_at,destination_state_id",
                filters={"created_at": f"gte.{since}", "limit": 5000},
            )
            metrics["social_feed"] = {
                "rows": len(rows),
                "unique_users": len({row.get('user_id') for row in rows if row.get('user_id')}),
                "states": sorted({row.get("destination_state_id") for row in rows if row.get("destination_state_id")})[:20],
            }
        log_event(logger, "supabase_product_metrics_collected", sections=list(metrics.keys()))
        return metrics

    def _aggregate_user_events(self, rows: list[dict[str, Any]]) -> dict[str, Any]:
        counts: dict[str, int] = {}
        screens: dict[str, int] = {}
        for row in rows:
            event_name = row.get("event_name") or "unknown"
            counts[event_name] = counts.get(event_name, 0) + 1
            screen = row.get("screen")
            if screen:
                screens[screen] = screens.get(screen, 0) + 1
        return {
            "rows": len(rows),
            "event_counts": counts,
            "screen_counts": screens,
            "unique_users": len({row.get("user_id") for row in rows if row.get("user_id")}),
            "unique_sessions": len({row.get("session_id") for row in rows if row.get("session_id")}),
        }

    def _collect_marketing_metrics(self, client, lookback_days: int, available_tables: dict[str, bool], logger=None) -> dict[str, Any]:
        metrics: dict[str, Any] = {"lookback_days": lookback_days}
        since = _iso_days_ago(lookback_days)
        if available_tables.get("jalapeno_instagram_posts"):
            rows = client.fetch_rows(
                "jalapeno_instagram_posts",
                select="status,content_type,published_at,created_at,permalink",
                filters={"created_at": f"gte.{since}", "limit": 1000},
            )
            metrics["instagram_posts"] = {
                "rows": len(rows),
                "published": sum(1 for row in rows if row.get("status") == "published"),
                "failed": sum(1 for row in rows if row.get("status") == "failed"),
                "content_types": self._count_values(rows, "content_type"),
            }
        if available_tables.get("jalapeno_post_metrics"):
            rows = client.fetch_rows(
                "jalapeno_post_metrics",
                select="likes,comments,shares,saves,reach,impressions,engagement_rate,collected_at,caption,cta_type,image_style",
                filters={"collected_at": f"gte.{since}", "limit": 2000},
            )
            metrics["post_metrics"] = {
                "rows": len(rows),
                "avg_engagement_rate": round(sum(float(row.get("engagement_rate") or 0) for row in rows) / len(rows), 4) if rows else 0,
                "top_cta_types": self._count_values(rows, "cta_type"),
                "top_image_styles": self._count_values(rows, "image_style"),
            }
        if available_tables.get("jalapeno_content_decisions"):
            rows = client.fetch_rows(
                "jalapeno_content_decisions",
                select="created_at,decision_summary,platform_flag",
                filters={"created_at": f"gte.{since}", "limit": 1000},
            )
            metrics["content_decisions"] = {"rows": len(rows)}
        log_event(logger, "supabase_marketing_metrics_collected", sections=list(metrics.keys()))
        return metrics

    def _count_values(self, rows: list[dict[str, Any]], key: str) -> dict[str, int]:
        counts: dict[str, int] = {}
        for row in rows:
            value = row.get(key)
            if not value:
                continue
            counts[str(value)] = counts.get(str(value), 0) + 1
        return counts

    def _collect_gaps(self, available_tables: dict[str, bool]) -> list[str]:
        gaps: list[str] = []
        if not available_tables.get("user_events"):
            gaps.append("user_events table unavailable; funnels and retention behavior may be incomplete.")
        if not available_tables.get("onboarding_analytics"):
            gaps.append("onboarding_analytics table unavailable or not accessible.")
        if not available_tables.get("jalapeno_post_metrics"):
            gaps.append("jalapeno_post_metrics unavailable; marketing performance may be under-instrumented.")
        return gaps

