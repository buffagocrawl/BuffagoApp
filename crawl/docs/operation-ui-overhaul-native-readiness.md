# Operation UI Overhaul — Crawls and Android readiness

Cleanup status (2026-10-09): generated capture/log links have been retired. Artifact paths below are historical identifiers or regeneration output locations, not retained evidence. Conclusions remain recorded in [the consolidated audit](branch-consolidation-final-audit.md). Scripts, fixtures and application assets are preserved.

October 8, 2026. Branch: `operation-ui-overhaul`. **Release acceptance remains incomplete.**
This continuation changes Crawls only; the other four redesigns and unrelated working-tree changes are preserved.

## Crawls changes

- Restored the approved map-led recommendation composition: preview, title, actual stop count, transportation, honestly labelled distance to first stop, and circular View crawl action.
- The preview projects existing validated stop coordinates. Dashed segments show stop order, explicitly labelled “schematic, not road directions.” No road geometry, travel times, coordinates, restaurants, or total route distances were fabricated. Missing coordinates use a branded unavailable-preview fallback. No decorative native map SDK is mounted.
- Recommendations retain nearest-first eligible ordering and filters, require existing stops and a known first-stop distance, and exclude active/completed crawls. The featured route is removed from the list so it appears once. All eligible routes remain accessible through discovery/filter/map actions.
- Compact header, three visible discovery segments, retained transportation controls and Not started filter, existing 100-mile eligibility, distinct active/completed cards, bounded progress and full-width Resume action. No Saved functionality added.
- Create crawl opens the existing suggestion workflow, explicitly titled Suggest a Crawl with review notice; it does not promise immediate route creation.
- Fixed an existing details-open initialization crash. Transportation labels resolve against current tags to avoid stale enrichment results. Larger text can wrap the header actions and preview caption without obscuring content.
- Existing persistence/start/resume/review/map handlers are retained. No approval/media exposure path was added; route-photo thumbnails are omitted because no authorized route-image source is available.

## Visual evidence

Evidence root: `artifacts/operation-ui-overhaul/crawls-final/` (all paths below relative to `crawl/`).

Approved source: `design-references/2e60084a-21d6-4d45-bc98-bd41a6a481e4.png`, **left phone**.
The existing comparison script uses the documented app-interior crop `(37,57,488,1010)` with proportional resizing and no data/UI masking.

| Evidence | Path |
| --- | --- |
| Approved reference crop/aligned reference | `crawls-reference-crop.png`, `crawls-reference-aligned.png` |
| Final implementation | `screenshots/crawls-390-fixture.png` |
| All requested sizes | `screenshots/crawls-320-fixture.png`, `crawls-360-fixture.png`, `crawls-390-fixture.png`, `crawls-430-fixture.png` |
| 130% web text | `screenshots/crawls-320-font130-fixture.png` |
| Side-by-side / overlay / transparent current | `crawls-side-by-side.png`, `crawls-overlay.png`, `crawls-current-transparent.png` |
| Annotated difference / comparison | `crawls-annotated-difference.png`, `crawls-annotated-comparison.png` |
| Provenance and viewport contact sheet | `comparison-manifest.json`, `crawls-viewport-contact-sheet.png` |
| Final matrix and interaction supplement | `screenshots/visual-report-routes-all.json`, `screenshots/visual-report-routes-390.json` |
| Light theme | `light/crawls-390-fixture.png`, `light/visual-report-routes-390.json` |
| Five-tab evidence | `all-tabs/visual-report-all-390.json` |
| Independent review | `independent-qa.md` |

The four requested dimensions are 320×740, 360×800, 390×844 and 430×932. Final fixture captures have no horizontal overflow or startup errors. Resume center hit-testing passes at every width, including the small-screen enlarged-text pass. The 390 interaction supplement opens recommendation details, verifies active/completed filtering, clicks Resume, reaches `/crawl/visual-active`, and confirms selected-route storage with three ordered stops. All five browser tabs navigate successfully.

Independent QA reviewed all final matrix images, light theme, source and comparisons. The major missing recommendation composition is resolved; no additional blocking Crawls issue was found after correction. Remaining differences are moderate: schematic grid instead of roads, absent authorized photo strips, extra preserved transport controls, card density/height, typography and badges. **No 1:1 or pixel-perfect fidelity claim.** These are intercepted synthetic fixtures, not actual restaurant/transaction evidence; 130% CSS text is not native Android font-scale validation. Blank captures from an intermediate save were replaced and are excluded from final evidence.

## Android compatibility and configuration

Expo SDK 54 (`expo` 54.0.37), React Native 0.81.5, Network 8.0.8, Video 3.0.16, Router 6.0.24 and development client 6.0.21 are installed. `expo install --check` passes. **No dependency upgrades or package/config changes were required.**

A local x86_64 debug APK built successfully (572 Gradle tasks; first build 7m50s), then rebuilt with `NODE_ENV=development`. Generated autolinking explicitly includes `NetworkModule` and `VideoModule`. Installed APK: `android/app/build/outputs/apk/debug/app-debug.apk`. This resolves the old binary's missing-module incompatibility for this emulator; it is not a release binary.

The ignored native directory remains stale in configuration (versionName 1.0.3 versus app config 1.0.5) and lacks Google Maps metadata. Android package remains `com.buffago.app`. App config reads the key exclusively through `EXPO_PUBLIC_GOOGLE_ANDROID_API_KEY` and rejects an EAS Android build without it. The key is absent locally. A suppressed, read-only project-scope EAS development-variable check found none of the Maps/Supabase variable names; account-scope values remain unverified. No secret values were printed or hardcoded.

`development` is the existing internal-distribution development-client profile using the development EAS environment. Local development/production Supabase files point to the same target, so isolation for testing is **not established**. Treat that target as production read-only. Local anon JWT metadata is plausible, but remote acceptance and safe authenticated testing are unverified. No live backend writes, real transactions, or authentication mutation were attempted.

Details: `android-readiness.md`, `android-local-build.log` and native artifacts under the evidence root.

## Native tests

Medium_Phone_API_36.1 booted; freshly built APK installed; native Android bundle loaded and reached unauthenticated onboarding without Network/Video import failures. Initial session hydration returned no session and no error. Sign In tab, email keyboard display/dismissal and background/resume smoke checks passed without submitting credentials. Actual screenshots: `android-native-startup.png`, `android-native-keyboard.png`, `android-native-resume.png` (with XML). ADB reverse/127.0.0.1 initially timed out; emulator host `10.0.2.2:8082` successfully connected to Metro.

Authenticated five-tab access and both Crawls/Wingdex native Maps remain **unverified**. Missing Maps key and lack of an isolated authenticated test session are external blockers. Browser map fallback tests do not count as native Maps verification. Still required: valid/invalid coordinates; missing-key UI; permissions allowed/denied; location services off; map close/reopen and background/resume; five-tab safe areas/gesture bar, keyboards/modals, small screens, native large text and light/dark themes. Physical Android and iOS validation remain outstanding. See the Android evidence report for any limited unauthenticated keyboard/background smoke results; those do not establish protected-screen acceptance.

## Automated regression

| Check | Final result |
| --- | --- |
| Recursive Node suite | **581 tests: 577 pass, 2 unchanged baseline migration failures, 2 existing skips**; `node-tests.log` |
| New preview/details tests | 4/4 pass, included above; eligibility/coordinate edge cases and actual opened-details hook render |
| TypeScript | Passed; `typecheck.log` |
| ESLint | 0 errors, 95 existing warnings; `eslint.log` |
| Quick rating | Passed; `quick-rating.log` |
| Browser visual/UI harness | Matrix, light390, all five tabs and Crawl interaction supplement pass |
| Diff and harness compilation | Passed; `diff-check.log`; Python scripts compile |
| Database runtime harness | Blocked: missing `supabase/contracts/buffago-baseline-v1.json`; `database-harness.log` |

Existing suite coverage includes crawl creation/resume/persistence/completion, route/map safety, rating eligibility, coins, XP/mission progress, approved galleries, historical attachment, and auth/session races. Fixture/runtime/source contracts do **not** prove successful live coins/ratings/rewards, completion persistence against the backend, live session renewal, photo upload/finalization or approval/expiration/privacy behavior. Those remain unverified. No tests were deleted or weakened.

## Migration baseline and remaining blockers

Unchanged: 24 checksum mismatches, one duplicate timestamp `20260729200000`, and 17 unmanifested migrations. Both known integrity-test failures persist; two skips remain legacy rate-limit-copy tests. Migration inputs, manifest hashes, checker and reconciliation tests have no diff from HEAD. No migration repair was attempted. Deployment-ledger/applied-byte evidence is still required separately. Counts: `migration-counts.json`; checker output: `migration-integrity.log`.

Release blockers: properly keyed/current native configuration; authenticated native Maps/layout matrix; isolated live auth/transaction/photo/privacy acceptance; unchanged migration integrity; missing authoritative baseline database contract. The safe local work is complete through these external boundaries; production readiness is not claimed.

## Exact next build commands

Run from `C:\Users\Brand\repo\BuffagoApp\crawl`, after privately supplying the restricted Android Maps key and configuring/confirming an isolated Supabase test target. Do not paste secrets into logs.

```powershell
$env:NODE_ENV = 'development'
$env:EAS_BUILD_PLATFORM = 'android'
npx expo prebuild --platform android --no-install
npx expo run:android --variant debug --device
npx expo start --dev-client --port 8082 --max-workers 2
```

Review generated native changes; preserve local native edits and avoid `--clean`. Existing native directory local compile command, already executed for this emulator:

```powershell
$env:NODE_ENV = 'development'
Set-Location android
.\gradlew.bat :app:assembleDebug -PreactNativeArchitectures=x86_64 --console=plain
```

Use the installed Android Studio JBR 21 via `JAVA_HOME`; SDK/build tools 36 and NDK 27.1.12297006 are present. The generated APK is x86_64-specific; an arm64 device requires `-PreactNativeArchitectures=arm64-v8a`.

External alternative, **not authorized or executed**:

```powershell
eas build --platform android --profile development
```

That command needs the EAS development Maps/Supabase environment and separate explicit external-build approval. No Play upload or deployment is needed for the local emulator build.

## Authorization record

**No commit, push, merge, deployment, Google Play upload, or EAS/cloud build submission occurred.** The only build performed was a local development APK installed on the local emulator. No new branch was created. Unrelated working-tree changes were preserved.
