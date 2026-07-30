# Buffago Metrics — 2026-07-29

- Collection status: **partial**; completeness: **14.1%**; evidence confidence: **medium**.
- Meaningful DAU / WAU / MAU: **Unavailable / Unavailable / Unavailable**.
- Any-activity DAU: **6** (the current daily aggregate cannot safely calculate WAU/MAU).

## Growth and activation

Growth acquisition and activation completion are unavailable pending identity-safe aggregate instrumentation. Activation is defined as onboarding completion plus a first meaningful action; Chipotle does not infer it.

## Engagement and geography

- Ratings created: **27**; crawls created: **29**; Wing Duel votes: **0**.
- Geographic and market-density data: unavailable pending aggregate views.

## Retention and product health

Retention cohorts are unavailable; immature cohorts must be emitted as `cohort_not_mature`, never zero. Product telemetry is unavailable, not a claim of zero errors.

## Business signals

Manual verified facts are read from `Buffago/metrics/manual-business-facts.json` without overwriting it. Missing facts are unavailable.

## Strongest signal / largest constraint

- Strongest positive signal: aggregate ratings and crawl activity are collected from production read-only sources.
- Largest constraint: no identity-safe meaningful-user, cohort, activation, telemetry, or geography aggregates yet.

## Important gaps and prior-week comparison

Important gaps: acquisition_cost, acquisition_spending, activated_users, activation_rate, active_market_growth, active_partner_conversations, anonymous_authenticated_activity, application_errors. Prior-week comparisons are present only where complete historical snapshots exist; no maturity score is calculated here.

Machine-readable: `Buffago/metrics/latest.json` and `Buffago/metrics/daily/2026-07-29.json`.
