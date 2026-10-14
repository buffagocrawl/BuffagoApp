# Wingdex Wingman and photo controls

## Scope and root cause

Branch: `fix/wingdex-wingman-and-photo-controls`, isolated at
`C:/Users/Brand/repo/buffago-wingdex-fix` from HEAD `335cc5f`.
The original working tree's `crawl/app.config.js` version change remains untouched.
The isolated worktree retains version **1.0.6**. Carry the original **1.0.7**
version bump into this worktree before building if that is the intended release version.
Repository README and SECURITY instructions were reviewed; no applicable AGENTS.md was present.

In the tracked history, `72b6bb7` introduced the Wingdex Wingman integration
through `ListEmptyComponent`, rather than a persistent header action. Subsequent
Saved Destinations changes (`c5e7bc4`) added other empty-state branches, and
`b4955a6` added search prefill. At the current HEAD, populated discovery results,
filtered discovery or saved collections, and saved-list empty/error/guest states do not render
that add-restaurant CTA. The dialog and callbacks themselves remain intact.
No Wingman rollout flag gates this screen. `ENABLE_SAVED_DESTINATIONS` controls
saved collections and `ENABLE_WING_JURY` controls the separate Jury entry.
There is no evidence in this history of a persistent Wingman button being removed;
the supported root cause is conditional-only discoverability.

Main restaurant cards render the shared `WingdexPhotoGallery` with `embedded`
and `compact`. The shared gallery rendered `PhotoVoteControls` unconditionally,
so its vote row appeared on main cards as well as in restaurant details.

The added saved-control issue came from rendering both Favorite and Want to Try
buttons on every card/detail, including a separate `Saved` or disabled status.
Per the user's clarification, unrated restaurants use Want to Try, not Favorites.
The single control now shows `Add to Want to Try` / `Want to Try` when unrated,
and `Favorite` / `Already favorited` when rated. It retains the existing collection
mutation handlers and eligibility rules. Wing Jury uses the same label policy.

Home loaded only the featured photo's URI and rendered a passive image. It now
retains the approved photo record and uses a tappable image that opens the existing
full-screen viewer at that submission ID. The separate restaurant-details action
and no-photo/loading/unavailable fallbacks remain in place.

Wing Jury previously rendered a second full voting bar inside the successful
restaurant reveal. It now leaves only the existing authoritative Photo Likes and
Wingdex Average results there, with a compact `Change verdict` action opening an
editor for the existing change/withdrawal flow. The blind controls stay visible
until success and are enabled after vote failure for direct retry. Account-scoped
confirmed results and existing own-vote reads restore previously voted photos;
shared vote events update results, including events received during a reveal fetch.
Vote calculations, service contracts and restaurant-reveal content remain unchanged.

## Changes

- `app/(tabs)/ratings/index.jsx`: add an unconditional 48dp Wingman header button
  with an explicit add-place label, reusing `openWingman` and passing the search
  query. Disable inline gallery votes only at the main-card call site.
- `components/WingdexPhotoGallery.jsx`: optional `showInlineVotes` defaults to
  true; omit the entire vote row and vote-error UI when disabled, omit an empty
  embedded action wrapper, retain ordering, swiping, counters and photo selection.
  Pass shared vote errors and retry to the viewer.
- `components/WingdexPhotoViewer.jsx`: show shared vote-load errors and retry
  through the parent gallery, preserving the shared controller and selected state.
- `tests/wingman-search-prefill.test.mjs`: persistent entry and callback regression.
- `tests/wingdex-gallery-device.test.mjs`: rendered main-card vote absence,
  swipe/counter/selected photo behavior and shared viewer vote state.
- `tests/wingdex-photo-viewer.test.mjs`: shared vote-load failure/retry regression.
- `scripts/qa/wingdex-wingman-photo-controls-native.mjs`: reproducible isolated
  Android fixture smoke checks and screenshots.
- `app/(tabs)/home/index.jsx` / `components/home/HomeDestinationPhoto.jsx`: retain
  photo identity and open/dismiss the existing viewer; close it on destination changes.
- `components/SavedRestaurantButton.jsx` / `lib/savedRestaurantLabels.js`: one
  control with rated/unrated labels, selected state and existing add/remove callbacks.
- `components/WingJuryGame.jsx`: same saved-label policy plus the focused results
  layout, compact verdict editor, previously-voted restoration and synchronized counts.
- `tests/restaurant-saved-presentation.test.mjs`,
  `tests/home-destination-photo.test.mjs`, and `tests/home/quick-actions-home.test.js`:
  clarified four states, toggles, Home viewer and fallback checks.
- `tests/wing-jury-results-layout.test.mjs` / `tests/wing-jury-ui.test.mjs`:
  successful/pending/failed votes, existing votes, revisits, synchronized results
  and secondary-action retry/withdrawal checks.

WingmanAddDialog, WingmanService, confidence rules, verification retry inputs,
manual-review submission, duplicate prevention, rate limiting, SQL and Edge
Functions were not modified. Default gallery voting remains enabled in detail;
Wing Jury's controls and shared vote event subscription remain intact.

## Verification

- Regression command: Node test files matching `wingman-*.test.mjs`,
  `wingdex-*.test.mjs`, `*wing-jury*.test.mjs`, `app-polish-*.test.mjs`,
  `*saved*.test.mjs`, `home-destination-photo.test.mjs`,
  `restaurant-saved-presentation.test.mjs`, and `quick-actions-home.test.js`,
  excluding paths containing `postgres`, `deno`, `server`, `database`, or
  `deployed`: **287 passed, 6 skipped, 0 failed**.
- `npm run lint`: **0 errors, 102 pre-existing warnings**.
- `npm run typecheck`: **passed**.
- `git diff --check`: **passed**.
- The final Wing Jury change was verified separately with **12 focused tests passed**, relevant
  lint (zero warnings/errors), and typecheck. The completed 287-test run above
  preceded that final layout change and was not repeated, as requested.
- An initial broader test selection also included seven Docker-dependent
  database checks. These could not run because the Docker Desktop Linux engine
  was unavailable. No production database tests or writes were performed.
- The older `client-account-privacy.test.mjs` harness reports 18 failures from
  missing mocked imports. Running it against the original unchanged tree confirmed
  the same 18 failures (33 tests, 15 passed); its baseline log is retained.

Android evidence is in the ignored local artifact directory
`crawl/artifacts/wingdex-photos/wingman-photo-controls/`, including screenshots,
accessibility XML, acceptance JSON and check logs. Run the smoke script with
Metro on port 8091 and `BUFFAGO_NATIVE_VISUAL_QA=1`,
`EXPO_PUBLIC_BUFFAGO_NATIVE_GALLERY_QA=1`, and
`EXPO_PUBLIC_BUFFAGO_APP_POLISH_QA=1`, plus
`EXPO_PUBLIC_BUFFAGO_NATIVE_ROUND3_QA=1` for synthetic saved-list mutations.
The script verifies fixture network-boundary
markers before UI interaction; fixture Supabase and Wingman replace real services.
Device evidence uses the Android API 36.1 emulator and installed development
client, not a physical Android device or release binary. Physical-device and
production-release verification remain unavailable.
The original Wingdex emulator checks and the saved-controls/Home continuation
passed; their screenshots are retained. The long-name selector initially failed
because Android XML escapes ampersands, then passed after correcting that selector.
No check was retried after two failures. No additional emulator automation or
screenshot infrastructure was added for the final Wing Jury layout. Verify its
success/failure/revisit/editor interactions on physical Android.

Screenshots to review:

- `wingdex-entry-and-clean-cards.png`: persistent action and photo without a vote row.
- `wingman-open.png`: existing popup, focused name input and Android keyboard.
- `card-swiped-second-photo.png`: second card photo and updated counter.
- `viewer-voting.png` / `viewer-vote-selected.png`: selected photo, vote controls,
  and updated count/selection after a synthetic vote.
- `filtered-empty-wingman-entry.png` / `filtered-search-wingman-prefill.png`:
  Wingman remains accessible after a search with no matches and receives that query.
- `rated-favorite.png` / `rated-already-favorited.png`,
  `unrated-add-to-want-to-try.png` / `unrated-want-to-try.png`: the four saved states.
- `home-no-photo-fallback.png`, `home-current-destination-photo.png`,
  `home-photo-viewer.png`, `home-photo-dismissed.png`: Home fallback and viewer flow.

All source changes are unstaged and uncommitted. No push, PR, merge, SQL/Edge
deployment, mobile release, or production test write was performed.
