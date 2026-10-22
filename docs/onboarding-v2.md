# Onboarding V2

V2 is an opt-in first-value flow: Welcome -> Find / rate wings -> restaurant search or Wingman -> the existing four-dimension RatingWizardDialog -> local result -> optional account or guest Home. Explore goes straight to Home. No preference questionnaire, required rating, login, location prompt, or Crawl education is part of V2.

## Rollout and rollback

Set `EXPO_PUBLIC_ONBOARDING_V2=true` in the QA environment and restart Expo (clear Metro cache if necessary). The explicit flag in `crawl/config/features.ts` defaults to false. V2 takes precedence over the older 50/50 experiment; that experiment is never mounted when V2 is enabled. Remove the flag or set it to false to restore existing route selection. No production environment was changed.

Completion still uses `buffago:onboarding_done_v3` and both legacy keys through `markOnboardingSeen`. Existing completed users do not re-onboard. The per-device `buffago:onboarding:v2_arrival` record lets Home avoid its blocking location gate for V2 participants and records actual Home arrival. LocationProvider reads permission without prompting for fresh V2 users and V2 participants; other users retain the existing prompt. Participants retain optional location after rollback so they can continue entering Home without a new gate. Other feature-specific location requirements remain intact.

## Data and account transition

All onboarding ratings are local previews, including when an account already exists. The result displays the selected overall score on its original 1-10 scale; numeric scoring and published rating fields are unchanged.

`createGuestRatingPreview` / `saveGuestRatingPreview` store the canonical `local_preview` at `buffago:guest_rating_preview:v1` first. The compatibility seed at `buffago:onboarding:seed_rating` contains the same operation ID, `onboarding_version: 'v2'`, and `local_only: true`. An interrupted compatibility write cannot erase the canonical preview; reopening incomplete V2 restores its result. Retry retains the operation ID. Neither record is deleted by V2.

Both existing auth seed import paths explicitly leave V2 seeds alone. **There is no automatic V2 preview import, public submission, coin spend, XP, photo entitlement, or cloud sync.** A future explicit review/import workflow must obtain a confirmed server receipt before making those claims. After completing onboarding, the preview remains recoverable in local storage for that follow-up; there is currently no new Home preview-management UI. Uninstalling/clearing app data removes local previews.

The optional Wing Shot offer completes onboarding with Home underneath auth/upload. The bounded login handoff and flag behavior are documented in the follow-up below. Full provider/device round trips remain manual QA.

Restaurant search uses the same anonymous destinations table access as existing onboarding, with a debounced name query and city/address disambiguation. It searches across states without a separate state stage; saved state is offered to Wingman. Search is capped at 30 matches: refine the name for broad queries. Both search and Wingman feed the same selection callback and shared quick rating dialog. `new:` placeholders and malformed IDs cannot open rating. Guest manual-review suggestions use the existing durable suggestion key and truthfully say they await sign-in; authenticated queued outcomes retain the shared dialog behavior. No backend/schema/RLS/Edge Function changes were made.

## Shared rating interaction

The canonical quick/full slider now uses a measured 56-point gesture surface with 14-point endpoint insets and a visible 28-point orange thumb. Tap/drag map to clamped integers 1-10, including RTL. An adjustable accessibility control exposes score, hint, and increment/decrement actions. Scores update live; endpoint labels are 15 points. Sauce/Rub starts at Forgettable. The dialog scrolls while navigation stays outside its scrolling body; the V2 result actions are below its scrolling body. The score payload builder and published submission code remain unchanged.

## Instrumentation

Events include `onboarding_started`, `onboarding_step_viewed`, `restaurant_selected`, `quick_rating_started`, `guest_rating_preview_created`, `quick_rating_completed`, `onboarding_account_offer_selected`, `onboarding_explore_selected`, `onboarding_completed`, and `onboarding_main_app_arrived`. Metadata includes `onboarding_version: v2`, `entry_path` (`find_rate`, `explore`, or `undecided` before choice), and platform. Preview completion uses `status: local_preview`; it does not emit `rating_submitted`. Search text, addresses, account details, and suggestion contents are not logged. Analytics failure never blocks navigation. Arrival is best-effort, with a durable pending marker (delivery is not exactly-once).

## Automated validation (2026-10-21)

From `crawl/`:

- `npm run test:quick-rating`: PASS.
- `node --test tests/onboarding-v2.test.mjs`: PASS, 10 focused tests. Executes production components through the existing mocked mobile runtime; covers both entry choices, existing search, Wingman verified/pending paths, guest suggestion durability, preview recovery after storage failure, auth route ordering, precedence/guards, slider taps/drags/RTL/accessibility, and quick/full step revisits/payloads.
- `node --test tests/onboarding*.test.* tests/wingman*.test.mjs lib/onboardingStepSix.test.cjs` (PowerShell expands files explicitly): PASS; 145 passed, 2 skipped. The database-dependent Wingman guest Postgres and atomic rate-limit cases require their external test environments and were skipped.
- `npm run lint`: PASS, 0 errors / 102 existing warnings. ESLint comparison of changed tracked files against origin/main: 19 warnings before and 19 after; no added warning in the new component. Existing warnings include unused values, hook dependencies, BOMs, and duplicate imports.
- `npm run typecheck`: FAIL on three pre-existing TS5097 errors in unchanged `supabase/functions/_shared/wingmanMenuEvidence.ts`, `wingmanMenuPolicy.ts`, and `supabase/functions/wingman-intake/index.ts`. No new diagnostics. `node node_modules/typescript/bin/tsc --noEmit --allowImportingTsExtensions`: PASS. Project config was not changed to hide this baseline issue.
- Read-only anonymous Supabase name lookup with the exact V2 selected columns: PASS, one row returned. No write performed.
- `git diff --check`: PASS.

## Required manual QA before enabling rollout

No Android/iOS simulator or device validation, screenshots, store build, merge, or deployment was performed.

Run on both Android and iOS, including a small phone (320/360 dp), landscape, large system text, light/dark themes, RTL, TalkBack and VoiceOver:

1. Fresh app data, V2 enabled: confirm only the clean welcome and two choices; no account/location prompt. Explore must open actual Home without the location gate, then stay there after relaunch. Confirm the arrival event.
2. Find/rate: search an existing restaurant, disambiguate by address, cancel/back, and choose it again. Verify four shared steps. Tap endpoints/midpoint, drag repeatedly, revisit each step three times, and use accessibility adjustment. Scroll outside the slider and check parent scrolling cannot steal a drag inside it. Verify thumb/score alignment in RTL.
3. Complete known scores (overall 8, sauce 7, crispiness 6, chicken 9). Result must show 8 / 10 and local-only copy. Both result CTAs must be reachable with large text; inspect clipping and fixed footer. Confirm no published review/XP/coin/photo-access change.
4. Exercise Wingman as a guest: existing match, verified new canonical destination, unavailable service, inconclusive/manual review, timeout, and close/reopen. Canonical results use the same rating dialog. Pending results offer search/explore, never a canonical rating. Guest suggestion remains on-device until sign-in; do not claim it was sent before authentication.
5. Interrupt during preview save; reopen incomplete V2 and recover result. After Explore/account completion and relaunch, verify both preview/seed keys remain. Existing storage fault tests use mocks; simulate low-storage behavior if possible.
6. Create account: complete password signup, email-confirmation path if configured, OAuth success/failure/cancel, and auth back. Confirm Home and no onboarding loop; preview remains local and no implicit coin transaction occurs. Existing account: continue Home. Verify local-only copy remains accurate.
7. V2 off: check both legacy experiment assignments, original completion keys, existing accounts, normal quick/full public ratings, Wingman, and existing location behavior. Verify normal rating payloads/server receipts and photo eligibility are unchanged.

Keep V2 false until these checks pass. A future preview import needs its own reviewed, idempotent, receipt-backed workflow. Backend deployment, production flag changes, store builds, merges, and migrations require separate authorization.

## Changed files

| Files (under `crawl/` unless noted) | Purpose |
| --- | --- |
| `components/OnboardingV2.jsx`, `lib/onboardingV2.js` | V2 UI, selection, durable preview, navigation |
| `app/onboarding.jsx`, `config/features.ts` | Explicit disabled flag and exclusive routing |
| `app/auth/login.jsx`, `app/auth/callback.jsx` | Leave V2 previews out of automatic legacy coin import |
| `app/(tabs)/home/index.jsx`, `components/LocationGate.tsx`, `providers/LocationProvider.tsx` | Participant-only optional location and Home arrival tracking |
| `components/RatingWizardDialog.jsx`, `lib/ratingSlider.js`, `lib/quickRating.js` | Shared accessible interaction, scrollable content, label |
| `tests/onboarding-v2.test.mjs`, repository `docs/onboarding-v2.md` | Focused regressions and rollout/manual QA |

## Wing Shot handoff follow-up (2026-10-21)

The result retains the actual overall score and restaurant name. When both authoritative prompt/photo flags permit uploads it offers:

- �Got a picture of those wings?�
- �Share a Wing Shot with the BuffaGo community. Create a free account to upload a photo, keep track of your favorite spots, and build your wing journey.�
- Guest: �Create Account & Add a Wing Shot�; account: �Add a Wing Shot�.
- �Explore BuffaGo� remains available without authentication.
- �Wing Shots are reviewed before they appear in the gallery.�

When flags fail or are disabled: �Wing Shots are unavailable right now. You can still explore BuffaGo; your preview stays on this device.� No upload CTA is advertised. The flag RPC grants authenticated-role access only: guests without any Supabase session cannot query it, while anonymous-auth sessions can. This means the desired guest acquisition offer is unavailable for sessionless guests under the existing contract. No grants or flags were changed.

The purpose-specific AsyncStorage key `buffago:wing-shot:onboarding-return:v1` holds a versioned pending intent for 30 minutes. Only UUIDs, a bounded display/search hint, timestamps, source and an optional account binding are stored. Claims serialize in-process, validate the current nonanonymous user with getUser, expire malformed/old intents, remove before returning a single fixed internal submit route, and never carry a preview rating ID. Password signup/signin and shared Google/Facebook callback success use this mechanism. Confirmation-required signup keeps the intent until a later actual login. Existing saved-destination intents take priority; OAuth account linking and nondefault return paths take priority. The standard OAuth Home return may be replaced by this narrow intent. Auth failure/cancel leaves it retryable until expiry; Explore from the result clears it. Back from auth has Home underneath. Reopening login within expiry can resume; onboarding previews remain durable regardless of intent state. After a consumed handoff, an interrupted navigation can be recovered from the normal Profile uploader (or the result if still available), rather than replaying auth automatically.

Submit checks current real auth and flags again. Composer loads the UUID from destinations through the existing client/RLS; route labels only prefill search, never prove identity. Missing/inaccessible/network-failed IDs fall back to the standard picker. There is no established closure field in this destination selection model, so independent closed-business detection is not implemented. Existing WingShotFlow owns explicit media selection/permissions, validation, drafts, consent, attribution, upload, idempotency, moderation, errors and submitted-for-review success. No image picker is opened automatically. Cancel goes to Home.

Additional events: onboarding_wing_shot_offer_viewed, onboarding_wing_shot_selected, onboarding_wing_shot_auth_return, wing_shot_upload_opened and wing_shot_restaurant_preselected. They include source and validated destination context, never labels/emails/media bytes. Existing onboarding_explore_selected records decline; existing Flow completion tracking is reused.

### Validation and remaining release blockers

Local static contract review: latest reservation definition in `20261007000241_image_workflow_rc_regression.sql` accepts onboarding with null p_rating_id and still enforces rollout, moderation, consent, attribution and quota. Existing contract suites pass. **Acceptance 9 actual backend upload without a canonical rating: BLOCKED / NOT RUN**. No production write was made; deployed contract parity and real media processing have not been established. Do not interpret static/mock tests as a successful backend upload.

Automated handoff tests exercise production intent code with missing/anonymous/current sessions, provider-independent claims, restart-equivalent persisted storage, expiry, stale screens, double claims, account binding and pseudo IDs. Production composer is executed with mocked RLS responses for preselection and fallback. Provider labels in intent tests do not constitute full login/callback UI integration or device OAuth tests.

Manual screenshot/test checklist, all **NOT RUN** on Android/iOS: result with known score/name and offer; small screen/large text/dark/RTL/accessibility; disabled/unready flags; immediate and confirmation-required password signup; signin; Google and Facebook round trips/cancel/failure; account switch; restart before/after claim; back and Explore; verified restaurant bypass; inaccessible/closed restaurant fallback; explicit picker permission denial; network failure; server rejection; draft retry; submitted-for-review state; preview remains local after each path; legacy flag-off onboarding unchanged. Screenshot these result, auth, preselected uploader, unavailable/fallback, and submitted-for-review states before rollout. V2 remains false by default.

Follow-up changed files: components/OnboardingV2.jsx; lib/wingShotAuthIntent.js; app/auth/login.jsx; app/auth/callback.jsx; app/profile/wing-shots/submit.jsx; components/wingShots/WingShotComposer.tsx; tests/onboarding-v2.test.mjs; tests/wing-shot-onboarding-handoff.test.mjs; docs/onboarding-v2.md.


Final follow-up validation (2026-10-21), from crawl:

- PowerShell: `$files = Get-ChildItem tests/onboarding*.test.*,tests/wingman*.test.mjs,tests/wingShot*.test.mjs,tests/wing-shot*.test.mjs,tests/auth/*.test.js | Select-Object -ExpandProperty FullName; node --test --experimental-default-type=module $files`: 371 tests; 367 PASS, 0 FAIL, 4 SKIP. Skips: two explicitly retired legacy rate-limit assertions, external limiter runtime, external PostgreSQL Wingman runtime.
- `node --test tests/onboarding-v2.test.mjs tests/wing-shot-onboarding-handoff.test.mjs`: 15 PASS, 0 FAIL.
- `npm run test:quick-rating`: PASS.
- `npm run lint`: PASS; 0 errors, 100 warnings.
- `npm run typecheck`: FAIL, exactly the three pre-existing TS5097 diagnostics in wingmanMenuEvidence.ts, wingmanMenuPolicy.ts and wingman-intake/index.ts.
- `node node_modules/typescript/bin/tsc --noEmit --allowImportingTsExtensions`: PASS. No configuration workaround committed.
- `git diff --check`: PASS. Static diff confirms no legacy onboarding component, slider, production flag, SQL, Edge Function or database object changed.
- Real backend upload, deployed contract parity, Android/iOS screenshots, device OAuth and closed-business fallback: NOT RUN / BLOCKED as described above. No production write requests.
