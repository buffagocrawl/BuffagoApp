# Operation UI Overhaul

Cleanup status (2026-10-09): generated capture/log links have been retired. Artifact paths below are historical identifiers or regeneration output locations, not retained evidence. Conclusions remain recorded in [the consolidated audit](branch-consolidation-final-audit.md). Scripts, fixtures and application assets are preserved.

October 8 continuation: [release-readiness review](operation-ui-overhaul-release-readiness.md)
records the exact baseline integrity discrepancies, all-27 screenshot review,
Crawl action visibility fix, updated validation and outstanding device checks.
It supersedes earlier remaining-issue summaries below.

## Audit and implementation plan

- Git: clean working tree; fetched origin/main matches main at f879b97. One branch: operation-ui-overhaul. No commit/push/merge/deployment authorized.
- Navigation: Expo Router, five tabs in app/(tabs)/_layout.tsx; detail routes outside tabs. Safe-area-aware bottom navigation. Journey currently opens Buffaverse before history.
- Screens: home/index.jsx (dashboard/rating workflow); routes/index.jsx (discovery, persistence, resume, maps); ratings/index.jsx (Wingdex, coins, galleries, sorting); leaderboards/index.jsx (feed/friends/leaderboards); journey/index.jsx plus profile/history/index.jsx and BuffaverseOverview (progress/history).
- Styling: React Native styles and React Native Paper. Active ThemeProvider has separate themes from src/theme/theme.ts. Existing ScreenHeader, GamificationHeader, FeedbackState, mission/challenge and creator components can be reused.
- Data: existing Supabase RPCs/views, auth and feature flags; location provider; AsyncStorage crawl/discovery preferences; approved-only Wingdex gallery; socially visible feed; own submission history. No backend/schema changes planned.
- Tests: extensive Node contract/domain/mobile-runtime tests under tests plus quick-rating checks; TypeScript/Expo lint; Cayenne Android device tooling in ../scripts/cayenne.
- Known crash paths: native maps require compiled platform keys and finite coordinates; existing platformMap guards these, waits for readiness, and catches render failures. Native SDK failures cannot be caught by React boundaries. Audit map requests and fallback before claiming device stability. Crawl resume has an existing temporal-dead-zone analytics reference.

Plan: build reusable tokens/cards and compact header/navigation; migrate Home/Crawls/Wingdex in disjoint agent ownership; then Social/Journey; run baseline and full relevant tests; add focused runtime regression checks; capture available web/device screenshots at multiple sizes; independent QA reviews complete diff. Preserve actions and business rules; do not fabricate metrics/media.

## Ownership

Root owns foundation, navigation, map wrapper, integration and reports. Screen agents own their assigned screen files only. Slots are reused for Social, Journey and independent QA after the initial three screen tasks finish. All changes share the same branch.

## Delivered screens

| Screen | Result |
| --- | --- |
| Home | Compact original-logo/utility header; shared level/title/XP and daily reward; actual achievement counters; approved public restaurant thumbnail/fallback, community rating count and existing rating/swap/directions/friend actions; nearby discovery/map entry; compact mission and facts. |
| Crawls | Nearby/My/Completed filters and transportation controls; featured nearest first stop; compact bordered cards; active progress/direct resume; existing view/review/maps/route suggestion retained. Existing resume analytics initialization bug fixed. Distance remains honestly labelled distance to first stop; no travel-time fabrication. |
| Wingdex | Compact approved-photo cards, scores/counts/coin states/actions; search/radius/filter controls; explicit sorting with original default preserved; compact map action and stable bottom navigation. Home map entry consumes a one-shot parameter. |
| Social | Feed/leaderboard/friends and state/all/friends scopes retained; individual activity cards with initials/profile access, date, actual score and restaurant details; public approved restaurant photo explicitly attributed as Restaurant Wing Shot. Empty/loading/error states preserved. |
| Journey | Actual YTD stats now default; same player progression component as Home; personal metrics/history; owner Creator stats/history/add-photo; challenge progress/counts/streaks; enabled achievements/objectives remain accessible. Missing averages show unavailable instead of a false zero. Public ownership boundaries retained. |

## Shared foundation

Added operationTokens and operationTabBarStyle, plus SurfaceCard, PlayerProgressCard, StatCard, SectionHeader, StatusBadge, ProgressBar, FilterChips, PrimaryButton, SecondaryButton, EmptyState, LoadingSkeleton, WingShotImage, RestaurantCard and CrawlCard exports in components/ui/OperationUI.jsx. Reused existing Paper cards and action handlers where replacement would risk behavior. Updated ScreenHeader, active ThemeProvider, tab navigation, weekly challenges, Creator card and Buffaverse detail styling.

The default dark palette uses near-black surfaces, orange accents, neutral borders and restrained state colors. Existing explicit light/system theme preference is retained. Tabs retain safe-bottom padding and cap only tab-label font scaling at 1.15; screen content scales normally. Narrow screen counters wrap, Wingdex uses a 44px map icon action, and route suggestion fields scroll with keyboard handling.

Map safeguards remain finite-coordinate validation, build configuration guards, Apple-provider fallback on iOS, readiness-gated native commands and render boundaries. Fallbacks now preserve dimensions and readable instructions. Web fallback hides unsupported marker content. No API keys were added. React boundaries cannot catch a native SDK process abort; native stability requires device validation.

## Verification

- Full recursive Node suite: 576 tests, 572 passed, two baseline migration-integrity failures, two skipped. Log: artifacts/operation-ui-overhaul/node-tests.log.
- New focused runtime regressions: 10/10 passed. Include full Home initial hook render and actual navigation effect/cleanup, approval/HTTPS/image failure guards, bounded progress, action forwarding, actual map failure rendering, owner/public mission gates, missing Journey averages, and responsive Wingdex map action.
- Existing focused Home/gallery/map/history run: 59/59 passed before the last two regression additions. Independent screen agents additionally exercised rating eligibility, mission tracking, auth/social and challenge/Buffaverse contracts.
- TypeScript, quick-rating, full Expo lint and scoped diff-check passed. Lint has zero errors and 95 existing warnings.
- Baseline failures: the migration manifest has 24 checksum mismatches and one duplicate migration. Migration checker/manifest/test match HEAD after line-ending normalization; overhaul changes no migration inputs. No tests deleted or weakened. Exact layout assertions were updated to the approved compact dimensions while preserving actions/safe-area assertions.

## Visual evidence and limits

Screenshots: artifacts/operation-ui-overhaul/screenshots/. Each tab has 320x740, 390x844 and 430x932 captures named <screen>-<width>-fixture.png; small-screen text-scaling captures use -font130-fixture.png. Extra captures cover Wingdex loading/search/empty/map fallback, Home missions/facts, Journey challenges and Social empty friends feed. JSON reports record overflow, startup errors, search matching and map fallback checks.

Final visual evidence: 27 PNGs (20 matrix captures and seven extra state captures). All matrix cases show no horizontal overflow or startup error. Search matched the selected restaurant and hid nonmatches; the web map fallback rendered successfully. Latest 320/390 rerun reports supplement the consolidated visual-report.json. The orchestrator visually inspected all five layouts plus larger text, loading/empty states, missions/challenges and map fallback. Native visual verification is excluded.

The Python Playwright harness uses the existing installed tooling and intercepts every configured Supabase request with synthetic fixtures. It makes no live backend writes and does not establish real authenticated backend behavior. No restaurant imagery was fabricated; screenshots deliberately exercise missing-approved-photo placeholders. Approved-media behavior is covered by runtime/contract tests. Web text scaling approximates layout pressure and is not native Dynamic Type verification.

Visual QA found and resolved an existing Home callback-before-initialization crash, progress text overlapping later cards due to Paper's web wrapper, clipped Home navigation due to resetting shared styles, and a narrow Wingdex header. Independent QA classifications and follow-up review are in operation-ui-overhaul-qa.md.

Native attempt: no device was initially connected. The installed Android emulator booted, but its existing development client reached a launcher error/ANR and did not load this app for reliable verification. The emulator started for this task was stopped. Android/iOS safe areas, keyboards, provider SDK behavior and native screenshot checks remain unverified. No iOS runtime is available here.

## Changed file inventory

- app/(tabs)/_layout.tsx
- app/(tabs)/home/index.jsx
- app/(tabs)/routes/index.jsx
- app/(tabs)/ratings/index.jsx
- app/(tabs)/leaderboards/index.jsx
- app/(tabs)/journey/index.jsx
- app/profile/history/index.jsx
- providers/ThemeProvider.tsx
- src/theme/operationTokens.js (new)
- components/ScreenHeader.jsx
- components/ui/OperationUI.jsx (new)
- components/WeeklyChallengeStats.jsx
- components/creator/WingCreatorSummaryCard.jsx
- components/buffaverse/BuffaverseOverview.jsx
- lib/platformMap.native.js
- lib/platformMap.web.js
- tests/home/quick-actions-home.test.js
- tests/home/weekly-mission-home-surface.test.js
- tests/operation-ui-overhaul.test.mjs (new)
- scripts/operation-ui-visual-qa.py (new)
- docs/operation-ui-overhaul.md (new)
- docs/operation-ui-overhaul-qa.md (new)
- artifacts/operation-ui-overhaul/ (test log, fixture screenshots and reports)

## Remaining review conditions

No unresolved new release blocker or major code regression was found by independent review. Full release acceptance is not claimed: the repository suite has baseline integrity failures and native/authenticated validation remains outstanding. Minor: newly approved/expired gallery thumbnails may require screen remount/refresh; failed photos gracefully fall back. Some existing lint warnings remain.

Concurrent changes appeared outside crawl in the growth command center, display-start script, root .gitattributes and kiosk test. They were not made or modified by this task and remain preserved outside this inventory.

No schema, RLS, auth contract, dependencies, backend business rules or API contracts changed. Exactly one branch was created: operation-ui-overhaul. Nothing was committed, pushed, merged or deployed.
