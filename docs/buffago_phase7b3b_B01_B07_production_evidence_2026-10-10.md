# Buffago — Phase 7B.3B B01–B07 production read-only evidence

**Inspected:** 2026-10-10  
**Supabase project ref:** `vhfxnizaxdanmvmouuaf`  
**Source packet:** `docs/phase-7b3b-remaining-production-readonly.sql` (uploaded)  
**Baseline:** `docs/phase-7b3b-final-release-gate.md` (uploaded)  
**Action:** Seven groups of `SELECT`-only statements executed through the connected Supabase SQL tool. They were submitted as individual read-only catalog queries rather than as a single `BEGIN READ ONLY` script; none were DDL or DML. No user/application rows, function bodies, raw statements or credentials were requested. **No schema changes, migrations, Edge deployment, feature enablement, or production writes.**

**Status: B01–B07 evidence collected; production application still NO-GO.** Catalog observations are a point-in-time snapshot. They do not replace a newly authenticated, certificate-verified deployment connection or real gateway/transaction testing. The separate full catalog snapshot/preflight file was **not executed**, because the release gate explicitly reserves it for an approved change window after the B01–B07 review.

## B01 — Project and runtime identity

- Connected control-plane project: ref `vhfxnizaxdanmvmouuaf`; status `ACTIVE_HEALTHY`; region `us-east-2`; database host `db.vhfxnizaxdanmvmouuaf.supabase.co`; project metadata database version `17.6.1.011`.
- SQL session: `current_database=postgres`, `current_user=postgres`, `session_user=postgres`, `server_version_num=170006` (PostgreSQL 17.6), isolation `read committed`, `rolbypassrls=true`.
- **Limit:** This verifies the connected SQL session, not the future executor's network route, TLS `verify-full`, credentials, role or session identity.

## B02 — Migration ledger

- Relation `supabase_migrations.schema_migrations` owned by `postgres`, `relacl=NULL`, `relrowsecurity=false`.
- Columns, in order: `version text NOT NULL`, `statements text[] NULL`, `name text NULL`, `created_by text NULL`, `idempotency_key text NULL`, `rollback text[] NULL`; no column defaults observed.
- Constraints: `schema_migrations_pkey PRIMARY KEY(version)`, `schema_migrations_idempotency_key_key UNIQUE(idempotency_key)`; both validated.
- Ledger relation has **zero non-internal triggers** and **zero rewrite rules**.
- **35 rows**, **35 distinct versions**; first `20260625000100` (`jalapeno_phase2_foundation`, 46 statement elements; full-array MD5 `89c74d5e929915033a0622c3b8fc71d7`); last `20261009201342` (`wing_photo_vote_gallery_eligibility`, 1 statement element; full-array MD5 `580c6a1da15acbc88596ccfa77ec0d59`). The proposed `20261010192747` version is greater than the current latest. Observed stored statement-array cardinalities: 1, 3, 5, 7, 8, 9, 12, 13, 15, 16, 19, 27, 45, 46, 48. **Mixed historical cardinalities do not establish that the proposed single-element array is the supported production deployment representation.**
- Six enabled database event triggers: `issue_graphql_placeholder` (sql_drop/DROP EXTENSION), `issue_pg_cron_access` (ddl_command_end/CREATE EXTENSION), `issue_pg_graphql_access` (ddl_command_end/CREATE FUNCTION), `issue_pg_net_access` (ddl_command_end/CREATE EXTENSION), `pgrst_ddl_watch` (ddl_command_end), `pgrst_drop_watch` (sql_drop). Owned by `supabase_admin`; none were modified.
- The 35 row versions, in order: `20260625000100`, `20260627000100`, `20260627000200`, `20260627000300`, `20260724020000`, `20260724040000`, `20260724050000`, `20260724140000`, `20260724141000`, `20260729140000`, `20260729150000`, `20260729160000`, `20260730120000`, `20260730145055`, `20260730222132`, `20260731010318`, `20260731012137`, `20260731013505`, `20260802143027`, `20261006235107`, `20261007000241`, `20261007001523`, `20261007002518`, `20261007003617`, `20261007120615`, `20261007121117`, `20261007125712`, `20261007233721`, `20261008121036`, `20261008133555`, `20261008144550`, `20261008171259`, `20261008171906`, `20261008184025`, `20261009201342`.

## B03 — Execution authority and role boundaries

- `postgres`: `rolbypassrls=true`, `rolcreaterole=true`, `rolcreatedb=true`, `rolsuper=false`, `rolinherit=true`. It has schema `USAGE` and `CREATE` in `public`, `private`, and `supabase_migrations`; `USAGE` but not `CREATE` in `auth` and `storage`.
- As observed in the SQL session, `postgres` has SELECT/INSERT/UPDATE/DELETE/TRIGGER/REFERENCES/TRUNCATE/MAINTAIN rights on the seven checked tables including `supabase_migrations.schema_migrations`, `destination_ratings`, `wing_media_submissions`, `storage.objects`, `auth.users`, `destinations`, and `crawls`.
- `anon` and `authenticated`: `rolbypassrls=false`, cannot use `private` or `supabase_migrations` schemas, and have no role memberships/reachable SET roles in B03. `service_role` has `rolbypassrls=true` but has no reachable SET roles and cannot use `private` or `supabase_migrations`.
- **IMPORTANT default-grant finding:** In schema `public`, `postgres` has `pg_default_acl` entries giving `anon`, `authenticated` and `service_role` broad privileges by default on newly created tables/sequences/functions (`arwdDxtm`, `rwU`, `X` respectively). The frozen migration/pre-COMMIT verifier MUST specifically remove or reject unsafe default privileges on *new feature objects*, then assert effective privileges, without altering unrelated preexisting defaults. Its local test must cover this actual default-ACL shape.
- None of these checks proves actual PostgREST gateway/JWT enforcement or the future external executor connection identity.

## B04 — Collision checks

**All four queried collision sets returned zero rows:**

- 14 named feature relations/indexes in `public`/`private`.
- Feature types `wing_jury_%`, `user_destination_favorites`, `user_want_to_try`.
- 13 named feature functions and potential overloads.
- Named `destination_ratings_%`, `wing_jury_%`, and new collection triggers.

This is a time-sensitive clean observation only; repeat immediately before application.

## B05 — Constraints and indexes

- 167 returned constraint records touching the specified baseline tables or foreign-key targets: **all validated, none deferrable**.
- 28 index rows on `destination_ratings` (7), `wing_media_submissions` (13), `storage.objects` (8): **all valid and ready**.
- `destination_ratings` FK to `crawls(crawl_id)` is `ON DELETE CASCADE`; to `destinations(id)` is `ON DELETE CASCADE`; to `auth.users(id)` is `ON DELETE CASCADE`. It has `PRIMARY KEY(id)` and `UNIQUE(destination_id,crawl_id,user_id)`.
- `wing_media_submissions` FK to `destination_ratings(id)` and to `destinations(id)` is `ON DELETE RESTRICT`; to `auth.users(id)` it is `ON DELETE SET NULL`. This is consistent with the release gate's requirement not to add a new Jury media-retention veto.
- Multiple existing external tables reference `wing_media_submissions(id)` with mixtures of `RESTRICT`, `CASCADE`, or `SET NULL`; the real deletion flow must respect them. Existing valid indexes include `wing_media_public_photo_destination_idx` and `idx_wing_media_title_card_rank`. No new feature index collision was found.
- These findings verify FK/index metadata, **not successful production deletion orchestration**.

## B06 — Existing function metadata/dependency visibility

- **26 function metadata rows**, including existing rating, Buffacoin, social, photo/moderation, referral, and account-cleanup functions. **46 pg_depend metadata rows**; returned dependencies were generally schema and PL/pgSQL language, not transitive table/SQL behavior.
- Selected deployed body MD5 fingerprints (metadata only; not function source):

| Function | MD5 (`pg_proc.prosrc`) |
|---|---|
| `submit_validated_restaurant_rating(...)` | `c81bf474e0ff7aed9e4cdb36098f381a` |
| `submit_validated_crawl_rating(...)` | `eeb943e155e279fd937a05f0150ef622` |
| `submit_buffacoin_rating_v1(uuid,uuid,text,integer,jsonb)` | `bc00b094b62a76dd269dc3aca0a72213` |
| `"Badge_Add_Rating_Milestones"()` | `298aa31f809efe43252005021f089fc1` |
| `guard_buffacoin_rating_writes()` | `b20e1dd1709b7f4f309086cc44e57511` |
| `enqueue_friend_rating_notification()` | `698de3165796ddc48b9198b3e7f261b3` |
| `mango_clear_ineligible_priority()` | `e6afd97295efcd4fd14542212290b7f0` |
| `guard_wing_photo_approval()` | `fbe2738b657b8f835692585ba351b55c` |
| `enqueue_wing_photo_upload_derivatives()` | `c1ba55009a3532cdc7adfb2d18c5297b` |
| `withdraw_wing_submission(uuid,text,text,uuid)` | `e6d81c3254fab8d90fa119e596b0c21d` |
| `prepare_wing_account_media_cleanup(uuid,uuid)` | `7fb25452bff5a1911d85e41bd3b7dbed` |
| `complete_wing_account_media_cleanup(uuid,boolean,text)` | `bb59e829e4cf848befa9e9c90fb93801` |
| `private.validate_wing_media_photo_vote()` | `93667fd6433a290d1cf4e89267327649` |
| `private.refresh_wing_media_photo_vote_counts()` | `3678ca3e53070266debd85cf6523eea2` |
| `wing_apply_owner_pseudonymization()` | `de76b9c0f76f833db3712676d0cc1b60` |

**Important:** Those signatures and hashes don't certify implementation behavior or lock ordering. The cited release gate still requires screened bodies/runtime caller/transaction retry evidence and representative parity tests. Existing security-definer functions with broad EXECUTE grants are existing baseline observations, not permission to broaden any new feature grants.

## B07 — Long transactions and blockers

Returned **zero rows** matching transaction age over 30 seconds or blocking-session condition **at observation time**. This does not promise a lock-free future maintenance window or validate 5-second/60-second timeouts on production-scale traffic.

## Decisions and remaining gates

**Cleared as production catalog evidence:** connected target identity, observed role/ownership/privilege footprint, existing ledger schema and 35-row history, current naming availability, existing constraint/index mappings, fingerprints and pg_depend visibility, momentary blocker check. This is sufficient for Codex to update its local compatibility and deployment planning evidence.

**NOT CLEARED:** actual trigger/RPC/deletion/retry behavior; whole-transaction `40P01`/`40001` retry and idempotency; real Supabase PostgREST/JWT and Storage signing behavior; project-provenanced TLS `verify-full` production adapter and same-session preflight; historical migration provenance exception/decision and **explicit acceptance of a custom one-row ledger mechanism**; representative locking/index-build/scale testing and approved maintenance window; incident owner and actual deployed Edge predecessor bundles/rollback approval; synthetic production smoke-write identities and authorization; separate exact migration deployment permission; later native enablement approval.

**Special caution:** `postgres` has permissive schema `public` *default* object grants to API roles. The release executor's post-DDL pre-COMMIT privilege hardening is therefore especially important; avoid treating a clean B04 collision scan as an ACL green light.

**Snapshot gate:** `phase-7b3b-catalog-snapshot-readonly.sql` was inspected and is read-only, but **not executed**. The runbook requests it only after B01–B07 review within an approved change window, then a fresh immediate comparison before any separately authorized migration execution. No baseline snapshot MD5 was approved or invented.

**Recommendation to Codex:** Integrate these actual B01–B07 facts into `docs/phase-7b3b-final-release-gate.md`, the baseline contract, readiness and handoff. Check the frozen migration against the observed default ACLs and ledger schema/array representation. Request screened behavior/source evidence only for the specific remaining RPC/trigger/deletion/retry gap. Do not alter frozen file hashes, change history, or deploy. If frozen SQL fails pre-COMMIT effective-ACL checks against the actual default privileges, record a blocker and require a separately reviewed new artifact rather than silently weakening guards.
