# Operation UI Overhaul: continuation readiness review

Cleanup status (2026-10-09): generated capture/log links have been retired. Artifact paths below are historical identifiers or regeneration output locations, not retained evidence. Conclusions remain recorded in [the consolidated audit](branch-consolidation-final-audit.md). Scripts, fixtures and application assets are preserved.

October 8 final polish continuation: [Crawls and Android native readiness](operation-ui-overhaul-native-readiness.md)
records the completed recommendation composition, final comparisons, replacement
local Android client and limited native smoke checks. It supersedes the earlier
Crawls/native-client status below; migration and live acceptance limitations remain.

Reviewed October 8, 2026. **Release acceptance is incomplete.** Branch is
`operation-ui-overhaul`; HEAD and local `main` are both
`f879b9747e932cf7edc4568b2a821d9bb145edbf`. No commit, push, merge, build
submission, or deployment was performed. Existing unrelated changes outside
`crawl/`, including the root `.gitattributes`, were preserved.

## Migration failure investigation

The two failing tests are in `tests/database/migration-integrity-reconciliation.test.js`:

- `known current-schema migration is explicitly registered and checksum-stable`
  asserts that **all** manifest checksums match, rather than only the named
  current-schema migration. It fails with 24 mismatches. The checker hashes raw
  on-disk bytes; `core.autocrlf=true` converts LF Git blobs to CRLF. Twenty
  mismatches disappear when comparing canonical LF bytes. Four do not:
  `20260729122000_wing_shots_creator_rewards.sql`,
  `20260729126000_wing_shots_notifications.sql`,
  `20260729132000_wing_creator_surfaces.sql`, and
  `20261007000241_image_workflow_rc_regression.sql`.
  Their committed content does not match the recorded deployment hash under LF
  or CRLF. This is a manifest-to-source integrity discrepancy, not a UI change.
  Rewards and creator surfaces were edited in `193e6b0`; notifications in
  `f66fd00`; the October migration was added in `74182f0`. The recorded hashes
  did not match any inspected file-history revision under LF or CRLF, so the
  exact applied production bytes cannot be inferred from Git alone.
- `recovered Phase 1 migrations are present as unique root files` verifies
  uniqueness across **all** migrations. It fails because
  `20260729200000_duplicate_media_classification.sql` and
  `20260729200000_duplicate_media_classification_fixed.sql` share timestamp
  `20260729200000`. The former entered history in `2dd3625`, the latter in
  `f19635c`; both exist in baseline `main`.

The standalone integrity checker additionally reports **17 unmanifested root
migrations**, including the `_fixed` duplicate. The exact names and per-file
manifest/disk/HEAD/LF SHA-256 values are recorded in
`artifacts/operation-ui-overhaul/migration-investigation.json`.
All 24 mismatching files equal HEAD after newline normalization; the migration
directory, manifest, checker, and reconciliation tests have no diff from HEAD.
HEAD equals baseline main, establishing that these failures predate the overhaul.
Production migrations, manifest hashes, and test assertions were not changed.

Resolution requires reconciling the four discrepant hashes and 17 missing
entries with actual deployment evidence, and resolving the duplicate timestamp
against the applied ledger. A platform-independent byte policy also needs to be
agreed. Do not replace recorded hashes or rename applied migrations blindly.

## Visual review and fix

Reviewed all 27 PNG captures against the documented five-screen system:
near-black surfaces, orange actions, restrained status colors, compact bordered
cards, consistent progression, and safe-area-aware navigation. Matrix covers
320, 390, and 430 widths plus 130% web text scaling; seven captures cover extra
loading, search, empty, map, mission, and challenge states. Horizontal chip
scrolling and vertical content scrolling are intentional. Truncated long card
titles remain accessible through restaurant details.

Found a missed regression: active Crawl cards had a blank area where their
Resume action should be. Paper's web progress wrapper filled its parent and
obscured the following button. Bounded that wrapper to 7px, retaining progress
values and existing action handlers. Recaptured all four Crawl matrix images;
Resume is now visible. Added browser hit-testing of its center to the existing
visual harness so an overlay hiding the action causes failure. Updated evidence:
`screenshots/visual-report-routes-all.json` (takes precedence over the older
consolidated report for Crawl rows). No other blocking inconsistency identified.
The remaining 23 PNGs were reviewed as existing evidence, not freshly rerun.

Fixtures exercise missing approved-photo placeholders; real approved imagery,
signed URL expiry, and live authenticated interactions remain unverified.
Mounted thumbnail caches may require a remount to show newly approved media;
this existing minor freshness limitation remains.

## Automated checks

- Full recursive Node suite: 576 tests, 572 passed, 2 failed as above, 2 skipped.
  Fresh log: `artifacts/operation-ui-overhaul/continuation-node-tests.log`.
- Focused overhaul regressions: 10/10 passed after the Crawl fix.
- Typecheck passed before and after the fix; quick-rating passed.
- Full lint: zero errors, 95 warnings; touched Crawl file lint passed.
- Working-tree diff validation and Python harness compilation passed.
- Crawl fixture browser rerun checks overflow, startup errors, and reachable
  Resume actions. Web fixtures do not establish native or real backend behavior.

## Exact Android build commands for the existing configuration

Run from `C:\Users\Brand\repo\BuffagoApp\crawl` after device-test build
authorization. These commands were documented, **not executed**.

```powershell
Set-Location C:\Users\Brand\repo\BuffagoApp\crawl
npx eas-cli@latest build --platform android --profile development
npx expo start --dev-client
```

`development` is the only existing internal-distribution profile. It uses the
development EAS environment and includes a development client; testers need
access to the Metro server. No standalone `preview` profile exists. Ensure
`EXPO_PUBLIC_GOOGLE_ANDROID_API_KEY` is configured for that EAS environment;
`app.config.js` rejects Android native builds without it. Supabase environment
values and Android signing credentials must also be available. Remote EAS
environment and credential availability were not checked.

For a release binary intended for the **Google Play internal-testing track**:

```powershell
npx eas-cli@latest build --platform android --profile production
```

That profile produces an AAB using the production environment and increments
the remote Android version code. It requires the production Android Maps key.
The repository's `submit.production` is empty; it does not explicitly select a
Play track. After separate upload authorization, upload the resulting AAB to
Play Console's Internal testing track. No auto-submit flag is included.

References: [Expo internal distribution](https://docs.expo.dev/build/internal-distribution/),
[EAS build profiles](https://docs.expo.dev/build/eas-json/), and
[Android production builds](https://docs.expo.dev/tutorial/eas/android-production-build/).

## Required physical-device checks still open

- Android and iOS cold launch, safe areas, gesture navigation, keyboard and
  modal behavior across all five tabs; small screens, native large text,
  accessibility labels/focus, and retained light/system theme preferences.
- Native Maps SDK initialization, permissions allowed/denied, location off,
  invalid/missing coordinates, fallback behavior, background/resume and map
  open/close without a process crash. A JavaScript boundary cannot catch an
  SDK process abort.
- Real sign-in/session renewal and authenticated loading/error/offline states;
  Home rating/swap/directions, daily reward, Wingdex search/sort/radius/photos,
  Crawl begin/resume/persistence/completion, Social scopes/profile privacy,
  Journey history/creator/challenges and photo submission/return navigation.
- Correct real coins/XP/rating updates, approved-media visibility, expiring
  URLs and owner/public boundaries against the configured backend.

The prior emulator development-client launcher error/ANR remains unresolved;
it never provided reliable app verification. No physical Android or iOS checks
were completed in this continuation. Migration integrity and required device
checks remain release blockers even though the verified UI scope now passes.
