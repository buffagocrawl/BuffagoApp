# Buffago — focused production-readiness next actions

**Status: NO-GO for SQL migration or Edge deployment.** Project `vhfxnizaxdanmvmouuaf`. This document summarizes read-only observations; it is neither deployment approval nor a production runtime parity certification.

## New read-only findings (2026-10-10)

| Deployed Edge function | Version | `verify_jwt` | Observed responsibility |
| --- | ---: | --- | --- |
| `delete-account` | 15 | true | Calls `delete_account_data({p_user_id})`, then `auth.admin.deleteUser` |
| `wing-media-stage-authorize` | 13 | false; bearer checked via `getUser` | Creates a signed Storage upload URL and advertises `expiresInSeconds: 7200` |
| `wing-media-validate` | 14 | false; bearer checked via `getUser` | Validates staged photo and stores validation metadata |
| `wing-media-promote` | 14 | false; bearer checked via `getUser` | Reads upload intent and validated staged media; copies to destination Storage |
| `wing-media-staging-cleanup` | 9 | false; bearer checked via `getUser` | Removes user-scoped staging objects |
| `wing-media-staging-gc` | 7 | false | Background staging garbage collection |

The signed-upload URL is **not continuously authenticated as a user bearer token for every subsequent upload request**. Supabase's published `createSignedUploadUrl` documentation says these upload URLs can be used without further authentication and are valid for **two hours**. Existing `stage-authorize` source issues them using a service-role Storage client. This requires testing a token issued *before* deletion against the full deletion protocol, Storage policies, and worker paths. The `expiresInSeconds` returned by the deployed Edge function is an advertised lifetime, not an independent measurement of a particular token.

Actual production `reserve_wing_submission_upload` MD5 `b743ef604059e9ffa454dc8085caad9b`, and `finalize_wing_submission_upload` MD5 `d7c7c9a5f47e72f04450197be6f76b53`, were retrieved under approved R3; neither screened function body visibly implements a user-level account-deletion fence. Their per-rating / per-quota advisory locks and upload-intent row locks are not equivalent to an account deletion lock. R3 also retrieved both actual DDL handler bodies and five other helpers (9/9 fingerprint-matched to *expected production* MD5, not checkout). Details in the preceding evidence summary.

The live `delete-account` function implements **a different deletion workflow** from the locally prepared candidate: it calls `public.delete_account_data(uuid)` and then Auth deletion, not an explicit prepare -> Storage.remove -> complete -> Auth.delete sequence. The actual body of `delete_account_data` was outside the approved R3 scope and remains unknown.

The three new `wing-jury-*` functions were not present in the 12-item deployed-function inventory. Existing `delete-account` v15 source has been retrieved, but its bundle SHA `78d7e9f2c8387d1147a7498d9ce80560f54175ae60fbbd838f41da3d603f4bf7` and file inventory alone do not establish a tested rollback mechanism.

## Immediate narrow evidence request

An explicit separate read-only authorization is required before executing **`buffago-delete-account-readonly-request.sql`** to inspect the production `public.delete_account_data` function body, ownership/configuration and fingerprint. The SQL is `BEGIN READ ONLY` / `ROLLBACK`, 5-second lock and 60-second statement timeout, and does not request user data. Screen returned function source for secrets before sharing it.

## Focused Codex engineering work

1. **Release separation decision.** Determine whether the frozen four-table Wing Jury / Saved Destinations migration + three new functions can be safely released *without changing `delete-account` v15*, preserving its actual account-deletion semantics. Test the full existing deletion path against new FKs, count triggers, pseudonymization and votes. Do not presume separation is safe merely because the delete correction is optional in source packaging.
2. **Atomic account-state contract.** If a deletion correction is needed, design a durable, irreversible `deleting` state or tombstone and serialize state transition with every upload reservation, finalization and promoter write using one account-wide coordination contract. Check all direct Data API, service-role, worker, Storage and signed-token paths. An Edge reread cannot create an atomic multi-service fence.
3. **Stale token/in-flight simulation.** Before deletion prepare: issue an upload token, start an upload, pause prior to Storage completion. Start deletion, then resume upload. Repeat with token issued earlier but used after Auth deletion, and with overlapping promoter/derivative workers. Assert no resurrected objects, orphaned ownership, inappropriate publishability, or false delete success. For a token that remains usable, test safe quarantine/denial or an independently verified drain-and-sweep protocol; do not assume token revocation or TTL changes without real Storage proof.
4. **Deletion failure and recovery.** Test `prepare`, Storage failures, failed terminal manifests, `complete`, Auth deletion, old-client writes, replay/correlation, linked `rating_id` RESTRICT edges and retry policies. Never silently unlink existing media, disable constraints or report `ok:true` before cleanup is confirmed.
5. **Production behavior parity.** Exercise nine R3 actual function bodies, especially `grant_pg_graphql_access`, `pgrst_ddl_watch`, `reserve_wing_submission_upload`, `finalize_wing_submission_upload` and matched referral/Badge/Mango helpers, inside a controlled disposable parity DB. Distinguish source MD5 match to production from source match to checkout and from actual runtime/Storage parity.
6. **Release/rollback packet.** Pin the exact migration, adapter, 3 Wing Jury functions, separately versioned deletion correction if required, predecessor Edge files/config and non-destructive rating-trigger containment candidate. Finalize named owner/backup, synthetic IDs, notification suppression, history exception, custom ledger approval, trusted signing/CA/psql artifacts and maintenance window.

## Exit conditions

- All locally reproducible races and realistic Storage/Auth/Edge contract checks are PASS, including signed-token/in-flight cases.
- Actual behavior parity established or explicitly scoped controlled acceptance still required, not falsely marked complete.
- A safe **split release** versus a required new deletion migration is justified by concrete evidence.
- Updated approval packet states exact GO/NO-GO; no production modifications without a fresh, scoped operator approval.

**No production migration, function deployment or SQL writes were performed in preparing this handoff.**
