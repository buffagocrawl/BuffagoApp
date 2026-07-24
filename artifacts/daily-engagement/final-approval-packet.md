# Final Approval Packet

Status: **Not approved. Human approval required.**

Release candidate source is base commit `0cdfc7fef4e98b04d83b658cc691b7fc2e226b5b` plus the uncommitted, narrowly scoped closure changes in this worktree. There is no standalone release commit because the worktree contains pre-existing user changes; production must use a reviewed commit containing the complete intended diff.

Database: Strategy B, external BuffaGo baseline; `public.users` is the profile table and `auth.users` is authoritative identity. Run `crawl/scripts/apply-engagement-migrations.ps1 -DatabaseUrl <url>`; it runs the preflight first and stops safely on missing prerequisites.

Platform: web supported. Native maps are behind `platformMap.native.js`; web uses the explicit map/geofence limitation fallback. Web export passed.

Evidence: TypeScript passed; lint passed with 0 errors and 95 warnings; Android, iOS, and web exports passed after the platform boundary; prior local baseline, partial-state, RLS/RPC, concurrent XP, and outbox-deduplication evidence remains in `test-results.md` and `release-validation.log`.

Physical iOS/Android push, deep-link, provider, and real-world proximity evidence is absent because no devices/toolchain are available. All risky engagement and background-geofencing flags remain off.

After approval, enable notification settings internally, then daily engagement UI, then 5%/25%/50%/100% stages with at least 24 hours per stage. Push categories and background geofencing follow separately. Rollback disables flags, stops the dispatcher, cancels queued rows without deleting audit history, and stops registered geofences on client sync. Do not drop data migrations during rollback.

User-visible change: eligible meaningful activity can show daily missions, streak reminders, friend-rating and crawl-proximity notifications when enabled; web shows a clear mobile-only limitation for maps/proximity. No daily-open reward is added.
