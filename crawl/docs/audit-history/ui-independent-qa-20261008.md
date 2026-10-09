# Independent QA review

Reviewed 2026-10-08. Independent read-only implementation review; no code, schema, or migration changes. Screenshots reviewed here are the existing 390px fixture captures in `../screenshots/`, not a new native execution. The primary audit must reconcile these findings against its final recaptures.

## References actually inspected

- Home: `crawl/design-references/8afd3fb8-1eda-4186-9dd0-054c410ac873.png`, bottom WINNER phone (not semifinal alternatives).
- Wingdex: `crawl/design-references/d2f0653a-f830-452b-8836-8fe848e2a09f.png`, bottom WINNER phone.
- Crawls, Social, Journey: `crawl/design-references/2e60084a-21d6-4d45-bc98-bd41a6a481e4.png`, left, middle, right phones.

## Visual findings requiring correction or explicit remaining discrepancy

| Screen | Finding | Classification |
| --- | --- | --- |
| Home | Reference has compact progression, three counters, image-led featured card and mission/fact cards visible together; current progression and featured text/action stack consume most of viewport, hiding mission/facts. Reference greeting missing. | Major composition/density drift |
| Crawls | Reference recommendation is map-led with thumbnail/info/footer and colored illustrated route rows. Current recommendation duplicates a plain active route card; maps/images absent and controls occupy two large rows. | Major structural drift |
| Wingdex | Winning reference uses wide photo-backed compact rows and thin sorting strip. Current uses small left photo tiles, taller search/filter stack and filled pill controls. | Major card/control drift |
| Social | Reference uses full-width wing photos dominating feed cards. Current uses 76px square thumbnail beside restaurant name. Missing imagery in fixture is data-related, but thumbnail geometry is real implementation drift. Do not copy fabricated likes/comments from reference. | Major card composition drift |
| Journey | Reference personal statistic tiles appear immediately after player progress, before creator/challenges. Current labels creator card as Personal statistics and puts actual statistics below challenges. Larger progression/creator sections hide lower content. | Major hierarchy/density drift |

Shared mismatch: reference selected filters are orange segmented controls; current shared `FilterChips` renders checked gray pills. Header typography, decorative borders, icon placement and bottom icon choices differ. Device frames/status bar cannot be pixel-compared as app content. No numerical fidelity percentage assigned.

## Functional and privacy review

- Crawl active actions remain wired to `startOrResumeCrawlFromList`; current screenshot visibly contains Resume. Earlier progress-wrapper occlusion is addressed in code, but center hit testing alone should be paired with an actual route transition assertion.
- Native map wrapper validates coordinates, guards missing Android configuration, catches React render exceptions, and delegates fitting after readiness. JS boundaries cannot establish survival of native SDK process faults. No native map execution was independently performed.
- Maps API key configuration and booleans are integrated in app.config.js. EAS Android native builds reject absent key. Config inspection is not proof that a signed device binary contains a valid key with correct package/certificate restrictions.
- Password sign-in uses `runPasswordSignInAttempt`, calls acceptance before detached profile bootstrap and accepts late sessions. Timeout can still display while an auth request is truly outstanding; real user-reported symptom needs slow-network/device evidence. No live credentials tested.
- Public images are fetched through `wing-public-gallery` and shown only as HTTPS approved gallery content. New Social card explicitly says Restaurant Wing Shot rather than attributing gallery photo to the rating author. No fake engagement added.
- Journey progression query is owner-only. Existing historical attachment remains self-only, feature-gated and eligibility-gated, invokes WingShotFlow with rating ID, and refreshes on return. Rendering and handler tests alone do not prove upload/storage/RPC success.
- Social restaurant image cache retains expired URLs/null results for the mounted screen. Newly approved shots may require remount; fallback preserves layout. This is a minor freshness limitation, not evidence of authorization bypass.
- No migration/RLS diff was observed within overhaul changes. Previously documented integrity failures remain explicit release blockers; this review did not independently hash production state.

## Coverage limits and verdict

Existing overhaul tests include real component helpers as well as source-pattern assertions. They provide targeted regressions, not full mounted-screen interaction or native acceptance. Deterministic fixture screenshots with missing-photo fallbacks omit the crucial approved imagery composition. Native Android/iOS, live session persistence, coin/XP server mutation, private/public backend behavior, real historical upload and signed URL expiry remain unverified by this reviewer.

**Independent verdict at reviewed snapshot: not ready for visual acceptance or release.** Correct major visual drift, recapture with approved-photo fixtures, and complete required native/live checks. Two known migration-integrity failures must remain reported; do not repair applied migration history as a UI task.

## Final correction follow-up

Reviewed fresh `final-audit/screenshots/{home,crawls,wingdex,social,journey}-390-fixture.png` and the corrected implementation on 2026-10-08. This section supersedes the initial visual findings where explicitly resolved.

- Resolved: Social has wide media beneath identity/restaurant text; the major thumbnail-composition mismatch is corrected without adding fake engagement.
- Resolved: Journey now displays four summary statistics before Creator and challenges. Compact progression materially improves hierarchy.
- Improved: Home compacts progression/counters, overlays restaurant identity on media and places mission/facts together. The 844px capture still cuts mission/facts below navigation; reference greeting/header actions and inline compact restaurant detail remain different.
- Improved: Wingdex now uses wide media-backed cards with compact metrics/actions. Light-theme scrim explicitly switches to white; code does not force dark text backgrounds onto retained light theme.
- Improved: Crawl active/completed surfaces now use orange/green tints; visible Resume controls remain retained.
- Remaining major visual delta: Crawls still has no map-led recommendation, route imagery or compact illustrated route rows from the approved mockup. Duplicated featured/explore active card and two rows of filters consume substantial height.
- Remaining controls delta in reviewed captures: Crawls/Wingdex local filters remain gray checked pills, unlike the orange segmented selection; Social shared filters are corrected.
- Remaining evidence gap: all reviewed fresh fixture photos are fallbacks. Approved-image cropping and actual wide-background contrast cannot be accepted from these captures alone.

### Data-label correction requested

Journey newly labels `best.avgW` as Highest rating. That value is the highest per-destination average, not the highest individual rating. With restaurant A ratings 10 and 2 and restaurant B rating 7, this displays 7 rather than 10. Relabel accurately or use the maximum valid rating score for this display-only summary; preserve existing business aggregates. Request communicated to principal agent for correction.

### Final review limitations

No light-theme rendered screenshots were available in the reviewed folder, so light appearance is code-reviewed only. No new privacy/RLS regression identified: public galleries remain moderated endpoint-derived, and private photo attachment/progression gates remain intact. Native onboarding launch on an outdated dev client with missing ExpoNetwork does not validate the five tabs or native Maps SDK. Live historical attachment and auth session/timeout checks remain unverified. Known migration integrity failures remain explicit.

**Follow-up verdict: materially closer, with unresolved visual differences and required native/live evidence.** Do not assert 95% or 1:1 fidelity, all-tests-pass, or release acceptance. The principal report should list final recapture paths and any subsequent corrections to these findings.

## Final disposition after contrast, filters and data fixes

Inspected the latest five 390px light+media captures in `final-audit/light-media/`, plus final dark Home/Wingdex media captures and current summary/filter/theme code. This section supersedes the remaining-evidence/data-label statements above where resolved.

- Journey Highest rating now uses the maximum finite individual score, excludes missing/blank scores and preserves a real zero. The targeted regression covers the 10/2 versus 7 example. The data-label defect is resolved.
- Crawl/Wingdex selected controls are orange in the latest rendered captures. Previous gray selected-control finding is resolved.
- Light Home gift/mission/facts and Wingdex score/metadata are visibly readable in the supplied final screenshots; the new light-aware scrims preserve dark text contrast. No newly introduced major light-theme blocker observed.
- Approved-media geometry is now exercised using documented synthetic gallery responses and a local photo crop from the supplied Home reference. These captures establish UI cropping/layout under an image, not production moderation, upload, signed-URL expiry or privacy acceptance.
- Social wide media and Journey summary ordering remain improved. Home mission/fact cards remain partly below the 844px fold, and Crawl map-led recommendation/illustrated route composition remains a substantial reference difference. Those residual design differences must stay listed in the principal report.
- Minor accessibility follow-up: light Crawl Completed badge uses pale green text on a pale green background; contrast was not numerically measured here. It deserves contrast verification rather than being treated as fully accessible based on legibility of the dark screenshot.

**Final independent disposition: no new confirmed functional/privacy release blocker in the reviewed corrections; visual acceptance and release acceptance remain incomplete.** Main outstanding evidence is a compatible native client (current client missing ExpoNetwork/ExpoVideo), native Maps stability, real sign-in/session behavior, authenticated photo attachment and backend mutations/authorization. The two existing migration-integrity failures remain blockers. This review does not independently certify all automated suite results or claim 95%/pixel parity.

## Final recapture addendum

Inspected the final Home 390x844 capture after the last density corrections. Compact progression/counters now preserve one coherent top section and both mission/fact cards fit fully above bottom navigation. The earlier Home fold finding is resolved at this viewport. Branding/header details and mockup imagery/data still differ; this is not a pixel-parity claim.

`contrast-checks.json` records focused WCAG luminance measurements for the revised light Completed badge (6.00:1), Active badge (6.44:1), and orange selected control (6.61:1). The previously flagged Completed-badge contrast concern is resolved for these code colors; this is not comprehensive accessibility certification.

Principal-agent evidence additionally records delayed-settle Wingdex 130% header-clearance assertions after responsive remeasurement. No new blocker identified by this final follow-up. The principal unresolved major visual finding is still Crawl recommendation/map/route imagery composition; native/live execution and known migration-integrity blockers remain as documented above.
