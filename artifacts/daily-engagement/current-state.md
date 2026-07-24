# Current State

Audit date: 2026-07-23. Repository: `crawl/` React Native 0.81 / Expo 54 / Expo Router / Supabase.

## Original behavior

No legacy “daily login reward” was found. App startup in `crawl/app/_layout.tsx` restored auth, emitted `app_opened`, and tracked foreground transitions, but did not grant daily XP or coins. Weekly crawl streak presentation existed in `crawl/app/leaderboards/index.jsx` and `crawl_weekly_streak`; it was not a daily-login system.

An uncommitted engagement foundation already existed in:

- `crawl/supabase/migrations/20260723143000_engagement_retention.sql`
- `crawl/lib/engagement/retentionService.js`
- `crawl/lib/engagement/retentionDomain.js`
- `crawl/lib/home/retentionDashboard.js`
- `crawl/components/engagement/RetentionJourneyCard.jsx`
- `crawl/app/(tabs)/home/index.jsx`
- `crawl/app/user/index.jsx`

It assigned one deterministic daily mission plus one weekly mission, advanced a meaningful-action streak for `rating_created`, `battle_vote`, `crawl_stop_completed`, or `mission_completed`, and required a visible claim for XP. `claim_engagement_reward` called the existing server-side `award_xp` RPC with idempotency key `engagement:<assignment-id>`. `xp_ledger.idempotency_key` is unique in `20260622220000_add_xp_ledger.sql`.

## Invocation and lifecycle

- `AppShell` in `crawl/app/_layout.tsx` handles session hydration, cold-start analytics, screen tracking, linking, and AppState.
- Home loads `get_engagement_dashboard` through `loadRetentionDashboard`.
- Rating/battle/crawl flows call `recordQualifyingAction` after canonical writes.
- Settings calls `update_engagement_preferences`.
- Before this work, foreground/session restoration did not run a dedicated daily status check or retry.

## Day, timezone, and trust boundary

The existing SQL calculated `v_today := (now() at time zone v_tz)::date`, so time came from PostgreSQL. However, `v_tz` came directly from the device and `record_engagement_action` accepted `p_occurred_at`, capped only against a future timestamp. That allowed timezone flipping and historical backdating. Unknown/invalid zones fell back to UTC via `engagement_safe_timezone`. DST was naturally handled by PostgreSQL IANA time zones, but travel/abuse policy was absent.

## Idempotency and ledgers

- Mission assignment: unique `(user_id, mission_key, period_start)`.
- Action receipt: unique `(user_id, action_type, action_ref)`.
- Mission reward receipt: unique `(mission_assignment_id)`.
- XP: unique ledger idempotency key.
- Canonical action ownership was checked server-side against ratings, battle votes, or mission rows.
- No coin reward was part of daily engagement.
- Concurrent reward calls lock the mission assignment and converge on `award_xp`.

The main remaining pre-change risk was that one real source action could potentially map into different local dates after timezone manipulation; no notification-event uniqueness existed.

## Offline and multiple devices

The UI could show last loaded state. Failed RPCs surfaced a sanitized retention error. There was no durable optimistic grant, which was good, but no centralized foreground retry. Multi-device reward writes were protected by database uniqueness, while timezone choice was not pinned.

## Notifications and location

`expo-location` existed for nearby restaurants and crawl check-in. There was no `expo-notifications`, push token table, provider dispatcher, delivery attempt log, notification deep-link listener, or background geofence task. `in_app_notification_readiness` was explicitly in-app only. Settings described push as unavailable and reminder defaults were true.

The app requested foreground location through existing product flows. `app.config.js` had only when-in-use copy and Android fine location. No continuous background tracking existed.

## Navigation and analytics

Expo Router and scheme `buffago` existed. Root linking handled OAuth and password recovery. Notification routes were absent. `crawl/lib/analytics.js` handled lifecycle events and `crawl/lib/analyticsSchema.js` sanitized properties, but the requested daily/push/proximity event catalog was absent.

## Social and privacy

Accepted friendships and blocks are implemented by `20260623190000_add_friends_system.sql`. Social visibility is centralized in `can_user_appear_socially`; `social_opt_out`, sharing preferences, and `20260723144000_engagement_privacy.sql` exist. Ratings in `social_feed_v2` were restricted by social visibility, although no social push existed.

## Infrastructure

Supabase migrations, RLS, RPCs, and Edge Functions are established patterns. No notification cron/worker was present. Feature flags were Expo-public build-time flags in `crawl/config/engagementFlags.js`; no remote engagement flag table existed.

## Conflicts and duplicates

- Legacy weekly crawl streak and the new meaningful daily streak are separate concepts but UI terminology can confuse users.
- Old `user_engagement_preferences` reminder toggles default true and describe in-app readiness; new push categories must not inherit those opt-ins.
- Both `crawl/app/home/index.jsx` and `crawl/app/(tabs)/home/index.jsx` contain substantial home implementations.
- The worktree contained extensive pre-existing uncommitted engagement/social/mascot changes. They were preserved.
