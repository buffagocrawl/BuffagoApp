# Buffago — approved R3 production read-only evidence summary

Date: 2026-10-10 (project context). Supabase project: `vhfxnizaxdanmvmouuaf`.

**Action performed:** approved R3 read-only PostgreSQL queries (with `BEGIN READ ONLY`, 5-second lock timeout, 60-second statement timeout); plus read-only deployed Edge Function inventory and `delete-account` version inspection. **No migration, function deployment, SQL write, or feature enablement occurred.**

## R3 function source verification

All nine requested source bodies were returned from production. Each body matched the expected *production* MD5 supplied in the approved R3 request. This does **not** mean those bodies match the checkout source or that full behavior parity tests have passed.

| Requested function / handler | Production `md5(prosrc)` | Source length (characters) |
| --- | --- | ---: |
| `issue_pg_graphql_access` (`extensions.grant_pg_graphql_access()`) | `dd3f3e2bb94cff45ef24b9cecb6af1c8` | 1357 |
| `pgrst_ddl_watch` | `7f27b8118fea5c88b0164331292859e3` | 729 |
| `public."Badge_Add_Rating_Milestones"()` | `298aa31f809efe43252005021f089fc1` | 1590 |
| `public.finalize_wing_submission_upload(uuid,text,uuid)` | `d7c7c9a5f47e72f04450197be6f76b53` | 6084 |
| `public.friend_pair_is_blocked(uuid,uuid)` | `dbb0188e6e65df3e38d401d995812e50` | 202 |
| `public.mango_clear_ineligible_priority()` | `e6afd97295efcd4fd14542212290b7f0` | 215 |
| `public.reserve_wing_submission_upload(uuid,text,text,bigint,text,text,text,text,uuid,uuid,text)` | `b743ef604059e9ffa454dc8085caad9b` | 6715 |
| `storage.protect_delete()` | `998d324ea2b1abc49351e8c2367b5796` | 424 |
| `storage.update_updated_at_column()` | `7596e66a7698d5a6b5129c5ce9b24c5f` | 57 |

New XP metadata: `public.xp_level_for(integer)` owner `postgres`, SQL STABLE, security definer false, source MD5 `5fba55f09b21a6b0824b9abd87fadf59`, config MD5 `d41d8cd98f00b204e9800998ecf8427e`, no function-level search_path override. Its source body was **not** requested or retrieved.

## Behavioral observations to reconcile, not approvals

- Production `reserve_wing_submission_upload` performs validation, checks upload-suspension conditions, locks by rating and user quota via advisory transaction locks, accesses upload intents, and handles idempotency. Its screened body does **not** visibly reference account-deletion manifests or a user-level account-deletion fence.
- Production `finalize_wing_submission_upload` uses an advisory transaction lock, locks relevant intent rows, checks an object in `storage.objects`, validates rating association, and updates upload intents. Its screened body also does **not** visibly reference account-deletion manifests or a user-level account-deletion fence.
- This inspection cannot prove that the complete Storage/Edge/worker pipeline lacks every possible fence. It also **cannot establish atomic deletion safety**, including in-flight signed uploads, until actual end-to-end contracts are tested.
- The GraphQL event handler can create/alter extension-related functions/grants conditionally; `pgrst_ddl_watch` issues PostgREST schema reload notifications for specified DDL events. Actual replay of production definitions in a disposable parity database remains required.

## Deployed Edge inventory observations

- 12 deployed functions were listed. `wing-jury-feed`, `wing-jury-vote`, and `wing-jury-reveal` were **not present**.
- `delete-account` is ACTIVE version **15**, with `verify_jwt=true`, deployed Edge bundle SHA256 `78d7e9f2c8387d1147a7498d9ce80560f54175ae60fbbd838f41da3d603f4bf7`.
- Its retrieved deployed source calls `delete_account_data({p_user_id: userId})` and then `auth.admin.deleteUser(userId)`. That implementation does **not** implement the new package's proposed explicit `prepare → Storage.remove → complete → Auth.delete` orchestration. Actual behavior of `delete_account_data` has **not** been inspected in this authorized R3 scope.
- A previous bundle identifier and deployed source inspection are **not by themselves** a complete tested restore procedure. Capture/test exact predecessor files/config and source integrity before replacing `delete-account`.

## Outstanding before production deployment

1. Reconcile these *actual* bodies with checkout and run disposable production-equivalent behavior tests, including event handlers and transitive helpers.
2. Prove or separately correct the account-deletion upload write fence including stale signed tokens, workers and in-flight uploads. Review actual deployed `delete_account_data` with **new scoped read-only authorization** if needed.
3. Confirm Storage/Auth/gateway acceptance and all exact Edge predecessor and candidate artifacts.
4. Complete historical-migration exception/custom-ledger decision, trust/adapter runtime attestation, maintenance/owner/backup/containment/rollback decisions, fresh pre/post-state preflight, and separate approved production-write window.

**Verdict:** evidence gathered; **production deployment NO-GO**. Function bodies were inspected in the approved read-only query result, but this summary deliberately does not reproduce the full source texts.
