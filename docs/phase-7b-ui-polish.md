# Phase 7B UI polish

Date: 2026-10-09. Status: LOCAL UI POLISH COMPLETE; production release remains blocked by the separate readiness review.

## Changes

- Home Wing Facts and Wing Jury use compatible minimum widths, compact Jury icons and padding, and wrapping layout. Both fit side by side at 360 and 390 px; genuinely narrow space can stack the cards. Weekly Missions and States Visited remain absent; retained Home behavior is unchanged.
- Wing Jury reveal removes the restaurant-name line clamp, gives the address and actions more separation, and places orange Next Photo beside a visibly outlined Close. Both action controls retain at least 44 px content height and can wrap when needed.
- The guest prompt now stacks a full-width orange Sign In / Create Account action above secondary Not Now. Existing sign-in routing, pending intent storage, dismissal handlers, verdicts, and save behavior are unchanged.
- Wingdex cards have more vertical padding, wider gaps between actions, readable 12 px saved-action labels, and 44 px content heights. Favorite/Saved and Set Destination/Take Me There rows wrap without clipping; the existing unrestricted name label remains intact.

Changed source files: `crawl/app/(tabs)/home/index.jsx`, `crawl/app/(tabs)/ratings/index.jsx`, and `crawl/components/WingJuryGame.jsx`. Existing Home tests in `quick-actions-home.test.js` and `weekly-mission-home-surface.test.js` were updated to assert both equal-basis card widths and retained touch height, replacing their previous fixed-order styling expectations. No service, API, auth, schema, migration, or feature configuration was edited in this polish pass.

## Visual verification

The [screenshot index](screenshots/wing-jury-phase7b/README.md) links all eight required captures: Home, unrated reveal, guest prompt, and Want to Try at 360 x 800 and 390 x 844. Each was captured and inspected from the actual Expo components, using Chrome Headless CDP with deterministic development fixtures. No runtime exception was recorded in the successful captures. A first connection-refused image was overwritten with the final valid Home capture; failed intermediate captures are not accepted evidence.

Three additional captures confirm Home stacking at 320 x 740 and long-name wrapping in reveal and Want to Try at 360 x 800. The long-name checks temporarily replaced only rendered label text in the browser DOM; the component layout and all controls remained the actual app output. No fixture or stored restaurant data changed. All three passed visual inspection.

The existing Phase 7A harness was found under ignored `crawl/.tmp/phase7a-{capture,action,reuse}.cjs`. A derived ignored `phase7b-capture.cjs` uses the same CDP technique with validated expected text. Chrome port 9228 became unresponsive; a fresh hidden local Chrome session on 9230 completed the captures. Local Expo port 8085 ran with read-only native visual fixtures and both feature flags explicitly enabled for that process. Source defaults remain `ENABLE_WING_JURY=false` and `ENABLE_SAVED_DESTINATIONS=false`.

The cartoon mascot visible in Jury screenshots is the existing development preview asset, not a user photo. Preview state is guarded by `__DEV__`; production Image source remains `currentPhoto.signed_url`, normalized by the feed service and supplied by the approved-public media boundary. No production mascot fallback or generic photo placeholder was added. Live approved user photo delivery remains unverified and is a release-validation requirement.

## Tests and limits

Affected regression command from `crawl/`:

```text
node --test --experimental-default-type=module tests/wing-jury-ui.test.mjs tests/wing-jury-service.test.mjs tests/destination-navigation.test.mjs tests/saved-destinations-service.test.mjs tests/home/quick-actions-home.test.js tests/home/weekly-mission-home-surface.test.js tests/native-visual-fixture.test.mjs
```

Result: PASS, 40/40. Coverage includes default-off boundaries, guest-local verdicts, blind data, reveal and retry contracts, saved-list eligibility, navigation, retained Home functionality, and fixture write denial. These include source-contract and mock-service tests, not live integration.

The final expanded command adds `lib/savedDestinationIntent.test.js` and `tests/social/social-feed-no-image.test.js` to the command above: PASS, 43/43, after the final Home styling and assertion updates. It retains once-only intent consumption and compact image-free Social coverage. The first expanded run before the assertion update failed two stale Home style-order checks; both were corrected to assert the new card sizing contract, and no checks were skipped or removed.

The root review also confirmed typecheck PASS, lint 0 errors / 95 existing warnings, and diff whitespace checks PASS after the styling changes. Final root verification and backend security findings are recorded in the readiness review and handoff.

Remaining blockers include historical migration integrity, staged database / Edge Function deployment, candidate grants/RLS corrections and runtime enforcement verification, guest session handling and account-switch reveal state identified by the readiness review, and Android/iOS native acceptance. Fresh read-only catalog evidence is recorded in the separate readiness review and does not establish runtime enforcement of the candidate changes. An Android emulator is attached, but this task's visual acceptance uses Chrome; no emulator build or device changes were performed.

Branch remains `feat/wing-jury-favorites-want-to-try`. Existing worktree changes were preserved. No commits, pushes, remote writes, deployments, new branches, resets, or cleanup were performed.
