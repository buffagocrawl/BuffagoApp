# Buffago Wing Jury go-live handoff

**Decision A — SAFE SPLIT RELEASE.** Wing Jury, Favorites and Want to Try can ship independently of the existing photo-upload/account-deletion race. Retain delete-account v15 and existing upload infrastructure. No deletion replacement or correction migration is needed for this feature interaction. This is a verified engineering split decision, **not production deployment authorization**.

This handoff supersedes the earlier blanket account-fence prerequisite and missing `delete_account_data` source statements for this release. The production permission hotfix is reported by the owner as deployed and independently verified: anon/authenticated EXECUTE=false, service_role=true, body unchanged. It is not modified, packaged or redeployed here. Historical evidence documents retain their original dates/status.

## Decision evidence and limits

The supplied [production RPC evidence](buffago-production-account-rpc-evidence-2026-10-10.md) contains the actual deletion body. Restoring its explicitly normalized line endings to CRLF reproduces source MD5 **`4f108f4b39ec1d613fd5b1ba6be97c82`**. Disposable PostgreSQL also verifies its config MD5 `dcd2abd514173991611a622e71d06e6f`, postgres owner and SECURITY DEFINER=true. The reported v15 sequence is service-role RPC deletion of ratings, crawls and preferences, then Auth deletion. The SQL phases of that sequence are tested with the exact body; the actual hosted Auth/Edge transport is not simulated as production proof.

| Question | Passing evidence / result |
| --- | --- |
| New upload/storage capability? | None. Storage relation metadata/ACLs/policies and objects are identical before/after frozen SQL. Existing media/rating constraints and deletion RPC metadata/ACL are unchanged. No reserve/finalize/deletion replacement exists in the migration. Jury feed signs only eligible processed **read** URLs for 300 seconds; no candidate issues signed upload tokens or writes media. |
| New account-deletion failure? | Exact service-role RPC then Auth deletion succeeds for unlinked ratings, crawls/preferences and feature rows. Linked-photo rating RESTRICT fails with SQLSTATE 23503 **both before and after** migration, preserving ratings/crawls/preferences and, after migration, Favorites atomically. This remains an existing support concern; no FK is weakened. |
| New user-owned data left behind? | Favorites, Want to Try and Jury votes reference Auth with ON DELETE CASCADE. The last-rating deletion prunes Favorites; Wants are removed on Auth deletion. RPC retry and saved-list insertion between RPC and Auth phases still leave zero owned feature rows after Auth deletion. An Auth failure leaves the existing account intact; no successful deletion is claimed until Auth completes. |
| Jury consistency? | Deleting a voter decrements the exact vote category, preserving other users' votes. Both vote-first and Auth-delete-first concurrent orderings are tested with real backend blocking/commit. Media deletion cascades feature votes/counts without adding RESTRICT; existing media RESTRICT failure preserves them atomically. |
| Old rating behavior changed? | Existing rating/media FK definitions remain identical. The new deletion triggers only lock the user/destination identity and prune an invalid Favorite; the exact RPC and existing RESTRICT outcome are unchanged. These locks can introduce ordinary contention/timeouts but do not grant upload rights or create an account-wide fence. |
| Existing upload race worse? | Upload reservation/finalization, workers, Storage permissions, media rows and deletion RPC are unchanged. New feature writes cannot reserve, finalize, promote or upload media. Media-owner deletion uses fingerprint-matched existing pseudonymization, retains existing Storage objects identically with and without feature SQL, makes the retained media Jury-ineligible, and removes the deleted owner's votes. No orphan Storage cleanup claim is made. |

Retained count rows are aggregates keyed by submission, not orphaned user ownership. Surviving votes belong to surviving users and retain history even when a photo becomes ineligible. Existing media retention and already-issued upload capabilities remain exactly the separate upload/deletion follow-up; fixing them is **not a prerequisite for this split release**. This conclusion concerns the new feature's interaction, not proof that the pre-existing upload pipeline is race-free.

## Tests performed

New suite: `crawl/tests/database/wing-jury-split-release.test.mjs`, **7/7 pass, zero failures/skips**, PostgreSQL **17.6**. Log: `crawl/.expo/final-engineering/split-release.log`. Each account fixture installs the exact production RPC with service-only ACLs and actual frozen feature SQL; matched owner-pseudonymization source MD5 is `de76b9c0f76f833db3712676d0cc1b60`. Baseline/feature pairs establish the existing RESTRICT and retained-object outcomes. Two-session races verify blocking and commit rather than synthetic ordering alone.

Prerequisite tables are reduced, production-shaped metadata fixtures, not a production database clone. Social/Badge/referral dependencies are explicitly synthetic; baseline-compatible substitutes prevent those fixture spies from referencing not-yet-created feature tables. The new tests do not certify their full reward behavior. Initial failures were extraction/config-fingerprint and feature-dependent fixture prerequisites; these were corrected in the test harness, with no production/app/migration fix or weakened feature assertion. Prior relevant rating/gallery/reward and Edge tests remain in [focused verification evidence](buffago-final-engineering-verification.json): adapter 21 passing, compatibility 18 passing, Edge 62 passing plus the explicit gallery rerun 1 passing, and 13 actual-source groups. Those counts overlap historical tests and are not added to the 409 total. No 409 rerun or broad historical investigation occurred.

Exact three-function archive verification passes: five expected files, identical previously runtime-tested bundle bytes, correct scoped gateway settings and preserved original archive/frozen hashes. New test lint and final whitespace checks pass. [Current artifact manifest](buffago-wing-jury-go-live-artifacts.json) records the split scope; old inventory decision notes are dated provenance, not current deletion gates.

Reproduce from repository root in PowerShell:

```powershell
$env:BUFFAGO_PHASE7B3D_NATIVE17='1'
node --test crawl/tests/database/wing-jury-split-release.test.mjs
node crawl/scripts/verify-jury-review-artifacts.mjs
git diff --check
```

## Frozen deployment artifacts

Only the following SQL migration and **three** Edge functions are in the release. Preflight/config/lock/adapter files are verification and execution dependencies, not additional feature changes. No delete-account replacement, upload change or permission-hotfix replay is included.

| SQL artifact | SHA-256 |
| --- | --- |
| `crawl/supabase/local/phase-7b3a/supabase/migrations/20261010192747_wing_jury_saved_destinations_forward.sql` | `f66c4585b7c0295579ca3b188bb4464815c84328f1b2ae71b4abe7354e6cfab3` |
| `crawl/supabase/local/phase-7b3a/production-fingerprint-preflight.sql` | `66ce48f694c2e458a5622d63fd737676a26380a7aa098e748614b5fb74ef299b` |

Source paths: `crawl/supabase/functions/<name>/index.ts`. Deployable bundle paths: `crawl/.expo/final-engineering/jury-only/supabase/functions/<name>/index.js`.

| Name | Source SHA-256 | Bundle SHA-256 | verify_jwt |
| --- | --- | --- | --- |
| wing-jury-feed | `0d3950e037a50571a2379eede476affb90dac394645ab0744f2b0cc0b1c133a6` | `7f96b8a5b111d5440e74633ad58ea69ef29b2f5b57c959327d96015598e67287` | false |
| wing-jury-vote | `9f27bf24f0d07dcc9b564d71a8e191a9719dedc30bc227e4e33c02399e89210a` | `5d58219e057ba313b395c91a0ea64257db23a7c104eb863e22efb7de628cba02` | true |
| wing-jury-reveal | `45bb37d99cf71ff65f1caf0b35f648a19a44dfe8165ccc86476f176328d08bc9` | `43d1c43d330ff9c33774f4939fcb7e9e7945fc08c56f259f5e90f5844899625f` | false |

Shared source `crawl/supabase/functions/_shared/wingJury.ts`: `b9440963027ec61f1764e99c0425388578cfd23a4c639f1c6656f5ff80acfbd0`.

Archive `crawl/.expo/final-engineering/jury-only-665be695d8d7352b2a25dfc80c4f54c6d581c479961da7dcd840837560b90cb5.tar`: `665be695d8d7352b2a25dfc80c4f54c6d581c479961da7dcd840837560b90cb5`.

Scoped config `crawl/.expo/final-engineering/jury-only/supabase/config.toml`: `b8d09f5bcb34e352460b3e54a539c2246dce3b7fdd58e397f06b9bc5e10f8006`. Frozen lock `crawl/.expo/final-engineering/jury-only/deno.lock`: `056c646907d3ed80aa8f8ee2fa9acc43d463913cb1ede3a5e104ae0060e8518e`.

Rating triggers/helpers are postgres-owned with guarded SECURITY DEFINER search paths. New table grants strip inherited PUBLIC/anon access; authenticated gets owned list SELECT/INSERT/DELETE and immutable Jury SELECT/INSERT under RLS. Counts are not publicly mutable. Feed/reveal SQL RPCs are service-only; authenticated may evaluate only the trusted private eligibility predicate needed by RLS. SQL preserves baseline permissions. Feed/reveal's gateway JWT exemptions implement explicit public/guest boundaries, with application token validation where required; they are not blanket authorization to bypass user checks.

## Remaining genuine release gates and owner decisions

- **Targeted DDL compatibility:** both active production DDL event-handler fingerprints are known, but full handler bodies are still omitted from local R3 summaries. Transfer the already retrieved screened bodies and rehearse their handling of the actual frozen CREATE/GRANT/ALTER statements. This is a concrete schema-deployment dependency, not an upload-fence requirement or request to repeat the full R3 audit. If the operator already holds matching acceptance, attach it; do not fabricate acceptance from MD5 alone.
- **Gateway/service acceptance:** actual hosted JWT/guest boundaries, public approved-photo read URLs and deployment configuration require the approved synthetic smoke. Distributed limits are not implemented in these handlers; owner must approve/provision and verify gateway controls before public exposure (existing proposal: feed 60/IP/min, vote/reveal 30/account/min, burst 10, 32 KiB bodies). Native/UI review is separate from this database/Edge deployment.
- **Owner authorization:** accept the documented historical/custom six-column ledger exception, exact artifacts and guest/reveal behavior, confirm gateway control ownership, assign the maintenance/incident/backup/smoke operators and backup/PITR readiness, and authorize the exact deployment window and containment scope. History integrity remains three passing/two failing assertions, duplicate version, five checksum mismatches and seventeen unmanifested files; no repair/replay is included.
- **Fresh signed execution evidence:** refresh the strict target/runtime/permissions/full-ledger/schema pre-state and expected post-state after the already deployed ACL hotfix. Do not reuse a pre-hotfix catalog digest or treat legitimate observed change as an automatically approved baseline. Jury predecessors were reported absent; refresh that inventory before authorizing deployment.

No release gate requires replacing delete-account, recovering all upload/worker bodies or proving the unrelated upload race absent. The newly supplied deletion source and owner-reported hotfix close the prior missing-RPC/unsafe-public-execution concerns for this split analysis. Previous independent review applies to unchanged frozen artifacts; this new split test is reproducible evidence, not an invented new reviewer endorsement. ChatGPT must independently review the decision and exact bytes before coordinating authorization.

## Exact deployment order and smoke checklist

1. ChatGPT reviews this split decision, the current manifest, targeted DDL acceptance and [history decision](buffago-final-history-decision.md). Obtain explicit owner acceptance/authorization; provision the reviewed trust, psql/runtime, protected credentials and durable off-checkout attempt evidence.
2. Confirm project `vhfxnizaxdanmvmouuaf`, direct `db.vhfxnizaxdanmvmouuaf.supabase.co:5432`, database postgres, verify-full TLS/SCRAM, PostgreSQL 17.6, nonsuper BYPASSRLS postgres with `session_user=current_user`. Freeze DDL/role/grant/ledger changes and pause affected rating writes including older clients. Keep feature flags false. Verify the deployed permission hotfix read-only; do not reapply it.
3. Independently prepare and sign fresh full pre/post fingerprints, ledger baseline, window and artifact hashes. Use the existing reviewed custom adapter (`crawl/scripts/phase7b3d-production-adapter.mjs`, SHA `cddbf54051b66e84cc5bf9e8cc88ee02051e330d14afd528957071a393652118`) with its unchanged executor/attempt mechanisms. Run frozen preflight and apply only the allowlisted frozen migration atomically with one six-column ledger row. No broad CLI migration push or historical replay. Retain five-second lock/60-second statement limits and independently verify the approved committed post-state.
4. Deploy exact **wing-jury-feed**, then **wing-jury-vote**, then **wing-jury-reveal** bundles with the scoped gateway settings. Database comes first. Leave v15 and upload infrastructure untouched. Confirm deployed inventory/config and bundle correspondence.
5. Execute only the explicitly approved synthetic smoke: guest/authenticated feed boundaries and blind output; eligible processed-photo URL access/expiry; authenticated vote and duplicate vote; reveal boundaries; user isolation/denials; owned Favorites/Want to Try and rating-driven pruning; exact vote/count correspondence; unchanged Home/Crawl/Buffacoin receipts and gallery behavior; configured gateway 429 limits. An approved disposable test account can exercise the RPC then Auth deletion and confirm no owned feature rows/count discrepancy. Do not delete real users or introduce uncontrolled upload races. Linked-photo RESTRICT is an expected pre-existing refusal, not a new smoke success condition.
6. Verify postflight/catalog/ledger, retain smoke evidence, reopen paused rating writers only after acceptance and close the window. Feature flag enablement needs a separate explicit decision and is not performed or implied by this handoff.

## Non-destructive containment/recovery

Follow [maintenance/recovery](buffago-final-maintenance-and-recovery.md). Before confirmed COMMIT a failed transaction rolls back feature DDL/ledger atomically. A missing COMMIT acknowledgement requires read-only independent classification using exact approved catalog/ledger states; never automatically replay or repair ledger rows.

After deployment, pause affected writers and feature admission on incident. Flags alone cannot stop installed rating triggers. The existing separately reviewable `docs/buffago-final-rating-containment-candidate.sql` disables only the four new rating triggers and revokes feature mutation under guarded checks, retaining feature data, immutable verdicts, counts, original handlers and ledger. It needs explicit incident authorization; do not execute it as an automatic down migration. Reconcile saved lists and approve a forward correction before restoring feature writes.

Jury endpoints were reported absent before this release; authorized endpoint disablement/removal can contain new API exposure without altering v15. Do not guess a predecessor bundle. Do not delete feature tables/history, weaken media FKs, restore public delete-account RPC execution, replay the permission hotfix, or automatically restore the database. Upload/deletion remediation remains its own scoped follow-up.

**Session safety:** existing branch preserved; no production connection/write, migration/Edge deployment, commit/push, new branch/worktree, feature-flag change or Android/iOS build. The deployed hotfix was neither modified nor redeployed.
