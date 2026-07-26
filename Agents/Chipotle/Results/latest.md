# Buffago Daily Metrics — 2026-07-25

## Executive Summary

- **Data collection:** 10 aggregate sources available; 12 metrics are honestly unavailable.
- **Jalapeno:** Investigate.
- **Immediate action:** Monitor unless a source is partial, stale, or unavailable.

## Daily Scorecard

| Metric | Yesterday | Previous day | Change | Trailing 7 days | Status |
|---|---:|---:|---:|---:|---|
| Ratings Created | 1 | 0 | new | 1 | Healthy |
| Crawls Created | 1 | 0 | new | 1 | Healthy |
| Crawls Completed | 0 | 0 | 0 | 0 | Healthy |
| Badges Awarded | 1 | 0 | new | 1 | Healthy |
| Onboarding Events | 0 | 0 | 0 | 0 | Healthy |
| Wing Battle Votes | 0 | 0 | 0 | 0 | Healthy |
| Xp Claims | 0 | 0 | 0 | 1 | Healthy |
| Jalapeno Runs | 1 | 1 | +0 | 8 | Healthy |
| Jalapeno Errors | 0 | 0 | 0 | 2 | Healthy |
| Dau | 22 | 7 | +15 | — | Healthy |

## Users and Retention

Retention, active-user ratios, and onboarding completion require a privacy-safe authoritative activity and auth aggregate source. Partial cohorts are not estimated.

## Ratings and Core Engagement

Ratings created is sourced from `destination_ratings.created_at`: 1 yesterday.

## Crawls, Missions, XP, and Rewards

Crawls created/completed use `crawls.start_time` / `crawls.end_time`; badges use `user_badges.earned_at`; daily XP activity uses `daily_xp_claims.claimed_at`.

## Reliability and Authentication

No authoritative application error, session, authentication-failure, or timing telemetry was detected; this is **Unavailable**, not zero errors.

## Jalapeno Health

Status: **Investigate**. local_artifact_freshness Artifact: latest_external_context.json.

## Significant Changes

Changes are shown as counts; no anomaly claim is made without sufficient denominators and history.

## Recommended Actions

1. **This Week — Analytics:** add approved aggregate activity/error views to enable retention and reliability metrics.
2. **Monitor — Jalapeno:** investigate if its local artifact exceeds the configured freshness window.

## Data Quality and Missing Metrics

Unavailable: registered_users, wau, mau, retention_d1, retention_d7, retention_d30, missions, referrals, state_passport, error_telemetry, auth_failures, performance_percentiles. See `docs/metric-source-map.md` for required sources.

## Run Metadata

- Execution timestamp: 2026-07-26T19:23:55.261900Z
- Reporting timezone: America/New_York
- Reporting window: 2026-07-25T04:00:00Z to 2026-07-26T04:00:00Z (end exclusive)
- Chipotle Git commit: 5859e3b
- Data-source status: aggregate REST GET collection; no writes performed.
