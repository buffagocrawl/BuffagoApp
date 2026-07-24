# Iteration History

## Baseline

Score 49.9. Missing push pipeline, exploitable timezone context, no delivery-time authorization, no deep links, no proximity controls.

## Loop 1

Implemented server-time checks, timezone pinning, unique daily/outbox/installation/proximity records, push registrations, granular default-off preferences, outbox/attempts, Expo dispatcher, social trigger/rechecks, one-stop geofencing, proximity accuracy/hysteresis/cooldowns, deep-link fallback, analytics events, flags, UI, tests, and operational artifacts.

Focused review found one missing delivery eligibility RPC; it was added. It also found feature flags missing from social/proximity enqueue paths; those gates were added. Dynamic Expo Router typing was corrected.

Loop 1 does not pass because full typecheck, deployed migration/RLS validation, production-capable push delivery, and physical-device geofence tests remain incomplete. Additional scoring loops would not legitimately clear external/deployment blockers, so no scores were inflated and no fake loops were performed.
# Loop 2 — 2026-07-24 release validation

- Re-ran the local chain and captured exact logs under this artifact directory.
- Empty reset exposed a real packaging issue: the migration directory is delta-only and requires the existing Buffago baseline (`public.users`).
- Restored the captured schema baseline in a disposable local database; all 14 migrations then applied successfully.
- Re-executed both engagement migrations against existing objects. Guarded policy/trigger creation, `IF NOT EXISTS`, `CREATE OR REPLACE`, and idempotent seeds completed with exit 0 and no duplicate flags/seeds/events.
- Added SQL validation for schema, RLS, RPC permissions, outbox dedupe, and captured a concurrent XP ledger grant (one ledger row, one award).
- TypeScript passed; JavaScript suite increased to 148/148; lint 0 errors/95 warnings; Android/iOS JS exports passed. Web export remains blocked by the existing native-only maps import.
- Revised independent score average: 92.0. Production approval remains withheld pending baseline packaging, web decision, and physical/provider tests.
## Closure run - 2026-07-23

- Chose Strategy B after inspecting the deployed delta pack, schema map, and profile usage. public.users remains the BuffaGo profile table; auth.users remains authoritative identity.
- Added read-only baseline preflight and an ordered migration runner that stops before deltas when prerequisites are missing.
- Resolved the supported web export blocker with native/web platform map files and regression tests. Web, Android, and iOS exports pass.
- Physical validation was attempted at the environment boundary: no Android device is attached and macOS/Xcode is unavailable. No device/provider result was fabricated.
- Independent closure panel rerun remains below the 95 average gate; production approval stays withheld.
