# BuffaGo local polish handoff

**Current status (2026-10-13):** voting SQL contracts were verified read-only before sequential deployment of wing-jury-vote v2 (verify_jwt=true), wing-jury-reveal v2 (false), and wing-public-gallery v4 (false). Exact source and shared dependencies were verified after each deployment. Final cleanup performed no deployment or production write. See [final branch hygiene](buffago-app-polish-final-hygiene.md) and [deployment receipt](../artifacts/app-polish/release-qa/deployment/production-edge-deployment-final.json). Statements below about undeployed work describe earlier sessions and are historical. Other release gates remain outstanding.

Work is on `feature/buffago-app-polish`, unstaged/uncommitted/unpushed/undeployed. Existing Mango/growth work and deployed Wingman v17 atomic rate limiting are preserved. No production votes, photos, restaurants or moderation were submitted; production inspection was read-only.



The authoritative [release and compatibility plan](buffago-app-polish-release-plan.md) contains SQL/Edge inventories, reconciliation/rollback, phased deployment, cleanup evidence and outstanding device checks. This branch is prepared for staging/device acceptance, **not production release**.



## Intended changes and affected files



- Popup focus/keyboard and retry preservation: `crawl/components/WingmanAddDialog.jsx`, `crawl/lib/wingmanFocus.js`.

- Wingdex horizontal photos, consistent ranking/counters/selected viewer and shared cache: `crawl/app/(tabs)/ratings/index.jsx`, `WingdexPhotoGallery.jsx`, `WingdexPhotoViewer.jsx`, `crawl/lib/wingdexGallery.js`, `wingdexPhotos.js`, and `crawl/types/wingdexPhotos.ts`.

- Drag/pinch framing with reset/cancel/confirm, orientation normalization and confirmed upload bytes: `crawl/components/wingShots/WingShotFramingPreview.tsx`, `WingShotFlow.tsx`, `WingShotMediaPreview.tsx`, `mediaAdapter.ts`, `crawl/lib/wingShotFraming.js`. Existing editing dependencies reused; primary/thumbnail match the frame, existing social aspect transformations remain.

- Shared Jury/detail/viewer controls/state: `crawl/components/PhotoVoteControls.jsx`, `WingJuryGame.jsx`, gallery/viewer above, `crawl/lib/photoVoteEvents.js`, `wingdexPhotos.js`, `wingJuryService.js`.

- Mixed-version database bridge: **`crawl/supabase/proposals/app-polish-shared-photo-votes.sql`**, unapplied. Keeps legacy upsert/delete and new Jury RPC paths synchronized, authoritative counts, owner/RLS protections, duplicate guards and deletion cascades. Saves both original vote stores in protected cascade-aware snapshots; latest valid recorded action wins eligible conflicts. Contradictory ties or invalid chronology stop installation; historical withdrawals cannot be inferred. Old installed versions remain unconfirmed; no voting upgrade floor is required for the inspected protocol, but archived-build staging acceptance is required.

- Wingman confidence: `crawl/lib/Wingman/WingmanService.ts`, `types.ts`, dialog above, `crawl/supabase/functions/wingman-intake/index.ts`, `_shared/wingmanConfidence.ts`, `_shared/wingmanMenuEvidence.ts`, `crawl/types/deno-runtime.d.ts`, and `Agents/Mango Habanero/src/RestaurantQueue.jsx` labels. Wing threshold is 0.50 inclusive with independent >=0.80 match, real verified restaurant/location and no ambiguity/unavailable/conflicting evidence. Missing scores fail closed. Exact v17 limiter, JWT checks and duplicate-safe Mango RPC remain.

- Status contrast after modal/foreground: `crawl/app/_layout.tsx`, `crawl/components/AppStatusBar.jsx`, `crawl/lib/statusBarPolicy.js`, and WingShotFlow modal lease/onShow restoration.

- Safe Mango test ports: `Agents/Mango Habanero/server/approval.mjs` optional frontend port preserves production default; `tests/localOrigin.test.js` uses isolated ephemeral ports. Reviewer app stays running.

- Four Edge proposals: **wing-public-gallery, wing-jury-vote, wing-jury-reveal, wingman-intake**. No other function deployment is included.



Meaningful tests include `crawl/tests/app-polish-{focus-framing,gallery-cache,votes-postgres,vote-bridge,vote-concurrency,statusbar,deployed-contract}.test.mjs`, Wingman confidence/atomic limiter tests, frozen legacy voting fixture and deployed-vote fixture helper, and updates to existing gallery/Jury/upload/runtime/Mango tests. Opt-in native fixtures, gesture harness source and capture/comparison scripts remain; fixture flags must be off in release builds. No dependencies or package/lockfile changes.



The preceding Mango migration/restaurant-review files, growth dashboard changes and their artifacts are existing work, not additional polish migrations/deployments. Mixed-purpose dialog/intake/Mango UI files retain that work. Review eventual release scope explicitly; no staging or commit was performed here.



## Confidence findings



There was no literal 0.50 parser default. Earlier thresholds were inconsistent (0.70/0.75), the model required a numeric score with missing evidence, a generic category prior covered 0.4?0.7, menu text was absent, and rounded display could label 49.9% as 50%. Midpoint model behavior is a plausible explanation, not measured production calibration. Forced 0.85 match floors, first-Places-result selection, fabricated existing-match scores, cleared ambiguity and retry score reuse were removed. Attributable bounded official website/menu excerpts are retained; fetch failures supply no approving default. Labels separate restaurant-match and wing confidence. The earlier rate-limit baseline claim was corrected against actual deployed v17 source.



## Verification and retained screenshots



Final compatibility suite: **362 tests; 355 passed, seven skipped, zero failed**. Full Mango: **76 passed**. Three supplemental Deno/SDK loopback tests passed. Typecheck/Deno/lint (zero errors, 98 existing warnings) and Android/iOS exports passed. SQL application/races used isolated databases and actual deployed vote definitions; provider/HTTP fixtures were mocked. Physical Android/native iOS, real staging HTTP/storage/worker load/conflict acceptance and installed-build mapping remain outstanding. Exports/emulator results do not establish production safety.



Evidence and cleanup inventories are in `artifacts/app-polish/release-qa/`. Cleanup removed 122 known generated paths/about 1.27 GB; original app assets, unrelated files and existing Mango/growth work were preserved. Final screenshots:



- Popup: `artifacts/app-polish/native/wingman-town-keyboard.png`, `wingman-details-keyboard.png`, and corresponding two captures under `320dp-font1.3/`.

- Photo swipe/viewer: `native/wingdex-inline-swiped.png`, `viewer-tapped-second.png`.

- Shared votes: `native/restaurant-detail-synchronized.png`, `detail-withdrawal-synchronized.png`, `jury-vote-changed.png`, `jury-vote-withdrawn.png`.

- Confidence: `native/wingman-confidence-50.png`.

- Injected emulator pinch/crop: `release-qa/native/pinch-and-drag-confirmed-frame.png`, `pinch-and-drag-confirmed-preview.png`; prepared JPEG/primary/thumbnail and crop verification JSON retained. The superseded intermediate pinch screenshot was removed during final cleanup. No network upload occurred.

- Status contrast: `release-qa/native/statusbar-modal-foreground.png`, `statusbar-after-dismissal.png`.



Relative screenshot entries above are under `artifacts/app-polish/`. Sixteen useful final captures remain; superseded captures, raw hierarchies, preliminary logs and exports were removed. The release plan has the short physical/iOS checklist and exact SQL -> four Edge Functions -> Mango -> mobile order, with non-destructive rollback and acceptance gates.



Git index is empty. Everything remains uncommitted, unpushed and undeployed.


Release acceptance update: see the October 13 section of the release plan. Read-only inspection found two approved-photo conflicts and one failed-photo historical conflict; the later Gallery dislike in the third pair now wins under the revised latest-recorded-action proposal. New evidence: 11 focused DB/contract/status tests, three conflict tests, two build-commit controller tests, three scoped Deno HTTP tests and 47 worker tests passed. EAS completed-build metadata is available; actual store/testing distribution remains unknown. Real isolated service staging and physical/native iOS acceptance remain blockers. No removals or deployments occurred in this update.


Latest release gates: the release plan now opens with the authoritative latest-recorded-action policy, preserving both source snapshots. Approved-photo results are dislike/dislike; the failed-photo like/neutral history is retained and publicly excluded. Tests cover the revised policy on PGlite and disposable native PG17, plus neutral/ties/future dates/audit permissions/cascades and prior-prototype rejection. No isolated staging target was found; exact setup and owner/evidence gates are documented. Fresh US App Store listing confirms 1.0.6, EAS OTA inventories are empty, and Play/TestFlight active cohorts remain unknown. Original evidence was preserved; no completed broad suites were repeated.

Current authoritative deployment list: `docs/buffago-app-polish-deployment-manifest.json` and the opening Exact deployment manifest section of the release plan. The two approved conflicts retain both rows, so missing Gallery withdrawal history does not leave an unresolved current withdrawal in those pairs; latest surviving recorded actions remain dislikes. Branden explicitly chose existing Jury verdicts as shared active votes for the separate 110 eligible Jury-only pairs (four voters); missing history remains documented, not invented. A separate local acceptance config/README is prepared, with migration/seed replay disabled and gateway settings preserved, but no services/project/branch were provisioned. Targeted delete/re-vote and owner-approved Jury-only/preflight checks passed. Full real-service staging and physical devices remain outstanding. Prior evidence and assets are preserved.

Latest staging attempt stopped at the validated-schema prerequisite: acceptance project has no containers and only config.toml; read-only existing crawl DB inspection found zero of seven required app tables and zero of six checked worker RPCs. No real Auth/PostgREST/Storage/Edge/worker acceptance ran, and no broad suite was repeated. See the opening release-plan section and deployment/staging-readiness-blocker.json for the smallest setup and NOT READY verdict. No production access, service startup or existing-stack mutation occurred.


## Current acceptance and shared Sort/Filters update

See [current staging acceptance](buffago-app-polish-staging-acceptance.md) and
[release plan](buffago-app-polish-release-plan.md). Earlier no-baseline/no-service
claims above are historical: real isolated native Auth/REST/Storage/Edge/worker
acceptance now passed for voting/photos. Jalape?o cleanup header bug was fixed
and real retry passed; no provider-success or physical-device pass is claimed.
Fresh read-only Wingman source is externally deployed v18 matching local bytes;
v17 limiter/create RPC definitions remain protected/unchanged. No deployment was
performed by this session.

Latest UI files: `crawl/app/(tabs)/ratings/index.jsx`,
`crawl/lib/wingdexCollection.js`, `crawl/lib/savedDestinations.js`,
`crawl/tsconfig.json` (exclude generated staging loaders),
`crawl/tests/wingdex-sort-filters.test.mjs`, saved service regression and fixture
pagination adapter, `crawl/scripts/qa/wingdex-sort-filters-native.mjs`.
Separate Sort/Filters preserve defaults/options; one predicate/comparator covers
Discover, Favorites and Want to Try, with full rating enrichment/stable paging.
Active filters, reset and filtered-empty clear action are explicit. 19 focused
tests, zero-error lint (ten existing warnings), typecheck and Android emulator
screenshots passed. Screenshot UI is mocked fixtures; physical/native iOS is
outstanding. No dependencies or SQL added for this UI change.
