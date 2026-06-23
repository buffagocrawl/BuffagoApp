# Recommended Schema Additions

These recommendations are intentionally practical for a solo-founder app. The first priority is one clean event stream plus a small number of read-only views. Do not start with a warehouse, CDP, or complex identity graph.

## MVP Additions

### `user_events`

Purpose: central product event log for app opens, onboarding, discovery, ratings, crawls, social/gamification, errors, empty states, and slow screens.

Example columns: `id uuid`, `occurred_at timestamptz`, `user_id uuid null`, `anonymous_id text null`, `session_id uuid`, `event_name text`, `screen text null`, `state_id int null`, `route_id uuid null`, `crawl_id uuid null`, `destination_id uuid null`, `metadata jsonb`, `app_version text null`, `platform text null`.

Why it matters: fills the biggest blind spot: what users try to do before rows like ratings/crawls exist.

Phase: MVP.

Risk/complexity: Low to medium. Main risk is inconsistent event names and logging sensitive metadata.

### `analytics_daily_active_users` view

Purpose: daily active users and anonymous users from `user_events`.

Example columns: `event_date`, `signed_in_users`, `anonymous_users`, `total_event_count`, `app_opens`.

Why it matters: answers basic growth and retention questions without exposing raw events.

Phase: MVP.

Risk/complexity: Low.

### `analytics_rating_funnel_daily` view

Purpose: daily counts for rating start, completion, and abandonment.

Example columns: `event_date`, `rating_started`, `rating_completed`, `rating_abandoned`, `completion_rate`.

Why it matters: shows whether users understand and finish the core action.

Phase: MVP.

Risk/complexity: Low after `user_events` exists.

### `analytics_crawl_funnel_daily` view

Purpose: daily crawl starts, step completions, completed crawls, abandoned crawls, and average stop coverage.

Example columns: `event_date`, `crawl_started`, `crawl_step_completed`, `crawl_completed`, `crawl_abandoned`, `avg_steps_completed`.

Why it matters: crawl completion is Buffago's core product loop.

Phase: MVP.

Risk/complexity: Low to medium because completed/abandoned logic needs definitions.

### `analytics_discovery_daily` view

Purpose: summarize search, profile views, route views, directions taps, map interactions, and empty states.

Example columns: `event_date`, `restaurant_searches`, `destination_views`, `route_views`, `directions_taps`, `empty_search_results`, `api_failures`.

Why it matters: tells you if users are discovering wings or getting stuck before rating.

Phase: MVP.

Risk/complexity: Low.

### `analytics_agent_restaurant_summary` view

Purpose: sanitized restaurant-level read model for agents.

Example columns: `destination_id`, `destination_name`, `city`, `state_id`, `rating_count`, `avg_weight_score`, `avg_overall`, `last_rated_at`, `profile_views_30d`, `directions_taps_30d`.

Why it matters: lets agents recommend content and marketing targets without raw user history.

Phase: MVP or Phase 2.

Risk/complexity: Medium. Must avoid exposing individual-user rows when counts are low.

## Phase 2 Additions

### `app_sessions`

Purpose: optional session table if event-only sessions become hard to reason about.

Example columns: `session_id uuid`, `user_id uuid null`, `anonymous_id text`, `started_at`, `ended_at`, `duration_ms`, `entry_screen`, `exit_screen`, `app_version`, `platform`.

Why it matters: easier retention/session-length analysis.

Phase: Phase 2.

Risk/complexity: Medium. Can be derived from events at first.

### `rating_sessions`

Purpose: optional stateful table for rating attempts.

Example columns: `id uuid`, `user_id`, `anonymous_id`, `destination_id`, `crawl_id`, `started_at`, `completed_at`, `abandoned_at`, `abandon_reason`, `destination_rating_id`.

Why it matters: provides precise rating funnel and abandoned-form recovery.

Phase: Phase 2.

Risk/complexity: Medium. Do not add until event-only tracking proves insufficient.

### `destination_profile_stats_daily`

Purpose: daily destination discovery stats.

Example columns: `event_date`, `destination_id`, `views`, `directions_taps`, `rating_starts`, `rating_completions`, `unique_users`.

Why it matters: identifies restaurants with interest but weak conversion, and restaurants worth featuring.

Phase: Phase 2.

Risk/complexity: Low to medium.

### `route_stats_daily`

Purpose: daily route discovery and crawl stats.

Example columns: `event_date`, `route_id`, `route_views`, `crawl_starts`, `crawl_completions`, `ratings_completed`, `directions_taps`, `unique_users`.

Why it matters: tells you which crawls drive behavior and which routes are dead weight.

Phase: Phase 2.

Risk/complexity: Low to medium.

### `user_lifecycle_daily` view

Purpose: retention and lifecycle segmentation without exposing raw profiles.

Example columns: `activity_date`, `user_id`, `first_seen_date`, `days_since_first_seen`, `days_since_last_seen`, `events_count`, `ratings_count`, `crawls_started`, `crawls_completed`.

Why it matters: powers D1/D7 retention, returning-user analysis, and "users who almost got value" lists.

Phase: Phase 2.

Risk/complexity: Medium because it includes user-level rows. Keep it admin-only or agent-safe only after anonymization.

### `marketing_attribution`

Purpose: capture install/source/referral attribution when available.

Example columns: `id`, `user_id null`, `anonymous_id`, `source`, `medium`, `campaign`, `referrer_user_id null`, `landing_context`, `created_at`.

Why it matters: connects growth experiments to real user behavior.

Phase: Phase 2.

Risk/complexity: Medium. Attribution is messy; keep it simple.

## Later Additions

### `experiment_assignments`

Purpose: record A/B test or feature flag variants.

Example columns: `id`, `user_id null`, `anonymous_id`, `experiment_key`, `variant`, `assigned_at`.

Why it matters: useful after there is enough traffic to test onboarding/rating/route changes.

Phase: Later.

Risk/complexity: Medium. Not worth building until traffic volume supports experiments.

### `notification_events`

Purpose: track push/email notification sent/opened/failed events.

Example columns: `id`, `user_id`, `channel`, `campaign_key`, `event_name`, `provider_message_id`, `occurred_at`, `metadata`.

Why it matters: retention/growth analysis once campaigns exist.

Phase: Later.

Risk/complexity: Medium.

### `agent_insight_snapshots`

Purpose: store generated, human-reviewable agent insights from read-only analytics views.

Example columns: `id`, `generated_at`, `insight_type`, `scope`, `source_view`, `summary`, `evidence`, `status`.

Why it matters: lets agents help with marketing/social planning without touching raw user data.

Phase: Later.

Risk/complexity: Medium. Only add once analytics views are stable.

## Recommended Columns On Existing Tables

### `destination_ratings.source`

Purpose: distinguish crawl rating, standalone rating, Buffacoin/WingDex rating, guest migration, admin import.

Why it matters: rating volume is not all the same behavior.

Phase: MVP or Phase 2.

Risk/complexity: Low, but backfill needs assumptions.

### `crawls.completed_reason` / `crawls.abandoned_reason`

Purpose: classify how a crawl ended.

Why it matters: makes crawl funnel and retention analysis sharper.

Phase: Phase 2.

Risk/complexity: Medium because UX must define reasons.

### `routes.status`

Purpose: lifecycle for route drafts, active routes, hidden routes, retired routes.

Why it matters: avoids relying only on `is_public` and supports cleanup.

Phase: Phase 2.

Risk/complexity: Low.

### `destinations.status`

Purpose: lifecycle for suggested, active, hidden, duplicate, closed, rejected.

Why it matters: improves Wingman/manual review quality and agent-safe discovery.

Phase: Phase 2.

Risk/complexity: Medium because duplicate/closed handling affects app screens.

## What Not To Build Yet

- Do not build a full enterprise data warehouse yet.
- Do not give agents raw table access.
- Do not create a complex attribution system before basic app events work.
- Do not split every event into its own table.
- Do not add migrations until RLS, indexes, and current schema drift are reviewed.

