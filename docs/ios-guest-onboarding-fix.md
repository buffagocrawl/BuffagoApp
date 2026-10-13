# iOS guest restaurant addition — implemented, not deployed

Prepared October 13, 2026 on the existing `feature/buffago-app-polish` branch. The branch was already active; no checkout, branch creation, reset, staging, commit, production write, function deployment, OTA publication, or store submission was performed. Existing unrelated changes remain in place.

## Behavior and evidence

The confirmed 401 was caused by v17 requiring `auth.getUser()` to return a real user for `insertDestination`. Guest onboarding supplies no user and the Supabase client uses the project's legacy anon JWT. The patched endpoint accepts that exact project anon JWT as a **public caller**, with `created_by = null`. It does not treat the API key, supplied user ID, or device ID as user identity. Other bearer tokens must resolve through Auth; missing/invalid/expired user tokens return 401 and cannot fall back to guest. Gateway JWT verification remains enabled.

Server-side Places resolution, state cross-check, restaurant/menu verification, approval policy, input validation and the existing atomic limiter remain mandatory before creation. Guests without a forwarding bucket fail closed. The last gateway forwarding entry is used instead of an attacker-controlled first entry; it is only an abuse bucket. Deployment acceptance must verify that the gateway appends or overwrites forwarding headers. Authenticated callers retain their Auth-derived creator ID. No client supplied creator can take ownership of a public restaurant.

Read-only production inspection reconfirmed v17 / `verify_jwt: true`, the service-only RPC grants, nullable destination creator, and no user triggers on destinations. `wingman_create_destination(jsonb,uuid)` is non-strict and SECURITY INVOKER; only postgres/service_role can execute it. Its short SHARE ROW EXCLUSIVE transaction serializes destination writes, reuses the same state/name/address, rejects ambiguous branches, and never reassigns existing ownership. **No database migration or grant change is required for the inspected production project.** Production `service_role` already has the UPDATE permission needed for this lock. Details are in [production-readonly-evidence.json](../artifacts/guest-onboarding/production-readonly-evidence.json).

Existing quotas are unchanged: guest 3/hour and 10/day by IP; signed-in 10/hour and 30/day by user. Search, deeper verification and creation consume separate calls; repeated searches can exhaust the guest budget and legitimately return 429. Retrying must wait for the quota window or use a signed-in session; the fix does not bypass the quota.

## Spinner investigation and app changes

The production incident's exact spinner cause remains unconfirmed. Tests execute the dialog source from iOS build commit `7830a30d1a574812e68e5f5007b93d985e58da6b`: an ordinary 401 clears loading, while a stalled cloned error body's `json()` reproduces persistent loading. Thus the HTTP status alone does not explain the observed spinner. Other inspected hazards were unbounded function/query requests, awaited local-selection/analytics callbacks, and a verification shortcut whose cleanup relied on the nested insertion path.

The app now bounds function requests and aborts their transport at timeout, bounds error-body parsing to 2 seconds, bounds best-effort log writes, and bounds each dialog stage/selection callback to 45 seconds. State-list loading has a 15-second bound. Both verification branches clear loading, failed system requests show errors instead of being mistaken for evidence requiring review, and retry preserves name, town and details. Synchronous in-flight guards suppress repeated taps. Once creation returns a row, selection retries reuse that row rather than creating again. Dismissal/unmount cancels the dialog generation; late completions cannot change a reopened dialog. Local onboarding selection writes have a 10-second bound; telemetry does not delay advancing to rating.

Guests still defer manual review in AsyncStorage for later sign-in. The dialog awaits that local save and explicitly says **saved on this device for submission after sign-in**, without claiming remote submission. A local-save failure remains retryable. Signed-in review still uses `destination_suggestions`. Callback cancellation also stops late onboarding transitions.

`ShortOnboardingFlow.tsx` was inspected: it selects existing destinations and contains no Wingman add path. Its local-only optional-rating behavior was left unchanged.

## Changed files for this task

App implementation:

- `crawl/components/OnboardingFlow.tsx`
- `crawl/components/WingmanAddDialog.jsx` (already modified before this task)
- `crawl/lib/Wingman/WingmanService.ts` (already modified before this task)
- `crawl/lib/wingmanAsync.ts` (new)

Backend implementation/config:

- `crawl/supabase/functions/wingman-intake/index.ts` (already modified before this task)
- `crawl/supabase/functions/_shared/wingmanDeadline.ts` (new)
- `crawl/supabase/config.toml` (explicit `wingman-intake.verify_jwt = true`)

Tests and verification:

- New `crawl/tests/wingman-guest-onboarding.test.mjs`, `crawl/tests/wingman-guest-postgres.test.mjs`
- Expanded existing `crawl/tests/wingman-confidence.test.mjs`
- Updated mocks in existing `crawl/tests/wingman-search-prefill.test.mjs`, `crawl/tests/app-polish-focus-framing.test.mjs`, `crawl/tests/mango-restaurant-intake.test.mjs`
- New `crawl/scripts/qa/guest-onboarding-checks.mjs`, this document, and `artifacts/guest-onboarding/`

These are incremental changes layered on the existing dirty tree. A full Git diff of the dialog/service/intake also includes earlier app-polish work. The existing shared confidence/menu policy files and existing Mango migration were not edited by this task.

## Verification

101 focused checks pass, including guest/signed-in success, both callers' 401/429/422/500 handling, stalled search/verification/insertion/selection/review, stalled error parsing, invalid input/token rejection, transport abort, repeated taps, storage failure, stale completion, legacy-spinner reproduction, and the actual onboarding selection callback with stalled analytics.

Two isolated native PostgreSQL 17.6 checks pass with no skipped checks: exact deployed RPC definitions and grants, null creator, concurrent duplicate-safe creation, signed-in creator preservation, ambiguous/invalid location rejection, denied direct client RPC access, and concurrent atomic guest/signed-in limits. Eight concurrent guest creations yield one destination. Tests use unique local loopback clusters; all synthetic restaurants exist only there. Handler tests execute the actual endpoint against mocked Auth/Places/OpenAI dependencies; they do not claim a live gateway/provider integration test or physical-device sign-off.

Active-source TypeScript verification passes (96 roots, zero diagnostics). `npm run typecheck` includes pre-existing generated `supabase/local` Deno bundles and fails on thousands of diagnostics. The scoped script excludes that generated directory using the existing compiler options; it does not modify `tsconfig.json`. `git diff --check` passes for the changed tracked implementation files.

Reproduce from `crawl` in PowerShell:

```powershell
$env:BUFFAGO_PHASE7B3D_NATIVE17 = '1'
node scripts/qa/guest-onboarding-checks.mjs
```

The native tests use the already available, verified local PostgreSQL 17.6 fixture binaries. Without that fixture, run the script without the environment flag for focused tests and active-source typechecking; the output explicitly states that native PostgreSQL was not requested. Logs and backend SHA-256 manifest are in [artifacts/guest-onboarding](../artifacts/guest-onboarding).

## Backend rollout, prepared only

Exact function bundle files:

1. `crawl/supabase/functions/wingman-intake/index.ts`
2. `crawl/supabase/functions/_shared/wingmanDeadline.ts`
3. `crawl/supabase/functions/_shared/wingmanConfidence.ts`
4. `crawl/supabase/functions/_shared/wingmanMenuEvidence.ts`

Configuration: `crawl/supabase/config.toml`. File hashes: [backend-manifest.json](../artifacts/guest-onboarding/backend-manifest.json). Existing provider keys and automatic `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` environment values are required. The installed client's legacy anon JWT must match the project's current anon JWT. No new secret, API, RPC, schema migration, or Supabase anonymous-user sign-in configuration is required.

The bundle includes the **pre-existing app-polish confidence/menu changes** already present in the working intake source and imported helpers. In particular, the local shared wing approval threshold is 0.5 versus deployed v17's 0.75; this task did not change that policy. Review those existing changes as part of this exact bundle; do not mistake this for a byte-minimal auth-only v17 patch. Other app-polish functions, photo/vote SQL, and Mango migration are outside this rollout. Do not deploy all functions or run a blanket `db push` from this dirty tree.

First deploy the exact bundle to an isolated staging project and confirm actual gateway JWT handling, current anon-key match, forwarding-header behavior (including a spoofed first entry), Auth sessions, provider evidence, quota responses, and retries. Once that acceptance and the reviewed manifest are approved for production, the exact production command is:

```powershell
Set-Location C:\Users\Brand\repo\BuffagoApp\crawl
npx supabase functions deploy wingman-intake --project-ref vhfxnizaxdanmvmouuaf --use-api
```

For staging, use the same command with the isolated staging project ref. CLI `functions deploy --help` was checked. Keep `verify_jwt = true`; do not add `--no-verify-jwt`. Deploying this single function bundles its imported helpers. Recheck returned version/configuration and read-only RPC grants afterward. A rollback can redeploy the captured v17 bundle with JWT verification enabled; that restores the known guest 401 restriction. No command above was executed by this task.

## Installed iOS support and mobile distribution

**The backend fix supports the installed client's confirmed `insertDestination` wire contract without an app update:** nullable onboarding `userId`, the same action/body, and the same `{ destination, result }` response. Confirmed 401 attempts prove the installed client reaches that action; the retained EAS build evidence maps submitted iOS 1.0.6/runtime 1.0.4 to the commit exercised by the legacy-source test. The exact user's binary/build/update ID was not captured, so physical verification must confirm it and the embedded anon-key configuration. Verification rejection and quota exhaustion remain legitimate outcomes. Backend deployment does **not** retrofit client deadlines, correct guest review copy, or guarantee recovery from every legacy spinner path.

The app changes are JavaScript/TypeScript only and introduce no native dependency or runtime change. Current resolved `expo config --type public` gives `runtimeVersion: "1.0.4"` and `updates: null`; `app.config.js` has no updates URL and the production EAS profile has no channel. Prior read-only EAS inventories in `docs/buffago-app-polish-release-plan.md` found no OTA channels/groups. Having `expo-updates` installed is insufficient. **An OTA rollout to the current installed iOS cohort is not established by this configuration.** Treat a native release as necessary unless the embedded binary's update URL/channel/runtime are independently proven compatible. Enabling OTA for future binaries requires native update configuration and is outside this fix. No runtime bump, OTA setup, publication, or store build was performed.

On a physical iPhone against staging, record OS/device/build/runtime/update ID and verify: guest and signed-in search/add/selection; rapid duplicate taps; rejected/uncertain restaurant and truthful deferred local review; 401/429/422/500 outcomes; weak/offline/stalled networking; retry after timeout without a duplicate row; close/reopen during a request; and advancing to rating even if telemetry stalls. Also run the already-installed production client's unchanged request against staging, with a fresh guest quota bucket. Do not create synthetic production restaurants.

Supabase's current [Edge Function authentication guidance](https://supabase.com/docs/guides/functions/auth) documents the gateway `verify_jwt` check; it remains enabled here.
