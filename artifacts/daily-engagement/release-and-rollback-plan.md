# Release and Rollback Plan

Do not release yet.

Before rollout:

1. Fix repository TypeScript configuration/errors and produce a clean Expo export/build.
2. Apply migrations to a disposable Supabase project; run RLS identity, concurrency, DST/travel, retry, deletion, and stale-content tests.
3. Deploy `notification-dispatch`; set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `NOTIFICATION_DISPATCH_SECRET`; invoke it from an authenticated scheduler every 15 minutes.
4. Exercise Expo delivery and receipt handling on physical iOS/Android development builds.
5. Validate killed/restarted app, OS permission revocation, approximate location, region limits, and cold/background/foreground deep links.
6. Keep all eight flags off. Enable internal `notification_settings`, then `new_daily_engagement`/`daily_reward_ui`; progress 5% → 25% → 50% → 100% with at least 24 hours per stage. Push types follow separately. Background geofencing is last.

Rollback:

- Immediately disable relevant rows in `engagement_feature_flags` and Expo-public client flags.
- Stop the dispatcher schedule.
- Existing queued rows can be marked `cancelled`; do not delete audit history.
- Stop registered geofences on next client sync.
- Revoke/drop new triggers and RPCs if needed. Drop new tables in reverse dependency order only after export/retention review.
- Do not remove old streak, mission, XP, friendship, rating, crawl, preference, or timezone rows. The migration contains detailed rollback comments.
# Validation hold — 2026-07-24

Production remains blocked. Before approval, run on at least one physical iOS and one physical Android device with a development-capable Expo/EAS build:

1. Register real Expo push tokens; verify token rows, permission status, app version, timezone, last-seen, and invalidation after provider errors.
2. Deliver each enabled category on both platforms; test denied permission and later OS revocation.
3. Open every notification from cold, background, and foreground states; verify stale/deleted/private destinations fall back safely.
4. Queue a friend-rating notification, remove friendship or change visibility before dispatch, and verify server-side suppression.
5. Queue a streak-at-risk notification, complete the qualifying action before dispatch, and verify suppression.
6. Exercise foreground proximity at approximately 161 m with precise/approximate permission, low accuracy, boundary bouncing, four-hour cooldown, and quiet hours.
7. Exercise background geofence entry, app termination, device restart, completed/abandoned crawl, and geofence cleanup.

Capture device model, OS, app version, token/install IDs (redacted), timestamps, provider response, outbox ID/correlation ID, deep-link result, and analytics event sequence. Roll back by disabling the relevant feature flags (`streak_at_risk_push`, `comeback_push`, `friend_rating_push`, `crawl_proximity_push`, `background_geofencing`, `new_daily_engagement`, `daily_reward_ui`, `notification_settings`) without dropping tables or reverting data migrations.
## Closure decisions

- Database uses Strategy B. Run crawl/scripts/apply-engagement-migrations.ps1 -DatabaseUrl <url>; the read-only baseline preflight must pass before any delta migration.
- Web is supported. Native maps remain native-only; web uses the explicit fallback and does not claim background proximity support.
- Physical iOS/Android and provider validation is still a human approval prerequisite and is not claimed by this artifact.
