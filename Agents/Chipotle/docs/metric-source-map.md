# Chipotle metric-to-source map

## Contract v2 definitions

All reporting windows are completed `America/New_York` calendar days converted to UTC, with an exclusive end. Sources use bounded Supabase REST `GET` requests and aggregate counts only. No user ID, email, token, session trail, or raw payload may reach a report.

| Area | Definition / safe source | Current state |
|---|---|---|
| Any-activity DAU | `analytics_daily_active_users.active_identities` for the completed day | Calculated. It is not treated as meaningful usage. |
| Meaningful DAU/WAU/MAU | Distinct users completing a rating, crawl, Wing Duel vote, or XP action. The allowlist is emitted in metadata. | Unavailable: no identity-safe rolling aggregate. |
| Activation | Onboarding completion plus first meaningful action. Completion rate and time-to-activation require a safe joined aggregate. | Onboarding starts calculated; activation otherwise unavailable. |
| Retention | D1/D7/D30 cohort users returning with a meaningful action divided by the original cohort size. | Unavailable: safe cohort aggregate not present. Future immature windows must be `cohort_not_mature`, with null value. |
| Engagement | Counts of ratings, crawl starts/completions, badges, Wing Duel votes, and XP claims from the public timestamped relations. | Calculated when source query succeeds. Unique users, locations, shares, referrals, and repeat contributors need aggregates. |
| Product health | Auth/core action outcomes, errors, crashes, incidents, backend failures, releases. | Unavailable pending sanitized telemetry views; no telemetry does not mean zero errors. |
| Business viability | Verified manual aggregate facts in `Buffago/metrics/manual-business-facts.json`. | Read-only and `manually_verified`; missing facts stay null. |
| Operational maturity | Collection coverage, freshness, scheduling evidence, and instrumentation gaps. | Calculated factual evidence only; no score. |

Confidence is high for a successful authoritative aggregate query, medium for an authoritative aggregate whose definition has a known limitation (for example daily identities that cannot be deduplicated across days), and none for unavailable or failed sources. Completeness is usable contract records divided by total contract records. Trends never divide by a zero baseline and only claim a complete window when the input window exists.

To add instrumentation, first add a privacy-safe aggregate view/RPC with no identifiers or raw payloads. Document its table/RPC, timestamp, denominator, cohort size, timezone semantics, and failure behavior here; then add the collector, fixture tests, and contract field. Do not substitute a product table containing user identifiers for an approved aggregate.

Apache should consume `Buffago/metrics/latest.json` for the most recent evidence and at least eight `daily/*.json` snapshots for its Sunday review. It should interpret statuses and gaps, and remains the owner of any score or action selection.

All timestamps are transformed from the completed `America/New_York` calendar day to UTC. Queries are GET-only, aggregate-only counts; no user identifiers or raw payloads enter a report.

| Metric group / metric | Definition and calculation | Authoritative source / timestamp | Availability | Privacy and limitations |
|---|---|---|---|---|
| Ratings created | Count rows created in period | `destination_ratings.created_at` | Implemented | Aggregate count only. Category averages/unique submitters need approved aggregate view. |
| Crawls created / completed | Count starts / ends in period | `crawls.start_time`, `crawls.end_time` | Implemented | Aggregate only; completion rate needs a validated cohort definition. |
| Badges awarded | Count earned rows | `user_badges.earned_at` | Implemented | Aggregate only. |
| Daily XP activity | Count daily-claim rows | `daily_xp_claims.claimed_at` | Implemented | Claim count is not XP amount; XP ledger mapping must be confirmed. |
| Onboarding events | Count starts | `onboarding_analytics.started_at` | Implemented | Completion rate requires session-level aggregate/view; no session identifiers retained. |
| Wing Battle activity | Count votes | `user_wing_battle_votes.created_at` | Implemented | Aggregate only; participation rate needs active-user denominator. |
| Jalapeno runs/errors | Counts by run/error creation | `jalapeno_runs.started_at`, `jalapeno_errors.created_at` | Implemented if tables are accessible | Only counts; raw error messages are never read. |
| Jalapeno freshness | Age of newest safe local `data/latest_*.json` artifact | `Agents/Jalapeno/data/latest_*.json` modified time | Implemented | Read-only adapter; does not claim a run outcome from artifact freshness alone. |
| DAU | Daily distinct activity identities | `analytics_daily_active_users.active_identities` / `event_date` | Implemented | The live view returns grouped counts only; a missing date row is authoritative zero activity for that date. |
| Registered/new users, provider mix, deletions | Auth account aggregates | `auth.users` / provider metadata | Unavailable | No existing safe aggregate RPC/view was exposed. Admin user enumeration and the public profile table are deliberately not used as substitutes. |
| WAU/MAU, returning/first active, retention | Unique rolling/cohort activity identities | `analytics_daily_active_users` is insufficient | Unavailable | The live view has no stable identity, so cross-day deduplication and D1/D7/D30 cannot be calculated. |
| Missions, Passport, referrals, social | Aggregate event counts | Mission/referral relations exist, but no approved Chipotle definition | Unavailable | A source is not adopted until the metric definition and privacy boundary are approved. |
| Errors, auth failures, performance percentiles, release signals | Sanitized telemetry aggregates | No confirmed authoritative telemetry view | Unavailable | `debug_logs` and raw operational payloads are intentionally excluded for privacy. |

## Detected Jalapeno integration

Jalapeno is a Python Instagram content agent at `Agents/Jalapeno`. Its migrations and code identify `jalapeno_runs`, `jalapeno_posts`, `jalapeno_post_metrics`, and `jalapeno_errors`; its safe local `data/latest_*.json` snapshots are parsed only for artifact freshness. Chipotle does not call or alter Jalapeno.

## 2026-07-26 production reconciliation

The configured value was a Supabase Dashboard URL (`https://supabase.com/dashboard/project/<ref>`), not a REST base URL. Chipotle now normalizes that exact dashboard form to `https://<ref>.supabase.co`; the project reference is `vhfxnizaxdanmvmouuaf`, which matches the production app's deployed Supabase callback and function URLs. Therefore all prior `supabase_http_404` results were incorrect REST routes, not missing or unexposed relations.

Live OpenAPI inspection confirms that every implemented source above is exposed in the `public` REST schema and that the timestamp columns match the source map. It also exposes the aggregate views `analytics_daily_active_users`, `analytics_crawl_funnel_daily`, `analytics_rating_funnel_daily`, and `referral_reporting_daily`. The analytics views are live-schema drift: they are present in the live public schema but their creation SQL is not represented by a checked-in migration. `referral_reporting_daily` is represented by `20260724033000_referral_system_v1.sql`.
