# Dead, Risky, or Confusing Database Areas

This is a code/schema review, not a live database audit. Confidence reflects evidence from the exported schema and source references.

## High-Confidence Findings

### Schema export is incomplete or stale

Confidence: High.

Evidence: `api_rate_limits` exists in `supabase/migrations/20260511173000_create_api_rate_limits.sql` and is queried/inserted in `supabase/functions/wingman-intake/index.ts`, but it is not listed in `tables.csv`.

Risk: future agents, migrations, and documentation based only on the CSV export will miss security-critical infrastructure.

Recommendation: regenerate schema exports from Supabase and include tables, views, functions, policies, indexes, and foreign keys.

### Code references tables missing from schema export

Confidence: High.

Evidence: `crawl_members` is referenced in `src/lib/crawl.ts` and `hooks/useCrawls.js`; `destination_tag_map` is referenced in `app/crawl/[id].jsx`; neither appears in `tables.csv` or `columns.csv`.

Risk: dead code paths, runtime errors, or incomplete schema documentation. `crawl_members` is especially important if social/multi-user crawls are planned.

Recommendation: decide whether these tables should be restored, migrated, or removed from code. Do not build analytics on them until ownership is clear.

### Route stop model is duplicated

Confidence: High.

Evidence: `routes` has `stop1_id` through `stop5_id`, while `route_ordered_destinations` has normalized `route_id`, `destination_id`, and `stop_order`. Code reads both patterns: route tabs use `route_ordered_destinations`, while home/crawl paths still select `routes.stop1_id` through `stop5_id`.

Risk: inconsistent route stop counts, crawl progress mismatches, harder analytics, and bugs when a route is updated in one model but not the other.

Recommendation: choose `route_ordered_destinations` as the canonical model, keep legacy stop columns temporarily, and add a read-only compatibility view if needed.

### Analytics are fragmented and mostly implicit

Confidence: High.

Evidence: There is `onboarding_analytics`, `debug_logs`, and operational logs like `wingman_intake_logs`, but no general `user_events` table. Product behavior is inferred from rows in business tables like `crawls` and `destination_ratings`.

Risk: you can count completed ratings/crawls, but not impressions, abandonments, empty states, failed searches, slow screens, app opens, map taps, or funnel leakage.

Recommendation: add one focused `user_events` table and later read-only analytics views.

### `wingman_intake_logs` is unsafe for unrestricted agent access

Confidence: High.

Evidence: columns include `raw_input`, `ai_raw_response`, `place_raw_response`, location fields, decision reasoning, and user identifiers.

Risk: raw user text, third-party API payloads, and operational reasoning could expose sensitive data or licensed vendor response content.

Recommendation: keep this table service/admin-only. Create a sanitized aggregate view for agents, for example counts by decision, state, confidence bucket, and day.

### `debug_logs` should not become the analytics source of truth

Confidence: High.

Evidence: `debug_logs` has generic `scope`, `event`, and `detail` JSON and is written by `lib/debugLog.js`.

Risk: debug logs tend to be noisy, inconsistent, privacy-leaky, and hard to index. They are useful for diagnostics, not product analytics.

Recommendation: keep `debug_logs` for troubleshooting with retention limits; create `user_events` for product analytics.

## Medium-Confidence Findings

### `onboarding_analytics` appears underused

Confidence: Medium.

Evidence: table exists with good onboarding fields, but no direct source reference was found in the scanned app code.

Risk: onboarding drop-off may already be intended to be tracked but not wired. This creates false confidence that onboarding analytics exist.

Recommendation: either wire it immediately or replace it with events like `onboarding_started`, `onboarding_step_viewed`, `onboarding_completed`, and `onboarding_abandoned`.

### `custom_restaurant_sourcing` appears orphaned or experimental

Confidence: Medium.

Evidence: table exists with `ratings` and `prefs_snapshot` JSONB, but no direct app references were found.

Risk: duplicated restaurant-intake pathway next to `destination_suggestions`, `wingman_intake_logs`, and `destinations.created_by`.

Recommendation: mark ownership. If it is an old experiment, archive it from app-facing docs and exclude from agent access.

### `00_Open_Work` looks like a manual ops table, not app data

Confidence: Medium.

Evidence: nonstandard name and only `source`, `status`, `item_count`; no app code references.

Risk: confusing for agents and future developers; the table name may sort first and look important despite not being product data.

Recommendation: keep it out of app/agent schemas. Consider moving operational checklists out of Postgres unless it drives a real workflow.

### Leaderboard functions/views have unclear boundaries

Confidence: Medium.

Evidence: schema lists `lb_total_destinations`, `lb_total_routes`, `lb_user_destinations_rated`, `lb_user_routes_completed`, and related aggregates, while app code sometimes calls RPCs of the same names and sometimes reads raw facts directly.

Risk: inconsistent leaderboard numbers and duplicated client-side aggregation.

Recommendation: standardize on read-only views/RPCs for leaderboard surfaces, then make screens consume the same source.

### `user_contactus` and `user_feedback` may be redundant

Confidence: Medium.

Evidence: both have `id`, `user_id`, `note`, `created_at`, `status`; `app/user/index.jsx` dynamically inserts based on a `table` variable.

Risk: support/feedback analytics split across nearly identical tables.

Recommendation: keep both only if they drive different workflows. Otherwise consider a future `user_messages` table with `type`.

### `destination_ratings` is doing multiple jobs

Confidence: Medium.

Evidence: it stores score dimensions, crawl progress, tag/flavor metadata, wings eaten, whether it came from Buffacoin, and rating creation time.

Risk: rating analytics, taste profile, progress tracking, and economy attribution are coupled. This is fine early, but funnel analysis cannot distinguish "started rating" from "completed rating."

Recommendation: keep the table as the final rating fact. Add events for rating started/abandoned/completed and optionally a future `rating_sessions` table.

## Low-Confidence Findings

### Foreign keys may be missing or incomplete

Confidence: Low from CSV alone, but important.

Evidence: `columns.csv` does not include constraints. Many columns are clearly relational: `user_id`, `state_id`, `destination_id`, `crawl_id`, `route_id`, `badge_id`, `battle_id`.

Risk: orphaned rows, inaccurate analytics, and joins that silently drop data.

Recommendation: export constraints or inspect Supabase. Verify FKs at least for `destination_ratings`, `crawls`, `routes`, `route_ordered_destinations`, `user_badges`, `user_preferences`, `buffacoin_ledger`, `user_wing_battle_votes`.

### Index coverage is unknown

Confidence: Low from CSV alone, but important.

Evidence: only the `api_rate_limits` migration shows indexes. Schema exports do not include index metadata.

Likely missing/important indexes:

- `destination_ratings(user_id, created_at desc)`
- `destination_ratings(destination_id, created_at desc)`
- `destination_ratings(crawl_id, user_id)`
- `crawls(user_id, status, start_time desc)`
- `crawls(route_id, status)`
- `route_ordered_destinations(route_id, stop_order)`
- `destinations(state_id, city)`
- `routes(is_public, city)`
- `buffacoin_ledger(user_id, created_at desc)`
- `user_events(user_id, occurred_at desc)` when added

Risk: slow screens and expensive leaderboard/history queries as usage grows.

Recommendation: inspect actual indexes before adding any. Add only indexes that match observed hot queries.

### RLS posture is unknown for most tables

Confidence: Low from CSV alone, high importance.

Evidence: only `api_rate_limits` migration explicitly shows RLS enabled with no public policies. The app uses client-side Supabase anon access for many tables, so RLS must be correct.

Risk: public reads/writes could expose user data or allow tampering with XP, ratings, wallets, badges, votes, logs, and suggestions.

Recommendation: export and review RLS policies before adding agent workflows. Agents should use sanitized read-only views, not raw tables.

## Tables That Should Not Be Exposed Raw To Agents

- `users`: contains user identifiers, usernames, avatars, XP, taste persona.
- `user_preferences`: taste profile data tied to user IDs.
- `destination_ratings`: user-level behavioral history.
- `crawls`: user-level activity history and progress.
- `buffacoin_ledger` and `buffacoin_wallets`: economy balances/transactions.
- `user_badges`: user achievement history.
- `user_contactus` and `user_feedback`: free-text support/feedback.
- `debug_logs`: device/user diagnostic payloads.
- `wingman_intake_logs`: raw input, AI output, Places data, decision traces.
- `api_rate_limits`: security/abuse-control data.

Preferred agent surface: read-only, privacy-reviewed views that aggregate by day, state, route, destination, anonymous cohort, or event type.

