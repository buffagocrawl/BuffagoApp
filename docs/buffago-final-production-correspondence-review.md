> Current 2026-10-10 handoff: external R3 queries are reported complete, but nine full bodies are not present locally; XP-level additionally mismatches checkout. See [current release review](buffago-final-supabase-deployment-approval.md#chatgpt--ready-for-deployment-review), [exact blockers](buffago-final-engineering-blockers.md) and [focused test results](buffago-final-engineering-verification.json). Earlier evidence below is retained and does not establish complete production parity.

# Production correspondence review — 2026-10-10

**NO-GO remains.** Input: [actual read-only production evidence](buffago-production-readonly-evidence-2026-10-10.md). No production connection was opened during this continuation. R1/R2 and account metadata are completed evidence; R3 is unexecuted and needs separate approval.

The [exhaustive comparison](buffago-final-readonly-correspondence.json) records all **20 returned signatures**, production source/config MD5s, selected checkout paths, every historical candidate's raw/LF body hashes, and signature/security/config comparisons. Extraction uses dollar-quoted PostgreSQL `prosrc` text, preserving the newline immediately after the quote. Normalization changes **only CRLF to LF**, not indentation, comments, trailing whitespace or logic. Search paths are normalized as PostgreSQL configuration values and encoded using PostgreSQL array-text quoting. Matching bodies/configurations were also independently checked after installation into PostgreSQL 17.6.

## Correspondence

| Function (exact full signatures in comparison JSON) | Body result | Checkout SQL under `crawl/supabase/migrations/` | Signature / config / SECURITY DEFINER |
| --- | --- | --- | --- |
| award_referral_xp_internal | EXACT MATCH | 20260724033000_referral_system_v1.sql | match / match / match |
| Badge_Add_Rating_Milestones | SOURCE NOT AVAILABLE | none | unavailable locally |
| can_user_appear_socially | EXACT MATCH | 20260622130000_add_social_opt_out.sql | match / match / match |
| enqueue_referral_push_internal | EXACT MATCH | 20260724033000_referral_system_v1.sql | match / match / match |
| flag_referral_account_deletion | EXACT MATCH | 20260724033000_referral_system_v1.sql | match / match / match |
| friend_pair_is_blocked | MISMATCH | 20260623190000_add_friends_system.sql | match / match / match |
| mango_clear_ineligible_priority | MISMATCH | 20260729170000_mango_habanero_review_dashboard.sql | match / match / match |
| referral_profile_eligibility | EXACT MATCH | 20260724133000_referral_profile_eligibility.sql | match / match / match |
| settle_referral_for_rating_internal | EXACT MATCH | 20260724133000_referral_profile_eligibility.sql | match / match / match |
| sync_verified_referral_badges_internal | EXACT MATCH | 20260724033000_referral_system_v1.sql | match / match / match |
| wing_photo_processing_blocker | NORMALIZED MATCH | 20261008171906_wing_photo_derivative_recovery.sql | match / match / match |
| wing_transition_submission | EXACT MATCH | 20260730233913_wing_review_intake_lifecycle.sql | match / match / match |
| storage.protect_delete | SOURCE NOT AVAILABLE | none | unavailable locally |
| storage.update_updated_at_column | SOURCE NOT AVAILABLE | none | unavailable locally |
| grant_pg_graphql_access (issue_pg_graphql_access) | SOURCE NOT AVAILABLE | none | return/event/config metadata only |
| pgrst_ddl_watch | SOURCE NOT AVAILABLE | none | return/event/config metadata only |
| complete_wing_account_media_cleanup | EXACT MATCH | 20260729121000_wing_shots_security_rpc.sql | match / match / match |
| finalize_wing_submission_upload | MISMATCH | 20261007000241_image_workflow_rc_regression.sql | match / match / match |
| prepare_wing_account_media_cleanup | EXACT MATCH | 20260729121000_wing_shots_security_rpc.sql | match / match / match |
| reserve_wing_submission_upload | MISMATCH | 20261007000241_image_workflow_rc_regression.sql | match / match / match |

Totals: **10 exact, 1 normalized, 4 mismatched, 5 unavailable**. All 15 functions with checkout candidates have matching returned identity signatures, configuration fingerprints and SECURITY DEFINER settings. Older reserve overloads are listed separately and never treated as the returned 11-argument signature. The two absent photo-named RPCs are not deployment requirements: checked-in calls use the returned submission-named RPCs.

The normalized blocker has raw MD5 `759cfdb3a5e6a6bdf07765719474fd99`; LF MD5 `77e5eb7a71360ecea76985ac278ce8a2` matches production. Its PostgreSQL config MD5 is `047a8d61c365228c81e80926d3284293`. Production is not byte-identical to the CRLF checkout; tests install the LF form.

| Mismatch | Production body MD5 | Latest corresponding checkout raw / LF MD5 |
| --- | --- | --- |
| friend_pair_is_blocked | dbb0188e6e65df3e38d401d995812e50 | 77b9e45f4b6d11f9049e653650001b83 / same |
| mango_clear_ineligible_priority | e6afd97295efcd4fd14542212290b7f0 | 0b716cf31e5d673c63e29ce753f46f68 / same |
| finalize_wing_submission_upload | d7c7c9a5f47e72f04450197be6f76b53 | 9e768f97f38fead75ed36cc70841be94 / 026517bc51bae5678c5359a304ac106f |
| reserve_wing_submission_upload | b743ef604059e9ffa454dc8085caad9b | ddd9692ce92ee1a4561e36452c19b771 / efa690b798033db82faf8b0cbb465df4 |

None of those production MD5s matches any extracted historical candidate. A mismatch is not evidence of malicious or broken code, and the latest checkout is not a safe substitute for production compatibility testing.

Production public owners are `postgres`; Storage owners are `supabase_storage_admin`; both event-handler owners are `supabase_admin`. Checked-in CREATE statements do not independently prove historical execution ownership. The installed matched functions are owned by the disposable `postgres` role. The attachment identifies three PUBLIC EXECUTE cases but does not supply complete per-function ACL arrays for the remaining functions, so complete ACL parity is not claimed.

## DDL event handlers — first deployment gate

`issue_pg_graphql_access` is enabled for `ddl_command_end` / `CREATE FUNCTION`, handler MD5 `dd3f3e2bb94cff45ef24b9cecb6af1c8`. `pgrst_ddl_watch` is enabled for all `ddl_command_end` tags, handler MD5 `7f27b8118fea5c88b0164331292859e3`. Both return `event_trigger`, are PL/pgSQL VOLATILE SECURITY INVOKER, owned by `supabase_admin`, and have empty search path, config MD5 `af3be9c3d4c2d891da1a7618c49685d3`.

There are no local handler implementations to compare. Their unqualified names in the attachment do not establish handler schemas; the new request follows each event's `evtfoid` instead of guessing a schema. Exact source is necessary to evaluate grants, schema-cache notifications, dependencies and exceptions under the proposed DDL. No synthetic handler was installed or used as acceptance evidence in this continuation. After retrieval, test the exact frozen DDL locally with actual handlers/bindings and equivalent owners/default ACLs, including COMMIT-only notifications, rollback, and final privilege/preflight checks. L4 remains open.

## Focused disposable compatibility results

[New results](buffago-final-matched-test-results.json): **13 checks passed**, exit 0, native EDB PostgreSQL **17.6**, unique loopback-only cluster, retained fixture/WAL evidence. Log: `crawl/.expo/final-readonly-matched-tests.log`. Reproduce with `BUFFAGO_PHASE7B3D_NATIVE17=1 node scripts/final-readonly-matched-tests.mjs` from `crawl`. This is a focused script with grouped assertions, not 13 new Node feature tests; the historical **409** accounting remains untouched.

All 11 matched bodies were installed and checked inside PostgreSQL against the production source/config/security fingerprints. Actual implementations tested: social opt-out; referral live-profile/banned/deleted eligibility; settlement's profile/rating rejection; existing XP ledger receipt replay; preference-controlled push and deduplication; settlement's late push-failure atomic rollback; settlement success using existing XP receipts and no duplicate rewards; badge award/removal/idempotency; Auth-deletion referral signal; photo owner/original/active-processing blockers; transition approval actor and receipt replay; account prepare/complete and late intent write.

Tables are reduced prerequisites, with exact checked-in referral table/index definitions where applicable. No unmatched helper body or synthetic replacement function was installed. Successful settlement uses two pre-existing XP ledger receipts, so it validates the actual recovery branch and downstream graph, **not fresh XP issuance or level calculations**. The matching award body calls `public.xp_level_for(integer)`, whose production fingerprint was not returned. Request its metadata first and compare checkout before asking for its source. Other dependencies discovered in the nine missing bodies must be requested by exact signature only after inspection. Whole rating-trigger/reward correspondence remains incomplete because Badge, Mango and friend blocking are unverified.

## Account deletion/upload fence — not atomic

The matching prepare RPC takes an account-delete transaction advisory lock, locks existing owned submissions, collects their original/processed/thumbnail/generated paths, inserts a manifest, withdraws/pseudonymizes existing media, and cancels existing reserved intents. It omits uploaded-but-unfinalized intent paths. The matching complete RPC only changes a pending manifest to `objects_deleted` or terminal `failed`; it has no upload or Auth guard.

The fresh local test commits prepare, then uses another backend to insert a reserved intent while the Auth identity remains present. Completion subsequently succeeds and the new intent survives. This demonstrates that **these matching cleanup RPCs alone do not establish a persistent fence**. Reduced-table privileged insertion is not proof that production client RLS or its mismatching reserve RPC permits this write. Production reserve/finalize source and the deployed upload/Storage access paths are necessary to settle that broader question. The checked-in reserve/finalize candidates use quota/rating/mutation locks rather than the cleanup lock and do not check a durable deletion state, but those candidate bodies are explicitly not production matched.

The reviewed delete-account candidate's late-media/intent inventories are defense in depth. Separate PostgREST/Storage/Auth HTTP calls cannot share prepare's transaction lock. A final successful reread leaves a window before `auth.admin.deleteUser`; cancellation does not revoke existing signed upload capability or stop an in-flight service promotion. Deleting Auth does not itself prove old JWTs cannot write to Storage: [Supabase's current user-management documentation](https://supabase.com/docs/guides/auth/managing-user-data#deleting-users) confirms already-issued JWTs remain valid until expiration. The existing contract therefore **cannot currently be accepted as atomically preventing new uploads throughout cleanup and Auth deletion**.

Before acceptance, either prove a separately approved external fence covering every writer and outstanding capability, or approve a new forward correction after reconciling production source. A backend correction should persist a per-user deletion fence before manifest creation; serialize reservation/finalization and prepare under the same per-user lock; reject fenced writes through RPC, direct Data API, upload/promotion Edge, Storage and workers; drain pre-fence in-flight writes/capabilities before freezing the complete inventory; and retain the fence through Storage cleanup, retries/failures and confirmed Auth deletion, including stale-token handling. Merely adding an advisory lock to prepare or checking a manifest in a different transaction is insufficient. No corrective migration is authored against unknown production upload contracts, and the frozen release SQL is unchanged.

Keep the existing terminal-failed-manifest and rating_id RESTRICT decisions explicit: neither reset failed manifests nor detach rating/media to manufacture deletion success. Owner-approved recovery of unmanifested objects and baseline linked-rating deletion blockers remains necessary.

## Minimum separately approved request

[New R3 draft](buffago-final-minimal-r3-source-request.sql): **nine exact bodies**, limited to the two actual event bindings, Badge milestone, Mango priority clearing, friend blocking, two Storage guards, and submission reserve/finalize. It requests no matching body again, no broad catalog dump, and no application rows. It suppresses body output on fingerprint drift and reports metadata so drift can be reviewed separately. Operator screening/redaction may make full parity unavailable; never call a redacted body an exact match.

The draft was parsed/executed successfully inside a disposable PostgreSQL 17.6 `BEGIN READ ONLY` / `ROLLBACK`; returned synthetic source output was suppressed. This checks syntax/read-only compatibility only and is excluded from the 13 grouped behavior checks. The original migration and preflight SHA-256 values were rechecked against the approval packet and remain unchanged.

The same draft contains one **metadata-only** request for `xp_level_for(integer)` newly identified in the matched award implementation. Its source is not yet requested. R1/R2 and account-column/function queries should not be rerun just to reproduce this attachment. Neither this draft nor a source request authorizes a production connection or deployment.

## What remains before production authorization

1. Approve/retrieve the nine screened bodies and XP-level metadata; reconcile source/config/signatures and any newly discovered exact dependencies. Run actual event-handler and full rating/reward/upload compatibility acceptance locally.
2. Prove an upload/Storage/worker fence lasting through cleanup and Auth deletion, with in-flight/stale-token coverage; resolve failed/unmanifested cleanup and linked-rating RESTRICT recovery decisions.
3. Controlled disposable Supabase Storage/Auth/gateway acceptance: upload/promotion/derivatives, signing/expiry/withdrawal/deletion, retries/rate limits and authorization boundaries. Obtain deployed Edge source/bundle/config/runtime/lock evidence and predecessor inventories for all proposed functions, including delete-account.
4. Close the existing history exception/custom-ledger, exact artifact/bundle approvals, reviewed CA/SCRAM/verify-full target identity, runtime/credentials/durable evidence, independently approved pre/post state digests, coordinated DDL/grant/ledger freeze and rating-write pause, maintenance/smoke/containment/recovery scope, and named owner/backup.
5. Explicit authorization for the exact production write/deployment window. Keep release feature flags false until their separately approved gates close.

UI screenshots are review-only local artifacts; they close no database, service, release or native-build gate.
