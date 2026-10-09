# Operation UI Overhaul — final visual and regression audit

Cleanup status (2026-10-09): generated capture/log links have been retired. Artifact paths below are historical identifiers or regeneration output locations, not retained evidence. Conclusions remain recorded in [the consolidated audit](branch-consolidation-final-audit.md). Scripts, fixtures and application assets are preserved.

Audit date: October 8, 2026. Branch: `operation-ui-overhaul`.
**Verdict: NOT READY for release acceptance.** The implementation is closer to
the approved mockups after corrections, but significant visual differences and
required native/live checks remain. No 95%, pixel-perfect, or 1:1 claim is made.
Nothing was committed, pushed, merged, deployed, or moved to another branch.
Unrelated growth-command-center and root changes were preserved.

## Reference establishment

The following requested files were confirmed and read at their actual paths:

- `crawl/docs/operation-ui-overhaul.md`
- `crawl/docs/operation-ui-overhaul-qa.md`
- `crawl/docs/operation-ui-overhaul-release-readiness.md`
- `crawl/artifacts/operation-ui-overhaul/screenshots/visual-report.json`

All five approved designs are available. These are redesign mockups, not old app
screenshots. The Home and Wingdex references are the bottom **winner** phones,
not the tournament's semifinal alternatives. Crawls, Social, and Journey are the
left, middle, and right phones in the triptych. The triptych also has `(1)` and
`(2)` copies; the canonical filename below is used for comparisons.

Paths below are relative to `crawl/`. `A` means
`artifacts/operation-ui-overhaul/final-audit/`.

| Screen / approved design | Actual approved source | Extracted reference | Current 390×844 implementation |
| --- | --- | --- | --- |
| Home / Progress + Discovery | `design-references/8afd3fb8-1eda-4186-9dd0-054c410ac873.png` | `A/home-reference-crop.png` | `A/screenshots/home-390-fixture.png` |
| Crawls / Route Explorer | `design-references/2e60084a-21d6-4d45-bc98-bd41a6a481e4.png`, left | `A/crawls-reference-crop.png` | `A/screenshots/crawls-390-fixture.png` |
| Wingdex / Compact Cards + Map | `design-references/d2f0653a-f830-452b-8836-8fe848e2a09f.png` | `A/wingdex-reference-crop.png` | `A/screenshots/wingdex-390-fixture.png` |
| Social / Wing Feed | canonical triptych above, middle | `A/social-reference-crop.png` | `A/screenshots/social-390-fixture.png` |
| Journey / Player Profile | canonical triptych above, right | `A/journey-reference-crop.png` | `A/screenshots/journey-390-fixture.png` |

## Comparison method and evidence

`scripts/operation-ui-final-comparison.py` produces a reproducible set per screen:
`<screen>-reference-crop.png`, `-reference-aligned.png`, `-current-aligned.png`,
`-current-transparent.png` (50% alpha), `-overlay.png` (50/50 composite),
`-difference.png`, `-side-by-side.png`, `-annotated-comparison.png`, and
`-annotated-difference.png`. All are under `A`. The annotations identify remaining
composition differences; original pixels are retained in the separate raw images.

`A/comparison-manifest.json` records source/capture hashes, original dimensions,
exact crop rectangles, proportional dimensions, and diagnostic RGB absolute error.
Only tournament artwork, external phone framing, and status chrome are cropped.
References are resized proportionally to 390px width and top aligned. Different
reference aspect ratios require explicitly visible bottom padding; diagnostic
pixel error excludes only that artificial padding. No UI, data, imagery, or
typography mismatch is masked. In particular, Wingdex's winner is a much shorter,
lower-resolution phone rendering than the test viewport. Pixel error is not a
fidelity score and has no acceptance threshold.

Fixtures use synthetic accounts, restaurants, coins, scores, crawls, and missions.
Every configured Supabase request is intercepted; no real sign-in or backend write
is established. The approved-photo variant returns a synthetic moderated gallery
response and serves a local crop from the supplied Home mockup, at a reserved
`.invalid` host. Its source rectangle is documented in each visual JSON report.
It exercises the image rendering path without inventing production photos or
changing application assets. Low-resolution reference imagery and different
fixture data remain visible in the comparisons. Actual signed URLs, moderation
authorization, and uploads still need live validation.

The Browser runtime was initialized and its troubleshooting procedure followed;
it listed no available browsers. The existing Python Playwright harness was used
for local fixture checks. This is browser evidence, not Android/iOS verification.

## Five-screen visual comparison matrix

| Screen | Composition and fidelity assessment | Corrections in this audit | Remaining discrepancies |
| --- | --- | --- | --- |
| Home | Recognizable Progress + Discovery hierarchy; final compact pass brings mission/facts into the 390×844 viewport. Still partial fidelity, not accepted as parity. | Compact level/title/XP/reward with an expanded 44px title target; compact counters with icons; orange discovery CTA; nearby label inside featured card; restaurant metadata over the image; compact side-by-side mission/facts; light-theme text contrast. | No greeting/avatar-led header; existing social/help utilities differ; featured score badge/photo count and favorite ornament differ; retained friend/directions/rate/swap actions add height; small/large-text viewports still scroll; orange XP rather than reference green; facts preview text absent. |
| Crawls | **Major structural difference remains:** no map-led recommended-route card or illustrated route rows. | Orange selection states; amber/orange active and green completed backgrounds; orange active badge; previous bounded progress fix retained. | Recommended item duplicates the active list item; no route map/photo composition; chip filters instead of reference segments; recommendation title and header hierarchy differ; no reference Saved/header Create Crawl controls; progress/resume width differs; completed-date/photo strip absent. Existing route suggestion and detail actions remain available. |
| Wingdex | Wide image-backed compact cards are closer to the approved winner; partial fidelity. | Replaced small left thumbnail with approved-photo backdrop; readable theme-aware scrim; photo/coin/detail actions retained; selected controls orange; metadata and score contrast corrected for light theme. | Search/filter header is taller; reference rank/favorite ornaments absent; score remains inline instead of a side badge; rating count/photo layout differs; extra radius/state/my-rating options require intentional horizontal scrolling; no static map panel in the winning reference or implementation (both have map access). |
| Social | Photo-led composition corrected; remaining moderate hierarchy differences. | Full-width Wing Shot panels; orange selected scopes; original identity/profile, score, restaurant and rating navigation retained; restaurant-image attribution explicit. | Header subtitle/utilities differ; controls are pills rather than segments; scope/latest heading takes extra space; score is in header rather than over photo; cards contain more identity spacing. Reference likes/comments/bookmarks intentionally absent: no fake engagement or unsupported actions added. |
| Journey | Four real personal metrics now precede Creator/challenges; hierarchy is much closer, with moderate density differences. | Compact progression; highest individual score, average score, distinct spots and total wings; missing scores excluded and zero preserved; redundant visible YTD heading removed while year remains accessible; compact Creator padding. | Header wording/settings, player shield/reward icon, YTD icons/change deltas, period/location stat controls, Creator thumbnail strip, and weekly-challenge composition differ. Rating-history access and full existing detailed statistics remain and add scrolling; challenge summary begins near the bottom at 844px. No synthetic deltas or owner-media strip was added. |

Across screens, 16px gutters, shared near-black surfaces, orange actions, 16px
cards, bounded progress bars and fixed bottom navigation are consistent. Font
family/weight/line-height, header scale, button shape, score placement, border
tones, photo treatment and visible density still differ from the raster mockups.
Actual fixture photos exercise cover cropping; fallback captures retain honest
no-approved-photo placeholders. Horizontal chip scrolling and vertical content
scrolling are intentional. No claim of native safe-area or Dynamic Type fidelity
is made from web screenshots.

## Corrections and iterative checks

The direct mockup comparison identified taller progression, thumbnail-led Social,
buried Journey statistics, non-orange selected controls, card/background drift,
and poor light contrast. These were corrected without replacing business handlers.
The new Journey summary initially used highest restaurant average for a label
reading Highest rating; independent QA caught this. It now uses the maximum finite
individual `weight_score`. Existing destination-average details are unchanged.

Fresh browser captures caught two intermediate correction mistakes: a narrow Home
mission-copy column and an undefined Wingdex `theme` reference. The mission copy
now gets full available card width; Wingdex uses its existing `dark` binding.
Both were fixed and recaptured. Exact Home layout assertions were updated to the
new spacing/card dimensions; handler, eligibility, disabled/loading, accessibility,
safe-area, and authorization assertions were preserved. A new executable summary
regression covers individual versus destination averages, missing scores and zero.

The last density review keeps Home counters in one row at 320px using 84px minimum
widths, while content remains scalable. The discovery copy is shortened to
"Find wings" to avoid a truncated primary CTA on compact phones; its destination
and action are unchanged. A city already present in the supplied street address is
no longer appended again. Expanded title touch targets and compact mission text
bring the 390px Home mission/facts row entirely above navigation. Avatar initials
may ellipsize in the aggressive CSS text-scaling probe; the full username/profile
action remains visible and accessible. Native scaling still requires device review.

The font-scaling harness now waits for React Native Web header remeasurement.
An explicit Wingdex assertion confirms the first restaurant title stays below the
sorting row at 320px/130%; `A/screenshots/visual-report-ratings-320.json`. The final
Home supplement is `A/screenshots/visual-report-home-all.json`. All five viewport
contact sheets and the additional-state contact sheet were visually inspected.

Exploratory navigation using the last matching text label had intermittent results
while changes were being served. The final harness uses explicit navigation
accessibility labels and waits for fixture hydration. Final report JSON is the
authoritative result; earlier exploratory timeouts are not native validation.

## Functional regression results

| Check | Result and limits |
| --- | --- |
| All recursive Node tests, 116 `.test.js`/`.test.mjs` files | **577 tests: 573 passed, 2 failed, 2 skipped.** Only the two migration failures below remain. `A/node-tests.log`. |
| TypeScript | Passed. `A/typecheck.log`. JSX rendering still requires browser/runtime checks; typecheck alone did not catch the intermediate Wingdex reference error. |
| Full ESLint | Zero errors, 95 existing warnings. `A/lint.log`. The unused import introduced during correction was removed. |
| Quick rating | Passed. `A/quick-rating.log`. |
| Special auth/maps/history/overhaul regressions | 66/66 passed before adding the summary regression; final full suite includes that regression. `A/special-regressions.log`. |
| Navigation/component/integration contracts | Included in the recursive suite; actual fixture tab navigation also checked. No real backend transaction assertion is inferred from a source contract. |
| Web screenshot matrix | 320×740 small Android-like, 360×800 typical Android-like, 430×932 large Android-like, 390×844 iPhone-like; five screens per size, plus five 130% web text cases. No overflow/startup errors in the final matrix. `A/screenshots/visual-report.json`. |
| Browser interactions | Restaurant search match/nonmatch exclusion, empty state, map fallback, Crawl Resume center hit-testing, and five-tab navigation. Final 390 supplement: `A/screenshots/visual-report-all-390.json`; light/media: `A/light-media/visual-report-all-390.json`; fallback: `A/fallback-screenshots/visual-report-all-390.json`. |
| Loading/error/empty states | Fixture screenshots cover Wingdex loading/search/empty/map, Social friends empty, Home mission/facts, Journey challenges; controlled errors/media failures are covered in runtime tests. This is not full real-network/offline testing. |
| Database runtime integration harness | **Could not run:** `supabase/contracts/buffago-baseline-v1.json` is missing; command exits with ENOENT. `A/database-harness.log`. No production connection attempted. |
| Git diff checks | Scoped whitespace validation passed; migration inputs unchanged. No branch/commit/publication action taken. `A/diff-check.log`. |

The existing suites cover password/session races, rewards/XP, coin transactions,
rating submissions and eligibility, mission/challenge progress, crawl persistence,
map configuration/safety, approved galleries, upload/attachment pipeline contracts,
history, social visibility, friendships, leaderboards, owner/public boundaries and
loading/failure states. Their mocks/contracts do not prove the complete live flows.

The two skips are pre-existing legacy rate-limit-copy assertions (not native or
database suites that were silently treated as passing).

The final Wingdex contrast recapture supplements the matrix at
`A/screenshots/visual-report-ratings-all.json` and the light run at
`A/light-media/visual-report-ratings-390.json`. The completed-badge concern from QA
was corrected to theme-specific text; `A/contrast-checks.json` records focused
ratios of 6.00:1 (light completed), 6.44:1 (light active), and 6.61:1 (light selected
orange controls). This is not comprehensive accessibility certification.

Email sign-in's known false timeout is covered by executable tests for normal auth,
real timeout without a session, invalid credentials, slow/failed optional bootstrap,
14,999/15,001ms completion races, listener success, cancellation and duplicate taps.
These pass. The actual email/network/session-persistence symptom remains **not live
verified**, so this report does not say that it cannot occur on a device.

Historical attachment remains gated by signed-in ownership, prompt/photo feature
flags, known eligibility, non-coin ratings and no existing submission. Existing
stable rating IDs enter `WingShotFlow` in photo-only profile mode and refresh after
submission. Contract/upload regressions pass. Camera/library selection, successful
upload/finalize, retained ownership and refreshed historical display have **not**
been validated end to end against the backend.

## Migration integrity — unchanged baseline failures

HEAD and local main both equal `f879b9747e932cf7edc4568b2a821d9bb145edbf`.
`git diff --quiet HEAD` returns 0 for migrations, manifest, checker and reconciliation
tests. These inputs therefore remain baseline inputs, not overhaul changes.

1. `known current-schema migration is explicitly registered and checksum-stable`
   fails: **24 manifest checksum mismatches**. Twenty are attributable to raw-byte
   CRLF/LF policy. Four also mismatch canonical LF:
   `20260729122000_wing_shots_creator_rewards.sql`,
   `20260729126000_wing_shots_notifications.sql`,
   `20260729132000_wing_creator_surfaces.sql`, and
   `20261007000241_image_workflow_rc_regression.sql`.
2. `recovered Phase 1 migrations are present as unique root files` fails:
   `20260729200000_duplicate_media_classification.sql` and
   `20260729200000_duplicate_media_classification_fixed.sql` share one timestamp.

The standalone checker also reports **17 unmanifested root migrations**. Fresh
output: `A/migration-integrity.log`. Exact per-file baseline evidence remains in
`artifacts/operation-ui-overhaul/migration-investigation.json`. Applied production
bytes/ledger evidence are still needed for remediation. No migration, deployment
hash, RLS policy, authorization contract, or test assertion was altered to hide this.

## Native evidence and required remaining checks

This audit booted `Medium_Phone_API_36.1` and launched the installed Android
`com.buffago.app` 1.0.3/versionCode 5 development client. Initial direct development
URLs failed or displayed blank/error states. A dedicated native Metro server and
ADB port forwarding ultimately reached onboarding. Evidence: `A/native-launch.png`,
`A/native-launch.xml`, `A/native-app-log.txt`, `A/native-module-errors.log`.

The installed binary lacks **ExpoNetwork and ExpoVideo**. Module-import failures
cause missing-route warnings for affected screens. It is not a compatible client
for the current source/dependencies; reaching onboarding is not five-screen
validation. Dependency/config files were not changed by this overhaul. A compatible
native development build is required. No replacement build was submitted or deployed.

Android Google Maps configuration is read at build time through
`EXPO_PUBLIC_GOOGLE_ANDROID_API_KEY`; native build configuration rejects a missing
key. The shared native map checks configuration and coordinates, waits for readiness,
guards imperative calls and provides a React render-error fallback; iOS can use the
Apple provider when the Google key is unavailable. Configuration/safety tests pass.
Actual API-key restrictions, installed manifest/SDK initialization and crash-free
Crawls/Wingdex map opening remain **unverified**. React boundaries cannot prove that
a native SDK will not abort. This audit did not introduce an automatically mounted
native preview into Crawls while this previously crashing path remains unverified.

Required release checks remain:

- Compatible Android build: cold launch and all five tabs; native Maps from Crawls
  and Wingdex; allowed/denied permissions, location off, missing coordinates/key,
  close/reopen and background/resume without a crash.
- Android physical-device and iOS validation: safe areas, gesture bars, keyboards,
  modals, screen sizes, large text, labels/focus and retained light/system modes.
  No iOS runtime or physical device was available. Web text scaling is an approximation.
- Live email sign-in, timeout reconciliation, restart/renewal/session persistence;
  real loading/error/offline behavior.
- Real rating/coin spending/balances, daily XP, weekly missions, crawl start/resume/
  completion and map navigation; social scopes/privacy, leaderboards and friendships.
- Approved-media visibility and expiration, owner/private boundaries, real photo
  upload and historical attachment/finalization/return navigation.
- Database integration once the missing authoritative baseline contract is restored;
  separately approved migration reconciliation against deployment evidence.

## Independent review and final disposition

The user-requested independent QA agent reviewed the diff, actual mockups, initial
captures and correction follow-ups. Findings are in `A/independent-qa.md`. Its
Social-composition and Journey-hierarchy findings drove fixes; it also caught the
highest-rating label mismatch and requested actual light/media evidence. No new
confirmed authorization/privacy regression was found in the reviewed scope.

**Release blockers are explicit:** remaining major visual drift in Crawl
recommendation composition, incompatible native test client and
uncompleted native/device checks, live authenticated transaction/photo/privacy
verification, the two baseline migration failures, and unavailable database runtime
integration. Moderate cosmetic differences are recorded in the matrix, rather than
hidden behind a numerical score. This audit is a failed acceptance audit with useful
corrections and reproducible evidence, not a completed release approval.
