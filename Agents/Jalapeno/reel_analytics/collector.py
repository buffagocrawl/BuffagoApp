"""Durable discovery and observation only. No app database or publisher imports."""
from collections import Counter
from datetime import datetime, timezone
import os
import re
from zoneinfo import ZoneInfo

import requests

from .meta import DEFINITIONS, MetaReadError, MetaReader
from .reporting import MILESTONES, build_report, engagement, markdown, snapshot_window
from .storage import ANALYTICS, Store, StorageError, discover


def schedule_gate(now, event, cron):
    if event != "schedule":
        return True
    local = now.astimezone(ZoneInfo("America/New_York"))
    expected = "30 0 * * *" if local.utcoffset().total_seconds() == -14400 else "30 1 * * *"
    return cron == expected and local.hour >= 20 and (local.hour > 20 or local.minute >= 30)


def snapshot_key(post, window):
    return f"snapshots/{post['platform']}_{post['media_id']}_{post['reel_id']}_{window}.json"


def observations(store):
    return [store.read(ANALYTICS + "snapshots/" + n) for n in store.names(ANALYTICS + "snapshots/")
            if re.fullmatch(r"(?:instagram|facebook)_\d+_[a-f0-9-]{36}_(?:24h|72h|7d|current-\d{4}-\d{2}-\d{2})\.json", n)]


def collect(store, meta, *, mode, now=None, run_key=None, clock=None):
    if mode not in {"diagnostic", "collect", "backfill"}:
        raise ValueError("invalid_analytics_mode")
    now = now or datetime.now(timezone.utc)
    clock = clock or (lambda: datetime.now(timezone.utc))
    if mode == "diagnostic" and not store.readonly:
        raise StorageError("diagnostics_require_readonly_store")
    store.check_private()
    if mode != "diagnostic":
        if not re.fullmatch(r"\d+\.\d+", run_key or ""):
            raise StorageError("actions_run_identity_required")
        prior = store.read(ANALYTICS + "reports/" + run_key + ".json")
        if prior:
            return prior  # An identical run attempt cannot append new data.
    posts, discovery_errors = discover(store)
    health = {"mode": mode, "discovered_posts": len(posts), "snapshots_collected": 0,
              "milestone_snapshots_collected": 0, "current_age_snapshots_collected": 0,
              "duplicates_skipped": 0, "too_young_for_milestones": 0,
              "outside_recent_horizon": 0, "missing_metrics": {}, "errors": list(discovery_errors)}
    ready, diagnostic_posts = [], []
    missing_counts = Counter()
    horizon = 90 if mode == "backfill" else 30
    for post in posts:
        try:
            resolved = meta.metadata(post)
            age = (now - datetime.fromisoformat(resolved["published_at"])).total_seconds() / 3600
            if age < 0:
                raise MetaReadError("publication_time_is_in_future")
            resolved["age_hours"] = round(age, 4)
            ready.append(resolved)
            if age > horizon * 24:
                health["outside_recent_horizon"] += 1
                continue
            if age < 24:
                health["too_young_for_milestones"] += 1
            window = snapshot_window(age, now)
            key = snapshot_key(post, window)
            if mode != "diagnostic" and store.read(ANALYTICS + key) is not None:
                health["duplicates_skipped"] += 1
                continue
            metrics, raw, failures = meta.insights(post)
            captured = clock()
            actual_age = (captured - datetime.fromisoformat(resolved["published_at"])).total_seconds() / 3600
            window = snapshot_window(actual_age, captured)
            for name, entry in metrics.items():
                if entry["value"] is None:
                    missing_counts[post["platform"] + ":" + name + ":" + entry["reason"]] += 1
            for metric, reason in failures.items():
                health["errors"].append({"platform": post["platform"], "media_id": post["media_id"], "metric": metric, "reason": reason})
            snapshot = {**resolved, "schema_version": 1, "captured_at": captured.isoformat(),
                        "age_hours": round(actual_age, 4), "window": window,
                        "observation_kind": "milestone" if window in MILESTONES else "current_age_observation_not_historical",
                        "missed_historical_windows": [w for w, h in MILESTONES.items() if actual_age >= h + 24
                            and store.read(ANALYTICS + snapshot_key(post, w)) is None],
                        "metrics": metrics, "raw_supported_insights": raw,
                        "engagement": engagement(post["platform"], metrics), "api_version": meta.version,
                        "metric_definitions": DEFINITIONS[post["platform"]]}
            if mode == "diagnostic":
                diagnostic_posts.append({"platform": post["platform"], "age_hours": round(actual_age, 4),
                                         "window_if_collected": window, "missing_metrics": {
                                             k: v["reason"] for k, v in metrics.items() if v["value"] is None}})
            elif store.create(snapshot_key(post, window), snapshot):
                health["snapshots_collected"] += 1
                health["milestone_snapshots_collected" if window in MILESTONES else "current_age_snapshots_collected"] += 1
            else:
                health["duplicates_skipped"] += 1
        except (MetaReadError, StorageError, ValueError, TypeError, KeyError) as error:
            reason = str(error) if isinstance(error, (MetaReadError, StorageError)) else "invalid_media_or_insight_response"
            health["errors"].append({"platform": post["platform"], "media_id": post["media_id"], "reason": reason})
    health["missing_metrics"] = dict(missing_counts)
    protection = store.verify_publications_unchanged()
    protection.update(meta_methods=sorted({r["method"] for r in meta.audit}),
                      storage_mode="read_only" if mode == "diagnostic" else "analytics_only_immutable_create",
                      legacy_tables_accessed=False)
    if mode == "diagnostic":
        access_passed = len(ready) == len(posts) and not discovery_errors
        status = ("diagnostic_passed_with_metric_gaps" if missing_counts else "diagnostic_passed") if access_passed else "diagnostic_partial"
        return {"status": status,
                "health": health, "posts": diagnostic_posts, "protection": protection}
    report = build_report(ready, observations(store), health, clock())
    report.update(protection=protection, storage=ANALYTICS, report_key="reports/" + run_key + ".json")
    report["markdown"] = markdown(report)
    store.create(report["report_key"], report)
    return report


def visibility(env):
    repo = env.get("GITHUB_REPOSITORY", "")
    if not re.fullmatch(r"[\w.-]+/[\w.-]+", repo):
        return "unverified"
    try:
        r = requests.get("https://api.github.com/repos/" + repo,
                         headers={"Authorization": "Bearer " + env.get("GITHUB_TOKEN", ""),
                                  "Accept": "application/vnd.github+json"}, timeout=30)
        data = r.json()
        if r.status_code == 200 and data.get("full_name", "").casefold() == repo.casefold() and type(data.get("private")) is bool:
            return "private" if data["private"] else "public"
    except (requests.RequestException, ValueError):
        pass
    return "unverified"


def main(mode, env=os.environ):
    import json
    now = datetime.now(timezone.utc)
    if not schedule_gate(now, env.get("GITHUB_EVENT_NAME", ""), env.get("GITHUB_EVENT_SCHEDULE", "")):
        print('{"status":"skipped_other_dst_trigger_or_before_2030_eastern"}')
        return 0
    readonly = mode == "diagnostic"
    if not readonly:
        expected = env.get("GITHUB_REPOSITORY", "") + "/.github/workflows/jalapeno-metrics.yml@refs/heads/main"
        if env.get("GITHUB_ACTIONS") != "true" or env.get("GITHUB_REF") != "refs/heads/main" or env.get("GITHUB_WORKFLOW_REF") != expected:
            raise StorageError("analytics_writes_require_main_metrics_workflow")
    store = Store(env["SUPABASE_URL"], env["SUPABASE_SERVICE_ROLE_KEY"], readonly=readonly)
    meta = MetaReader(env["META_LONG_LIVED_ACCESS_TOKEN"], env["META_APP_SECRET"], env["META_GRAPH_API_VERSION"])
    identity = meta.identity(env["INSTAGRAM_BUSINESS_ACCOUNT_ID"], env["FACEBOOK_PAGE_ID"],
                             env["GUESS_EXPECTED_INSTAGRAM_USERNAME"], env["GUESS_EXPECTED_FACEBOOK_NAME"])
    repo_visibility = visibility(env)
    result = collect(store, meta, mode=mode, now=now,
                     run_key=env.get("GITHUB_RUN_ID", "") + "." + env.get("GITHUB_RUN_ATTEMPT", ""))
    # Public repository logs/summaries receive operational counts and permission
    # names ONLY. Full metrics, raw insights, IDs, geography and report stay private.
    health = result["health"]
    safe = {"status": result.get("status", "collected"), "mode": mode,
            "discovered_posts": health["discovered_posts"], "snapshots_collected": health["snapshots_collected"],
            "milestone_snapshots_collected": health["milestone_snapshots_collected"],
            "current_age_snapshots_collected": health["current_age_snapshots_collected"],
            "too_young_for_milestones": health["too_young_for_milestones"],
            "errors": len(health["errors"]), "missing_metrics": health["missing_metrics"],
            "permissions": identity["permissions"], "protection": result["protection"],
            "repository_visibility": repo_visibility, "report": result.get("report_key")}
    print(json.dumps(safe))
    path = env.get("GITHUB_STEP_SUMMARY")
    if path:
        with open(path, "a", encoding="utf-8") as stream:
            if repo_visibility == "private" and "markdown" in result:
                stream.write(result["markdown"])
            else:
                stream.write("### Jalapeño Reel analytics\n\n```json\n" + json.dumps(safe, indent=2) +
                             "\n```\n\nDetailed performance report retained in private Jalapeño storage. No artifact uploaded.\n")
    return 0 if result.get("status") != "diagnostic_partial" else 1
