# BuffaGo Visual Polish V2 completion

Cleanup status (2026-10-09): generated capture/log links have been retired. Artifact paths below are historical identifiers or regeneration output locations, not retained evidence. Conclusions remain recorded in [the consolidated audit](branch-consolidation-final-audit.md). Scripts, fixtures and application assets are preserved.

2026-10-08. Final acceptance and test totals follow below after the last recaptures.

Continued the existing implementation. The previous FAIL report is preserved in [prior report](audit-history/visual-polish-prior-report-20261008.md). All original native captures were inspected before edits. The actual checkout is `feature/wingdex-photo-voting`, rather than the requested `operation-ui-overhaul`; no branch switch, commit, push, deployment or EAS build was performed. Other pre-existing/concurrent work was preserved.

## Defect register

| Original defect / native QA finding | Component and root cause | Fix | Native before / after |
| --- | --- | --- | --- |
| Crawls filter/create clipping | `routes/index.jsx`, shared `SelectionChip`: fixed button height and Paper Chip intrinsic sizing inside horizontal rails | Minimum-height action, scalable segment padding, accessible intrinsic Pressable chips; retain horizontal rail and fade/chevron | Before (historical evidence removed during cleanup), 320dp/130% (historical evidence removed during cleanup), scrolled (historical evidence removed during cleanup) |
| Wingdex header/search/controls | `ratings/index.jsx`, `SelectionChip`: fixed search height, nonwrapping header, constrained chip measurements | Scale-aware search minimum height, wrapping header, intrinsic chips. Retain top inset and accessible compact 44dp map action | Before (historical evidence removed during cleanup), after (historical evidence removed during cleanup) |
| Social navigation/geographic overflow | `leaderboards/index.jsx`, `FilterChips`: constrained chip measurements | Complete labels in horizontal scroll with indicator and explicit swipe cue; Feed/Leaderboard/Friends accessible; selected state retained | Before (historical evidence removed during cleanup), feed (historical evidence removed during cleanup), scrolled (historical evidence removed during cleanup) |
| Oversized text-only Social media areas | Social rendered `WingShotImage` without approved media | Render image only when approved URI exists; text-first cards stay compact | Same Social captures |
| Journey sign-in clips | `journey/index.jsx`: centered child sizing without a stretch/scroll container | Full-width button, wrapping centered copy in flex-growing ScrollView; top inset once | Before (historical evidence removed during cleanup), native after (historical evidence removed during cleanup) |
| Profile statistics wrap numbers | `profile/history/index.jsx`: 20% basis / 64dp minimum | 45% basis / 120dp minimum; wrapping rows. Labels wrap while numbers stay together | profile (historical evidence removed during cleanup), statistics/creator (historical evidence removed during cleanup) |
| Home actions truncate at 360dp/130% | `home/index.jsx`: two constrained buttons per row | Stack below 360dp or above 115% font scale; dominant rating CTA and existing picker preserved | Home scrolled (historical evidence removed during cleanup) |
| Home bottom gap/double inset | Home bottom safe area plus tab height despite navigator-reserved space | Top/left/right safe area, 16dp content bottom padding; navigator owns bottom inset | Home scrolled captures and layout-contract tests |
| Photos obscure titles/controls | Absolute image overlays on Home/Wingdex | Approved images followed by text/controls in normal flow; cover at 16:9. Clear shared 72dp image height on Home | Home approved (historical evidence removed during cleanup), Wingdex approved (historical evidence removed during cleanup) |
| No-photo restaurants reserve image space | Fixed Home placeholder and empty Wingdex image surface | Compact first-Wing-Shot invitation using existing eligible rating/attachment flow | Home empty (historical evidence removed during cleanup), Wingdex no-photo captures |
| Failed photos reserve tall space | Shared `WingShotImage` inherits image geometry | Compact unavailable feedback clears height/aspect ratio | Component and failure regression checks; no live failure injection |
| Mission trophy overlaps enlarged title; address ellipsizes | Home absolute trophy/fixed title offset and two-line address cap | Trophy in normal flow, remove offset and address line cap | Final Home 130% captures |

No functional label was shortened with ellipses or reduced fonts to hide overflow. Rails intentionally show part of the next option at the viewport edge; scrolling exposes it fully. Partially visible adjacent cards in vertical screenshots remain reachable by scrolling. Empty list space is unused viewport space, not a reserved image panel.

## Home functionality and media

Nearby discovery and location/selection logic remain intact. Find Wings opens the existing four-step destination picker. Rate this spot remains dominant; restaurant details remain accessible with and without photos. The existing directions icon provides external map access, and Wingdex Map is one tab away. Separate legacy shortcut buttons were not restored.

The approved native variant uses a genuine approved public-gallery image for J Timothy's Tavern, retaining the endpoint's restaurant association and coordinates. Other ratings/profile data in these screenshots are synthetic. The sample was obtained through read-only public restaurant/gallery requests. Signed URLs remain in an ignored local JSON file and are not printed.

Home/Wingdex retain `loadWingdexRestaurantGallery` and the existing approved-photo/processed-asset boundary. Zero-photo fixtures return zero images. No stock, pending or rejected image is used. Existing approval, gallery, rating and photo checks exercise eligibility. Contribution CTAs use existing rating or historical attachment paths; no new upload endpoint, authorization bypass or calculation change. Fixture rendering does not prove live upload, moderation, RLS or rating completion.

## Native environment and matrix

Existing `Medium_Phone_API_36.1`, emulator-5554, Android 16/API 36; `com.buffago.app` Expo development client, local Metro port 8081 through adb reverse. The original APK lacked Android Maps metadata and crashed when Map opened despite the runtime flag being configured. Local Android prebuild and Gradle `assembleDebug` succeeded in 1m21s; the development APK was installed with adb, preserving app data. This was a local build, not EAS. After an emulator OpenGL failure, final navigation checks used headless SwiftShader graphics. PNGs are actual Android screencaps, not browser images.

| Width | Framebuffer at 480dpi | Font scale | Coverage |
| --- | --- | --- | --- |
| 320dp | 960×2220 | 1.0 and 1.3 | Five tabs, Home top/scrolled, filters, profile/statistics/creator, signed-out Journey |
| 360dp | 1080×2400 | 1.0 and 1.3 | Same |
| 390dp | 1170×2532 | 1.0 and 1.3 | Same |
| 430dp | 1290×2796 | 1.0 and 1.3 | Same |

Restarted the app after density/font changes. Approved-photo variants additionally cover 320dp/130% and 390dp/100%. Radius 5/25/50 miles was selected and checked in native accessibility state at all widths with 130% text; approved-photo runs also cover 390dp/100%. Horizontal swipes expose complete filters. Long restaurant names, five-digit wing counts and creator reputation were exercised. Bottom navigation remains above the Android gesture area.

Required evidence is under completion (historical evidence removed during cleanup). Filenames encode width, font scale, state and `fixture`. Approved variants are under `approved/`; true signed-out captures under `sign-in/`. Capture names include `home-top-no-photo`, `home-scrolled`, `crawls`, `crawls-filters-scrolled`, `wingdex-5mi-no-photo`, `wingdex-25mi`, `wingdex-50mi`, `social-feed`, `social-filters`, `journey-profile`, `journey-statistics`, and `journey-creator-challenges`. Full PNGs are evidence; contact sheets aid review. Failed/loading captures were recaptured rather than accepted.

Original Android captures and new fixture captures differ in data/session/configuration; before/after links are not claimed to be pixel-matched comparisons. Native inspection found additional action, aspect-ratio and icon defects, which were corrected and recaptured.

## Authentication and integration blockers

**BLOCKED — live authenticated QA.** Development and production configuration reference the same Supabase project. No isolated project/authorized account was found. No user was created and no credentials printed. Unblock with a distinct development project, an explicitly authorized test account, seeded restaurant/rating/media states and permission for scoped nonproduction interactions.

**FIXTURE PASS — authenticated presentation.** Opt-in `BUFFAGO_NATIVE_VISUAL_QA=1` substitutes an isolated client/location provider through Metro. The client uses a `.invalid` host, in-memory session storage and deterministic rows. Table writes, unsupported RPC mutations and live hosts are rejected. Module and release-bundle guards prevent production authentication bypass. Isolation tests pass. Normal signed-out captures have fixture substitution disabled. These results do not prove live Supabase authentication or end-to-end photo submission.

**PASS — Google Maps tiles on the existing Android development APK.** After the Google Cloud restriction update, the 2026-10-08 native retest rendered real Google tiles in both map dialogs. The earlier blank-tile diagnosis below is retained as historical context and is superseded by the retest results.

### Android Maps authorization investigation (2026-10-08)

The installed `com.buffago.app` APK is byte-for-byte identical to `android/app/build/outputs/apk/debug/app-debug.apk`. `apksigner` reports its signing SHA-1 as **`5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25`**. The native Gradle debug signing config uses `android/app/debug.keystore`; the separate user-level `~/.android/debug.keystore` has a different SHA-1 and must not be registered for this installed build. Both Gradle namespace/application ID and the installed package are `com.buffago.app`.

The generated native manifest contains nonempty `com.google.android.geo.API_KEY` metadata. Its value equals the current local `EXPO_PUBLIC_GOOGLE_ANDROID_API_KEY` and the key identified by the SDK log (values withheld). It is not the legacy `EXPO_PUBLIC_GOOGLE_API_KEY`. The log reports `Error requesting API token. StatusCode=INVALID_ARGUMENT`, followed by `Authorization failure`, asks to enable Maps SDK for Android, and identifies the required Android application as `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25;com.buffago.app`. This proves the SDK reached authorization with an injected key; it does not prove which Cloud setting rejected the request. A missing/mismatched Android application restriction is a likely cause, while Maps SDK enablement, API restrictions, key/project validity and billing remain possible until the key's Google Cloud project is inspected.

In Google Cloud Console, find the project that owns the key currently set in `.env.local`. Confirm billing is enabled and **Maps SDK for Android** is enabled. In **APIs & Services → Credentials**, open that key and set **Application restrictions → Android apps** with package `com.buffago.app` and SHA-1 `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25`. Set **API restrictions → Restrict key** and allow **Maps SDK for Android**. If the existing key cannot be made suitable, create a separate restricted Android Maps key in that project, place it privately in local `.env.local` as `EXPO_PUBLIC_GOOGLE_ANDROID_API_KEY`, and rebuild/reinstall the development APK so the manifest picks it up. If only restrictions/API/billing on the already injected key change, allow for propagation and retest the installed APK before rebuilding. Do not use the legacy Directions key for native Maps.

For Google Play Internal Testing, register the **Play app signing certificate SHA-1** for `com.buffago.app` on the key used by the EAS `production` environment. Retrieve that fingerprint from **Play Console → Test and release → App integrity → App signing** (the Play-signed APK's certificate, not the upload certificate). It was not available locally, so no Play fingerprint is asserted here. The EAS `production` environment also needs `EXPO_PUBLIC_GOOGLE_ANDROID_API_KEY`; `development` needs its own value for EAS development builds. No Android source or signing change is indicated by current evidence.

At the time of the initial investigation, local Maps did not work. Google Cloud settings cannot be directly inspected from this checkout. The retest below confirms effective SDK tile access on the installed build. Fixture captures still do not establish live Supabase authentication; that remains blocked on an isolated test environment.

### Native Google Maps and five-tab retest (2026-10-08)

**MAPS PASS.** Retested the existing `com.buffago.app` development APK on `Medium_Phone_API_36.1` at 320dp and 130% font scale, using the isolated native visual fixture through Metro. No rebuild, branch switch, commit, push or deployment was performed. Both native maps showed actual Google street, building and label tiles, plus the Google watermark. These were inspected visually, rather than inferred from a visible map container.

| Flow | Open | Pan | Zoom | Return |
| --- | --- | --- | --- | --- |
| Wingdex → Map | Tiles (historical evidence removed during cleanup) | Moved streets and markers (historical evidence removed during cleanup) | Double-tap zoom (historical evidence removed during cleanup) | Reopened after leaving the tab (historical evidence removed during cleanup) |
| Crawls → Map | Tiles (historical evidence removed during cleanup) | Moved streets and markers (historical evidence removed during cleanup) | Double-tap zoom (historical evidence removed during cleanup) | Reopened after leaving the tab (historical evidence removed during cleanup) |

The interrupted five-tab navigation pass was completed with native screenshots after each tab's fixture content loaded: Home (historical evidence removed during cleanup), Crawls (historical evidence removed during cleanup), Wingdex (historical evidence removed during cleanup), Social (historical evidence removed during cleanup), and Journey (historical evidence removed during cleanup). The primary content, text and bottom navigation were visible without clipping or overlap in these five screen captures. Adjacent horizontal filter choices are intentionally partially visible and reachable by swiping, as described above.

**Historical native layout defect, closed below:** At 320dp/130%, Wingdex's Restaurants Map dialog was taller than the available area. Its `Close` label overlaid the bottom navigation, and Android accessibility reported a `Close` button with bounds `[655,2046][849,2044]` (zero/negative height). Touching that footer did not reliably dismiss the dialog; Android Back did. Before screenshot (historical evidence removed during cleanup).

Filtered Android log findings (historical evidence removed during cleanup): MapsInitializer loaded the latest renderer; there were no Maps SDK authorization failures, API-token failures, or post-map app crashes in the captured log. Startup before Metro had cached the development bundle produced a socket timeout, ANRs and an Expo dev-launcher `NullPointerException` after its error screen was tapped. Restarting Metro with two workers and prewarming the bundle resolved startup; all map and five-tab checks then ran in the same installed APK. An `INVALID_ARGUMENT` warning from `GmsWeatherProviderContr` persists in Google Play services; its tag and the successfully rendered Maps tiles indicate it is unrelated to the Maps SDK tile requests. The broader `native-visual-qa.mjs 320 1.3` script stopped at its 25-mile control assertion; the focused five-tab capture completed. The earlier matrix's radius captures were not rerun in this retest.

### Final native defect closure (2026-10-09)

**Wingdex map Close: PASS. Radius filters: PASS.** The map dialog sizes its canvas against viewport height, safe-area insets and font scale, reserving room for its title, legend, actions and bottom navigation. The Close button's Android touch node is at least 44dp high. At 320dp/130%, native bounds measure Close at 194×132px, dialog bottom at 1877px and tab bar top at 1975px. At 320dp/100%, Close is 157×132px and the dialog bottom is 1949px, before the 1975px tab bar. Android Back, pan, zoom and marker interactions remain usable. Real Google tiles are visible in the new captures.

The 25-mile script stop was automation readiness and selector timing, not a radius calculation defect. The corrected script waits for Wingdex content and selected state, accepts positive native bounds, and scrolls the radius rail when needed. An opt-in in-memory QA fixture adds restaurants at 8, 18 and 38 miles without touching Supabase production. In every requested configuration, 5 miles showed none of these three, 10 showed 8, 25 showed 8+18, and 50 showed all three. The original `native-visual-qa.mjs 320 1.3` completed after the correction.

| Native setting | Map and Close | Radius result |
| --- | --- | --- |
| 320dp / 100% | open (historical evidence removed during cleanup), pan (historical evidence removed during cleanup), zoom (historical evidence removed during cleanup), closed (historical evidence removed during cleanup) | result (historical evidence removed during cleanup) |
| 320dp / 130% | open (historical evidence removed during cleanup), pan (historical evidence removed during cleanup), zoom (historical evidence removed during cleanup), closed (historical evidence removed during cleanup) | result (historical evidence removed during cleanup) |
| 360dp / 100% | open (historical evidence removed during cleanup) | result (historical evidence removed during cleanup) |
| 390dp / 100% | open (historical evidence removed during cleanup) | result (historical evidence removed during cleanup) |
| 430dp / 100% | open (historical evidence removed during cleanup) | result (historical evidence removed during cleanup) |

Each configuration also has native radius screenshots and Home, Crawls, Wingdex, Social and Journey captures. Visual review found no new status-bar or bottom-bar overlap in the five-tab screens. Current Android logs have zero Maps authorization failures, token failures, BuffaGo fatal exceptions or BuffaGo ANRs. TypeScript passed; lint had zero errors and 95 existing warnings; 36 relevant UI tests passed. The full test directory still has two known migration-integrity failures. Live authenticated QA and Play signing remain unverified; this is not release approval.

## Automated checks

Latest totals and acceptance are appended after final review. Logs: `artifacts/visual-polish-v2/typecheck-completion.log`, `lint-completion.log`, `focused-regression-completion.log`, `full-suite-completion.log`.

## Files changed by this continuation

- `components/ui/OperationUI.jsx`
- `app/(tabs)/home/index.jsx`, `ratings/index.jsx`, `routes/index.jsx`, `leaderboards/index.jsx`, `journey/index.jsx`
- `app/profile/history/index.jsx`
- `tests/home/quick-actions-home.test.js`, `weekly-mission-home-surface.test.js`; `tests/operation-ui-overhaul.test.mjs`, `native-visual-fixture.test.mjs`
- `metro.config.js`; `tests/fixtures/native-visual/` isolated client, location provider, approved sample module and local ignore rule
- `scripts/native-visual-qa.mjs`, `native-visual-sign-in.mjs`, `native-visual-interactions.mjs`, `native-visual-approved-photo.mjs`, `native-visual-contact-sheet.mjs`
- This report and `artifacts/visual-polish-v2/` screenshots/logs.

Other pre-existing/concurrent changes are outside this continuation. No backend contract or database migration was changed by this work. This pass is not production release approval.
