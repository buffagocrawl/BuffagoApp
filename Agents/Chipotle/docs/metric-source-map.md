# Chipotle metric-to-source map

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
| Registered/new users, provider mix, deletions | Auth account aggregates | `auth.users` / provider metadata | Unavailable | Needs a dedicated privacy-safe aggregate RPC/view. Admin user enumeration is deliberately not used. |
| DAU/WAU/MAU, returning/first active, streaks, retention | Cohorts based on an authoritative activity event | No complete tracked activity-event aggregate | Unavailable | Never infer from ratings alone; D1/D7/D30 exclude incomplete cohorts. |
| Missions, Passport, referrals, social | Aggregate event counts | No confirmed authoritative tracked source | Unavailable | Requires source-map update before implementation. |
| Errors, auth failures, performance percentiles, release signals | Sanitized telemetry aggregates | No confirmed authoritative telemetry view | Unavailable | `debug_logs` and raw operational payloads are intentionally excluded for privacy. |

## Detected Jalapeno integration

Jalapeno is a Python Instagram content agent at `Agents/Jalapeno`. Its migrations and code identify `jalapeno_runs`, `jalapeno_posts`, `jalapeno_post_metrics`, and `jalapeno_errors`; its safe local `data/latest_*.json` snapshots are parsed only for artifact freshness. Chipotle does not call or alter Jalapeno.
