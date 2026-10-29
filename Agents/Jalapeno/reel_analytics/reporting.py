"""Age-matched, per-platform reporting; no inferred conversions or unique totals."""
from collections import Counter, defaultdict
from datetime import datetime, timedelta
from statistics import mean

COMPONENTS = {"instagram": ["likes_reactions", "comments", "shares", "saves"],
              "facebook": ["likes_reactions", "comments", "shares"]}
MILESTONES = {"24h": 24, "72h": 72, "7d": 168}


def engagement(platform, metrics):
    components = COMPONENTS[platform]
    reach = metrics.get("reach", {}).get("value")
    values = [metrics.get(k, {}).get("value") for k in components]
    value = None if reach is None or reach <= 0 or any(v is None for v in values) else sum(values) / reach
    return {"value": value, "components": components, "denominator": "reach",
            "reason": "reach_or_required_component_unavailable_or_zero_reach" if value is None else None,
            "comparison_scope": "same_platform_and_age_window_only"}


def snapshot_window(age_hours, captured_at):
    for label, threshold in MILESTONES.items():
        if threshold <= age_hours < threshold + 24:
            return label
    return "current-" + captured_at.date().isoformat()


def metric(row, name):
    return row.get("metrics", {}).get(name, {}).get("value")


def build_report(posts, snapshots, health, now):
    latest = {}
    for row in snapshots:
        key = (row["platform"], row["media_id"])
        if key not in latest or row["captured_at"] > latest[key]["captured_at"]:
            latest[key] = row
    recent = []
    for post in sorted(posts, key=lambda p: p.get("published_at", ""), reverse=True)[:60]:
        observation = latest.get((post["platform"], post["media_id"]))
        recent.append({**post, "observation": observation,
                       "milestone_status": "too_young_for_24h" if post.get("age_hours", 0) < 24 else "eligible_or_past_milestones"})
    groups = defaultdict(list)
    for row in snapshots:
        if row["window"] in MILESTONES:
            groups[(row["platform"], row["window"], row.get("live_test", False))].append(row)
    rankings, geography, comparisons = [], [], []
    for (platform, window, live_test), rows in sorted(groups.items()):
        # First observation in a milestone window; immutable snapshot identity
        # ensures each post contributes once to that platform/window cohort.
        for name in ("reach", "comments", "shares"):
            ranked = sorted((r for r in rows if metric(r, name) is not None), key=lambda r: metric(r, name), reverse=True)[:5]
            rankings.append({"platform": platform, "window": window, "live_test": live_test,
                             "metric": name, "reels": [{"reel_id": r["reel_id"], "post_url": r["post_url"],
                                                         "geography": r["geography"], "value": metric(r, name),
                                                         "age_hours": r["age_hours"]} for r in ranked]})
        areas = defaultdict(list)
        for row in rows:
            areas[row["geography"].get("label") or "Unknown"].append(row)
        for area, members in sorted(areas.items()):
            geography.append({"platform": platform, "window": window, "live_test": live_test,
                              "area": area, "n": len(members),
                              "age_range_hours": [min(r["age_hours"] for r in members), max(r["age_hours"] for r in members)],
                              "metrics": {m: {"n": sum(metric(r, m) is not None for r in members),
                                              "mean": mean([metric(r, m) for r in members if metric(r, m) is not None])
                                              if any(metric(r, m) is not None for r in members) else None}
                                          for m in ("views", "reach", "comments", "shares", "saves")}})
        # Use publication cohorts that have BOTH had a full chance to reach the
        # milestone plus daily collection tolerance. Compare adjacent 7d spans.
        end = now - timedelta(hours=MILESTONES[window] + 24)
        current = [r for r in rows if end - timedelta(days=7) <= datetime.fromisoformat(r["published_at"]) < end]
        previous = [r for r in rows if end - timedelta(days=14) <= datetime.fromisoformat(r["published_at"]) < end - timedelta(days=7)]
        for name in ("views", "reach", "comments", "shares", "saves"):
            a, b = [metric(r, name) for r in current if metric(r, name) is not None], [metric(r, name) for r in previous if metric(r, name) is not None]
            enough = len(a) >= 3 and len(b) >= 3
            comparisons.append({"platform": platform, "window": window, "live_test": live_test, "metric": name,
                                "period_end_exclusive": end.isoformat(), "period_days": 7,
                                "current_n": len(a), "previous_n": len(b),
                                "current_mean": mean(a) if enough else None,
                                "previous_mean": mean(b) if enough else None,
                                "change_fraction": (mean(a) - mean(b)) / mean(b) if enough and mean(b) > 0 else None,
                                "reason": None if enough else "too_little_data_minimum_3_per_period"})
    comparable = [c for c in comparisons if not c["live_test"] and c["change_fraction"] is not None]
    takeaway = "Too little comparable data to judge improvement or geographic winners. Current-age observations and live tests do not establish a trend."
    if comparable:
        c = comparable[0]
        takeaway = (f"{c['platform']} {c['window']} mean {c['metric']} changed {c['change_fraction']:+.1%} "
                    f"between adjacent 7-day publication cohorts (n={c['previous_n']} then {c['current_n']}). "
                    "This is descriptive evidence, not a causal result or a posting recommendation.")
    return {"schema_version": 1, "generated_at": now.isoformat(), "health": health,
            "recent_reels": recent, "rankings": rankings, "geography": geography,
            "period_comparisons": comparisons, "engagement_components": COMPONENTS,
            "takeaway": takeaway, "notes": [
                "Lifetime cumulative observations at actual capture ages; milestone tolerance is [target,target+24h).",
                "Current-age backfills cannot reconstruct missed historical metrics. Provider data may lag 48h.",
                "Live tests are separate cohorts. Rank and compare only within a platform and age window.",
                "Reach is unique within a single post estimate; never summed as unique people across posts or platforms.",
                "Instagram and Facebook engagement use different components and are not directly comparable.",
                "Geography describes the challenge area, not viewers' locations. No attributed installs/downloads/conversions are measured."]}


def markdown(report):
    def clean(value):
        return str(value).replace("|", "\\|").replace("\n", " ").replace("\r", " ")
    def display(value):
        return "null" if value is None else f"{value:.2f}" if isinstance(value, float) else str(value)
    lines = ["# Guess the Wing Spot — Instagram and Facebook performance", "",
             "Collection health: " + clean(report["health"]), "", report["takeaway"], "",
             "| Geography | Platform | Published UTC | Observation age (h) | Window | Views | Reach | Likes/reactions | Comments | Shares | Saves | Engagement | Link |",
             "|---|---|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---|"]
    for row in report["recent_reels"]:
        observation = row.get("observation") or {}
        values = [row["geography"].get("label"), row["platform"] + (" (live test)" if row["live_test"] else ""),
                  row.get("published_at", "unavailable"), display(observation.get("age_hours")), observation.get("window", row["milestone_status"])]
        values += [display(metric(observation, m)) for m in ("views", "reach", "likes_reactions", "comments", "shares", "saves")]
        rate = observation.get("engagement", {}).get("value")
        values += ["null" if rate is None else f"{rate:.2%}"]
        values += [row.get("post_url") or "unavailable"]
        lines.append("| " + " | ".join(map(clean, values)) + " |")
    lines += ["", "## Best Reels (separate platform and observation windows)"]
    for rank in report["rankings"]:
        if rank["reels"]:
            lines.append(f"- {rank['platform']} / {rank['window']} / {'live test' if rank['live_test'] else 'nightly'} / {rank['metric']}: " +
                         "; ".join(f"{clean(r['geography'].get('label'))}: {display(r['value'])} ({r['post_url']})" for r in rank["reels"]))
    if not report["rankings"]:
        lines.append("No milestone observations yet; current-age results are not ranked against older posts.")
    lines += ["", "## Geographic cohorts", "", "| Platform | Window | Cohort | Area | Posts | Capture age range | Mean reach (n) | Mean comments (n) | Mean shares (n) |", "|---|---|---|---|---:|---|---|---|---|"]
    for g in report["geography"]:
        cells = [g["platform"], g["window"], "live test" if g["live_test"] else "nightly", g["area"], g["n"], g["age_range_hours"]]
        cells += [f"{display(g['metrics'][m]['mean'])} ({g['metrics'][m]['n']})" for m in ("reach", "comments", "shares")]
        lines.append("| " + " | ".join(map(clean, cells)) + " |")
    lines += ["", "## Equivalent-period comparisons"]
    for c in report["period_comparisons"]:
        lines.append(f"- {c['platform']}/{c['window']}/{c['metric']} ({'live test' if c['live_test'] else 'nightly'}): " +
                     (f"{c['change_fraction']:+.1%}" if c["change_fraction"] is not None else c.get("reason") or "change undefined with zero previous mean") +
                     f"; previous n={c['previous_n']}, current n={c['current_n']}.")
    lines += ["", "## Engagement", "Instagram: (likes + comments + shares + saves) / reach.",
              "Facebook: (reactions + comments + shares) / reach; saves unsupported.",
              "Missing required components or unavailable/zero reach produce null. Formulas are not directly comparable.",
              "", "## Limitations"] + ["- " + note for note in report["notes"]]
    return "\n".join(lines) + "\n"
