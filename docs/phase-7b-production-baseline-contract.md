# Phase 7B production baseline contract and release decision

## Phase7B.3C current production contract — 2026-10-10

**PARTIAL / NO-GO; local preparation YES, production application NO, feature enablement NO.** [Current3C closure/adapter/history decision plan](phase-7b3c-compatibility-and-adapter-plan.md) and [updated release gate](phase-7b3b-final-release-gate.md) are authoritative. [B01–B07 evidence](buffago_phase7b3b_B01_B07_production_evidence_2026-10-10.md) is now verified, not pending: connected project/host/runtime17.6/READ COMMITTED/postgres nonsuper+BYPASSRLS, effective owner/CREATE/USAGE/FK/read/row-lock/TRIGGER/ledger authority, API no private/ledger usage/SET roles, six-column ledger35distinct versions/latest20261009201342/no relation triggers or rules, queried candidate names absent,167 validated/nondeferrable constraints and28 valid/ready indexes, no qualifying blockers at observation. These individual catalog queries are not an atomic change-window snapshot and do not prove future adapter identity or function behavior. Do not repeat B01–B07 now.

Actual postgres/public defaults give API roles table `arwdDxtm` (including MAINTAIN), sequence `rwU`, function `X`. Exact frozen new-object ALL revokes/narrow grants plus pre-COMMIT owner/RLS/effective ACL/grantee/SET/grant-option/column checks **PASS on disposable PG17.6 with those schema-specific defaults**, preserving existing defaults. No new feature sequence/membership/baseline grant or frozen change required. Migration SHA `f66c4585b7c0295579ca3b188bb4464815c84328f1b2ae71b4abe7354e6cfab3`; preflight SHA `66ce48f694c2e458a5622d63fd737676a26380a7aa098e748614b5fb74ef299b`, unchanged/verified.

Ledger original-file singleton text[]/named three-column representation is SQL-compatible with actual six-column/default/key shape; local PREPARE/SELECT proof writes no ledger rows. Custom mechanism/consumer acceptance remains explicit human decision. Nonfrozen snapshot now includes entire ledger row hash including created_by/idempotency_key/rollback drift, but was NOT executed and no digest approved. Six existing event triggers preserved; only CREATE FUNCTION/ddl_command_end handlers need behavior review for emitted commands. Eight additional matched local RPC/cleanup/approval/queue bodies reused; matched Buffacoin rollback/replay/concurrent operation lock passes with synthetic dependencies. Actual Badge/Mango/transitive helpers/lock/retry/deployed deletion/Storage behaviors remain only bounded checks, not a new broad catalog investigation. Account cleanup does not unlink rating_id; baseline account deletion may still fail RESTRICT.

Required next gates: five targeted behavior cases; specified future TLS/credential/approval adapter implementation and disposable acceptance/actual read-only same-session proof; [named/hash-pinned historical exception draft](phase-7b3c-history-exception-draft.json) or honest reconciliation and ledger-mechanism decision; representative lock/index/window/role-DDL freeze plus smoke/incident/recovery approval; approved-window full snapshot/immediate preflight; separate exact production SQL/new-ledger/smoke authorization. API/feature release adds actual gateway/Storage/Edge/native/runtime and distribution approval. No exception, connection, production action or enabling flag is inferred. Historical duplicate/five mismatch/seventeen omissions/two failing assertions remain intact. Earlier3B/3A/older pending statements below are dated history.

## Phase 7B.3B dated release gate — 2026-10-10 (superseded)

**Local drafting YES; production application NO; feature enablement NO.** [Phase7B.3B final release gate](phase-7b3b-final-release-gate.md) is authoritative for current executor/approval status. Frozen3A migration/preflight hashes remain unchanged. New local-only atomic feature/ledger kernel adds full-ledger/catalog drift and effective ACL/default-grantee/SET-role refusal; it provides no production connection. Current read-only production identity/ledger/authority/metadata and screened actual trigger/RPC/deletion/retry behavior are pending. Historical duplicate/five mismatches/seventeen unmanifested/two failing assertions remain visible; no human exception is granted. Older conditional-drafting, missing-exact-metadata and RV-not-executed statements below are preserved **dated historical decisions**, not current release gates.

## Phase 7B.3A authoritative contract — 2026-10-10

**Local drafting CLEAR; quarantined forward migration prepared. Production application NOT READY. Feature enablement NOT READY.** This section supersedes earlier missing-exact-evidence/drafting-deferred decisions below. User authorized local preparation only; no production action or historical exception is authorized. [Exact production catalog evidence](buffago_7b3_production_catalog_exact_evidence_2026-10-10.md) closes the prior validated constraint, 18 attachment/MD5 and observed postgres CREATE/TRIGGER gaps. Full behavior/dependency equivalence is not inferred from fingerprints.

Authoritative candidate: [20261010192747_wing_jury_saved_destinations_forward.sql](../crawl/supabase/local/phase-7b3a/supabase/migrations/20261010192747_wing_jury_saved_destinations_forward.sql). CLI-generated unique version in an isolated unlinked local project outside historical roots, greater than all local root versions and dated remote maximum. Exact hashes: [draft package](../crawl/supabase/local/phase-7b3a/draft-package.json). Complete compatibility decisions, evidence distinctions, deployment ordering/preflight/verification/emergency procedures and remaining gates: [Phase 7B.3A runbook](phase-7b3a-deployment-runbook.md).

| Contract | Current candidate |
| --- | --- |
| Baseline constraints | Nineteen exact validated foundational/media definitions and all twenty incoming media FK names/delete actions supplied. Existing media rating/destination RESTRICT, owner SET NULL and all baseline actions preserved. |
| New Jury media deletion | Votes and counts **CASCADE on media**; votes CASCADE on auth account. No added media retention RESTRICT. Physical media deletion is permitted only if existing baseline dependencies allow it. Withdrawal/pseudonymization retain votes/counts but remove eligibility. Immutable direct DELETE/UPDATE denied while both parents exist; parent disappearance permits its FK cascade. |
| Rating/parent deletion | Final-rating cleanup respects multiple ratings and old/new identity locks. Baseline media RESTRICT can abort rating/crawl/route/account/destination deletion; failed deletion rolls back lists/votes/counts. No automatic unlink or baseline deletion repair. |
| New ownership/access | Four tables and fourteen functions explicitly owned by postgres; fourteen fixed `pg_catalog` paths; no new baseline rights. ALL revokes precede restrictive RLS/narrow direct-DML grants. Current direct-DML collection/vote architecture retained; no unnecessary RPC conversion. Public rating SELECT remains public. |
| Forward-only checks | Transactional new-object-only CREATE, named constraints, consumed types/nullability/RLS/owner/role authority, exact nineteen definitions/twenty incoming actions/eighteen attachments/known security-path checks, overload/global relation/type/index/trigger collisions. No IF NOT EXISTS, OR REPLACE or DROP of existing objects. Locked prerequisite relations/timeouts plus coordinated DDL/role window needed. |
| Strict fingerprint gate | Separate read-only [preflight](../crawl/supabase/local/phase-7b3a/production-fingerprint-preflight.sql) compares production constraint/attachment/owner/MD5 contract. It rejects surrogate bodies; no test-mode fingerprint bypass. Function behavior and current project/ledger/ACL/exposure remain independent gates. |

Safe local comparisons: raw extracted body MD5 matches Buffacoin guard, friend notification and owner pseudonymization; LF body MD5 matches both gallery helpers; local Mango body differs. Source review/tests establish selected candidate behavior only. Notification dependencies, actual Badge reward source, Mango/approval/derivative/Storage and relevant account/referral lifecycle/RPC/wallet locks remain specific application-time evidence gates. New BEFORE lock precedes guard; friend AFTER trigger precedes Want cleanup, Badge follows it. Require READ COMMITTED and whole-transaction retry, including null-owner rating events; no global deadlock-freedom claim.

Production-shaped disposable PG17.6 fixture supplies exact reported constraint/attachment shapes and five matched bodies, with labeled surrogate dependencies/unavailable helpers and unmatched Mango candidate. Final exact-draft tests exercise lifecycle/grants/guest denial/concurrency/count cleanup/order/isolation and rollback; actual results appear in the final handoff. It is not recovered production history or full Supabase/actual-RPC/generated-score parity. Staged Phase 2B source is preserved as a previous development artifact; this candidate supersedes its media RESTRICT and implicit-ownership/replacement conveniences for release planning.

**Remaining application blockers:** actual relevant source/dependency/RPC/deletion/isolation/retry behavior; trusted live executor/auth-Storage row-lock authority and real Supabase Data API/JWT RLS; fresh target/version/ledger maximum/absence/ACL/fingerprint checks; measured candidate-index/locking plan; historical provenance disposition or explicit human frozen-history exception; tested approved exact-artifact-only executor/new-version recording and scoped smoke/containment; separate exact application approval. Offline package verifier is not a production executor. Historical duplicate/five mismatch/seventeen unmanifested failures, missing legacy baseline JSON/harness and unresolved remote/local mappings remain visible and unmodified.

**Enablement blockers additionally:** approved SQL/post-apply verification, exact Edge/shared/config deployment, real gateway/JWT/CORS/Deno/anonymous/Storage versions/signing/fetchability/expiry, realistic scale/native auth/navigation/accessibility acceptance, approved live test/emergency procedures, separate bundle/cohort flag approval. Both flags remain disabled. No root-glob apply/db push or silent historical exception.

Stop after local preparation. Production deployment may be evaluated for a future separately scoped authorization only after these gates close; it cannot be safely authorized now. Earlier sections below are dated baseline/staged inventories, preserved as evidence rather than current release instructions.

## Phase 7B.3 authoritative update — 2026-10-10

**RV01–RV04 have executed successfully in production; they are no longer pending. Local preparation was authorized by the user. Compatibility remains PARTIAL; versioned drafting is deferred and production application is NOT READY.** This section supersedes older pending-query/authorization statements below. [Supplied verified report](buffago_rv01_rv04_production_results_2026-10-10.md); [local compatibility review and complete blockers](phase-7b3-local-preparation-review.md).

- RV01: all 21 checked function/trigger/index/type names absent on 2026-10-10. Previously listed later-name collision gaps are closed for that date, subject to fresh complete preflight.
- RV02: crawls.crawl_id UUID PK; media rating/destination FKs RESTRICT and auth owner SET NULL; gallery media/auth CASCADE; additional media incoming RESTRICT edges. Media owner pseudonymization is required. Exact CHECK expressions/constraint names/validation and full incoming-edge list were returned but omitted from the supplied summary; descriptions do not establish exact consent/storage/status parity.
- RV03: 18 attached triggers confirmed, including all three existing rating triggers and media/gallery/auth/profile/Storage lifecycle attachments. Exact returned fingerprints/WHEN/owner/path/ACL fields are not retained in the supplied report. Safe source/dependency closure remains unverified. Local guard and pseudonymization candidates are available; attached production reward helper source is not recovered. No historical source is silently treated as deployed.
- RV04: anon/authenticated have no privileged inherited path or CREATE in trusted schemas; private USAGE denied. postgres has public/private CREATE, not auth/storage CREATE. service_role lacks direct auth.users prerequisite privileges. Existing destinations/ratings client SELECT/UPDATE/TRIGGER grants are broad; media client grants absent. Storage client grants remain RLS-governed. **Ratings are publicly selectable through `TO PUBLIC USING true`; their RLS is not a privacy guarantee.** Preserve those baseline rights and enforce private collections/Jury response boundaries independently. Exact approved-owner read/row-lock contract and Data API exposure still need verification.

The staged direct-DML collection/vote grants, restrictive new-object RLS and explicit default-grant revokes remain the current enforcement architecture; this supersedes discovery's proposed RPC-only mutation model. No baseline ACL correction is bundled into this feature. Jury media RESTRICT adds retention beyond merely inheriting existing constraints and needs a supported deletion contract. Linked-media rating/account deletion can fail under baseline RESTRICT; local tests must preserve atomic rollback rather than weaken those FKs.

Local verification uses the existing PG17.6 integration suite plus reported-lifecycle/permission models and exact local-source candidates; synthetic notification/reward witnesses establish ordering/atomic rollback only. They do not establish actual production trigger/RPC coexistence. Exact results appear in the Phase 7B.3 final handoff. No migration version/artifact generated because the conditional compatibility gate remains unmet. Historical duplicate/five mismatch/seventeen unmanifested issues and strict failures are unchanged. Historical disposition/explicit human exception, exact feature-only runner, draft/negative-preflight/production-shaped acceptance, fresh target/owner/catalog/ledger and index-lock plans remain application blockers; gateway/Storage/native/scale and separate deployment/flag approval remain enablement gates.

**Next action:** recover already returned nonsecret RV02–RV04 metadata and a bounded safe attached-function dependency pack; establish deletion/owner contracts, then resume quarantined CLI-versioned drafting and exact-draft acceptance. Do not repeat the full packet or apply root migrations. Earlier Phase 7B.2.6 text below is dated analysis, not the current status.

Date: 2026-10-10. Project evidence: `vhfxnizaxdanmvmouuaf`, inspected 2026-10-09. Branch: `feat/wing-jury-favorites-want-to-try`.

**Analysis complete; production compatibility PARTIAL. No release migration is authorized or created.** Phase 7B.3 may begin only as separately authorized, quarantined drafting after the four narrow catalog gaps below are resolved. Production application and feature enablement have separate gates. Full historical byte recovery is not a prerequisite for drafting unrelated new objects; it remains required to claim historical reconciliation. Applying while history remains unresolved requires explicit human acceptance of the frozen-history exception described below.

This contract supersedes earlier blanket requirements that all historical artifacts, live Edge tests and native acceptance must precede any draft. It does not waive those application/enablement requirements, make the integrity checker green, or authorize the next phase.

## 1. Evidence rules

| Source | What it establishes | What it does not establish |
| --- | --- | --- |
| [Production catalog review](phase-7b-database-review.md), Q01-Q13 plus Q09b/Q11b in [the original packet](phase-7b-supabase-verification-queries.sql) | Fifteen read-only production SELECTs executed; durable summaries of relations, consumed columns, keys, indexes, triggers, policies, effective/default ACLs, auth/rating function signatures, PG 17.6 and private bucket. | Raw result sets are not separately retained in this repository. Missing exact definitions/names below remain UNVERIFIED. It is dated evidence, not a fresh target check. |
| [Production ledger evidence](buffago_remote_migration_evidence_2026-10-09.md) | Complete ordered 35-row version/name/statement-count metadata, latest `20261009201342`; selected MD5 of FIRST stored statement. | Complete stored SQL, migration-file SHA-256, bypass-ledger execution, present catalog equivalence. Its local project-link cross-check is not recorded. |
| [Historical reconciliation](phase-2a-database-baseline-reconciliation.md), [candidate manifest](deployments/migration-status.md), current strict tooling | 69 roots, duplicate version, five genuine content mismatches, seventeen unmanifested; manifest/Git provenance. | Manifest membership is not production application. Ledger absence is not object absence. |
| [Current staged SQL](../crawl/supabase/local/phase-2b/20261009_local_phase2b_foundation.sql), Edge sources and [API contract](phase-5-wing-jury-api-contract.md) | Exact proposed schema and dependencies below. | Production presence, compatible privileges/ownership or execution. |
| Phase 7B.2.5 logs in `crawl/.expo/`, final [handoff](codex-handoff.md) | Actual PG 17.6 19/19, independent connections/lock waits, synthetic claim role-enforced RLS, count/cascade/race/deadlock acceptance; full-catalog feed acceptance. | Production-shaped reward/notification/guard triggers, real Supabase Auth/PostgREST/Edge/Storage/native or realistic scale. Completed tests are preserved, not repeated. |

Status labels: **VERIFIED** means the dated catalog summary explicitly supplies the fact. **UNVERIFIED** means authoritative detail is absent; historical source/fixtures cannot fill it. **COMPATIBLE FOR DESIGN** is narrower than ready to apply. No live object is inferred from an unrecorded migration version.

## 2. Required existing production objects

No new feature replaces these objects. Exact constraint/index/policy names not preserved in the catalog summary are UNVERIFIED even where their structural behavior is verified.

| Production object / type | Required and verified columns/keys | Existing indexes/constraints | RLS/grants/dependencies and required behavior | Compatibility / missing evidence |
| --- | --- | --- | --- | --- |
| `auth.users` / identity table | `id uuid NOT NULL`, PK(id), Q01-Q03. New feature FKs target this, never `public.users.id`. | UUID PK verified; other incoming deletion edges not retained. | RLS enabled Q01. Feature definer owner must read identity existence for cascade exception; client gets no new auth-table rights. Auth/account-delete triggers and effective creation-role authority UNVERIFIED. | Identity compatible for design. RV02/RV03/RV04 needed for cascade/lifecycle/owner compatibility; real Auth is later runtime gate. |
| `public.users` / profile table | `user_id uuid NOT NULL`, PK(user_id), FK to auth.users(id) ON DELETE CASCADE, Q01-Q03. | PK/FK structure verified; other index names UNVERIFIED. | RLS enabled. No feature FK, query, policy or grant is added here. Preserve profile/account deletion and media pseudonymization. Full policies/trigger bodies UNVERIFIED. | Reuse unchanged; profile deletion is an indirect lifecycle dependency, not an invented `id` key. |
| `public.destinations` / canonical restaurant table | `id uuid` PK default gen_random_uuid(); `name text NOT NULL`; `address,city text NULL`; `lat,lng numeric NULL`; `created_at timestamptz NOT NULL DEFAULT now()`; `created_by uuid NULL`, `state_id integer NULL`, Q02/Q03. | PK verified; unrelated index names/checks UNVERIFIED. | RLS enabled. Authenticated saved-list UI needs SELECT on id/name/address/lat/lng; Edge service needs id/name/address/city/lat/lng. Existing wide grants are observed, not permission to broaden them. Deletion cascades must be reviewed where media is affected. | Column/key types compatible; numeric coordinates are explicitly cast in distance expression. RV04 preserves exact current read policies/authority; null/invalid coordinates follow deterministically. No location data rows required. |
| `public.crawls` / existing rating parent | Rating FK targets `crawl_id`; type/unique target not independently preserved because Q01-Q04 omitted crawls. | UNVERIFIED; do not assume fixture's UUID PK is live evidence. | Existing Home/Crawl/Buffacoin RPCs need crawl identity; feature SQL does not add a crawl FK or modify it. Full clean-init/RPC dependencies UNVERIFIED. | RV02 checks only the key/constraints, required to construct a production-shaped rating baseline. |
| `public.destination_ratings` / canonical rating table | `id uuid` PK default gen_random_uuid(); `destination_id uuid NOT NULL` FK destinations CASCADE; `crawl_id uuid NOT NULL` FK crawls CASCADE; `user_id uuid NULL` FK auth.users CASCADE; `weight_score numeric` GENERATED; `created_at timestamptz NOT NULL DEFAULT now()`; `is_buffacoin boolean NOT NULL DEFAULT false`; `buffacoin_operation_id uuid NULL`, Q02/Q03. | UNIQUE(destination_id,crawl_id,user_id), valid crawl/user/time, created-time and Buffacoin-operation uniqueness indexes verified Q04. No dedicated (user_id,destination_id) or (destination_id,created_at DESC) index found. Exact score expression/index names UNVERIFIED in durable summary. | RLS enabled. Authenticated user reads own rating IDs for UX; service reads caller's latest rating explicitly filtered plus definer all-history aggregate. Any persisted nonnull-owner rating qualifies, including unscored/Buffacoin; average excludes null scores. Existing three triggers and three RPCs below must coexist. | Types and multiple-rating semantics compatible. Never replace generated score or RPCs. RV03/RV04 and safe baseline source review needed; local fixture's plain numeric score is not generated-expression parity. |
| `public.wing_media_submissions` / media and moderation table | `id uuid` PK; `destination_id uuid NOT NULL`; `user_id uuid NULL`; `media_type,status text NOT NULL`; `created_at timestamptz NOT NULL DEFAULT now()`; `processed_storage_path,thumbnail_storage_path text NULL`; `owner_deleted_at,withdrawn_at timestamptz NULL`; `consent_version text NOT NULL`, `consented_at timestamptz NOT NULL`, `attribution_preference text NOT NULL`; `rating_id uuid NULL`; gallery `like_count,dislike_count integer NOT NULL DEFAULT 0`, Q02/Q03. | Valid destination/created-time indexes verified; precise media FK/delete actions, status/consent CHECKs and names UNVERIFIED. Complete media column inventory/defaults preserved in database review. | RLS enabled. Service-only reads/signing use approved photo, public consent/attribution, live owner, no withdrawal and canonical processed derivative. No client metadata/original/moderation exposure. Existing lifecycle/approval/pseudonymization triggers preserved. | Consumed columns compatible. RV02/RV03 needed for deletion and CHECK/trigger closure. New Jury media RESTRICT FK can block existing hard-deletes; approval of retention and compatibility with auth/destination cascades must precede application. No claim all media lifecycle paths are safe from fixture success. |
| `public.wing_media_photo_votes` / mutable gallery votes | `submission_id,user_id uuid NOT NULL`, PK(submission_id,user_id); `vote smallint NOT NULL CHECK IN(-1,1)`; `created_at timestamptz NOT NULL DEFAULT now()`; media/auth FKs CASCADE, Q01-Q03. | PK and valid user index verified; exact other index names UNVERIFIED. | RLS enabled. Existing BEFORE INSERT/UPDATE validation and AFTER INSERT/DELETE/UPDATE counts verified Q05. Exact policy bodies/grants/helper identities not retained; source mapping to remote October ledger is unproved. | Reuse unchanged. New votes/counters never touch this table or media gallery count columns. RV03 fingerprints actual attached helpers for unchanged-before/after comparison; old local eligibility migration must NOT be replayed. |
| `storage.objects` / private Storage catalog | `id uuid` PK; `bucket_id,name text NULL`; `archived_at timestamptz NULL`; `is_delete_marker,is_versioned boolean NOT NULL DEFAULT false`; `version,owner_id text NULL`; metadata/user_metadata jsonb; version/lifecycle columns verified Q02. | Bucket/name and active/version-aware indexes present/valid Q04; exact definitions/names UNVERIFIED in summary. | RLS enabled. Predicate and vote trigger require trusted owner SELECT and row SHARE locks on matching existing objects. No API role gets new Storage rights. No public wing-submissions SELECT policy found Q07. Bucket/name equality is metadata authorization, not actual signing/fetchability proof. | Consumed types compatible. RV03/RV04 establish attachment/authority metadata; active version selection/insertion and signing remain disposable Supabase runtime gates. No object rows/paths queried. |
| `storage.buckets` / bucket configuration table | `id,name text NOT NULL`, PK(id); `public boolean`; configuration types including `versioning_status text NOT NULL DEFAULT 'DISABLED'`, lifecycle jsonb retained Q02. | PK verified; other names UNVERIFIED. | RLS enabled. Q12 verified ONLY bucket id `wing-submissions`, public=false. Actual bucket versioning/lifecycle values were NOT retrieved and remain UNVERIFIED. Original uploads stay private; no bucket/policy change proposed. | Private flag compatible. Configuration lifecycle/fetchability is application/runtime evidence, not proof from column defaults. |
| `auth.uid()` / SQL function; `auth.jwt()` / SQL function | Returns uuid/jsonb respectively, STABLE invokers, Q06. | Signatures verified; no replacement. | Policies use actual UID and trusted `is_anonymous` JWT claim, not editable user_metadata. Effective real JWT claims and anonymous denial require disposable Auth/PostgREST acceptance. | Signature compatible; synthetic GUC claims do not certify Auth. |
| `public` and `private` / schemas; API roles | private already exists Q09; anon/authenticated/service_role have no private USAGE/CREATE in saved result. PG 17.6 Q11; pgcrypto1.3 Q11b; no ltree/btree_gist entries. | No new extension, PostGIS, enum, view or sequence required. Built-in hashtextextended/advisory transaction locks used. | postgres/public default relation ACL grants ALL to API roles Q09b; baseline effective ACLs broad Q08. New-object revokes normalize these, without changing defaults globally. Public trusted-path CREATE, API role inheritance/flags and actual approved DDL owner authority UNVERIFIED. NULL pgrst.db_schemas hint is NOT proof private is unexposed. | RV04 required. Verify actual Data API exposed schemas separately before application. Current PG upgrade changelog means dated17.6 observation is not a promise of future runtime version. |

### Existing rating completion API and trigger contract

Q13 verified the live definitions/signatures and event paths, without invoking them. Durable summaries preserve these facts, not their complete source closure:

| Existing function | Exact argument types in order / result | Privileges, search path, persisted event |
| --- | --- | --- |
| `public.submit_validated_restaurant_rating` | `(uuid,uuid,double precision,double precision,double precision,smallint,smallint,smallint,smallint,smallint,bigint,smallint,smallint,boolean,smallint[]) -> jsonb` | SECURITY DEFINER; EXECUTE postgres/authenticated/service_role, no PUBLIC/anon; search_path pg_catalog,public. Home INSERT; idempotent replay performs no new rating event. |
| `public.submit_validated_crawl_rating` | Same 15 argument types -> jsonb | Same execute boundary; search_path public. INSERT ON CONFLICT(destination_id,crawl_id,user_id) DO UPDATE scores/attributes, same identity. |
| `public.submit_buffacoin_rating_v1` | `(uuid,uuid,text,integer,jsonb) -> TABLE(operation_id uuid,rating_id uuid,crawl_id uuid,debit_ledger_id uuid,new_balance integer)` | Same execute boundary; search_path public. Wallet debit and new rating INSERT in one transaction; replay returns original operation. |

Home leading UUID is operation ID; Crawl leading UUID is crawl ID; second is destination ID. Buffacoin argument names: operation ID, destination ID, state code, coin cost, rating JSON. Exact parameter names/defaults are not fully retained; feature does not redefine these APIs. Full dependent wallet/reward/provenance definitions remain UNVERIFIED.

Existing rating triggers verified Q05: `destination_rating_friend_notification` AFTER INSERT; `guard_buffacoin_rating_writes` BEFORE INSERT OR UPDATE OF is_buffacoin; `trg_rating_after_insert` AFTER INSERT. Preserve each. New BEFORE lock trigger participates in name ordering; binding/events alone cannot prove existing lock/identity mutation behavior. RV03 captures attachment metadata/fingerprints. Safe schema-only helper source and disposable actual-RPC coexistence tests are application gates. Do not execute reward/reconciliation routines to construct a baseline.

## 3. Exact new-object deployment checklist

All entries below are proposed, not live verified. The original four table relations, nine original private names and six indexes on inspected relations were absent in the dated review. Absence of the two newer private names/three public wrappers, schema-wide index names/types and two newer rating trigger names is UNVERIFIED (RV01). Policies/triggers on newly absent tables cannot exist until those tables exist; initial preflight must still revalidate all absences atomically.

### Tables, constraints and indexes

| Add only after preflight | Exact staged columns / keys / deletion contract |
| --- | --- |
| `public.user_destination_favorites` | user_id uuid NOT NULL, destination_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(); PK(user_id,destination_id); auth.users(id) CASCADE; destinations(id) CASCADE. Owner+personal rating required on INSERT. |
| `public.user_want_to_try` | Same columns/PK/FKs; owner+no personal rating required on INSERT. Committed rating removes save in same transaction. |
| `public.wing_jury_votes` | submission_id uuid NOT NULL, user_id uuid NOT NULL, vote smallint NOT NULL CHECK IN(-1,0,1), created_at timestamptz NOT NULL DEFAULT now(); PK(submission_id,user_id); media(id) RESTRICT; auth.users(id) CASCADE. Immutable except supported account cascade. |
| `public.wing_jury_photo_vote_counts` | submission_id uuid PK references media(id) CASCADE; like_count/neutral_count/dislike_count integer NOT NULL DEFAULT 0, each >=0; updated_at timestamptz NOT NULL DEFAULT now(); named `wing_jury_photo_vote_counts_total_nonnegative` sum >=0. Trusted INSERT/DELETE arithmetic only; +1 alone is Like. |

Fresh PostgreSQL implicit constraint names: each table `_pkey`; collections `_user_id_fkey`/`_destination_id_fkey`; votes `_submission_id_fkey`/`_user_id_fkey`/`_vote_check`; counts `_submission_id_fkey` and `_like_count_check`/`_neutral_count_check`/`_dislike_count_check`. Four PKs create four implicit indexes. Future draft should name constraints explicitly and assert exact validated keys/actions; staging's implicit names are not production observations.

| Six explicit public indexes | Definition / dependency |
| --- | --- |
| `user_destination_favorites_destination_idx` | favorites(destination_id,created_at DESC) |
| `user_want_to_try_destination_idx` | Want(destination_id,created_at DESC) |
| `wing_jury_votes_user_idx` | votes(user_id,created_at DESC) |
| `wing_jury_photo_vote_counts_like_idx` | counts(like_count DESC,submission_id) |
| `wing_media_submissions_wing_jury_candidate_idx` | EXISTING media(destination_id,created_at,id), partial media_type='photo', status='approved', processed_storage_path IS NOT NULL, owner_deleted_at IS NULL, withdrawn_at IS NULL |
| `wing_jury_votes_submission_vote_idx` | votes(submission_id,vote) |

Check global public relation namespace for all ten index names, not only indexes attached to expected tables. Existing media candidate index is additive but takes a lock/build workload on a live table; measure and choose transactional build versus separately approved concurrent build with explicit failure plan. It does not make global Haversine ordering index-nearest. No extra rating index is justified merely by missing dedicated names; require representative plans.

### Fourteen functions: eleven private, three public

All are SECURITY DEFINER; approved trusted creation/ownership and prerequisite read/row-lock/trigger rights must be explicit in the future candidate. Staging does not pin OWNER. Every relation/helper is schema-qualified; paths below must remain trusted and not API-writable. No unrelated function may be overwritten by OR REPLACE.

| Function signature | Result / volatility / fixed search_path | Required execution and dependency |
| --- | --- | --- |
| `private.lock_user_destination(uuid,uuid)` | void / VOLATILE / pg_catalog | No API execute; built-in advisory lock, READ COMMITTED guard. |
| `private.require_authenticated_user()` | uuid / STABLE / pg_catalog | No API execute; existing auth.uid/jwt, reject missing/anonymous. |
| `private.validate_favorite_insert()` | trigger / VOLATILE / pg_catalog,public,private | No API execute; owner/auth/lock and canonical personal rating existence. |
| `private.validate_want_to_try_insert()` | trigger / VOLATILE / pg_catalog,public,private | No API execute; owner/auth/lock and absence of personal rating. |
| `private.remove_want_to_try_after_rating()` | trigger / VOLATILE / pg_catalog,public,private | No API execute; locked transactional Want deletion on INSERT/UPDATE. |
| `private.lock_rating_collection_identities()` | trigger / VOLATILE / pg_catalog | No API execute; ordered distinct old/new nonnull identities, BEFORE INSERT/UPDATE/DELETE. |
| `private.remove_favorite_after_rating_delete()` | trigger / VOLATILE / pg_catalog,public,private | No API execute; old identity lock, delete Favorite only after last qualifying rating disappears. |
| `private.is_public_wing_jury_photo(uuid)` | boolean / STABLE / pg_catalog,public,private | ONLY authenticated execute for prebound count-policy evaluation; private remains unexposed. Current media/consent/Storage active predicate. |
| `private.validate_wing_jury_vote_insert()` | trigger / VOLATILE / pg_catalog,public,private | No API execute; owner auth and media/Storage SHARE locks then eligibility check. |
| `private.enforce_wing_jury_vote_immutability()` | trigger / VOLATILE / pg_catalog | No API execute; auth.users existence permits parent cascade only. |
| `private.refresh_wing_jury_photo_vote_counts()` | trigger / VOLATILE / pg_catalog,public,private | No API execute; atomic INSERT/DELETE counter deltas, never gallery recount. |
| `public.is_public_wing_jury_photo(uuid)` | boolean / STABLE / pg_catalog | ONLY service_role execute; wrapper calls private predicate. |
| `public.wing_jury_restaurant_rating_summary(uuid)` | jsonb / STABLE / pg_catalog | ONLY service_role execute; avg/count nonnull weight_score across all history. |
| `public.wing_jury_feed_candidates(double precision,double precision,uuid,uuid[],double precision,uuid,timestamptz,uuid,integer)` | TABLE / STABLE / pg_catalog | ONLY service_role execute; eligible media/destinations, caller's permanent vote exclusions, full-catalog keyset, limit1-120. |

Feed TABLE fields in declaration order: `id uuid,destination_id uuid,user_id uuid,media_type text,status text,processed_storage_path text,owner_deleted_at timestamptz,withdrawn_at timestamptz,consent_version text,consented_at timestamptz,attribution_preference text,created_at text,distance double precision`. Edge receives privileged metadata but projects only blind photo DTO. Argument order/types/result and named RPC parameters must match source; existing overloads/return types/foreign ownership are hard conflicts, not permission to replace.

### Nine row triggers

| Name | Relation / events / function |
| --- | --- |
| `user_destination_favorites_validate_insert` | favorites BEFORE INSERT -> validate_favorite_insert |
| `user_want_to_try_validate_insert` | Want BEFORE INSERT -> validate_want_to_try_insert |
| `destination_ratings_lock_collection_identities` | EXISTING ratings BEFORE INSERT/UPDATE/DELETE -> lock_rating_collection_identities |
| `destination_ratings_remove_want_to_try` | EXISTING ratings AFTER INSERT -> remove_want_to_try_after_rating |
| `destination_ratings_update_want_to_try` | EXISTING ratings AFTER UPDATE -> remove_want_to_try_after_rating |
| `destination_ratings_remove_invalid_favorite` | EXISTING ratings AFTER DELETE/UPDATE -> remove_favorite_after_rating_delete |
| `wing_jury_votes_validate_insert` | Jury votes BEFORE INSERT -> validate_wing_jury_vote_insert |
| `wing_jury_votes_enforce_immutability` | Jury votes BEFORE UPDATE/DELETE -> enforce_wing_jury_vote_immutability |
| `wing_jury_votes_refresh_counts` | Jury votes AFTER INSERT/DELETE -> refresh_wing_jury_photo_vote_counts |

New rating triggers alter all existing persisted flows even with both UI flags off. They reject non-READ COMMITTED rating INSERT/UPDATE/DELETE events through the BEFORE lock or AFTER cleanup helpers; existing transaction isolation and retry handling must be compatible. The BEFORE helper skips null-owner identities, but AFTER cleanup still calls the isolation guard even for null-owner guest rows; those writes also require READ COMMITTED. Source-level/fixture acceptance does not prove production reward/wallet/mission interactions. Multirow deadlocks require whole-transaction retry; no global deadlock-freedom claim.

### Nine policies and effective privilege checklist

| Exact policy name | Table / command |
| --- | --- |
| `user_destination_favorites_own_select` | favorites / SELECT USING owner and nonanonymous |
| `user_destination_favorites_own_insert` | favorites / INSERT WITH CHECK owner and nonanonymous |
| `user_destination_favorites_own_delete` | favorites / DELETE USING owner and nonanonymous |
| `user_want_to_try_own_select` | Want / SELECT USING owner and nonanonymous |
| `user_want_to_try_own_insert` | Want / INSERT WITH CHECK owner and nonanonymous |
| `user_want_to_try_own_delete` | Want / DELETE USING owner and nonanonymous |
| `wing_jury_votes_own_select` | Jury votes / SELECT USING owner and nonanonymous |
| `wing_jury_votes_own_insert` | Jury votes / INSERT WITH CHECK owner and nonanonymous |
| `wing_jury_photo_vote_counts_public_select` | counts / SELECT USING nonanonymous UID and eligible photo |

- Enable RLS on all four tables. Owner policies check verified UID and nonanonymous JWT claim; no UPDATE policy is created.
- `wing_jury_photo_vote_counts_public_select` permits only authenticated nonanonymous UID plus eligible photo; despite name, anon has no table grant. Guests read a sanitized Edge service response.
- REVOKE ALL on each new table from PUBLIC, anon, authenticated, service_role before narrow grants. Authenticated: SELECT/INSERT/DELETE collections, SELECT/INSERT votes, SELECT counts. service_role: SELECT only each table. No client UPDATE/TRUNCATE or direct count mutation.
- REVOKE function EXECUTE from all four roles before listed exceptions. Prebound eligibility policy may evaluate the private predicate without broad schema USAGE; test actual PostgREST, do not widen schema grants merely to satisfy assumptions.
- Evaluate effective privileges including inherited memberships; direct revokes do not cancel unrelated inherited rights. Approved owner bypass is intentional for restricted definers, not ordinary client access. Extra permissive policies are a hard stop. Do not alter baseline global default privileges.

### Fail-closed draft requirements

Staging's IF NOT EXISTS, OR REPLACE and named DROP POLICY/TRIGGER are not a production preflight. Future draft must, before any DDL: identify expected target/baseline, assert compatible validated UUID key targets and consumed columns/types, trusted schemas/roles/owner/effective ACLs, existing rating event/fingerprint contract, and complete new namespace absence. Fail on unexpected overload, relation/type/index/policy/trigger/owner. Unknown/incompatible prerequisites abort; never invoke business functions or scan user records. Revalidate under an approved catalog-change window/locking plan so observation-to-application drift cannot race the assertions. Apply additive schema and ACLs in one reviewed transaction where feasible; prove negative preflight/rollback behavior locally. No final migration is generated here.

## 4. Historical issues and exact disposition

Categories: **A** demonstrated correctness blocker for the new schema; **B** current deployment tooling blocker; **C** provenance debt without demonstrated feature dependency; **D** insufficient evidence for an applied identity/compatibility fact. One issue can have a primary category and a D qualification. None of the historical anomalies alone demonstrates A.

### Duplicate version

`20260729200000_duplicate_media_classification.sql` and `20260729200000_duplicate_media_classification_fixed.sql`: **B**, plus C/D applied identity. Both are immutable historical source. Original uses `o.etag`; fixed uses `o.metadata->>'eTag'`. Supplied ledger has no row for this version; neither is thereby proven unapplied. Freeze both without deleting, renaming, retimestamping, merging, replaying or marking applied. New feature calls neither helper. If a future concrete required behavior is missing, implement ONLY that reviewed correction at a new unique forward version. Frozen-history release lane must exclude both paths; ordinary migration chain remains blocked.

### Five genuine content discrepancies

| Exact historical file | Classification and deployed-SQL evidence requirement |
| --- | --- |
| `20260729122000_wing_shots_creator_rewards.sql` | C; D original applied bytes. Exact ledger row absent. Git `193e6b0` changes Creator XP descriptions to Creator Reputation. No new-feature helper call. Applied artifact needed to reconcile history, not to draft feature tables. Preserve actual reward triggers; source closure is application coexistence evidence. |
| `20260729126000_wing_shots_notifications.sql` | C; D bytes. Exact row absent. Git `f66fd00` changes notification copy. No new-feature dependency. Artifact required for historical repair, not feature drafting. |
| `20260729132000_wing_creator_surfaces.sql` | C; D bytes. Exact row absent. Git `193e6b0` changes safe rejection categories/copy. No feature call. Artifact required for historical repair, not drafting. |
| `20261007000241_image_workflow_rc_regression.sql` | C; D deployed definition/bytes. Exact row recorded. First-statement MD5 is not file SHA-256. Need complete safe deployed-SQL/artifact for byte reconciliation; for feature application need current relevant media/Storage lifecycle definitions, which can establish compatibility without certifying old bytes. |
| `20261008232910_wing_photo_vote_gallery_eligibility.sql` | C; D mapping to recorded `20261009201342`. Exact local version absent; similar remote name is not equality. Need complete safe artifact/statement comparison to resolve mapping. New feature uses separate voting, so local candidate MUST NOT be reapplied. Preserve/fingerprint actual gallery helpers. |

All five keep the strict pipeline red (**B** under ordinary tooling). No SHA replacement, manifest blessing or historical SQL repair is performed. Full statement payloads can contain secrets; prefer sanitized schema-only definitions and artifact hashes, never indiscriminate remote SQL text retrieval. Catalog equivalence is weaker than historical byte provenance and does not prove data-side effects.

### Seventeen unmanifested migrations

Exact row status comes from the complete supplied metadata, not from name similarity. Each omission is C; all have D original applied bytes/non-ledger execution. Three exact versions are recorded, fourteen absent. `_fixed` also carries B duplicate conflict. Schema prerequisites are the current objects in section2, not a requirement to replay these files.

| Exact root filename | Supplied exact ledger | Classification / feature relevance |
| --- | --- | --- |
| `20260729160000_wing_shot_rating_rule.sql` | Recorded | C/D; rating/upload reservation. Canonical persisted-rating contract reused independently. |
| `20260729170000_mango_habanero_review_dashboard.sql` | Absent | C/D; review/priority fields and RPCs not called. Only consumed media columns matter. |
| `20260729171000_mango_habanero_jalapeno_priority_selection.sql` | Absent | C/D; nightly selection untouched. |
| `20260729172000_jalapeno_approved_queue_authority.sql` | Absent | C/D; publish queue untouched. |
| `20260729173000_jalapeno_social_attribution_and_location.sql` | Absent | C/D; profile/social helpers not called; media attribution fields verified separately. |
| `20260729200000_duplicate_media_classification_fixed.sql` | Absent | B + C/D; freeze both duplicate paths. |
| `20260729210000_wing_upload_retry_idempotency.sql` | Absent | C/D; upload reservation not called; introducing commit not reachable in saved provenance investigation. |
| `20260730120000_wing_shot_uploaded_object_validation.sql` | Recorded | C/D; finalizer untouched; current Storage predicate independent. |
| `20260730144324_wing_shot_staging_transport.sql` | Absent | C/D; remote `20260730145055` has similar name, NOT proven equivalent. Signing uses wing-submissions, not staging. |
| `20260730145136_wing_shot_staging_cron.sql` | Absent | C/D; cron is not staging-transport remote row; no new dependency. |
| `20260730150000_wing_shot_completed_upload_rate_limit.sql` | Absent | C/D; upload/moderation limits unchanged. |
| `20260730214940_weekly_mission_rating_reconciliation.sql` | Absent | C/D; relevant existing rating AFTER INSERT coexistence, not a missing-schema conclusion. Preserve mission/reward behavior. |
| `20260730222132_wing_shot_finalize_legacy_compat.sql` | Recorded | C/D; finalizer compatibility untouched. |
| `20260730233913_wing_review_intake_lifecycle.sql` | Absent | C/D; relevant current media lifecycle attachment/source, not replay prerequisite. |
| `20260730235900_wing_review_intake_remove_legacy_finalizer.sql` | Absent | C/D; do not reproduce historical drop. |
| `20260731020000_wing_review_queue_processing_reconciliation.sql` | Absent | C/D; actual trigger state matters; never invoke repair as preflight. |
| `20260731030000_mango_habanero_review_contract_fix.sql` | Absent | C/D; review-list RPC not called. |

Missing rows are manifest bookkeeping/provenance, not demonstrated missing schema. If RV results show an incompatible/missing mandatory prerequisite, that precise finding becomes A. No such A finding has yet been established from the saved facts.

### Current tooling blockers

- Strict checker and duplicate guard correctly preserve duplicate/five mismatch/seventeen unmanifested failures; two migration-integrity assertions remain red. Prior CRLF/full-filename defects were already corrected. No test/checker changes in this phase.
- `crawl/scripts/apply-engagement-migrations.ps1` executes EVERY root file after its legacy preflight; it has no feature-only allowlist/applied-ledger suppression. Do not use it for this release. Ordinary broad db push/root replay is prohibited.
- Checker optional `--ledger-file` expects leading fourteen-digit plain pipe-delimited lines; supplied Markdown is not that input. It does not validate statement equivalence or project identity. ManifestedMissingRoot filters environment `production`, whereas relevant manifest uses `applied`; zero is not exhaustive proof of applied coverage.
- Missing `supabase/contracts/buffago-baseline-v1.json` blocks the legacy runtime harness. Even if restored, that script only reports blocked/not-run and exits2; it does not execute its named runtime suites. This Markdown contract is NOT that JSON and does not make that harness a pass. Required production-shaped runtime acceptance needs a separately reviewed schema pack and actual runner.

## 5. Three separate readiness gates

| Stage | Decision now | Exact conditions |
| --- | --- | --- |
| **Ready for forward-only migration drafting** | **CONDITIONAL; not yet cleared** | Complete RV01-RV04 and resolve concrete incompatibilities; approve bounded baseline/deletion/coexistence design, trusted DDL ownership and quarantined drafting scope; separately authorize Phase 7B.3. Existing 19/19 PG evidence retained. Draft outside deploy queue with fail-closed preflight, unique CLI-generated versions and negative/local candidate tests. Do not require unrelated historical artifacts, live Edge or native testing before writing a nondeployable draft. |
| **Ready for production migration application** | **NO** | Draft gate plus exact candidate hashes/versions, fresh target/project+ledger maximum, transaction/locking/index plan, completed relevant safe trigger/deletion source closure and production-shaped disposable PG/Supabase SQL/RLS/role/RPC acceptance. Either reconcile historical release gate honestly OR explicitly approve frozen-history exception and new-artifact-only migration mechanism. Verify private schema unexposed and owner/effective privileges. Preflight compares actual current catalogs, fails before writes on drift/conflicts; preserves unrelated objects. Separate approval applies only exact new SQL and records only its new versions. |
| **Ready for production feature enablement** | **NO** | Approved SQL applied with flags off and post-apply ACL/policy/trigger/catalog checks; separately approved compatible Edge feed->vote->reveal deployment including shared helper. Real JWT/gateway/CORS/Deno/anonymous/cross-user tests, Storage active-version/signing/fetchability/expiry, actual rating flows/cleanup, realistic feed scale and native auth/navigation/accessibility pass. Scoped approved synthetic live testing and rollback/disable reviewed. Separate flag/bundle/cohort approval, Saved Destinations then Wing Jury; no partial function-set enablement. |

Supabase SQL application can precede Edge deployment; requiring the new Edge endpoints to be deployed before applying their SQL would be circular. Disposable integrated runtime can validate both candidate artifacts before production application, while deployed-runtime testing remains an enablement condition. Rating triggers have immediate database effects despite flags off; their compatibility is an application gate.

### Recommended frozen-history release strategy (requires explicit human approval)

Preserve all historical bytes/versions/manifest/ledger and continuing strict failures. Approve a documented exception naming the duplicate, five mismatches, seventeen omissions, remote-only source mappings and residual D facts. The exception must state no demonstrated feature A dependency, include completed narrow catalog evidence, approved target, exact new artifact versions/hashes and the reason an independent feature lane is acceptable. It must NOT label history repaired or suppress the blocked existing release-smoke pipeline.

Use a separately reviewed, tested release package/runner selecting only exact approved new artifacts, never the root glob. It must reject extra files, hash drift, duplicate/nonmonotonic new versions, wrong target, pre-existing new ledger versions, or failed catalog preflight. Record exact NEW versions through the approved migration mechanism; never fabricate applied rows for old versions. Future versions must exceed BOTH verified current remote and local maxima, including any later observations. No version reserved/generated in this phase; dated `20261009201342` is not a current maximum guarantee. [Supabase migration documentation](https://supabase.com/docs/guides/deployment/database-migrations) distinguishes local files and remote history; this controlled lane is our proposed exception, not a claim the current CLI safely resolves this checkout.

If human declines the exception, ordinary deployment remains blocked until an evidence-backed historical disposition is approved. This does not demand that every C artifact be a new-schema dependency; it preserves current release policy. Historical ledger/manifest reconciliation writes would need their own approval and are outside the recommended feature lane.

### Runtime, deployment and emergency disable

Local config has guest feed/reveal verify_jwt=false and vote=true; handlers verify bearer identity before personalization, vote rejects anonymous auth and writes through caller JWT. Actual gateway/key mode and Data API exposure must be checked in disposable/live acceptance; service secret stays server-only. The trusted wrapper ACL boundary follows [Supabase function security guidance](https://supabase.com/docs/guides/database/functions); fixed trusted paths and explicit revocation are mandatory.

Apply reviewed SQL first with flags false; verify baseline/feature catalog and existing rating flows; then approved feed, vote, reveal/shared helper/config; test; only then separately approve distribution/cohort flags. No production feature enabled in this phase. Existing17.6/pgcrypto evidence remains dated; [the official 17.11 upgrade notice](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes) motivates runtime-version revalidation, not an authorized upgrade/reindex/audit.

Rollback/emergency disable must preserve saved lists/votes/counts. Disable client flags through approved distribution; separately authorize immediate endpoint or feature-only ACL containment if needed. Retain rating cleanup invariants while saved data exists; never drop triggers/tables merely to hide UI. Restore compatible reviewed artifacts or roll forward with a new corrective version. Already issued 300-second signed URLs may survive withdrawal until expiry; measure/document policy rather than promise immediate revocation. No resets/destructive cleanup/history rewrites.

## 6. Missing evidence, verification and next action

Four single-SELECT blocks in [phase-7b-remaining-verification.sql](phase-7b-remaining-verification.sql), NOT executed remotely:

1. RV01: five newer function names, two newer rating triggers, global index/type collisions.
2. RV02: omitted media/crawl key/CHECK definitions and relevant incoming deletion FKs.
3. RV03: existing rating/media/gallery/auth/profile/Storage trigger attachment/events/owner/ACL and safe source fingerprints. No bodies or trigger argument values. Unknown WHEN/source/dependencies require separately reviewed safe schema artifact before application; MD5 is not historical SHA-256.
4. RV04: API/current-owner role flags and reachable parent flags, trusted schema CREATE, reused read/row-lock/trigger authority and exact rating/destination SELECT policies. Approve the actual migration creator from these roles or separately verify a different proposed owner. It does not reveal arbitrary settings/secrets or prove private is unexposed.

No full ledger SQL, production user/application/private photo/Storage-object records are requested. Current full ordered ledger metadata/project maximum must be refreshed just before application/version reservation, not broadly re-audited here. Retrieve safe artifact/hash evidence for historical byte reconciliation only if taking that route. Dashboard/API exposed-schema and bucket lifecycle/gateway settings are later nonsecret configuration evidence, not pretend SQL facts.

Phase 7B.2.6 verification is documentation/source inventory and local read-only packet validation only. No feature implementation/tooling changed; no large UI or completed PG suite rerun. Final focused results are recorded in handoff/readiness. Existing 19/19,114/114,41/41,0 errors / 95 warnings / typecheck exit 0 retained as prior evidence; two strict integrity assertions remain failures, not suppressed.

**Exact next action:** give RV01-RV04 to ChatGPT's authorized read-only Supabase connector for the named project, return four metadata result sets with project/date, reconcile ONLY their contract gaps and review the proposed historical exception. Then separately authorize Phase 7B.3 quarantined drafting if the draft gate clears. Do not create a migration, apply SQL, deploy Edge, enable flags, commit/push or start builds here.
