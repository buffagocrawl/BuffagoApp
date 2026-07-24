# Executive Summary

Buffago originally did not award daily login XP. A work-in-progress system already rewarded meaningful daily missions and advanced an activity streak, but caller timezone/time context and the absence of a push pipeline created material gaps.

The implemented design keeps opens reward-free. Ratings, verified battle votes, crawl-stop completion, and completed server missions are the qualifying actions. Server time, a 24-hour pinned timezone transition, action/assignment/ledger uniqueness, row locking, and outbox dedupe prevent duplicate streak/reward/notification credit across retries and devices. Offline state is never shown as confirmed.

The new foundation supports multi-installation Expo tokens, default-off granular preferences, quiet hours, auditable outbox/attempts, bounded retries, invalid-token handling, at-risk notifications, friend-rating events, conservative crawl proximity, notification deep links, analytics, structured operational state, and server/client kill switches. Comeback remains off and unqueued pending evidence.

The 0.1-mile feature uses a 161 m foreground target, 200 m OS region, ≤75 m accuracy, 250 m hysteresis, one next stop, 24-hour stop and four-hour global cooldowns, state rechecks, and no coordinate trail. Unknown background accuracy is suppressed.

Evidence: 131/131 JavaScript tests pass and lint has zero errors. Release is **not approved** because repository typecheck fails, migrations/RLS were not exercised on a deployed test database, and no real provider/device push or background geofence delivery was exercised. Final review average is 89.9, below the required gate.
# Release validation update — 2026-07-24

The server-authoritative daily engagement and notification foundation now passes local schema, RLS, RPC permission, idempotency, concurrent reward, and native Android/iOS bundle checks. A fresh empty reset still fails before the engagement migrations because the repository contains delta migrations without the required Buffago baseline schema; this is recorded as a packaging blocker. Web export also fails on the pre-existing native-only `react-native-maps` import. TypeScript and all 148 JavaScript tests pass. Production deployment is not approved until the baseline strategy and web target decision are resolved and real iOS/Android push, deep-link, permission, privacy-race, and geofence tests are completed.
## Closure status

Web support is retained and the native-only map import is behind a platform boundary. Database deployment now has an explicit Strategy B prerequisite and fail-before-apply preflight. Production remains blocked because physical iOS/Android push, deep-link, provider, and real-world proximity evidence could not be collected in this Windows workspace.
## Final hardening hold

An immutable closure code candidate exists at 7937e76c6e9bab3f28c9e3d2479e029c458ee7fa, but exact-candidate TypeScript fails because broader pre-existing source changes remain outside that commit. The current worktree passes 160/160 JavaScript tests, TypeScript, lint, and web export. Physical iOS/Android validation is blocked by missing devices/tooling, so final approval and panel advancement remain withheld.
