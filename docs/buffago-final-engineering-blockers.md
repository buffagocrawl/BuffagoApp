# Final engineering disposition

**Engineering PARTIAL; production NO-GO.** This mission closes locally runnable verification and packages the three Jury functions separately. It does not establish production behavior from source hashes or authorize deployment. Existing branch/work and historical failures are preserved.

## R3 recovery and exact source gap

The three `buffago-r3-production-evidence-summary*.md` files contain the same report, not three independent source exports. Each explicitly says it does not reproduce the nine bodies. They are operator evidence that bodies were retrieved and fingerprint-verified, but no runnable body bytes are available locally. Do not repeat R3 against production merely because its existing output was omitted from the handoff: transfer the retained screened results.

| Required retained R3 body | Verified production MD5 | Reported characters |
| --- | --- | ---: |
| extensions.grant_pg_graphql_access(), bound to issue_pg_graphql_access | dd3f3e2bb94cff45ef24b9cecb6af1c8 | 1357 |
| pgrst_ddl_watch(), resolve actual schema from retained binding | 7f27b8118fea5c88b0164331292859e3 | 729 |
| public."Badge_Add_Rating_Milestones"() | 298aa31f809efe43252005021f089fc1 | 1590 |
| public.finalize_wing_submission_upload(uuid,text,uuid) | d7c7c9a5f47e72f04450197be6f76b53 | 6084 |
| public.friend_pair_is_blocked(uuid,uuid) | dbb0188e6e65df3e38d401d995812e50 | 202 |
| public.mango_clear_ineligible_priority() | e6afd97295efcd4fd14542212290b7f0 | 215 |
| public.reserve_wing_submission_upload(uuid,text,text,bigint,text,text,text,text,uuid,uuid,text) | b743ef604059e9ffa454dc8085caad9b | 6715 |
| storage.protect_delete() | 998d324ea2b1abc49351e8c2367b5796 | 424 |
| storage.update_updated_at_column() | 7596e66a7698d5a6b5129c5ce9b24c5f | 57 |

Supply exact body text, newline encoding, signatures/arguments, language/return/security/search-path/owner/ACL metadata and event bindings from the already approved results. MD5s/lengths alone cannot recover these implementations. Install only fingerprint-verified bodies into disposable tests; preserve any redaction as a parity limitation.

The R3 metadata for `public.xp_level_for(integer)` newly proves a **mismatch**: production `5fba55f09b21a6b0824b9abd87fadf59`, checkout raw/LF `952cb844d1b79c9972dd72ec67051813` in `20260622220000_add_xp_ledger.sql`. Signature, SECURITY INVOKER and empty configuration MD5 match. Its source was not retrieved. Fresh XP/level issuance cannot use the checkout substitute as production parity.

New scoped operator approval is needed for just **two exact bodies initially**: `public.xp_level_for(integer)` and `public.delete_account_data(uuid)`. [Reviewable two-signature request](buffago-final-additional-source-request.sql) has passed a disposable READ ONLY syntax check. Existing [delete-account request](buffago-delete-account-readonly-request.sql) is retained; the new request narrows identity to the exact UUID overload. No new production request was executed. Additional exact dependencies should be identified only from those returned bodies.

## Can the release retain delete-account v15?

**UNRESOLVED; retention is not approved, and replacement is not justified as safe.** The R3 report establishes ACTIVE v15, `verify_jwt=true`, reported deployed bundle SHA-256 `78d7e9f2c8387d1147a7498d9ce80560f54175ae60fbbd838f41da3d603f4bf7`, and `delete_account_data(p_user_id) → auth.admin.deleteUser`. The local candidate instead uses `prepare → Storage.remove → complete → Auth.delete`. Neither candidate tests nor matching prepare/complete bodies establish v15's deployed behavior. Actual v15 source/bundle bytes are also missing from the local handoff, so its reported hash is not a tested restore archive.

The new saved-list and Jury account FKs are CASCADE, not new RESTRICT edges. Focused PostgreSQL tests demonstrate removal of deleted voters' own lists/votes, exact count adjustment, retained other voters' history, owner withdrawal hiding a photo, unchanged gallery counts, and existing media RESTRICT rollback. These establish a bounded **additive database delta**, not that v15 invokes the matching cleanup, covers unfinalized originals or fences uploads. Without `delete_account_data`, existing ownership triggers and actual Storage/worker contracts, a claim that retaining v15 is safe is unsupported. Conversely, a pre-existing hazard is not evidence that the local deletion repair or a guessed backend patch solves it.

The user independently reports signed upload capability lifetime **7,200 seconds**. This is an externally reported upload lifetime, distinct from the candidates' **300-second public read URLs**. No local request or timing test verified the production upload lifetime. A transaction advisory lock released at prepare COMMIT cannot cover either lifetime or subsequent HTTP work. A manifest reread, cancelled intent or Auth row deletion cannot establish revocation/draining of previously issued or in-flight writes.

Therefore the proposed release package **excludes delete-account** as a concrete scope boundary pending a decision; it is not permission to deploy while the deletion gate remains open. Preserve the original four-function candidate/archive for review and do not deploy its repair speculatively.

## Required race acceptance matrix

| Scenario | Evidence available locally | Remaining actual acceptance |
| --- | --- | --- |
| Account deletion during active upload | Matching prepare cancels present intents; separately committed late-intent witness survives | Actual reserve/finalize, delete_account_data, upload/promotion and Storage service |
| Already-issued 7,200-second upload tokens | Externally reported lifetime; no revocation proof | Test issued-token writes throughout fence, failure and Auth deletion; verify actual token claims/runtime |
| In-flight Storage upload | No real Storage upload exercised | Drain/fence byte writes and promotions; include an upload begun before deletion that finishes afterward |
| Reservation/finalization races | Cleanup-only counterexample; R3 says reserve/finalize lack visible account fence | Both actual backend orderings and writer admission across every path |
| Worker after deletion starts | Matching photo blocker tests deletion/ownership/process blockers | Actual claimed-worker writes, lease/retry/output paths, derivatives and publication behavior |
| Interrupted cleanup | Matching pending replay preserves manifest/pseudonym; local candidate tests interruptions | v15/new contract plus service object inventory and interruption recovery |
| Failed Storage deletion | Terminal failed manifest and local candidate fail-closed checks | Actual Storage failures/capabilities and supported operator recovery |
| Duplicate deletion requests | Local candidate convergence/user-binding tests | Actual v15/new RPC and backend locking, including shared outstanding writes |
| Auth deletion failure | Local candidate replay test; SQL RESTRICT failure | Actual Auth response/retry with durable fence retained |
| Existing linked-rating RESTRICT | Actual baseline FK metadata/matching cleanup tests reject and preserve state | Owner accepts or approves a separate supported repair; do not detach media/weaken FK |
| No orphaned media/inconsistent counts | Exact frozen Jury counts/cascades/rollback tested with reduced prerequisites | Complete Storage object inventory, v15 ownership behavior and actual upload/worker graph |

These are explicit unavailable requirements, not synthetic passing service tests. No in-flight-token claim is inferred from a mock Storage.remove response.

If retention cannot pass after source recovery, prepare a separately versioned forward migration and coordinated service correction. It must establish a durable per-user deletion state; use the same serialization boundary for prepare/reserve/finalize and relevant SQL writers; enforce the state on direct API, Storage, Edge promotion and workers; prevent or drain outstanding capabilities/in-flight operations before inventory is frozen; and retain the fence on interrupted cleanup, Storage failure, duplicate requests and Auth failure. Keep a tombstone/session gate for stale-token sensitive writes. Decide whether actual Storage upload handling can enforce admission at write completion before choosing implementation. A 7,200-second wait alone does not prove in-flight drain. No safe, executable correction can be inferred from missing contracts; no speculative migration or frozen-SQL edit was made.

## Production behavior boundaries

The unchanged prior [20-function comparison](buffago-final-readonly-correspondence.json) still proves 10 exact bodies, one LF-normalized body, four mismatches and five missing implementations locally. R3 changes external retrieval status, not local checkout correspondence. Matching referral/profile/push/badge-sync/social-opt-out/transition/photo-blocker/prepare/complete bodies are exercised with actual source. Fresh award-level behavior remains gated by the new XP mismatch. Home/Crawl/Buffacoin, gallery SQL and account compatibility tests use matched entrypoint bodies with explicitly reduced/surrogate transitive prerequisites; they do not close full L1–L4 parity. No unavailable DDL handler or Storage guard was synthesized for acceptance.

## Local review boundary

The prior independent Agent D review remains applicable to unchanged SQL, adapter and handler bytes. The added offline three-function packager was checked against original source/bundle/archive hashes, deterministic tar output, exact file allowlist and scoped ESLint, and its archive was independently unpacked for byte/hash verification. That mechanical cross-check is not a new independent human/agent review. Review of any recovered bodies, deletion decision or future correction remains mandatory before declaring all engineering-controlled requirements independently accepted. No independent reviewer endorsement is fabricated.
