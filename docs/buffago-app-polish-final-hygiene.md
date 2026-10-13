# BuffaGo app-polish final branch hygiene

Branch: `feature/buffago-app-polish`. Base: `1cb2ba52ef7369436e2e73ec40f93876119e8409` (HEAD and origin/main at inspection). No committed branch delta; the reviewed changes are in the working tree. There are no applicable root/crawl AGENTS.md files; the two repository instruction files apply only to Chipotle and Serrano, neither of which was modified.

The three Edge deployments are complete: vote v2/JWT true, reveal v2/JWT false, gallery v4/JWT false. [Deployment receipt](../artifacts/app-polish/release-qa/deployment/production-edge-deployment-final.json). This cleanup performed no deployment, SQL or record write.

## Cleanup and inventory

Removed 57 entries, approximately 0.79 MiB. This is additional to earlier cleanup recorded in cleanup-results.json; its roughly 1.18 GiB recovery is historical and is not counted again. Exact paths, reasons and inventory: [final-hygiene.json](../artifacts/app-polish/release-qa/final-hygiene.json). Removed only untracked task-generated, unreferenced logs, sort/filter UI hierarchy XML captures, the superseded intermediate pinch screenshot an empty output directory, and the six temporary final-audit helpers/exports. No tracked deletion.

Retained 111 artifact files: final acceptance JSON receipts, referenced validation logs, rollback bundles/SQL, deployed voting definitions and contract fixtures, selected flow/keyboard/status/framing/sort screenshots, crop images and metadata. The three byte-identical JPG pairs have separate script input/evidence roles; deleting them would break QA scripts. Final framed screenshots replace the intermediate pinch capture in documentation.

## Preserved uncertain and independent work

- Six running buffago-polish-acceptance containers, staging database, generated function loaders and local main/Kong copies. Active environments were not stopped or deleted. Their ignored synthetic credential/session files remain necessary to resume acceptance and were never printed.
- 103 stopped native PG17 fixture directories under crawl/.expo/phase7b3d-native17-minimal/fixtures. No running postgres process was observed and sampled directories have no postmaster.pid, but no remaining directory ID was attributable to app-polish evidence. They were preserved because the shared harness also serves earlier phase and guest/Mango work.
- Native PostgreSQL/Deno binaries and cache, .expo/app-polish-edge compiled bundles, node_modules, older .tmp browser profiles, existing crawl Supabase containers and stopped phase7b25 containers. Ownership or continued use is uncertain, or tests require them; no dependency or binary was removed without proof.
- Mango restaurant-review, growth dashboard (including its tracked screenshots), guest onboarding, independent artifacts, mango-restaurant-review.patch and the already modified tracked Python bytecode. No unrelated work was restored or deleted.

## Source and ignore review

All changed tracked paths against the base and visible untracked source were inventoried; added lines were scanned for debug/fixture/local endpoint and conflict markers. Voting handlers and access checks remain byte-identical to deployed candidates. Local endpoints and synthetic IDs are confined to opt-in QA harnesses, fixtures and the isolated local stack. The development fixture route additionally requires __DEV__ and the invalid fixture host. The crop diagnostic requires __DEV__ plus the QA flag and is consumed by capture-synthetic-crop.mjs, so it is intentional QA instrumentation. No source correction was required by this cleanup. Existing compact source formatting was preserved.

Root/crawl ignore rules already protect .env files, .secrets, .expo credentials/cache, native build output and Python caches. Added narrow app-polish generated XML/runtime-log rules and local .branches ignore. Reviewed screenshots, meaningful tests, SQL, receipts and required source remain visible. Ignore rules do not remove already tracked Python bytecode.

## Intended changed source/release files

This list includes the app-polish implementation, meaningful tests, QA reproduction harnesses, local baseline dependencies and release documentation; required artifact evidence is enumerated separately in final-hygiene.json. Wingman/dialog/service changes also overlap preserved guest-onboarding work and should be reviewed together, without reverting either contribution.

- .gitignore
- Agents/Jalapeno/tests/test_wing_processing_repository.py
- Agents/Jalapeno/wing_processing_worker/repository.py
- crawl/app/(tabs)/ratings/index.jsx
- crawl/app/_layout.tsx
- crawl/app/dev-app-polish.jsx
- crawl/components/AppStatusBar.jsx
- crawl/components/PhotoVoteControls.jsx
- crawl/components/WingJuryGame.jsx
- crawl/components/WingdexPhotoGallery.jsx
- crawl/components/WingdexPhotoViewer.jsx
- crawl/components/WingmanAddDialog.jsx
- crawl/components/wingShots/WingShotFlow.tsx
- crawl/components/wingShots/WingShotFramingPreview.tsx
- crawl/components/wingShots/WingShotMediaPreview.tsx
- crawl/components/wingShots/mediaAdapter.ts
- crawl/lib/Wingman/WingmanService.ts
- crawl/lib/Wingman/types.ts
- crawl/lib/photoVoteEvents.js
- crawl/lib/savedDestinations.js
- crawl/lib/statusBarPolicy.js
- crawl/lib/wingJuryService.js
- crawl/lib/wingShotFraming.js
- crawl/lib/wingdexCollection.js
- crawl/lib/wingdexGallery.js
- crawl/lib/wingdexPhotos.js
- crawl/lib/wingmanAsync.ts
- crawl/lib/wingmanFocus.js
- crawl/metro.config.js
- crawl/scripts/app-polish-native-qa.mjs
- crawl/scripts/qa/android-pinch/AndroidManifest.xml
- crawl/scripts/qa/android-pinch/PinchInstrumentation.java
- crawl/scripts/qa/android-pinch/build.ps1
- crawl/scripts/qa/app-polish-baseline-edge-audit.py
- crawl/scripts/qa/app-polish-local-api-proxy.ts
- crawl/scripts/qa/app-polish-local-main.sh
- crawl/scripts/qa/app-polish-release-documentation.py
- crawl/scripts/qa/app-polish-run-real-worker.py
- crawl/scripts/qa/app-polish-runtime-routing.py
- crawl/scripts/qa/app-polish-stage-functions.py
- crawl/scripts/qa/app-polish-staging-catalog-audit.py
- crawl/scripts/qa/app-polish-staging-cleanup-endpoint.mjs
- crawl/scripts/qa/app-polish-staging-cleanup.mjs
- crawl/scripts/qa/app-polish-staging-common.mjs
- crawl/scripts/qa/app-polish-staging-derivatives.py
- crawl/scripts/qa/app-polish-staging-edges.mjs
- crawl/scripts/qa/app-polish-staging-fixtures.mjs
- crawl/scripts/qa/app-polish-staging-refresh-auth.mjs
- crawl/scripts/qa/app-polish-staging-storage-cascades.mjs
- crawl/scripts/qa/app-polish-staging-upload.mjs
- crawl/scripts/qa/app-polish-staging-votes.mjs
- crawl/scripts/qa/capture-synthetic-crop.mjs
- crawl/scripts/qa/verify-framing.py
- crawl/scripts/qa/wingdex-sort-filters-native.mjs
- crawl/supabase/config.toml
- crawl/supabase/functions/_shared/wingmanConfidence.ts
- crawl/supabase/functions/_shared/wingmanDeadline.ts
- crawl/supabase/functions/_shared/wingmanMenuEvidence.ts
- crawl/supabase/functions/wing-jury-reveal/index.ts
- crawl/supabase/functions/wing-jury-vote/index.ts
- crawl/supabase/functions/wing-public-gallery/index.ts
- crawl/supabase/functions/wingman-intake/index.ts
- crawl/supabase/local/app-polish-acceptance/.gitignore
- crawl/supabase/local/app-polish-acceptance/README.md
- crawl/supabase/local/app-polish-acceptance/baseline/audit_dependencies.py
- crawl/supabase/local/app-polish-acceptance/baseline/build_schema.py
- crawl/supabase/local/app-polish-acceptance/baseline/catalog-buckets.json
- crawl/supabase/local/app-polish-acceptance/baseline/catalog-policies-normalized.json
- crawl/supabase/local/app-polish-acceptance/baseline/catalog-schemas.json
- crawl/supabase/local/app-polish-acceptance/baseline/catalog-sequences.json
- crawl/supabase/local/app-polish-acceptance/baseline/catalog-signatures.json
- crawl/supabase/local/app-polish-acceptance/baseline/catalog-source.json
- crawl/supabase/local/app-polish-acceptance/baseline/catalog-staging-bucket.json
- crawl/supabase/local/app-polish-acceptance/baseline/catalog-views.json
- crawl/supabase/local/app-polish-acceptance/baseline/dependency-audit.json
- crawl/supabase/local/app-polish-acceptance/baseline/edge-direct-dependencies.json
- crawl/supabase/local/app-polish-acceptance/baseline/edge/_shared/wingShotResponse.ts
- crawl/supabase/local/app-polish-acceptance/baseline/edge/fresh-deployed-source-capture.json
- crawl/supabase/local/app-polish-acceptance/baseline/edge/manifest.json
- crawl/supabase/local/app-polish-acceptance/baseline/edge/transport-manifest.json
- crawl/supabase/local/app-polish-acceptance/baseline/edge/wing-media-promote/index.ts
- crawl/supabase/local/app-polish-acceptance/baseline/edge/wing-media-stage-authorize/index.ts
- crawl/supabase/local/app-polish-acceptance/baseline/edge/wing-media-staging-cleanup/index.ts
- crawl/supabase/local/app-polish-acceptance/baseline/edge/wing-media-validate/index.ts
- crawl/supabase/local/app-polish-acceptance/baseline/fresh-wingman-rpc-definitions.json
- crawl/supabase/local/app-polish-acceptance/baseline/photo-worker-functions.json
- crawl/supabase/local/app-polish-acceptance/baseline/platform-storage-column-definitions.json
- crawl/supabase/local/app-polish-acceptance/baseline/platform-storage-columns.json
- crawl/supabase/local/app-polish-acceptance/baseline/platform-storage-prerequisites.sql
- crawl/supabase/local/app-polish-acceptance/baseline/provided-media-voting.sql
- crawl/supabase/local/app-polish-acceptance/baseline/schema-baseline.sql
- crawl/supabase/local/app-polish-acceptance/baseline/validate_schema.py
- crawl/supabase/local/app-polish-acceptance/supabase/config.toml
- crawl/supabase/migrations/20261013011230_mango_restaurant_review.sql
- crawl/supabase/proposals/app-polish-shared-photo-votes.sql
- crawl/supabase/proposals/app-polish-vote-conflict-review.sql
- crawl/tests/app-polish-conflict-reconciliation.test.mjs
- crawl/tests/app-polish-deployed-contract.test.mjs
- crawl/tests/app-polish-focus-framing.test.mjs
- crawl/tests/app-polish-gallery-cache.test.mjs
- crawl/tests/app-polish-latest-action-postgres.test.mjs
- crawl/tests/app-polish-statusbar.test.mjs
- crawl/tests/app-polish-vote-bridge.test.mjs
- crawl/tests/app-polish-vote-concurrency.test.mjs
- crawl/tests/app-polish-votes-postgres.test.mjs
- crawl/tests/app-polish-withdrawal-history.test.mjs
- crawl/tests/fixtures/legacy-photo-voting.js
- crawl/tests/fixtures/native-visual/WingmanService.ts
- crawl/tests/fixtures/native-visual/approvedPhoto.js
- crawl/tests/fixtures/native-visual/framing-landscape.png
- crawl/tests/fixtures/native-visual/supabase.js
- crawl/tests/fixtures/native-visual/wingShotStaging.ts
- crawl/tests/helpers/photo-controls-runtime.mjs
- crawl/tests/helpers/photo-vote-compatibility-fixture.mjs
- crawl/tests/image-workflow-mobile-runtime.test.mjs
- crawl/tests/saved-destinations-service.test.mjs
- crawl/tests/wing-jury-deno-runtime.test.mjs
- crawl/tests/wing-jury-service.test.mjs
- crawl/tests/wing-jury-ui.test.mjs
- crawl/tests/wing-shot-validation-flow.test.mjs
- crawl/tests/wingdex-gallery-contract.test.mjs
- crawl/tests/wingdex-gallery-deno.test.mjs
- crawl/tests/wingdex-gallery-device.test.mjs
- crawl/tests/wingdex-photo-server.test.mjs
- crawl/tests/wingdex-photo-viewer.test.mjs
- crawl/tests/wingdex-photo-voting.test.mjs
- crawl/tests/wingdex-sort-filters.test.mjs
- crawl/tests/wingman-atomic-rate-limit.test.mjs
- crawl/tests/wingman-confidence.test.mjs
- crawl/tests/wingman-search-prefill.test.mjs
- crawl/tsconfig.json
- crawl/types/deno-runtime.d.ts
- crawl/types/wingdexPhotos.ts
- docs/buffago-app-polish-deployment-manifest.json
- docs/buffago-app-polish-release-plan.md
- docs/buffago-app-polish-staging-acceptance.md
- docs/buffago-app-polish.md
- docs/buffago-app-polish-final-hygiene.md
- artifacts/app-polish/release-qa/final-hygiene.json
- artifacts/app-polish/release-qa/final-hygiene-checks.json
- artifacts/app-polish/release-qa/deployment/production-edge-deployment-final.json

## Independent changed files preserved

- Agents/Jalapeno/__pycache__/supabase_client.cpython-312.pyc
- Agents/Mango Habanero/README.md
- Agents/Mango Habanero/server/approval.mjs
- Agents/Mango Habanero/server/index.mjs
- Agents/Mango Habanero/server/restaurantEvidence.mjs
- Agents/Mango Habanero/server/restaurants.mjs
- Agents/Mango Habanero/src/RestaurantQueue.jsx
- Agents/Mango Habanero/src/main.jsx
- Agents/Mango Habanero/src/styles.css
- Agents/Mango Habanero/tests/approval.test.js
- Agents/Mango Habanero/tests/localOrigin.test.js
- Agents/Mango Habanero/tests/restaurantEvidence.test.js
- Agents/Mango Habanero/tests/restaurantUi.test.jsx
- Agents/Mango Habanero/tests/restaurants.test.js
- artifacts/guest-onboarding/backend-manifest.json
- artifacts/guest-onboarding/focused-tests.log
- artifacts/guest-onboarding/postgres-tests.log
- artifacts/guest-onboarding/production-readonly-evidence.json
- artifacts/guest-onboarding/typecheck.log
- artifacts/restaurant-review/changed-files.txt
- artifacts/restaurant-review/mango-fixture-approval.png
- artifacts/restaurant-review/mango-fixture-evidence.png
- artifacts/restaurant-review/mango-fixture-rejection-history.png
- artifacts/restaurant-review/mango-live-pending.png
- artifacts/restaurant-review/prefill-api-error.log
- artifacts/restaurant-review/prefill-api.log
- artifacts/restaurant-review/prefill-vite-error.log
- artifacts/restaurant-review/prefill-vite.log
- buffago-growth-command-center/README.md
- buffago-growth-command-center/artifacts/operations-redesign/buffago-growth-1280x720.png
- buffago-growth-command-center/artifacts/operations-redesign/buffago-growth-1600x900.png
- buffago-growth-command-center/artifacts/operations-redesign/buffago-growth-800x480.png
- buffago-growth-command-center/models.py
- buffago-growth-command-center/tests/test_models.py
- buffago-growth-command-center/tests/test_screenshots.py
- buffago-growth-command-center/ui/dashboard.py
- crawl/components/OnboardingFlow.tsx
- crawl/scripts/qa/guest-onboarding-checks.mjs
- crawl/scripts/qa/read-eas-submissions.cjs
- crawl/tests/mango-restaurant-concurrency.test.mjs
- crawl/tests/mango-restaurant-intake.test.mjs
- crawl/tests/mango-restaurant-postgres.test.mjs
- crawl/tests/wingman-guest-onboarding.test.mjs
- crawl/tests/wingman-guest-postgres.test.mjs
- docs/ios-guest-onboarding-fix.md
- docs/mango-restaurant-review.md
- mango-restaurant-review.patch

## Remaining issues before commit

The previously observed Wingman v17 preservation test in app-polish-deployed-contract.test.mjs is stale relative to preserved guest-intake changes: the Jury tests passed but the Wingman test failed during deployment preflight. It was not rewritten to make independent work appear passing. Reconcile its baseline with that work before using the whole suite as a commit gate. Physical Android/native iOS, provider-backed Wingman calibration and other release gates remain as documented; Edge deployment alone does not close them. Do not commit ignored active credentials/runtime state or unrelated changes as part of app-polish without reviewing scope.

No staging, commit, push, PR, merge, reset, bulk clean, production write, deployment or branch deletion occurred during cleanup. Final local hygiene validation is recorded in final-hygiene-checks.json.

Final checks passed: Git index empty, no tracked deletions, git diff --check clean, no conflict markers, no broken Markdown/release paths, and all static relative imports resolve (including native/web platform modules). Local secret/output paths are ignored; required release files remain visible. No broad suite was repeated because cleanup changed no application or test source. Existing trailing spaces outside the changed hunks were preserved to avoid formatting churn.
