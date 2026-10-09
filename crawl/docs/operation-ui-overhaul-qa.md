# Independent QA: Operation UI Overhaul

Cleanup status (2026-10-09): generated capture/log links have been retired. Artifact paths below are historical identifiers or regeneration output locations, not retained evidence. Conclusions remain recorded in [the consolidated audit](branch-consolidation-final-audit.md). Scripts, fixtures and application assets are preserved.

October 8 continuation: see [release-readiness review](operation-ui-overhaul-release-readiness.md)
for exact migration root causes, review of all 27 captures, the newly found and
fixed Crawl Resume-button obstruction, fresh checks, actual EAS profiles, and
outstanding device acceptance. The earlier claim of no remaining UI blocker
is superseded by that finding and its verified fix.

Review performed October 7, 2026, on the shared operation-ui-overhaul working branch. No commits, pushes, merges, or deployment were performed by this agent.

## Automated verification

- Recursively ran all 116 Node test files: 576 tests; 572 passed, 2 failed, 2 skipped. Full output: artifacts/operation-ui-overhaul/node-tests.log.
- Both failures are preexisting database migration integrity problems: 24 manifest checksum mismatches and one duplicate migration. The migration checker, manifest, and reconciliation test match HEAD after normalizing line endings; no migration inputs were changed by this overhaul.
- New focused runtime regressions: 10/10 passed. Exercise approved-only HTTPS image visibility, missing/failed-photo fallback and replacement, progress bounds, action forwarding, invalid coordinates, map readiness and provider exceptions, Android configuration fallback, and the actual MapBoundary failure rendering. Also check Home-to-Wingdex map parameter consumption, approved gallery integration, Journey owner-only mission progress with the growth feature gate, and full initial Home hook evaluation for declaration-order errors.
- Existing Home tests: 10/10 passed. Migrated only precise layout assertions to the approved dimensions (44px clipped logo after visual QA), retaining all content, actions, and measured tab-bar clearance checks and adding progression/media assertions.
- Quick-rating test script passed.
- TypeScript typecheck passed.
- Expo lint passed with zero errors (95 warnings, mostly existing unused variables, hook dependencies, and BOMs).
- git diff --check passed.

## Independent diff review

Reviewed navigation, shared components/tokens, theme, all five screens, profile history, weekly challenge statistics, creator summary, Buffaverse achievement detail, and both platform map adapters.

Release blocker found in real web rendering: Home referenced refreshClosestDistanceOnly in dependency arrays before its const initialization. Resolved by moving the unchanged callback above its first use; added full mocked Home initial hook-render regression (passing). Actual browser recheck is being handled by the orchestrator. Existing migration integrity failures prevent claiming that the entire repository suite is green.

Major: none identified in the code review. Device-native map provider behavior and full authenticated flows still require actual Android/iOS validation; JavaScript fallbacks cannot catch a provider process abort.

Minor: gallery thumbnails cache signed URLs or empty entries during a mounted session; newly approved images may require remounting or refreshing. This is a UI freshness limitation, not an approval visibility bypass.

Cosmetic: literal question marks in route subtitle and coin-rate label were corrected.

Confirmed preservation of the growth-mission feature gate for newly added owner mission progress. Public profiles continue to use public visibility APIs and do not fetch owner missions.

Approved media is loaded through the existing moderated wing-public-gallery boundary; the shared renderer requires explicit approval and HTTPS. No direct private submission/storage query was added. Ratings, coins, XP rewards, route persistence, feed privacy, and other business handlers were retained.

## Visual and live data limitations

Visual screenshots and viewport checks are being handled by the orchestrator. This report does not claim independent native-device visual verification or live authenticated backend verification. Runtime component tests use controlled mobile mocks; existing backend and security contract tests remain in the recursive suite.

## Visual-fix follow-up review

Independently reviewed fixes from real web screenshot QA: bounded 6px shared progress container prevents Paper web wrappers from filling cards; Home clips the original padded logo inside a 44px container; navigation restored a 64px base to avoid label clipping while retaining safe-area padding; Wingdex subtitle moved below its header row to allow full width. Updated regressions pass (18/18 focused plus Home). The final recursive suite retains only the two baseline integrity failures. Screenshots and actual browser rechecks are recorded by the orchestrator.

## Navigation restoration follow-up

Independently verified shared operationTabBarStyle reuse in both tab layout and Home: the actual Home navigation effect and its cleanup restore the same safe-area-aware style (98px total for a 34px inset), retaining comparison-modal hiding. Full initial Home hook-render regression now executes this effect; backend effects remain excluded. The shared stat minimum width is 96px and Home counters wrap for larger font scaling. Focused regressions remain 8/8; typecheck passed and touched-file lint has zero errors / 10 existing warnings. Full suite remains 570 passed, two baseline integrity failures, two skipped. Root was notified to remove whitespace in the moved distance callback found by the final diff check.

## Final implementation review

Reviewed the final named navigation labels (font-scale cap applies only to tab labels), compact Wingdex map action, player identity minimum width, Home public-visible HEAD rating count with stale request guard, and Journey missing-average formatting. Added executable regressions for the actual Journey formatter (null/undefined/empty/invalid show unavailable; zero remains 0.00) and both actual responsive Wingdex map-action branches at small width and larger font scale, retaining navigation handlers and 44px targets. Focused regressions are 10/10. Full recursive suite: 576 tests, 572 passed, two baseline migration integrity failures, two skipped. Typecheck and full lint passed; lint reports zero errors and 95 warnings. Workspace diff-check passed after callback whitespace cleanup. No unresolved new release blocker or major code regression identified.

Unrelated concurrent changes outside crawl were observed in the repository (growth command center and display-start script); this agent did not create or modify those files. They should remain outside the overhaul deliverable. Visual harness screenshots are fixture-backed and do not establish live authenticated or device-native backend verification.

## Orchestrator final evidence

After the independent review, the orchestrator verified the final narrow-header spacing and removed unsupported marker children from the web map fallback. Targeted map/platform/runtime regressions passed (33/33), typecheck passed, touched lint had zero errors, and scoped diff-check passed.

Final visual artifacts comprise 27 fixture-backed PNGs: all five screens at three viewport sizes, all five at small-screen 130% web text scaling, plus seven loading/search/empty/map/mission/challenge captures. The final matrix reports zero horizontal overflow and zero startup errors. Search matching/nonmatch exclusion and the web map fallback checks passed. The orchestrator inspected these captures. This evidence is separate from the agent's independent code review and does not substitute for native Android/iOS or live authenticated backend validation.

Release acceptance remains incomplete because the full suite has the two confirmed baseline migration-integrity failures and the available Android development client did not reach the app reliably. No new unresolved blocker or major regression was found in the verified UI scope. Nothing was committed, pushed, merged, or deployed.
