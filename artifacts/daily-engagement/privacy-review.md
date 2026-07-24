# Privacy Review

New push categories default off. The app does not prompt on first launch; permission is requested only from the notification settings screen after explanatory copy. OS permission, category preference, feature flag, source authorization, and quiet hours all must pass.

Users can read only their own installations, preferences, outbox events, timezone state, daily checks, and proximity receipts. They can mutate those only through narrow authenticated RPCs. Clients cannot insert outbox rows, attempts, XP, or streak state. The dispatcher uses service role only inside an Edge Function protected by `NOTIFICATION_DISPATCH_SECRET`.

Friend rating events are created after commit and require accepted friendship, no block, actor social visibility, recipient opt-in, and delivery-time revalidation. Copy intentionally omits exact presence and currently avoids names/scores until deployed visibility fields are fully validated.

Geofencing registers one 200 m OS region for the next stop. Foreground confirmation targets 161 m, requires reported accuracy ≤75 m, and applies 250 m exit hysteresis. The database stores crawl/destination IDs, accuracy class, timestamps, installation ID, and cooldown key—not latitude, longitude, or a movement trail. Unknown/approximate background entries are suppressed from delivery.

Analytics sanitization rejects tokens, contact fields, raw errors, coordinates, precise location, and rating content. Operational tables retain correlation IDs and bounded error codes.

Outstanding privacy gate: validate RLS/functions against a disposable deployed Supabase project and exercise iOS/Android permission/revocation flows on physical devices.
