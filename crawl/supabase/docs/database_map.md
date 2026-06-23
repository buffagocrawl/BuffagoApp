# Buffago Database Map

Generated from `crawl/supabase/schema/tables.csv`, `crawl/supabase/schema/columns.csv`, the Supabase migration in `crawl/supabase/migrations`, the edge functions in `crawl/supabase/functions`, and app/client usage found under `app`, `components`, `hooks`, `lib`, `utils`, and `src`.

Important caveat: the schema exports appear incomplete. `api_rate_limits` exists in `supabase/migrations/20260511173000_create_api_rate_limits.sql` and is used by `supabase/functions/wingman-intake/index.ts`, but is not listed in `tables.csv`. The app also references `crawl_members` and `destination_tag_map`, but neither appears in the exported schema.

## Central Product Tables

### `destinations`

Purpose: master restaurant/wing destination catalog.

Important columns: `id`, `name`, `address`, `lat`, `lng`, `city`, `state_id`, `created_by`, `created_at`.

Likely relationships: `state_id -> states.state_id`; `created_by -> users.user_id` or `auth.users.id`; referenced by `routes.stop1_id` through `stop5_id`, `route_ordered_destinations.destination_id`, `destination_ratings.destination_id`, `destination_suggestions`/Wingman flows, and `buffacoin_ledger.destination_id`.

Likely readers/writers: home nearby route discovery (`app/(tabs)/home/index.jsx`, `app/home/index.jsx`), route browsing (`app/(tabs)/routes/index.jsx`, `hooks/useRoutes.js`), ratings screens (`app/(tabs)/ratings/index.jsx`, `app/ratings/index.jsx`), onboarding (`components/OnboardingFlow.tsx`, `components/DestinationPickerWizard.tsx`), Wingman (`components/WingmanAddDialog.jsx`, `lib/Wingman/WingmanService.ts`, `supabase/functions/wingman-intake/index.ts`), auth migration of guest ratings (`app/auth/login.jsx`, `app/auth/callback.jsx`).

Classification: Central.

### `routes`

Purpose: curated crawl routes, usually 1-5 stops.

Important columns: `id`, `title`, `city`, `created_by`, `is_public`, `stop1_id` through `stop5_id`, `travel_tag_id`, `is_token_route`, `created_at`.

Likely relationships: `created_by -> users.user_id`; stop columns -> `destinations.id`; `travel_tag_id -> route_travel_tag.id`; referenced by `crawls.route_id`, `route_ordered_destinations.route_id`, route leaderboard functions/views, and token crawl RPCs.

Likely readers/writers: home start crawl, route browser, crawl detail screen, ratings route filter, onboarding preview, token route creation through RPCs. Code references include `app/(tabs)/home/index.jsx`, `app/(tabs)/routes/index.jsx`, `app/crawl/[id].jsx`, `hooks/useRoutes.js`, `app/onboarding/crawl-preview.jsx`.

Classification: Central.

### `route_ordered_destinations`

Purpose: normalized route stop list with order. This appears to be the better long-term route model compared with `routes.stop1_id` through `stop5_id`.

Important columns: `route_id`, `destination_id`, `stop_order`.

Likely relationships: `route_id -> routes.id`; `destination_id -> destinations.id`.

Likely readers/writers: route browsing and ratings screens prefer this when available (`app/(tabs)/routes/index.jsx`, `hooks/useRoutes.js`, `app/(tabs)/ratings/index.jsx`).

Classification: Central, but coexists with legacy route stop columns.

### `crawls`

Purpose: a user's active or completed crawl session.

Important columns: `crawl_id`, `route_id`, `user_id`, `status`, `start_time`, `end_time`, `crawl_type`, `is_solo`.

Likely relationships: `route_id -> routes.id`; `user_id -> users.user_id` or `auth.users.id`; referenced by `destination_ratings.crawl_id`, `buffacoin_ledger.crawl_id`, crawl views, profile history, and route progress.

Likely readers/writers: home starts/resumes crawls, crawl screen updates status/completion/deletion, route tabs detect active/completed crawls, profile history reads and can detach crawls, `utils/crawls.ts`, `hooks/useCrawls.js`.

Classification: Central.

### `destination_ratings`

Purpose: core rating facts for a user, destination, and optionally crawl.

Important columns: `id`, `destination_id`, `crawl_id`, `user_id`, `crispiness`, `sauce`, `meat`, `overall`, `weight_score`, `created_at`, `tag_id`, `wings_eaten`, `sauce_style`, `flavor_vibe`, `spice_level`, `would_order_again`, `is_buffacoin`.

Likely relationships: `destination_id -> destinations.id`; `crawl_id -> crawls.crawl_id`; `user_id -> users.user_id` or `auth.users.id`; `tag_id -> destination_tags.id`.

Likely readers/writers: crawl screen rating submit/progress, ratings tab, leaderboards, home stats, profile history/yearly summary, guest-to-account migration in auth, destination picker recommendations.

Classification: Central.

### `users`

Purpose: app-level user profile and XP record parallel to Supabase Auth.

Important columns: `user_id`, `avatar_url`, `created_at`, `username`, `xp`, `taste_persona`.

Likely relationships: `user_id -> auth.users.id`; referenced by ratings, crawls, badges, preferences, leaderboards, profile, social feed.

Likely readers/writers: auth callback/login upsert profile, XP utility, profile screen, crawl presence display, leaderboards, user settings.

Classification: Central.

## Discovery, Ratings, and Route Support

### `states`

Purpose: US state lookup and geographic grouping.

Important columns: `state_id`, `state_code`, `state_name`.

Likely relationships: referenced by `destinations.state_id`, suggestions, Wingman logs, custom sourcing, event/state selection needs.

Likely readers/writers: onboarding state selection, location-to-state lookup, leaderboards state scope, route/home browsing.

Classification: Supporting.

### `destination_tags`

Purpose: tag catalog for destination or rating flavor/style metadata.

Important columns: `id`, `tag`, `created_at`.

Likely relationships: `destination_ratings.tag_id -> destination_tags.id`. Code also references `destination_tag_map`, but that table is missing from schema export.

Likely readers/writers: crawl rating screen, ratings tab, onboarding, destination picker.

Classification: Supporting, with unclear/partial model.

### `route_travel_tag`

Purpose: route travel mode or distance/type label.

Important columns: `id`, `travel`.

Likely relationships: `routes.travel_tag_id -> route_travel_tag.id`.

Likely readers/writers: route browser filters/labels.

Classification: Supporting.

### `route_submissions`

Purpose: user-submitted route ideas for manual review.

Important columns: `id`, `user_id`, `stop1` through `stop5`, `created_at`, `status`.

Likely relationships: `user_id -> users.user_id` or `auth.users.id`.

Likely readers/writers: route submission dialogs in `components/SubmitRouteSimpleDialog.jsx`, `app/(tabs)/routes/index.jsx`, and `app/routes/index.jsx`.

Classification: Supporting/manual ops.

### `destination_suggestions`

Purpose: user-submitted restaurant suggestions for manual review, especially when Wingman cannot fully validate.

Important columns: `id`, `user_id`, `state_id`, `restaurant_name`, `address`, `created_at`.

Likely relationships: `user_id -> users.user_id`; `state_id -> states.state_id`.

Likely readers/writers: Wingman dialog/manual review, auth guest migration.

Classification: Supporting/manual ops.

### `custom_restaurant_sourcing`

Purpose: likely stores user-sourced custom restaurant recommendation/rating snapshots.

Important columns: `id`, `state_id`, `restaurant_name`, `ratings`, `prefs_snapshot`, `created_at`, `user_id`.

Likely relationships: `state_id -> states.state_id`; `user_id -> users.user_id`.

Likely readers/writers: no direct code references found in the scanned app source.

Classification: Legacy or experimental.

## Gamification and Economy

### `buffacoin_wallets`

Purpose: current Buffacoin balance per user.

Important columns: `user_id`, `balance`, `created_at`, `updated_at`.

Likely relationships: `user_id -> users.user_id` or `auth.users.id`.

Likely readers/writers: ratings tab reads wallet balance; probably maintained by DB triggers/functions from `buffacoin_ledger`.

Classification: Central gamification support.

### `buffacoin_ledger`

Purpose: append-style currency transactions.

Important columns: `id`, `user_id`, `delta`, `reason`, `crawl_id`, `state_id`, `destination_id`, `created_at`.

Likely relationships: `user_id -> users.user_id`; `crawl_id -> crawls.crawl_id`; `state_id -> states.state_id`; `destination_id -> destinations.id`.

Likely readers/writers: crawl completion rewards, auth guest migration, daily/home reward flows, Buffacoin RPC spending.

Classification: Central gamification support.

### `badge_catalog`

Purpose: badge definitions.

Important columns: `id`, `code`, `name`, `description`, `icon`, `xp_reward`, `category`, `tier`, `is_active`.

Likely relationships: referenced by `user_badges.badge_id` and `v_badges_for_user`.

Likely readers/writers: Badges screen reads catalog; badge earning RPC probably writes `user_badges`.

Classification: Supporting.

### `user_badges`

Purpose: badges earned by users.

Important columns: `user_id`, `badge_id`, `earned_at`.

Likely relationships: `user_id -> users.user_id`; `badge_id -> badge_catalog.id`.

Likely readers/writers: Badges screen inserts/reads; `earn_badge` RPC.

Classification: Supporting.

### `daily_xp_claims`

Purpose: daily XP reward claim log.

Important columns: `id`, `user_id`, `claimed_at`, `claim_date`.

Likely relationships: `user_id -> users.user_id`.

Likely readers/writers: daily XP RPCs used by home screens: `daily_xp_status`, `daily_xp_last_claimed`, `claim_daily_xp`.

Classification: Supporting.

### `user_meta`

Purpose: per-user auxiliary progression metadata.

Important columns: `user_id`, `daily_claim_streak`, `last_daily_claim_at`, `created_at`, `updated_at`.

Likely relationships: `user_id -> users.user_id`.

Likely readers/writers: likely daily XP RPCs; no direct client table use found.

Classification: Supporting.

### `level_thresholds`

Purpose: XP-to-level lookup.

Important columns: `level`, `xp_required`, `level_title`.

Likely relationships: used with `users.xp` and `user_with_level`.

Likely readers/writers: home/profile HUDs.

Classification: Supporting.

### `user_with_level`

Purpose: view exposing user XP and computed level.

Important columns: `user_id`, `xp`, `level`.

Likely relationships: derived from `users` and `level_thresholds`.

Likely readers/writers: home and leaderboards.

Classification: Supporting read model/view.

### `crawl_weekly_streak`

Purpose: view or aggregate table for weekly crawl streaks.

Important columns: `user_id`, `current_streak_weeks`.

Likely relationships: probably derived from completed `crawls`.

Likely readers/writers: leaderboards.

Classification: Supporting read model/view.

### `user_wing_battle_votes`

Purpose: stores user votes in Wing Battle matchups.

Important columns: `user_id`, `battle_id`, `choice`, `created_at`, `updated_at`.

Likely relationships: `battle_id -> wing_battle_options.id`; `user_id -> users.user_id`.

Likely readers/writers: home Wing Battle module.

Classification: Supporting/social gamification.

### `wing_battle_options`

Purpose: catalog of Wing Battle prompts/options.

Important columns: `id`, `label`, `left_option`, `right_option`, `is_active`, `sort_order`, `created_at`.

Likely relationships: referenced by `user_wing_battle_votes.battle_id`.

Likely readers/writers: home Wing Battle module.

Classification: Supporting/social gamification.

### `wing_battle_options_active`

Purpose: active Wing Battle options view.

Important columns: `id`, `label`, `left_option`, `right_option`.

Likely relationships: derived from `wing_battle_options`.

Likely readers/writers: home Wing Battle module reads this view.

Classification: Supporting read model/view.

## User Preferences, Profile, Contact, and Onboarding

### `user_preferences`

Purpose: taste preference profile.

Important columns: `user_id`, `wing_piece`, `sauce_pref`, `spicy_pref`, `prep_pref`, `created_at`, `updated_at`.

Likely relationships: `user_id -> users.user_id`.

Likely readers/writers: user profile/settings screen.

Classification: Supporting, important for personalization.

### `users_check_profile`

Purpose: tracks whether profile/history welcome UI has been seen.

Important columns: `user_id`, `seen_at`.

Likely relationships: `user_id -> users.user_id`.

Likely readers/writers: profile history screen.

Classification: Supporting UX state.

### `users_check_route`

Purpose: tracks whether routes welcome UI has been seen.

Important columns: `user_id`, `seen_at`.

Likely relationships: `user_id -> users.user_id`.

Likely readers/writers: route tab/screens.

Classification: Supporting UX state.

### `onboarding_analytics`

Purpose: current onboarding-specific analytics table.

Important columns: `id`, `session_id`, `user_id`, `step`, `started_at`, `finished_at`, `duration_ms`, `state_id`, `picked_destination_id`, `created_custom`, `created_account`, `skipped`.

Likely relationships: `user_id -> users.user_id`; `state_id -> states.state_id`; `picked_destination_id -> destinations.id`.

Likely readers/writers: no direct code references found in scanned app source. It may be unused or planned.

Classification: Supporting analytics, but currently underused.

### `user_contactus`

Purpose: contact/support messages.

Important columns: `id`, `user_id`, `note`, `created_at`, `status`.

Likely relationships: `user_id -> users.user_id`.

Likely readers/writers: profile/user screen dynamically inserts into `user_contactus` or `user_feedback`.

Classification: Supporting/manual ops.

### `user_feedback`

Purpose: user feedback messages.

Important columns: `id`, `user_id`, `note`, `created_at`, `status`.

Likely relationships: `user_id -> users.user_id`.

Likely readers/writers: profile/user screen dynamically inserts into `user_contactus` or `user_feedback`.

Classification: Supporting/manual ops.

## Views and Leaderboard Read Models

### `crawl_public`

Purpose: limited public crawl fields.

Important columns: `crawl_id`, `user_id`, `route_id`, `status`, `start_time`, `end_time`.

Likely relationships: derived from `crawls`.

Likely readers/writers: no direct app usage found.

Classification: Supporting/agent-safe candidate view.

### `crawl_coverage_public`

Purpose: public crawl progress/coverage view.

Important columns: `crawl_id`, `user_id`, `route_id`, `status`, `start_time`, `end_time`, `stop_count`, `rated_count`, `pct_rated`.

Likely relationships: derived from `crawls`, route stop counts, and ratings.

Likely readers/writers: no direct app usage found.

Classification: Supporting/agent-safe candidate view.

### `ratings_per_crawl_user`

Purpose: aggregate count of ratings per crawl/user.

Important columns: `crawl_id`, `user_id`, `rated_count`.

Likely relationships: derived from `destination_ratings`.

Likely readers/writers: no direct app usage found.

Classification: Supporting read model/view.

### `route_stop_counts`

Purpose: route stop count aggregate.

Important columns: `route_id`, `stop_count`.

Likely relationships: derived from `route_ordered_destinations` or route stop columns.

Likely readers/writers: no direct app usage found.

Classification: Supporting read model/view.

### `lb_total_destinations`

Purpose: total destination count for leaderboard/global stats.

Important columns: `total_destinations`.

Likely readers/writers: code mostly calls `supabase.rpc('lb_total_destinations')` or direct destination counts, not necessarily this relation.

Classification: Supporting read model/view or function-like export.

### `lb_total_routes`

Purpose: total route count for leaderboard/global stats.

Important columns: `total_routes`.

Likely readers/writers: code mostly calls `supabase.rpc('lb_total_routes')`.

Classification: Supporting read model/view or function-like export.

### `lb_user_badges_counts`

Purpose: leaderboard count of badges by user.

Important columns: `user_id`, `badges_count`.

Likely readers/writers: leaderboards screens.

Classification: Supporting read model/view.

### `lb_user_destinations_rated`

Purpose: leaderboard count of distinct destinations rated by user.

Important columns: `user_id`, `distinct_destinations`.

Likely readers/writers: code calls RPC of same name and sometimes reads rating facts directly.

Classification: Supporting read model/view or function-like export.

### `lb_user_routes_completed`

Purpose: leaderboard count of completed routes by user.

Important columns: `user_id`, `completed_routes`.

Likely readers/writers: code calls RPC of same name and sometimes queries `crawls` directly.

Classification: Supporting read model/view or function-like export.

### `v_badges_for_user`

Purpose: view joining all badge catalog entries with whether a user has earned each badge.

Important columns: `user_id`, `badge_id`, `code`, `name`, `description`, `icon`, `xp_reward`, `earned_at`, `earned`.

Likely relationships: derived from `badge_catalog` and `user_badges`.

Likely readers/writers: Badges screen.

Classification: Supporting read model/view.

### `v_social_feed`

Purpose: public/social feed of ratings.

Important columns: `user_id`, `weight_score`, `created_at`, `destination_id`, `destination_name`, `destination_city`, `destination_state_id`, `username`.

Likely relationships: derived from `destination_ratings`, `destinations`, and `users`.

Likely readers/writers: leaderboards/social feed tab.

Classification: Supporting public read model/view; high-value agent-safe candidate if privacy-reviewed.

## Content and Operational Tables

### `fun_facts`

Purpose: rotating wing facts.

Important columns: `id`, `text`, `source`, `is_active`, `created_at`.

Likely readers/writers: home/profile history utility and random fact RPC.

Classification: Supporting content.

### `debug_logs`

Purpose: client-side debug/diagnostic event sink.

Important columns: `id`, `created_at`, `device_id`, `user_id`, `scope`, `event`, `detail`.

Likely readers/writers: `lib/debugLog.js`; no broad event analytics semantics.

Classification: Supporting diagnostics; risky if used as analytics without retention/privacy rules.

### `wingman_intake_logs`

Purpose: logs AI/Google Places validation inputs/outputs for restaurant intake.

Important columns: `id`, `user_id`, `raw_input`, `state_id`, `ai_name`, `ai_city`, `ai_state`, `ai_confidence`, `place_found`, `place_name`, `place_address`, `place_lat`, `place_lng`, `wings_probability`, `wings_confidence`, `decision`, `decision_reason`, `destination_id`, `suggestion_id`, `ai_raw_response`, `place_raw_response`, `restaurant_name`, `city_input`, `extra_info`, `created_at`.

Likely relationships: `user_id -> users.user_id`; `state_id -> states.state_id`; `destination_id -> destinations.id`; `suggestion_id -> destination_suggestions.id`.

Likely readers/writers: `lib/Wingman/WingmanService.ts` client fallback logs and `supabase/functions/wingman-intake/index.ts` operational flow.

Classification: Supporting ops/AI audit; not safe for unrestricted agents because raw input and raw API responses may contain sensitive or licensed data.

### `00_Open_Work`

Purpose: operational checklist/status table.

Important columns: `source`, `status`, `item_count`.

Likely readers/writers: no direct app usage found.

Classification: Legacy/manual ops.

## Migration-Only / Missing From Export

### `api_rate_limits`

Purpose: server-side edge function rate-limit ledger.

Important columns from migration: `id`, `user_id`, `ip_address`, `feature`, `created_at`.

Likely relationships: optional `user_id -> auth.users.id`.

Likely readers/writers: `supabase/functions/wingman-intake/index.ts`. RLS is enabled with no public policies; edge functions use service role.

Classification: Supporting security/ops. Missing from schema export.

### Referenced But Missing: `crawl_members`

Purpose inferred from code: multi-user crawl membership/presence.

Code references: `src/lib/crawl.ts`, `hooks/useCrawls.js`.

Classification: Missing, deleted, or not exported. This is risky because source code may be stale or the schema export is incomplete.

### Referenced But Missing: `destination_tag_map`

Purpose inferred from code: many-to-many map from destinations to tags.

Code references: `app/crawl/[id].jsx`.

Classification: Missing, deleted, or not exported. The current schema only shows `destination_ratings.tag_id`, which is not the same as a destination-level tag map.

