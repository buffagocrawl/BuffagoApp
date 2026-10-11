> Current 2026-10-10 handoff: external R3 queries are reported complete, but nine full bodies are not present locally; XP-level additionally mismatches checkout. See [current release review](buffago-final-supabase-deployment-approval.md#chatgpt--ready-for-deployment-review), [exact blockers](buffago-final-engineering-blockers.md) and [focused test results](buffago-final-engineering-verification.json). Earlier evidence below is retained and does not establish complete production parity.

# Final PostgreSQL behavior evidence

**2026-10-10 continuation supersedes the outstanding-source statements below:** actual production R1/R2/account fingerprints have now been supplied and exhaustively compared. See [current production correspondence and 13 focused PG17.6 checks](buffago-final-production-correspondence-review.md), [all 20 comparisons](buffago-final-readonly-correspondence.json), and the [minimum nine-body R3 request](buffago-final-minimal-r3-source-request.sql). Matching referral/social/transition/blocker/cleanup functions now have actual-body local evidence. Badge/Mango/friend blocking/Storage/event/upload source and fresh-XP transitive correspondence remain open. The earlier 33-test run and its fixture limitations below are historical evidence, not a claim that every helper is still missing. The cleanup contract still cannot establish an atomic fence through Auth deletion.

Date: 2026-10-10. Branch: `feat/wing-jury-favorites-want-to-try`.
Production target: `vhfxnizaxdanmvmouuaf`. No production session was opened.

The frozen migration and preflight remain unchanged. Tests apply the exact
feature SQL only to disposable loopback PostgreSQL 17.6 fixtures. Existing
historical migration files, constraints, reward triggers, gallery votes and
feature flags were not changed by this review.

## What the evidence establishes

The seven new checks in
`crawl/tests/database/phase-final-compatibility-postgres.test.mjs` passed on
PostgreSQL 17.6: **7/7, zero failures/skips, 108327.6468 ms**. Initial log:
`crawl/.expo/final-A-compatibility-initial.log`.

The final regression run includes the preserved draft (15), compatibility (4),
matched-body behavior (7), and final compatibility (7) checks: **33/33 PASS,
zero failures/skips/cancellations, exit 0, 485752.0436 ms**. Retained log:
`crawl/.expo/final-A-postgres-regressions.log`. The repeated initial seven checks
are not added again to the unique test count.

| Area | Demonstrated locally | Limit |
| --- | --- | --- |
| Home | Actual fingerprint-matched body: fresh/replay, concurrent same operation with loser `23505`, later receipt recovery, Want cleanup and late referral failure rollback. Whole RPC `40P01`/`40001` retries preserve the operation ID. | Referral/reward/social helper behavior is not production matched in reduced fixtures. Home receipt replay returns the original operation even if later inputs differ; callers must retain the exact original payload. |
| Crawl | Actual matched body: INSERT/conflicting UPDATE, stable rating/provenance identity, changed scores, late referral failure rollback. | No operation receipt contract equivalent to Home is introduced. Exactly once reward effects need actual helper correspondence. |
| Buffacoin | Actual matched body: atomic wallet/debit/rating/Want rollback, replay, real independent-backend advisory-lock wait and one debit. | Reduced wallet/crawl/reward prerequisite tables do not prove actual deployed transitive triggers. |
| Collections | Exact frozen triggers: race orderings, reassignment, final-rating Favorite removal, Want cleanup, fixed-snapshot isolation rejection, failed media RESTRICT retaining rating/lists. | Baseline receipt/other retention relationships are preserved; tests do not authorize unlinking media. |
| Photo upload/approval | Actual matched enqueue/approval bodies: pending/unsettled rejection, settled derivative and canonical object requirement, upload derivative receipt. | Actual blocker, Mango/transition, processing workers and Storage API still need matching evidence/runtime acceptance. |
| Jury/gallery | Exact frozen Jury plus matching gallery validation/count bodies: independent mutable gallery counts and immutable verdicts; -1/0/+1, duplicate conflicts, account cascades and concurrent count arithmetic. | Gallery predecessor schema is reduced and its exact RLS service integration is not synthesized. |
| Media deletion | All **15** actual catalog-matched incoming RESTRICT edges reject physical deletion atomically with unchanged Jury/gallery state. With those baseline blockers absent, existing gallery and new Jury/count rows cascade. | This preserves the established deletion contract; it does not authorize deleting linked jobs/rewards to clear restrictions. |
| Withdrawal | Both real backend orderings serialize vote/withdrawal; committed verdict survives withdrawal, eligibility hides photo, later votes fail. | Actual matched withdrawal RPC still depends on an explicitly labelled surrogate transition helper until its fingerprint/body is supplied. |
| Storage metadata | Archived objects and delete markers are ineligible; prior immutable verdicts/counts survive. | SQL catalog presence does not prove byte existence, active-version resolution, signing, public access restrictions or removal API behavior. |
| Account cleanup | Actual matched prepare/complete: interrupted pending replay preserves original paths and pseudonym; late failure rolls back manifest/transitions/owner; terminal failed manifest replay; successful Auth-parent cascade adjusts Jury counts and removes saved lists. | Auth/Storage APIs and the deployed Edge bundle were not accessed. No actual physical object removal is inferred from calling completion with `true`. |
| DDL handlers | Only two applicable handlers are identified in supplied evidence. Existing final ACL/atomic rollback tests fail closed on introduced unexpected rights. | No exact handler body/binding evidence is present; synthetic handlers cannot certify production parity. |

## Confirmed account deletion hazard and correction boundary

The exact matched `prepare_wing_account_media_cleanup` body first collects
original/processed/thumbnail/generated paths for `submission.user_id`, then
pseudonymizes the media (`user_id = NULL`). Its manifest persists the original
paths. The matched completion helper transitions only a `pending` manifest.
`failed` is terminal; calling successful completion on it returns **false**.
Same-correlation prepare replays the failed status and original paths.

A fresh correlation after the first prepare sees no media owned by that user
and returns an empty path list. The old checkout `delete-account` handler
generated a new correlation on every invocation and checked only completion
errors, ignoring a false completion result. A retry could therefore reach Auth
deletion while the original failed manifest still contained private paths.
The new test proves the actual matched SQL prerequisite for that failure;
the application agent owns the reviewed service correction and its tests.

The matched prepare helper also replays correlation IDs globally without
checking the requested user. The service must bind any reused correlation and
manifest lookup to the verified Auth user. Do not expose this trusted service
helper as a client mutation interface.

Supported local recovery after interruption: reuse the original **pending**
manifest/correlation, remove its retained paths in bounded idempotent Storage
batches, require a confirmed successful completion, then delete Auth last.
If a Storage batch explicitly fails, preserve the failed manifest and Auth
identity, return a controlled error, and require operator recovery of the exact
retained path list. A new empty manifest is not recovery. No existing RPC resets
the failed manifest. Any change to its terminal state requires separately
reviewed operational authorization or a versioned correction; none occurred.

The existing `wing_media_submissions.rating_id` RESTRICT still blocks Auth
deletion through the rating CASCADE even after the media owner is pseudonymized
and Storage completion succeeds. That is established baseline behavior. The
new Jury and saved-list FKs add no additional blocker in the locally demonstrated
paths. Do not unlink photos or weaken the FK to claim a deletion PASS. Owner
must accept or separately remediate the baseline linked-rating behavior before
claiming full deletion success for those accounts.

## Minimal external evidence

[Screened read-only request](buffago-final-behavior-readonly-request.sql) has not
been executed on production. It requests missing direct/transitive helper fingerprints,
the two applicable event-handler bindings, and only known missing/unmatched
Badge/Mango/event bodies. Metadata comes first, so matching checkout helpers
can be reused without requesting their bodies again. No B01-B07 repetition,
application records, private paths, secrets, ledger SQL or production DDL is
requested. An operator must screen implementations before sharing them.

The exact SQL packet was also parsed and executed inside a **disposable local
READ ONLY transaction**, with all returned synthetic source output suppressed:
PASS, exit 0. Log: `crawl/.expo/final-A-readonly-packet-local.log`. This is a
syntax/read-only check, not another Node test count and not production evidence.

Required missing bodies/correspondence: actual Badge, Mango, referral settlement
and its consumed award/profile/badge/push helpers, social/block helpers,
transition and photo blocker, referral account-deletion trigger, Storage
delete/update guards, plus `issue_pg_graphql_access` and `pgrst_ddl_watch`
handlers. Supplied fingerprints for already matching rating, approval,
enqueue, withdrawal, prepare/complete, gallery, owner-pseudonymization and
notification implementations are reused. Additional dependencies discovered
inside a newly screened body require only a subsequent exact signature request.

Local candidates for the metadata-first comparison are below. These are
**unmatched candidates**, not verified deployed definitions. Files are under
`crawl/supabase/migrations/`. Compare the supplied production raw body MD5 to
either raw or LF-normalized column before reusing any candidate.

| Helper | Candidate file | Raw MD5 | LF MD5 |
| --- | --- | --- | --- |
| can_user_appear_socially | 20260622130000_add_social_opt_out.sql | f4519e4112e7497b0acc5207054f2e3c | 71b0ead8cde41e1101e52844ea97c8a5 |
| friend_pair_is_blocked | 20260623190000_add_friends_system.sql | 77b9e45f4b6d11f9049e653650001b83 | 77b9e45f4b6d11f9049e653650001b83 |
| settle_referral_for_rating_internal | 20260724033000_referral_system_v1.sql | 702899ec9f8dc100aa10d97560294d2b | 33343807268d7839b555dead06556a94 |
| settle_referral_for_rating_internal | 20260724133000_referral_profile_eligibility.sql | 582d64ecad7b96c027de2c7384ece5be | fe89fc9ea0a3167bffc0aaadf22839ac |
| referral_profile_eligibility | 20260724133000_referral_profile_eligibility.sql | 3e430d004bfebc4c183545257015f45d | af8ccd920e53105578ac067ee53a5544 |
| award_referral_xp_internal | 20260724033000_referral_system_v1.sql | ee57684e110b9b013e947ffcd1979b0f | b78c91bc46fab0fa13df0d7cfe604290 |
| sync_verified_referral_badges_internal | 20260724033000_referral_system_v1.sql | 990b49ddc24b22b12a913858b1b04320 | 782f35bd82eff909e1bbade59b631355 |
| enqueue_referral_push_internal | 20260724033000_referral_system_v1.sql | 79f580d07ab242be795e3bf0965a6f59 | 60b86c245533e467452ede0312bac688 |
| flag_referral_account_deletion | 20260724033000_referral_system_v1.sql | 65b376c54d2fdf603650f063d1f14df6 | d7bfcc8afeb0a15f4552bcb7d0febd85 |
| wing_transition_submission | 20260729121000_wing_shots_security_rpc.sql | f30330a8d531afd43f3401bd02f8446c | b902f54312639fa88591d74bad0586cd |
| wing_transition_submission | 20260730233913_wing_review_intake_lifecycle.sql | ed3cd6c94145df3a63a364e2cef69fcc | 6febaf0fda38f06c6ece140f66ff4975 |
| wing_photo_processing_blocker | 20261008171906_wing_photo_derivative_recovery.sql | 759cfdb3a5e6a6bdf07765719474fd99 | 77e5eb7a71360ecea76985ac278ce8a2 |

Badge, the two event handlers and the Storage guards have no recovered matching
local implementation. Mango's known local hash is
`0b716cf31e5d673c63e29ce753f46f68`; production is
`e6afd97295efcd4fd14542212290b7f0`, so that candidate cannot supply parity.

For L4, restore exact screened handlers and bindings in a disposable parity
fixture; run exact feature DDL under equivalent ownership/default ACLs. Verify
CREATE FUNCTION behavior, schema cache notifications delivered after COMMIT
and withheld on rollback, unchanged old handlers, expected final ACL/RLS/owner,
transactional unexpected-grant refusal and injected handler-error rollback.
Never perform a production DDL trial. Without the screened originals, this
remains an external implementation-evidence gate.

For live Storage/Auth, supply the exact deployed `delete-account` bundle/config
and predecessor evidence, private bucket version/lifecycle configuration, and
an authorized disposable Supabase service instance. Controlled acceptance:
synthetic uploader and voter; pending/failed/succeeded derivatives; approval
rejection/success; missing/archived/delete-marker/versioned canonical objects;
signed URL fetch before expiry and denial after expiry; no original/thumbnail
identity leakage; withdrawal during vote; 101+ paths split across two removal
batches; interrupt/fail second batch; pending replay and terminal-failed
containment; Auth deletion last; linked-rating RESTRICT refusal. Record fixed
IDs, action counts, configuration/bundle hashes and expected receipts/counts.
Live production scope requires separate permission and notification suppression.

## Test environment and final disposition

Native EDB PostgreSQL 17.6 archive SHA-256:
`d378882abd001a186735acd6f6ba716bca6ccd192e800412d4fd15ed25376b3e`.
The harness checks archive provenance, exact executable/server version,
127.0.0.1-only listening and unique fixture directories/ports. Files, WAL and
server logs remain in `crawl/.expo/phase7b3d-native17-minimal/fixtures/`.
No existing PostgreSQL service/cluster was used or modified.

Actual matched account body MD5 values:
prepare `7fb25452bff5a1911d85e41bd3b7dbed`,
complete `bb59e829e4cf848befa9e9c90fb93801`.
The test checks raw function-body hashes before installation; native transport
preserves CR-containing bodies. Reduced/surrogate prerequisites remain clearly
labelled. Final regression result: **33/33 PASS**, recorded above. A separate
local READ ONLY SQL-packet syntax check passed and is excluded from that test
count. Required branch and `git diff --check` also passed at completion.

This document supports bounded local engineering acceptance. It does not grant
full L1-L4 production parity or deployment authorization. Missing actual
transitive implementations, service/deployed correspondence and handler
evidence remain explicit external gates.
