# Buffago Daily Metrics — 2026-07-25

## Executive Summary

- **Data collection:** 0 aggregate sources available; 22 metrics are honestly unavailable.
- **Jalapeno:** Investigate.
- **Immediate action:** Monitor unless a source is partial, stale, or unavailable.

## Daily Scorecard

| Metric | Yesterday | Previous day | Change | Trailing 7 days | Status |
|---|---:|---:|---:|---:|---|
| Ratings Created | Unavailable | Unavailable | — | Unavailable | Unavailable |
| Crawls Created | Unavailable | Unavailable | — | Unavailable | Unavailable |
| Crawls Completed | Unavailable | Unavailable | — | Unavailable | Unavailable |
| Badges Awarded | Unavailable | Unavailable | — | Unavailable | Unavailable |
| Onboarding Events | Unavailable | Unavailable | — | Unavailable | Unavailable |
| Wing Battle Votes | Unavailable | Unavailable | — | Unavailable | Unavailable |
| Xp Claims | Unavailable | Unavailable | — | Unavailable | Unavailable |
| Jalapeno Runs | Unavailable | Unavailable | — | Unavailable | Unavailable |
| Jalapeno Errors | Unavailable | Unavailable | — | Unavailable | Unavailable |

## Users and Retention

Retention, active-user ratios, and onboarding completion require a privacy-safe authoritative activity and auth aggregate source. Partial cohorts are not estimated.

## Ratings and Core Engagement

Ratings created is sourced from `destination_ratings.created_at`: Unavailable yesterday.

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

Unavailable: ratings_created, crawls_created, crawls_completed, badges_awarded, onboarding_events, wing_battle_votes, xp_claims, jalapeno_runs, jalapeno_errors, registered_users, dau, wau, mau, retention_d1, retention_d7, retention_d30, missions, referrals, state_passport, error_telemetry, auth_failures, performance_percentiles. See `docs/metric-source-map.md` for required sources.

## Run Metadata

- Execution timestamp: 2026-07-26T19:01:17.411539Z
- Reporting timezone: America/New_York
- Reporting window: 2026-07-25T04:00:00Z to 2026-07-26T04:00:00Z (end exclusive)
- Chipotle Git commit: b771d42
- Data-source status: aggregate REST GET collection; no writes performed.
