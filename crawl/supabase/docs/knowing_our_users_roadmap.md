# Knowing Our Users Roadmap

This roadmap assumes a solo-founder pace. The highest value path is: understand what exists, add clean event logging, then build a few read-only views that answer real product questions.

## Phase 1: Understand Current Data

What to build:

- Regenerate schema exports including tables, views, functions, policies, indexes, and foreign keys.
- Confirm whether `api_rate_limits`, `crawl_members`, and `destination_tag_map` exist in production.
- Make `route_ordered_destinations` vs `routes.stop1_id` through `stop5_id` ownership explicit.
- Define core metrics: active user, rating completed, crawl started, crawl completed, retained user, restaurant discovery action.
- Create a short data dictionary for central tables.

Why it matters: current data can answer completed actions, but not attempts, abandonment, empty states, or retention causes. Before migrations, the real production schema needs to be known.

Effort estimate: 0.5-1 weekend.

Highest-value first steps:

- Export policies/indexes/FKs.
- Verify missing/stale tables.
- Pick canonical route stop model.

What not to build yet:

- Do not build dashboards off stale schema exports.
- Do not clean up legacy tables until production references are verified.

## Phase 2: Add Clean Event Logging

What to build:

- `user_events` table.
- Minimal RLS for insert-only client writes and no raw client reads.
- TypeScript `trackEvent` helper.
- Anonymous/session ID handling.
- Event instrumentation for app opens, onboarding, search, restaurant views, directions, rating funnel, crawl funnel, Wing Battle, leaderboard/profile, errors, empty states, and slow screens.

Why it matters: this fills the main behavioral blind spot. Business rows show what completed; events show what users tried and where they quit.

Effort estimate: 1 weekend for MVP instrumentation, another partial weekend to polish.

Highest-value first steps:

- Log `app_opened`, `rating_started`, `rating_completed`, `rating_abandoned`, `crawl_started`, `crawl_completed`, `restaurant_search_submitted`, `restaurant_profile_viewed`, `directions_tapped`, `screen_load_failed`, and `screen_load_slow`.

What not to build yet:

- Do not track raw search text or precise location by default.
- Do not send every tiny button tap. Track decisions and funnel transitions.

## Phase 3: Build Analytics Views

What to build:

- `analytics_daily_active_users`
- `analytics_rating_funnel_daily`
- `analytics_crawl_funnel_daily`
- `analytics_discovery_daily`
- `analytics_route_performance_daily`
- `analytics_destination_performance_daily`
- `analytics_agent_restaurant_summary` with privacy thresholds.

Why it matters: views turn raw events into useful product answers and create safe surfaces for agents.

Effort estimate: 1 weekend after event data exists.

Highest-value first steps:

- DAU/app opens.
- Rating funnel.
- Crawl funnel.
- Search empty states and API failures.

What not to build yet:

- Do not build complex cohort models before there is enough event volume.
- Do not give agents `select *` on `user_events`.

## Phase 4: Build Retention and Growth Dashboards

What to build:

- Simple dashboard for D1/D7 retention.
- New vs returning users.
- Onboarding completion.
- Rating completion rate.
- Crawl start-to-completion rate.
- Top restaurants/routes by views, directions taps, ratings, and conversion.
- Error/slow-screen trend.
- Share/referral activity once sharing is instrumented.

Why it matters: this turns product work into measurable loops: discovery, rating, crawling, returning, sharing.

Effort estimate: 1-2 weekends depending on dashboard tool.

Highest-value first steps:

- Weekly founder dashboard: active users, new users, returning users, ratings, crawl starts, crawl completions, restaurant views, directions taps, top empty states.

What not to build yet:

- Do not overbuild BI. A handful of Supabase views plus charts is enough.
- Do not optimize paid marketing until organic onboarding/retention baselines are visible.

## Phase 5: Feed Insights Into Agents, Social Media, and Marketing

What to build:

- Agent-safe read-only views with aggregated restaurant/route/state insights.
- Weekly insight generator: "best performing restaurants", "routes with interest but low completion", "states with demand but low coverage", "top empty searches", "content ideas".
- Social content queue based on aggregate trends, not individual user data.
- Marketing opportunity reports by state/city/route/destination.

Why it matters: Buffago can use its own behavior data to choose where to improve coverage, what content to post, and which restaurants/routes to feature.

Effort estimate: 1 weekend for first agent-safe views and a simple weekly report.

Highest-value first steps:

- `analytics_agent_restaurant_summary`
- `analytics_agent_route_summary`
- `analytics_agent_growth_opportunities`

What not to build yet:

- Do not let agents query raw user tables.
- Do not let agents access free-text feedback, debug payloads, Wingman raw inputs, or raw AI/Places responses.
- Do not automate public marketing posts without human review.

## Best First Weekend Task

Build the MVP `user_events` design and instrument the highest-value flows:

- app opened
- onboarding started/completed/skipped
- restaurant search submitted/empty
- restaurant profile viewed
- directions tapped
- rating started/completed/abandoned
- crawl started/completed/abandoned
- leaderboard viewed
- screen load failed/slow

Then create two views: `analytics_daily_active_users` and `analytics_rating_funnel_daily`. That is enough to start learning immediately without overbuilding.

