# BuffaGo Android QA release summary

Branch: `fix/android-qa-four-issues`. All nine QA fixes are implemented. This cleanup adds no features, UI redesign, dependencies or production changes.

| Fix | Final behavior |
|---|---|
| Wing Jury access | Production flag enabled; Home and Wingdex entries remain; guest voting stays session-local. |
| Wingdex filters | Compact Filters / sort / Wing Jury toolbar; existing filter modal and five tabs retained. |
| Welcome bonus | Exactly one server-owned 100-coin welcome award; durable account-owned notice. |
| Early Bird bonus | Additive, idempotent 250-coin award; existing balances preserved. |
| Restaurant gallery | Existing approved-only gallery embedded in details; multiple images, viewer, compact empty/error states. |
| Saved destinations | Existing Favorites / Want to Try systems enabled in production; visible controls and guest sign-in handoff. |
| Compact cards | Photo-first cards with name/photo count and score/rating/Rate rows; wrapping narrow layouts. |
| Rating photos | Shared optional photo-first flow for canonical ratings, including coin and immediate Wingman ratings; private persisted drafts and receipt-bound retries. |
| Wingman prefill | Exact Wingdex query passed to editable name field; default launches reset normally. |

The previous eight-case Android matrix passed at 360/390/412/430 dp with 1x and 1.3x font scaling. Selected synthetic-fixture emulator references remain in [visual review](android-qa-additional-five/VISUAL-REVIEW.md). Redundant screenshots, XML trees, logs, intermediate JSON, downloaded QA binary and capture-only scripts were removed. Permanent regression tests, safe fixtures, security/rollback records and configuration remain.

## Production database history

The owner reports Wing Jury, BuffaCoin bonuses and Wing Shot eligibility were manually applied through Supabase SQL Editor and independently verified. Their corresponding Supabase migration-ledger entries are missing. This is a recorded history gap, not an instruction to replay SQL or repair history.

Retained records:

- [Wing Jury / saved-destination forward SQL](../crawl/supabase/local/phase-7b3a/supabase/migrations/20261010192747_wing_jury_saved_destinations_forward.sql).
- [Bonus migration source](../crawl/supabase/migrations/20261011141411_android_qa_coin_bonuses.sql), [Early Bird credit SQL](android-qa-early-bird-credit-approval.sql), [preview SQL](android-qa-early-bird-preview.sql).
- [Exact Wing Shot eligibility SQL record](../crawl/docs/android-qa-rating-photo-proposed.sql.txt), [security/scope record](../crawl/docs/android-qa-rating-photo-approval.md).

The eligibility record removes only the boolean function's `is_buffacoin` exclusion and the reason function's `buffacoin_rating` rejection. Ownership, destination matching, score and duplicate checks remain; private staging, consent and moderation remain. Historical migrations were not rewritten. No SQL, migration repair, db push, coin credit or Edge deployment was performed during cleanup.

The retry integration regression uses the actual client transaction and upload helpers with an isolated mock backend: lost coin response and explicit same-operation retry produce one debit and rating; failed finalization, persisted resume and concurrent photo retry produce one reservation, promotion and photo. This is client regression evidence, not an independent audit of production transaction internals.

## Cleanup verification

Final results are recorded here after the cleanup checks. Physical-device/internal-release validation remains the owner's later release step. Nothing was staged, committed, pushed, merged, deployed or built.
Final cleanup checks: 228 focused tests passed, 0 failed, 1 pre-existing legacy assertion skipped; the separate PostgreSQL 17.6 bonus concurrency test passed (229 passing checks total). Typecheck passed. Lint passed with 0 errors and 98 existing warnings. Release configuration verifies Wing Jury and Saved Destinations enabled for production and internal testing. git diff --check passed.

Cleanup counts: 1,742 disposable files removed (157 prior QA artifacts plus 1,585 files from the new isolated concurrency fixture after confirmed shutdown). Retained QA documentation/reference set: 21 files (19 existing references plus this summary and the proposed-file list). All application, regression, fixture, SQL/migration and security files were preserved except four capture-only scripts. All 66 tracked files in buffago-growth-command-center were preserved; no unrelated tracked modifications or untracked files were present in the initial status. Ambiguous ignored artifacts, local credentials/configuration and active Metro/Expo state remain untouched.

Proposed commit paths: [explicit file list](android-qa-proposed-files.txt), including intentional tracked deletions. Recommended title: fix(android): finalize nine QA fixes and remove generated evidence. No actual staging or commit was performed; secret scanning uses a disposable index only.
