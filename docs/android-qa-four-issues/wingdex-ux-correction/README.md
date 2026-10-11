# Wingdex visual review

Branch: fix/android-qa-four-issues. This revision changes only Wingdex browsing and its focused QA assets; the other three fixes and backend SQL remain untouched.

The first card starts about 209?223 dp from the top at the narrowest size, with approved community wings, restaurant identity, score, distance, photo count and rating action visible immediately. The toolbar shows active filter count, current sort and Wing Jury. The modal preserves all prior controls and wraps them within a vertically scrollable area. Cards without photos remain compact and expose Add a photo; no synthetic food imagery is used.

These are actual Android API 36.1 emulator captures of the installed development client, using isolated fixture accounts/results and one read-only approved public photo sample associated with its actual restaurant. Scores and balances are QA fixtures. They are not Samsung production screenshots. No new AAB was built.

## Screenshots

| Width | Default 1? | Filters 1? | Default 1.3? | Filters 1.3? | No photo 1.3? |
|---|---|---|---|---|---|
| 360 dp | [View](default-360dp-font1.png) | [View](filters-360dp-font1.png) | [View](default-360dp-font1.3.png) | [View](filters-360dp-font1.3.png) | [View](without-photo-360dp-font1.3.png) |
| 390 dp | [View](default-390dp-font1.png) | [View](filters-390dp-font1.png) | [View](default-390dp-font1.3.png) | [View](filters-390dp-font1.3.png) | [View](without-photo-390dp-font1.3.png) |
| 412 dp | [View](default-412dp-font1.png) | [View](filters-412dp-font1.png) | [View](default-412dp-font1.3.png) | [View](filters-412dp-font1.3.png) | Covered by card layout checks |
| 430 dp | [View](default-430dp-font1.png) | [View](filters-430dp-font1.png) | [View](default-430dp-font1.3.png) | [View](filters-430dp-font1.3.png) | [View](without-photo-430dp-font1.3.png) |

## Verification

- Typecheck passed.
- 37 focused regression tests passed (3 QA UI assertions plus 34 rating/photo viewer/voting regressions).
- Targeted lint: zero errors; 11 existing warnings in Wingdex (fewer than before the correction).
- Screenshot/UI matrix: 360, 390, 412 and 430 dp at 1? and 1.3?; see verification.json.
- Native behavior checks: six distances, four sorts, My ratings, current state, All, chosen state, persistent selections after dismissal, Android Back, Wing Jury route/back and five tabs; see behavior-verification.json.
- No backend changes, commits, pushes, merges, deployment or builds.

## Changed files for this correction

- crawl/app/(tabs)/ratings/index.jsx
- crawl/tests/android-qa-ui.test.mjs
- crawl/scripts/wingdex-discovery-capture.mjs
- crawl/scripts/wingdex-discovery-behavior.mjs
- docs/android-qa-four-issues/REPORT.md and this review folder

Run captures with the existing native visual fixture configuration, Wing Jury enabled and BUFFAGO_NATIVE_VISUAL_PHOTO=1 after refreshing the read-only approved sample. Run the matrix capture before the behavior capture; both operate only on the local emulator and fixture backend.

Visual review approved by the owner. Production Android build and internal-track submission authorized. Backend coin changes already applied independently; never rerun the SQL for this release.
