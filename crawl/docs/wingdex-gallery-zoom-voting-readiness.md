# Wingdex gallery zoom and voting readiness — 2026-10-09

Cleanup status (2026-10-09): generated capture/log links have been retired. Artifact paths below are historical identifiers or regeneration output locations, not retained evidence. Conclusions remain recorded in [the consolidated audit](branch-consolidation-final-audit.md). Scripts, fixtures and application assets are preserved.

**Release readiness: NO-GO.** The local client and prepared server code pass the available checks. The deployed `wing-public-gallery` function is still v2, the stricter vote-eligibility migration is not applied, and live two-account voting plus iOS native validation remain open. No production deployment, database write, recovery job, build publication, commit, push, or merge was performed.

## Audit and implementation

| Area | Existing implementation confirmed | Closure in this pass |
| --- | --- | --- |
| Gallery and viewer | Tappable previews, full-screen modal, processed-asset lookup, loading/error/empty states, X/Back, safe-area padding, aspect-ratio preservation, pagination | Preview dialog corner radius set to 24dp; full-photo lookup now rejects a different submission returned by an older handler; native synthetic gallery rechecked at 320dp/130% and 390dp/100% |
| Gestures | `react-native-zoom-toolkit` handles pinch, double tap, pan and 1–4× clamp; viewer navigates on horizontal pan only at 1× | Confirmed toolkit callback behavior; Android emulator double tap, zoomed pan, 1× swipe, reset, close and return captured |
| Votes | `wing_media_photo_votes` is the photo-vote table; composite `(submission_id,user_id)` upsert/delete, optimistic counts, rollback, own-vote read and server counter trigger already existed locally. `user_wing_battle_votes` serves Home battles. | Preview and viewer now share one mutation controller and pending lock. Vote state and counts synchronize through optimistic, saved, failed, closed-viewer and account-change paths. |
| Public media | Prepared gallery already filtered approved, consented, undeleted and unwithdrawn photos and signed derivatives for 300 seconds. | Server now signs/counts only canonical `processed/<submission-id>/primary`; thumbnail signing requires `thumbnails/<submission-id>/preview` and otherwise uses that photo's processed asset. Tests reject original and cross-photo paths. |
| Vote eligibility | Existing local migration adds eligibility checks and serialized recounts, but is not deployed. | Pending migration source now requires the same canonical processed path; PGlite regression rejects original/cross-photo paths. No migration was applied. |

The opt-in Android QA fixture uses bundled synthetic BuffaGo images and an invalid local Supabase host. It does not use the ignored local sample containing a legacy original-image URL and cannot write production votes. The fixture is unavailable in release bundles.

## Security and production observations

The latest read-only linked-project inventory found 15 recovered submissions with derivatives: 14 currently approved and one failed. Two other photos are withdrawn. Recovery remains complete: 15 succeeded jobs, 45 receipts and zero incomplete jobs. `wing-submissions.public = false`. `wing_media_photo_votes` has RLS enabled with four own-user policies, no anonymous SELECT grant, and the composite primary key. The original photo-vote migration is registered; the stricter eligibility migration has zero ledger rows. The deployed `wing-public-gallery` function remains version 2. The legacy RPC still contains an original fallback, but anonymous/authenticated execution is revoked; its service-only use by the old handler still requires source review and replacement. No private path, signed URL, or credential was printed.

Local tests verify approved-only, consent, deleted/withdrawn owner, canonical derivative paths, no original-path signing, scoped 300-second URLs, client response fields, rejection of a mismatched full-photo submission, anonymous vote rejection, one vote per user/photo, vote toggle/switch/rollback, and persisted trigger counts. These local checks do **not** prove the deployed v2 function is private-safe. Its documented original fallback and different `include_covers`/`submission_id` contract remain a release blocker. See [production rollout](wingdex-photo-production-rollout.md) and [eligibility migration](wingdex-photo-vote-eligibility.md).

## Historical validation evidence

| Check | Result |
| --- | --- |
| Wingdex gallery/viewer/voting/server/PGlite/Deno tests | **69 passed, 0 failed, 0 skipped**, including actual Deno handler execution (log (historical evidence removed during cleanup)) |
| Python derivative integration | **20 passed** using local Python 3.12 with Pillow/requests (log (historical evidence removed during cleanup)) |
| TypeScript | Passed (log (historical evidence removed during cleanup)) |
| Lint | 0 errors, 95 existing warnings (log (historical evidence removed during cleanup)) |
| Full test directory | 673 tests: 669 passed, 2 skipped, 2 failed only in known migration-integrity baseline (log (historical evidence removed during cleanup)) |
| Android and iOS Hermes exports | Both passed (Android (historical evidence removed during cleanup), iOS (historical evidence removed during cleanup)) |
| Android native debug build | `:app:assembleDebug` passed; local build only (log (historical evidence removed during cleanup)) |
| iOS native build | Unavailable on this Windows host; the iOS JavaScript bundle check passed |

Android development-client smoke at 320dp/130% and 390dp/100% used the synthetic local gallery. At both sizes, the viewer opened, double tap zoomed, a zoomed pan retained photo 1, reset plus a horizontal swipe reached photo 2, X closed the viewer, Android Back closed the gallery, and Wingdex retained its list position. The current smoke did not inject a two-finger pinch; an earlier local viewer capture shows pinch zoom, but real Android and iOS device gestures still require manual verification. Android logs from the smoke show no BuffaGo fatal exception or ANR.

Native evidence: 320 gallery (historical evidence removed during cleanup), 320 viewer (historical evidence removed during cleanup), double-tap zoom (historical evidence removed during cleanup), zoomed pan (historical evidence removed during cleanup), second photo (historical evidence removed during cleanup), Wingdex return (historical evidence removed during cleanup), 390 viewer (historical evidence removed during cleanup). The separate Wingdex card cover shows an unavailable placeholder for the local Metro asset; gallery and viewer images load. Production HTTPS cover loading must be checked after the safe handler is deployed.

## Remaining release gates

1. Review the prepared function against exported deployed-v2 source or explicitly accept documented differences, including publishing status and original fallback. Deploy only under the separate rollout gate, then verify response compatibility, no original URL/path/metadata exposure, 300-second URLs, and private-bucket denial.
2. Review and apply the target-only local vote-eligibility migration in an authorized release procedure. Do not use broad `db push` or history repair. Verify RLS/grants, concurrent two-session recounts, and denial of votes on ineligible photos.
3. Use two authorized live accounts to test upvote, downvote, switch, remove, rapid taps, cross-account identity, persistence after refresh, cover ranking, withdrawal, and expired URLs without altering the recovered production photos.
4. Test real Android and iOS devices for pinch in/out, double tap, zoomed pan versus swipe, image failure/retry, safe areas, preview and viewer voting, and return position. Produce an iOS native build in a macOS environment. Verify Play signing separately before store release.

The two migration-integrity failures predate this pass and were not repaired by changing historical migrations. Other dirty workspace changes were preserved.

## Resumed consolidation and branch inventory

Both the gallery and UI overhaul are intentionally retained on `feat/wingdex-gallery-zoom-voting`; HEAD matches main and all working changes remain uncommitted. No UI overhaul source, asset, dependency or fixture was modified during this resumed consolidation.

| Ownership | Files retained |
| --- | --- |
| Gallery | `components/WingdexPhotoGallery.jsx`, `components/WingdexPhotoViewer.jsx`, `lib/wingdexGallery.js`, `lib/wingdexPhotos.js`, `types/wingdexPhotos.ts`, `supabase/functions/wing-public-gallery/index.ts`, the three `20261008*` photo migrations, `tests/wingdex-*`, derivative/recovery tests, `scripts/native-wingdex-gallery-qa.mjs`, photo recovery tooling and `docs/wingdex-photo-*` |
| Protected UI overhaul | Tab layout and Home/Journey/Leaderboards/Routes screens, profile history, ScreenHeader, WeeklyChallengeStats, BuffaverseOverview, WingCreatorSummaryCard, RoutePreview, OperationUI, platformMap, routePreview, ThemeProvider, operationTokens, metro config, design references, UI documentation, native visual scripts/fixtures/tests and both UI artifact directories |
| Shared | Both ratings routes, package manifests, mobile-runtime test helper, image-workflow integration tests and migration manifest; existing compatible changes retained |
| Unrelated/uncertain | Agents/Jalapeno work, growth-command-center work, `.gitattributes`, production safety backup and ignored local fixtures preserved |

The resumed work extends the existing PGlite test with representative catalog-reviewed RLS policies: cross-account reads/updates/deletes, forged ownership, duplicate upserts, anonymous role/JWT rejection, accurate counts and deletion after withdrawal. This is isolated verification, not certification of deployed RLS. Docker's engine and a local PostgreSQL server are unavailable, so real simultaneous sessions remain unverified.

Pagination and virtualization cover synthetic collections of 10, 50, 100 and 500 photos. Preview requests use thumbnails or the same approved processed derivative, full-screen requests use processed images, and only the selected full image renders. Server metadata/signing work still scales with the eligible collection to establish exact counts; this is not a benchmark of device memory or production latency. Expiration refresh, account changes, optimistic rollback and stale-response protection are automatically exercised; device rotation, gesture arbitration, real networking and UI visual correctness remain manual gates.

## Artifact cleanup ledger

Removed 301 conclusively reproducible/superseded generated files (113,321,994 bytes), after verifying paths and dependencies:

- All 49 files in each of `artifacts/wingdex-photos/export-android/`, `export-android-final/`, `export-android-recheck/`, `export-ios/`, `export-ios-final/` and `export-ios-recheck/`: 294 exported bundles/assets/maps, reproducible from source and unreferenced by retained documentation.
- Exactly seven obsolete root logs: `export-android-final.log`, `export-ios-final.log`, `focused-final.log`, `full-suite-final.log`, `lint-final.log`, `typecheck-final.log`, `wingdex-suite-final.log`. The retained recheck logs supersede them.

Retained 42 gallery evidence files: all 15 files in each `native-gallery/320-font1.3/` and `native-gallery/390-font1/`, plus `android-assemble-final.log`, `android-empty-card.png`, `android-empty-gallery.png`, `android-pinch.png`, `android-zoom.png`, `export-android-recheck.log`, `export-ios-recheck.log`, `focused-recheck.log`, `full-suite-recheck.log`, `lint-recheck.log`, `photo-derivative-python-final.log`, `typecheck-recheck.log`. Existing UI artifacts, ignored local sample fixture, unrelated backup/assets and uncertain files were preserved. Fresh export output under the system temporary directory was removed after successful builds. No application source or tracked file was deleted.

## Current checks and reproduction

The historical logs above record earlier executions; current results below are separate and do not overwrite retained evidence. The missing-Python failures were resolved by selecting the existing interpreter rather than rewriting tests:

```powershell
$env:WINGDEX_PYTHON = 'C:\Users\Brand\.venv\Scripts\python.exe'
$testFiles = Get-ChildItem -LiteralPath tests -Recurse -File | Where-Object { $_.Name -match '\.test\.(mjs|js)$' } | Select-Object -ExpandProperty FullName
node --test --experimental-default-type=module @testFiles
```

Python 3.12.10, Pillow 12.2.0 and requests 2.32.5 are available there. The remaining full-suite failures are the two historical migration-integrity gates: duplicate timestamp `20260729200000`, 24 checksum mismatches (20 line-ending-only, four content mismatches) and 17 older unmanifested files. Historical deployed migrations were not renamed, rewritten or rechecksummed. Detailed investigation remains in the protected UI release-readiness report and `artifacts/operation-ui-overhaul/migration-investigation.json`.

Fresh checks after artifact cleanup: full recursive suite **674 tests: 669 passed, 2 failed (historical migration integrity), 3 skipped**; focused gallery suite **90 tests: 89 passed, 0 failed, 1 skipped**. Deno is unavailable; the other two skips are existing legacy rate-limit copy tests. The focused suite requires the same `WINGDEX_PYTHON` environment variable. UI regression tests passed 31/31; authentication passed 24/24; typecheck passed; lint reported zero errors and 95 existing warnings. Android and iOS Hermes exports passed; Android `:app:assembleDebug` passed (608 tasks). iOS native compilation requires macOS. Current emulator/device testing was not rerun; earlier smoke evidence remains explicitly historical. Tracked security scanning passed, and a scoped credential-pattern scan of 47 untracked source/documentation files found no matches; unrelated confidential backups were preserved and excluded. Final diff whitespace checks passed, with no tracked deletions or conflict markers.

## Authorized release sequence and rollback

1. Review the pending migration and prepared handler against the deployed contract/source; separately authorize a target-only migration and backend deployment. Do not broadly push or repair historical migrations.
2. Apply only `20261008232910_wing_photo_vote_gallery_eligibility`; verify function definitions, RLS, grants, identity checks, two-session recounts and denial on ineligible photos in an isolated release test environment.
3. Deploy the prepared gallery handler. Verify approved/consented filtering, private Storage denial, no originals anywhere in responses, thumbnail/full-image selection, existing Android/iOS response fields, expired-URL refresh and pagination using authorized test data. Reconfirm bucket privacy. Never rerun recovery or modify recovered photos to create tests.
4. Verify two-account voting and Android/iOS physical-device behavior, then iOS native/signing and redesigned-screen navigation/visual smoke. Resolve or formally assess the historical migration-integrity gate before release approval.
5. If privacy or contract verification fails, disable gallery exposure and voting or deploy a reviewed fail-closed handler. Do not roll back to the unsafe v2 fallback, make the bucket public, undo recovery or remove eligibility enforcement. Retain reviewed prior safe artifacts and a database backup for an independently authorized rollback procedure.

**Release decision remains NO-GO:** local implementation is complete within available automated checks, but production handler/eligibility deployment, deployed privacy/contract checks, genuine multi-session voting, physical-device validation and iOS native build remain open. The full regression gate also reports historical migration drift.
