# Test Results

Run date: 2026-07-24 (local disposable Supabase, captured Buffago schema baseline).

- TypeScript: **passed** (`npm run typecheck`, exit 0).
- Full JavaScript suite: **150 passed, 0 failed** (`node --test --experimental-default-type=module` over all `tests/**/*.test.js`).
- Expo lint: **0 errors, 95 warnings** (warnings are existing BOM/unused-variable/hook warnings; no lint errors).
- Android production JS export: **passed** (`npx expo export --platform android`, exit 0).
- iOS production JS export: **passed** (`npx expo export --platform ios`, exit 0).
- Web export: **failed** on pre-existing native-only `react-native-maps` import from `app/(tabs)/ratings/index.jsx`; this is a web-target blocker, not a TypeScript or native bundle failure.
- Empty-database migration reset: **failed** at `20260620120000_add_facebook_connection_to_users.sql` because the repository migration pack is delta-only and does not include the required baseline `public.users` schema.
- Baseline restore: **passed** from the captured schema dump (`baseline-restore.log`).
- Migration application from baseline: **passed** through all 14 local migrations (`engagement-migration-recovery.log`, exit 0).
- Partial-state engagement rerun: **passed** for both engagement migrations; existing policies, tables, indexes, functions, trigger, flags, and seed rows were retained (`engagement-retention-rerun.log`, `engagement-notifications-rerun.log`, both exit 0).
- Schema validation: **passed** (9 required tables, required RPCs, trigger).
- RLS tests: **passed**; direct client inserts denied and outbox RLS enabled.
- RPC permission tests: **passed**; anon denied and authenticated allowed for the daily RPC.
- Concurrent reward grant: **passed**; two simultaneous `award_xp` calls produced one ledger row and one 10 XP award.
- Notification outbox dedupe: **passed**; repeated and concurrent keys produced one outbox row.

Release gate: **FAIL for production approval**. Database and native bundle validation pass, but the migration pack needs an explicit baseline strategy, web export remains broken, and real-device/provider notification and geofence validation are still required.

## Reconstruction candidate `b39be7580a80637f64471e1407e52a4139f069c2`

- Isolated checkout: clean, exact SHA above.
- TypeScript: passed.
- Full candidate JavaScript suite: **68 passed, 0 failed**.
- Focused daily-engagement suite: **41 passed, 0 failed**.
- Lint: **0 errors, 102 warnings**.
- Android, iOS, and web exports: passed.
- Migration integrity: passed; 9 root migrations and committed checksums.
- Strategy B preflight: failed as expected against the unprovisioned local database; 34 missing prerequisites were listed and no engagement migration ran.
- Strategy B apply, partial recovery, schema/RLS/RPC runtime, concurrent reward, and notification outbox runtime checks: blocked pending the correctly provisioned baseline.
## Closure rerun

- TypeScript passed; web, Android, and iOS exports passed after the platform boundary.
- Lint: 0 errors, 95 warnings. New platform and baseline-preflight regression tests passed.
- The full repository test command was not clean because current migration files are stored under supabase/migrations/deployed while existing contract tests still address deleted root paths; one unrelated Buffaverse contract also fails on its pre-existing SQL-shape assertion. Prior release evidence remains 150 passed, 0 failed.
- Physical-device/provider tests are blocked: no attached Android device and no macOS/Xcode toolchain. No pass is claimed.

## Final hardening run

- Exact candidate 7937e76c6e9bab3f28c9e3d2479e029c458ee7fa: focused closure tests 4/4 passed; candidate web export passed.
- Exact candidate TypeScript check: FAILED because the candidate commit intentionally excludes unrelated pre-existing uncommitted source changes; failures include casing conflicts and existing app/function typing/import errors. The current worktree TypeScript check passes after dependency restoration.
- Current complete JavaScript suite: 160 passed, 0 failed.
- Current lint: 0 errors, 95 warnings. Current web export: passed.
- iOS/Android physical/provider/deep-link/proximity totals: 0 passed, 0 failed, 20+ blocked by no attached device and unavailable Xcode tooling. No device pass is claimed.
- Final approval gate remains blocked; no panel score increase is warranted.

## Database-baseline recovery run — 2026-07-23

- Read-only linked-project inspection passed: `vhfxnizaxdanmvmouuaf`, CLI `2.107.0`, PostgreSQL `17.6.1.011`.
- No versioned pre-engagement baseline was found. The recovered snapshot is post-engagement and diagnostic only; SHA-256 `BE31964E558689B153B3052A166DE7DE6B97B745DA948573230215AE7D11CE21`.
- One disposable replay environment passed restore, preflight, both target migrations, replay, and existing schema/RLS/RPC/outbox SQL checks.
- Two clean environments and the requested full executable runtime matrix were not proven. No candidate code or migration changed.

Database run outcome: **FAIL / BLOCKED for the requested passing criteria**.

## Current-schema release run — 2026-07-24

- Contract generation: passed, 29 checks; checksum `fe2af053e41c78ed27919292d4168a87d990a3f4637ca5dcb30703bac0a1d891`.
- Contract/preflight/reconciliation static tests: passed, 4/4.
- Dispatcher and Expo notification configuration: staging package created; live provider capture not run.
- iOS physical validation blocked by unavailable macOS/Xcode/iPhone. Android physical validation not run.
- Production preflight/migration not run; no production secrets or mutation used.

| Area | Passed | Failed | Skipped | Blocked |
| --- | ---: | ---: | ---: | ---: |
| Contract/preflight/reconciliation static | 4 | 0 | 0 | 0 |
| Existing full JavaScript evidence | 160 | 0 | 0 | 0 |
| TypeScript | 1 | 0 | 0 | 0 |
| Lint | 1 | 0 | 0 | 0 |
| Web/Android/iOS exports | 3 | 0 | 0 | 0 |
| Physical/provider/device validation | 0 | 0 | 1 | 2 |
| Production database mutation | 0 | 0 | 1 | 0 |

The fresh full repository JavaScript command on this checkout completed **79 passed, 0 failed**. The earlier 160-test figure is preserved as historical evidence from a different test inventory and is not used as the current-run total.
