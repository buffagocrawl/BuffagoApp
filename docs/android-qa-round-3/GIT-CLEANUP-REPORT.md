# Round 3 Git cleanup and security audit

Branch: fix/android-qa-round-3. Recommended commit title: **fix(android): complete Round 3 QA improvements and backend integration**.

## Cleanup counts

| Item | Count |
|---|---:|
| Pre-existing disposable repository QA files deleted | 306 |
| Known inactive temporary PostgreSQL cluster files deleted | 1944 |
| Audit working files deleted after final checks | 15 |
| Total files deleted, including external temporary files | 2265 |
| PNG/screenshots deleted | 111 |
| PNG/screenshots retained | 23 |
| UI hierarchy XML dumps deleted | 134 |
| Other repository logs/JSON/reports/debug scripts deleted | 61 |
| Temporary logs/artifacts including DB/audit working files | 2020 |
| Permanent test/fixture files retained repository-wide | 190 |
| Permanent test/fixture files in proposed commit | 24 |
| Permanent capture maintenance scripts retained | 3 |
| Exact proposed commit-file count | 81 |
| Tracked Git deletions | 0 |

Deletion targets were checked against the exact Round 3 documentation tree, .tmp/round3-* files and the known integrate-coin-ui scratch script. Two specifically identified inactive buffago-coins test directories were removed after checking their resolved paths, absence of postmaster.pid and absence of matching active processes. Active processes were untouched. The audit's separate temporary directory was removed after results were summarized here. Removed repository files were untracked/ignored disposable artifacts, so there are no tracked deletions in the manifest.

The 23 retained screenshots cover important states, mainly one image per state at 390 dp, plus two 360 dp/1.3-text stress examples. They are synthetic fixture evidence and predate final exact-quote integration. No screenshot matrix or new visual cycle ran. Reports have no links to deleted screenshots or diagnostics.

## Security: PASS

All 81 proposed files (58 text/source files and 23 PNGs) were scanned, including tracked changes, untracked additions, documentation, SQL, test fixtures and proposed diffs. The existing scripts/security/scan-secrets.mjs passed against an isolated review index containing precisely the proposed manifest; the real Git index remains empty. Supplemental scanning covered JWT/service-role and sb_secret keys, DB passwords/connection strings, Google and AI API keys, GitHub/EAS tokens, service-account JSON, private keys/certificates, credential-like assignments and credential filenames. There are no text/EXIF metadata chunks in the retained PNGs.

| Path | Category | Remediation |
|---|---|---|
| crawl/tests/buffacoin-pricing.test.mjs | Synthetic fixture credential placeholder | Not required; nonfunctional test value |
| crawl/tests/client-account-privacy.test.mjs | Synthetic fixture credential placeholder | Not required; nonfunctional test value |
| crawl/tests/fixtures/native-visual/supabase.js | Synthetic fixture credential placeholder | Not required; nonfunctional test value |
| crawl/tests/helpers/wingJuryEdgeHarness.mjs | Synthetic fixture credential placeholder | Not required; nonfunctional test value |

No actual credentials, hardcoded live bearer tokens, customer records or credential logs were found in proposed files. Local .env/credential files were preserved and remain excluded. Source references to environment variables are configuration lookup, not embedded credentials. No real public anon/publishable or Maps key literals occur in this proposed commit; no credential restriction or rotation claim is made.

## Release/source verification

All 14 Round 3 changes, deployed SQL, Edge source and permanent regressions are retained. Cleanup did not alter application behavior or SQL definitions. Isolated-index diff checking found redundant EOF blank lines in the Jury SQL file and PostgreSQL concurrency test; only those blank lines were removed. Production EAS explicitly enables Wing Jury and saved destinations and does not enable QA fixture flags. Required relative imports resolve, including native/web platformMap variants; Markdown links resolve. No required harness/fixture was removed.

Read-only production inspection confirms all five relevant SQL function bodies match release SQL; active wing-jury-feed version 2 and _shared/wingJury.ts match local source after line-ending normalization. Private Jury tables have RLS enabled with no anon/authenticated table access; Jury allocation/lookup RPCs are service-only. Owner counts/pricing deny anon and allow authenticated. See [deployment verification](DEPLOYED-BACKEND-VERIFICATION.md). SQL Editor deployment does not automatically create migration-history entries. No SQL application, history repair, balance/data mutation or Edge redeployment occurred.

Release SQL byte hashes:

- crawl/supabase/proposals/android-qa-issue14-buffacoin-confirmation.sql: 22d0b2f372023ee4db269e3753b9d0bb131e67cba875181dad8057c6ce3f3143
- crawl/supabase/proposals/android-qa-round-3-randomized-jury-feed.sql: 2b702abdd62e9d8ce2183929340c0018dd7eb793068925968e19518ae75e9960
- crawl/docs/android-qa-round-3-owner-vote-counts-proposal.sql: 7d16a8e462c45acce9d71859fd9793daa8d64c9163cdeee8da4ecdc98c60a5a7

## Final verification

- Focused Round 3 suite: **200 passed, 0 failed, 0 skipped**, 26 files, about 24.1 seconds. Includes eight-independent-connection PostgreSQL transaction retries/rollback, exact pricing, payment/photo recovery, private-log permissions/quotas, page-one snapshot replay, Jury tier/pagination/security, all changed regressions and representative adjacent rating/native configuration tests.
- npm run typecheck: PASS.
- npm run lint: PASS, zero errors and 98 existing warnings.
- git diff --check: PASS; only normal Windows line-ending notices.
- Proposed-file secret scan and supplemental security/reference checks: PASS.
- Production EAS flags, deployed Edge/SQL correspondence and private permissions: PASS by config review/read-only metadata inspection.

Reproduce from crawl (no emulator/build):

```powershell
$round3Tests = @(
  'tests/androidQaJourney.test.mjs',
  'tests/buffacoin-concurrent-postgres.test.mjs',
  'tests/buffacoin-operation-recovery.test.mjs',
  'tests/buffacoin-photo-retry-integration.test.mjs',
  'tests/buffacoin-pricing.test.mjs',
  'tests/buffacoin-transaction-postgres.test.mjs',
  'tests/client-account-privacy.test.mjs',
  'tests/crawls-details-render.test.mjs',
  'tests/crawls-filter-runtime.test.mjs',
  'tests/home/quick-actions-home.test.js',
  'tests/home/weekly-mission-home-surface.test.js',
  'tests/image-first-rating-flow.test.mjs',
  'tests/native-visual-fixture.test.mjs',
  'tests/operation-ui-overhaul.test.mjs',
  'tests/rating-photo-policy-proposal.test.mjs',
  'tests/saved-destinations-service.test.mjs',
  'tests/wing-jury-edge-security.test.mjs',
  'tests/wing-jury-feed-client.test.mjs',
  'tests/wing-jury-feed-pagination.test.mjs',
  'tests/wing-jury-randomized-feed.test.mjs',
  'tests/wing-jury-service.test.mjs',
  'tests/wing-jury-ui.test.mjs',
  'tests/wing-shot-owner-votes-proposal.test.mjs',
  'tests/wing-shots-native-config.test.mjs',
  'tests/wing-shots-rating-integration.test.mjs',
  'tests/wingdexRadius.test.mjs'
)
node --test --experimental-default-type=module @round3Tests
npm run typecheck
npm run lint
```

## Preserved unrelated work and remaining blockers

Older crawl/.tmp/phase7a-* and phase7b-* artifacts, rating-comparison-export, unrelated ignored build/history artifacts, historical migrations and local credentials were preserved because ownership/use is uncertain. No unrelated tracked modifications were identified in the initial status; all initial tracked changes belong to the Round 3 groups in the handoff. No unrelated path is in [COMMIT-MANIFEST.txt](COMMIT-MANIFEST.txt).

Backend deployment is no longer pending. Separate user commit/merge approval, final visual review and authorized native paid recovery/optional-photo completion remain open. Production gateway/load capacity and pooled guest quotas were not load-tested. The retained screenshot harness previously stopped on Later/LATER case matching; it remains available unchanged for a separately authorized focused run. No build/submission or production transaction/device validation is claimed.

Nothing is staged, committed, pushed, merged, built or submitted. No branch/agent was created. The manifest includes every proposed source/test/documentation/screenshot path and excludes local/generated/unrelated files.

## Final git status --short

```text
 M .gitignore
 M crawl/app/(tabs)/_layout.tsx
 M crawl/app/(tabs)/home/index.jsx
 M crawl/app/(tabs)/ratings/index.jsx
 M crawl/app/(tabs)/routes/index.jsx
 M crawl/app/profile/history/index.jsx
 M crawl/app/profile/wing-shots/[id].jsx
 M crawl/app/profile/wing-shots/history.jsx
 M crawl/components/RatingWizardDialog.jsx
 M crawl/components/WingJuryGame.jsx
 M crawl/components/creator/WingCreatorSummaryCard.jsx
 M crawl/config/features.ts
 M crawl/eas.json
 M crawl/lib/buffacoinRatingTransaction.js
 M crawl/lib/wingCreator.js
 M crawl/lib/wingJuryService.js
 M crawl/supabase/functions/_shared/wingJury.ts
 M crawl/supabase/functions/wing-jury-feed/index.ts
 M crawl/tests/client-account-privacy.test.mjs
 M crawl/tests/crawls-details-render.test.mjs
 M crawl/tests/fixtures/native-visual/OperationUI.jsx
 M crawl/tests/fixtures/native-visual/supabase.js
 M crawl/tests/helpers/wingJuryEdgeHarness.mjs
 M crawl/tests/home/quick-actions-home.test.js
 M crawl/tests/home/weekly-mission-home-surface.test.js
 M crawl/tests/native-visual-fixture.test.mjs
 M crawl/tests/operation-ui-overhaul.test.mjs
 M crawl/tests/rating-photo-policy-proposal.test.mjs
 M crawl/tests/saved-destinations-service.test.mjs
 M crawl/tests/wing-jury-edge-security.test.mjs
 M crawl/tests/wing-jury-feed-client.test.mjs
 M crawl/tests/wing-jury-service.test.mjs
?? crawl/docs/android-qa-round-3-owner-vote-counts-proposal.sql
?? crawl/lib/buffacoinOperationStore.js
?? crawl/lib/buffacoinPricing.js
?? crawl/lib/buffacoinRatingUi.js
?? crawl/lib/wingShotHistory.js
?? crawl/lib/wingdexRadius.js
?? crawl/scripts/qa/android-round3-paid.mjs
?? crawl/scripts/qa/android-round3.mjs
?? crawl/scripts/qa/round3-screenshot-check.mjs
?? crawl/supabase/proposals/
?? crawl/tests/androidQaJourney.test.mjs
?? crawl/tests/buffacoin-concurrent-postgres.test.mjs
?? crawl/tests/buffacoin-operation-recovery.test.mjs
?? crawl/tests/buffacoin-pricing.test.mjs
?? crawl/tests/buffacoin-transaction-postgres.test.mjs
?? crawl/tests/crawls-filter-runtime.test.mjs
?? crawl/tests/helpers/buffacoin-transaction-fixture.sql
?? crawl/tests/wing-jury-randomized-feed.test.mjs
?? crawl/tests/wing-shot-owner-votes-proposal.test.mjs
?? crawl/tests/wingdexRadius.test.mjs
?? docs/android-qa-round-3/
```
