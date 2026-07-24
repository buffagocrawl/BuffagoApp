# Staging dispatcher package

Dispatcher: `crawl/supabase/functions/notification-dispatch/index.ts`

## Deploy

```powershell
supabase functions deploy notification-dispatch --project-ref <staging-project-ref>
supabase secrets set --project-ref <staging-project-ref> `
  SUPABASE_SERVICE_ROLE_KEY=<staging-service-role-key> `
  NOTIFICATION_DISPATCH_SECRET=<random-staging-secret> `
  EXPO_ACCESS_TOKEN=<optional-expo-access-token>
```

Invoke every 15 minutes from a staging scheduler with `x-dispatch-secret`. Capture the function response, provider response status, outbox ID/correlation ID, and delivery-attempt rows. Never print push tokens; inspect only `token_fingerprint` and masked token suffixes in an operator query.

## Fixtures and trigger commands

Create two staging users, an accepted mutual friendship, one visible rating, and one active crawl with an incomplete next stop. Enable only the relevant staging flag and preference through reviewed SQL/RPC calls. Trigger:

```sql
select public.queue_streak_at_risk_notifications();
select public.record_crawl_proximity('<crawl-id>', '<destination-id>', '<installation-id>', 'precise');
-- friend-rating is triggered by the canonical destination_ratings insert.
select * from public.notification_outbox order by created_at desc limit 20;
```

For each event, queue it, change the preference/friendship/privacy/source state, then invoke the dispatcher and confirm suppression. Confirm no client role can insert an outbox row or call the delivery eligibility RPC.

## Provider/device checklist

- APNs: Apple push key/team ID/bundle ID, Expo project ID, development build, permission grant/revoke.
- Android: FCM credentials in Expo/EAS, notification channel, POST_NOTIFICATIONS grant/revoke.
- Expo development build: `npx expo run:android` or EAS development profile; do not use Expo Go for background geofencing validation.
- Deep links: cold, background, foreground for rating, crawl stop, streak today, and fallback.
- Geofence: foreground target 161 m, OS radius 200 m, precise accuracy <=75 m, approximate/unknown suppression, dwell/hysteresis, 4-hour global and 24-hour stop cooldowns.

iOS physical validation is blocked without macOS/Xcode and an iPhone. Android validation should run when hardware is attached. No blocked platform may be reported as passed.
