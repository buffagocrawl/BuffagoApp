# Current-schema candidate validation handoff

Date: 2026-07-24  
Executable candidate: `2d5cfd6c96adb94ed3aa0d0a7989a2422159b29b`  
Executable candidate parent: `6b2399f492f02d51711611aebf753dfd749de611`  
Base: `561caca49474390b69e3734d0bad43b02861a727`  
Contract checksum: `fe2af053e41c78ed27919292d4168a87d990a3f4637ca5dcb30703bac0a1d891`

## Clean-checkout evidence

Validation ran from a fresh detached worktree at the executable candidate SHA. The checkout was clean before dependency installation and exports. The executable candidate is immutable; this file is documentation-only follow-up evidence.

## Commands and results

| Command | Result |
|---|---|
| `npm ci` | passed |
| `npm run typecheck` | passed |
| `node --test --experimental-default-type=module <all tests/*.test.js>` | 72 passed, 0 failed |
| `node --test --experimental-default-type=module ./tests/database/current-schema-contract.test.js` | 4 passed, 0 failed |
| `npm run migration:integrity` | passed; 10 root migrations, 0 legacy archives |
| `npx eslint app components lib hooks providers utils` | 0 errors, 107 warnings |
| `npx expo export --platform android` | passed |
| `npx expo export --platform ios` | passed |
| `npx expo export --platform web` | passed |

The full default `npm run lint` includes Supabase Deno remote-import resolution errors in pre-existing functions; the candidate-scoped application lint above is the reproducible 0-error check. Warnings remain historical/non-blocking and are not silently counted as errors.

## Schema and migration

- Current Supported Schema Contract v1: 29 checks; checksum above.
- Current-schema preflight and reconciliation source tests passed.
- Reconciliation migration is manifest-registered with SHA-256 `c3760e51f19e7156c9d05d636a85137b628ca018023eb3245cbde45c5810dee6`.
- Source tests cover read-only preflight ordering, exact incompatibility reporting, fail-closed `limited_time_events`, replay-safe guards, RLS/grants, uniqueness, deduplication, deep links, privacy, cooldowns, and geofence logic.
- Disposable/staging database runtime was not executed: no explicit staging Supabase target was available and Docker was unavailable. No production database connection or mutation was attempted.
- Actual parallel reward claims, meaningful-action receipts, outbox deduplication, RLS/RPC authorization, and delivery-time suppression remain staging-runtime evidence gaps.

## Dispatcher and provider status

- Dispatcher source is in the candidate at `crawl/supabase/functions/notification-dispatch/index.ts`.
- Staging deployment version: not deployed; intended version is the executable candidate SHA above.
- Scheduler, staging function version, provider response, test-account allowlist, and staging environment-variable configuration: pending an explicitly supplied staging project and credentials.
- No provider credentials, tokens, device identifiers, production data, coordinates, or `.env` files are in the candidate.
- Production-facing flags remain disabled by default; comeback remains disabled unless separately approved.

## Android and proximity status

- Physical Android device/provider validation: not run; no Android device was attached (`adb devices` returned no device).
- Therefore installation/permissions, token lifecycle, provider delivery, lifecycle routing, visible copy, correlation, retry behavior, and real-world proximity are not claimed as passed.
- Source-level deep-link and proximity tests passed in the 72-test suite; these are not a substitute for device validation.

## iOS status

- Static configuration and iOS export passed: `buffago` scheme, auth/reset route definitions, Expo notifications plugin, APNs configuration surface, and background-location permission declarations are committed.
- iOS physical-device and APNs provider delivery remain blocked without macOS/Xcode, an iPhone, and a real provider response.

## Review panel

The latest recorded eight-reviewer closure panel remains average `93.125`, lowest reviewer `93`, and does not meet the required average `95` gate. It was not inflated and was not rerun as a passing panel because staging/provider/device evidence is absent. A fresh panel rerun is required after Android, provider, server, and clean-candidate evidence exists.

## Approval boundary

Serrano run `2026-07-23T232335` was explicitly approved and advanced through its build to validation. This candidate handoff does not approve release, does not enable production flags, and does not deploy to production. Remaining approval requires human acceptance of the iOS physical-validation risk plus successful staging database, dispatcher/provider, Android-device, proximity, suppression, and review-panel gates.
