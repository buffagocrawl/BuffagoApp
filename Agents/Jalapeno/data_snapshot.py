from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from config import ConfigError, BASE_DIR
from data_client import Phase3DataClient, Phase3WindowConfig, log_section_counts
from fallback_data import build_fallback_snapshot
from logging_utils import log_event
from supabase_client import SupabaseClient, SupabaseError


DEFAULT_SNAPSHOT_PATH: Path = BASE_DIR / "data" / "latest_snapshot.json"


@dataclass(frozen=True, slots=True)
class SnapshotResult:
    snapshot: dict[str, Any]
    output_path: Path
    is_fallback: bool
    section_counts: dict[str, int]


def _activity_score(snapshot: dict[str, Any]) -> int:
    return sum(
        [
            len(snapshot.get("recent_ratings", [])),
            len(snapshot.get("new_restaurants", [])),
            len(snapshot.get("active_states", [])),
            len(snapshot.get("recent_badges", [])),
            len(snapshot.get("crawl_activity", {}).get("recent_crawls", [])),
        ]
    )


def _section_counts(snapshot: dict[str, Any]) -> dict[str, int]:
    xp_streak_milestones = snapshot.get("xp_streak_milestones", {})
    crawl_activity = snapshot.get("crawl_activity", {})
    return {
        "recent_ratings": len(snapshot.get("recent_ratings", [])),
        "top_restaurants": len(snapshot.get("top_restaurants", [])),
        "new_restaurants": len(snapshot.get("new_restaurants", [])),
        "active_states": len(snapshot.get("active_states", [])),
        "recent_badges": len(snapshot.get("recent_badges", [])),
        "xp_levels": len(xp_streak_milestones.get("xp_levels", [])),
        "streak_weeks": len(xp_streak_milestones.get("streak_weeks", [])),
        "crawls": len(crawl_activity.get("recent_crawls", [])),
    }


def _write_snapshot(snapshot: dict[str, Any], output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as handle:
        json.dump(snapshot, handle, indent=2, sort_keys=True, default=str)
        handle.write("\n")


def _real_snapshot(client: SupabaseClient, *, logger=None, window_config: Phase3WindowConfig | None = None) -> dict[str, Any]:
    data_client = Phase3DataClient(client, logger=logger)
    sections = data_client.collect_snapshot_sections(window_config=window_config)
    snapshot = {
        "agent": "Jalapeno",
        "phase": 3,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "is_fallback": False,
        **sections,
    }
    return snapshot


def generate_latest_snapshot(
    *,
    logger=None,
    client: SupabaseClient | None = None,
    output_path: Path = DEFAULT_SNAPSHOT_PATH,
    window_config: Phase3WindowConfig | None = None,
) -> SnapshotResult:
    window_settings = window_config or Phase3WindowConfig()
    log_event(logger, "snapshot_generation_started", output_path=output_path, is_fallback=False)
    fallback_reason = "missing_supabase_credentials" if client is None else None
    low_activity_score: int | None = None

    snapshot: dict[str, Any]
    is_fallback = False
    try:
        if client is None:
            raise SupabaseError("Supabase client unavailable")

        snapshot = _real_snapshot(client, logger=logger, window_config=window_settings)
        threshold = window_settings.activity_score_threshold
        low_activity_score = _activity_score(snapshot)
        if low_activity_score < threshold:
            fallback_reason = "low_activity"
            log_event(
                logger,
                "snapshot_generation_low_activity",
                level="warning",
                activity_score=low_activity_score,
                threshold=threshold,
                fallback_reason=fallback_reason,
            )
            snapshot = build_fallback_snapshot()
            is_fallback = True
    except (SupabaseError, OSError) as exc:
        log_event(logger, "snapshot_generation_failed", level="error", message=str(exc), fallback_reason=fallback_reason or "supabase_error")
        snapshot = build_fallback_snapshot()
        is_fallback = True
    else:
        fallback_reason = None

    if is_fallback:
        snapshot["source"] = {
            "supabase_available": client is not None,
            "opted_out_user_count": snapshot.get("source", {}).get("opted_out_user_count", 0),
        }

    counts = _section_counts(snapshot)
    if is_fallback and snapshot.get("source", {}).get("opted_out_user_count") is not None:
        log_event(logger, "opted_out_users_excluded", count=snapshot.get("source", {}).get("opted_out_user_count", 0))
    log_section_counts(
        logger,
        recent_ratings=counts["recent_ratings"],
        top_restaurants=counts["top_restaurants"],
        new_restaurants=counts["new_restaurants"],
        active_states=counts["active_states"],
        recent_badges=counts["recent_badges"],
        xp_levels=counts["xp_levels"],
        streaks=counts["streak_weeks"],
        crawls=counts["crawls"],
    )
    if is_fallback:
        log_event(logger, "fallback_data_used", reason=fallback_reason or "unavailable", is_fallback=True)

    try:
        _write_snapshot(snapshot, output_path)
    except OSError as exc:
        log_event(logger, "snapshot_generation_failed", level="error", message=str(exc), fallback_reason="snapshot_write_failed")
        raise ConfigError(f"Unable to write snapshot: {exc}") from exc

    log_event(logger, "snapshot_written", output_path=output_path, is_fallback=is_fallback)
    return SnapshotResult(snapshot=snapshot, output_path=output_path, is_fallback=is_fallback, section_counts=counts)
