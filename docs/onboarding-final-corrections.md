# Final onboarding corrections — 2026-10-22

Implemented on `feature/onboarding-v2-simplified-first-value`. Release QA remains incomplete because native Android and live backend checks are blocked.

## Behavior

- Restored the pepper slider implementation, native Slider interaction, color interpolation, arrow, and styles from `35d8227^`. Only the slider portion was restored; current wizard payload, scores, quick/full flows, and submission logic remain intact. Home, standard ratings, and Crawls share this wizard.
- V2 already contains no Crawl tutorial pages. Production now explicitly enables V2. The route still honors its rollback flag; the disabled legacy route was not redesigned. Actual Crawl functionality is untouched.
- The result now congratulates the user, displays the selected restaurant and their actual overall score, and offers **Create Account & Add Photo** or **Continue to BuffaGo**. Guest results remain explicitly identified as local previews. Explore remains available before rating.
- Photo intent now preserves the preview identity through existing password/OAuth auth handoffs. Completion is persisted before opening authentication, using the existing completion keys and Home underneath auth. Existing completion records are not reset.
- After authentication, a bound preview opens an explicit **Confirm & Save Rating** screen. No rating submission occurs merely because authentication completed. Confirmation requests foreground location and invokes the existing `submit_validated_restaurant_rating` RPC through `ratingRpcRetry`, bound to the account. The preview UUID is only an idempotency operation key, never a rating ID.
- Only an accepted RPC receipt containing a canonical rating ID and `wing_shot_eligible=true` opens the existing Wing Shot flow. Its `eligibleRatingId` is that returned ID. The linked restaurant is locked; lookup failure offers retry/Home rather than selecting a different restaurant for that rating. Existing validation, consent, moderation, upload retry, and authorization remain in control.
- A saved but ineligible rating is reported as saved and ineligible. Missing previews, account changes, location denial/proximity rejection, and uncertain network outcomes retain truthful retry/Home alternatives. Repeat confirmation uses the same server operation key. Existing uploader in-flight/session protection and server duplicate constraints remain unchanged. Upload cancellation returns Home.

## Validation

- **82/82 targeted automated tests PASS**, using Node tests and the mobile hook simulation harness. These cover original native-slider props/styles, quick/full score retention, V2 routing and local preview, Wingman fallback, existing auth journey and callback protections, bound confirmation, rapid double taps, canonical receipt linking, account changes, rejected/ineligible submissions, locked restaurant recovery, and existing Wing Shot provenance contracts. This is simulated client/contract coverage, not live signup, persistence, or photo attachment. [Test output](../artifacts/onboarding-final-corrections/tests.txt).
- Targeted ESLint: **0 errors**, one preexisting unused `theme` warning in the restored wizard's tag component. [Output](../artifacts/onboarding-final-corrections/lint.txt).
- Standard `npm run typecheck`: **FAIL**, three TS5097 errors in unchanged `supabase/functions/_shared/wingmanMenuEvidence.ts`, `wingmanMenuPolicy.ts`, and `wingman-intake/index.ts`. `npx tsc --noEmit --allowImportingTsExtensions`: **PASS**. [Standard output](../artifacts/onboarding-final-corrections/typecheck.txt), [compatible check](../artifacts/onboarding-final-corrections/typecheck-compatible.txt).
- `git diff --check`: PASS.

## Exact production verification

Read-only `eas config --platform android --profile production --json` resolved the production environment with Android `buildType=app-bundle`. EAS reports remote production variables for Google keys and Supabase URL/anonymous key; neither onboarding flag is remotely overridden. Resolved profile values are:

```
EXPO_PUBLIC_ONBOARDING_V2=true
EXPO_PUBLIC_ONBOARDING_WING_SHOT_INVITE=true
```

Executed `eas env:exec production "node scripts/qa/verify-onboarding-production.cjs" --non-interactive`. The script applies resolved production profile env, disables local dotenv loading, and exports Android locally. It evaluates the actual compiled feature module with an empty runtime environment: both `ENABLE_ONBOARDING_V2` and `ENABLE_ONBOARDING_WING_SHOT_INVITE` are **true**. The route's enabled branch mounts **OnboardingV2**, not either legacy flow. Source-map comparison confirms the eight relevant runtime source files match the final checkout.

Bundle: `entry-5800f5c25b52e85d25464c2a6f0e2ef7.js`

SHA-256: `028e74224c5c5e0cf4b148c851ecec4dba23e4b9c66b554f124ba145f77e5791`

[Resolved flags, compiled values, hash and source matches](../artifacts/onboarding-final-corrections/production-flags.json), [export log](../artifacts/onboarding-final-corrections/production-export.txt), [final verification](../artifacts/onboarding-final-corrections/bundle-verification.txt). The exported bundle and map remain local under the ignored `android-export/` directory. Verification export disables Hermes bytecode for inspection; an earlier default-Hermes Android export also succeeded. This verifies build configuration and bundled JS; **no new native APK/AAB was built, installed, or submitted**.

## Android and backend blockers

No physical Android device was connected. Started the existing dedicated `Buffago_Onboarding_QA` AVD twice, including a cold boot with kernel logging and explicit software graphics. It remained **offline** in ADB during Android initialization, preventing UI interaction or screenshots. No app data was cleared, no existing onboarding state was reset, and no earlier screenshots were reused as current evidence. QA-launched Metro and emulator processes were stopped afterward. [ADB evidence](../artifacts/onboarding-final-corrections/android-devices.txt). Full boot diagnostics remain locally in the ignored `emulator-boot.log`.

| Requested native evidence | Result |
| --- | --- |
| Welcome | BLOCKED; no screenshot |
| Restaurant selection | BLOCKED; no screenshot |
| Restored slider appearance and drag interaction | BLOCKED; no screenshot |
| Completed score | BLOCKED; no screenshot |
| Congratulations and Wing Shot invitation | BLOCKED; no screenshot |
| Signup and existing-account sign-in entry/completion | BLOCKED; no screenshot or live session |
| Post-auth confirmation and linked uploader | BLOCKED; simulated tests only |
| Home after continuing/canceling | BLOCKED; simulated navigation only |
| Home after cold restart | BLOCKED; no current native evidence |
| Actual rating persistence and attached Wing Shot | NOT VERIFIED; no backend receipt |

Release still requires a working Android device/emulator, new-account signup and existing-account sign-in, an authorized in-person rating receipt, successful linked photo receipt, cancellation/Home and cold restart checks, and installation/testing of a production-profile native artifact. Server eligibility must remain enforced; do not substitute synthetic location or fabricated IDs to clear these gates.

## Changed files

Application and configuration:

- `crawl/components/RatingWizardDialog.jsx`
- `crawl/components/OnboardingV2.jsx`
- `crawl/components/OnboardingRatingConfirmation.jsx` (new)
- `crawl/components/wingShots/WingShotComposer.tsx`
- `crawl/app/profile/wing-shots/submit.jsx`
- `crawl/lib/confirmOnboardingRating.js` (new)
- `crawl/lib/wingShotAuthIntent.js`
- `crawl/eas.json`

Tests and verification:

- `crawl/tests/onboarding-v2.test.mjs`
- `crawl/tests/onboarding-wing-shot-route.test.mjs`
- `crawl/tests/wing-shot-onboarding-handoff.test.mjs`
- `crawl/tests/onboarding-rating-confirmation.test.mjs` (new)
- `crawl/scripts/qa/verify-onboarding-production.cjs` (new)

Documentation/evidence:

- `docs/onboarding-final-corrections.md` (this report)
- `artifacts/onboarding-final-corrections/.gitignore`
- `artifacts/onboarding-final-corrections/android-devices.txt`
- `artifacts/onboarding-final-corrections/bundle-verification.txt`
- `artifacts/onboarding-final-corrections/lint.txt`
- `artifacts/onboarding-final-corrections/production-export.txt`
- `artifacts/onboarding-final-corrections/production-flags.json`
- `artifacts/onboarding-final-corrections/tests.txt`
- `artifacts/onboarding-final-corrections/typecheck-compatible.txt`
- `artifacts/onboarding-final-corrections/typecheck.txt`

`crawl/config/features.ts` and `crawl/app/onboarding.jsx` were inspected and verified; neither needed changes. No production channels, credentials, server flags, database objects, or backend deployments were changed. No push, merge, store build submission, or deployment was performed.
