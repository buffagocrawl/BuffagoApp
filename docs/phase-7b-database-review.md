# Phase 7B database and architecture readiness review

2026-10-10 superseding local assessment: staged Phase 2B SQL now corrects effective ACLs/RLS, privileged execution, immutable votes/count cascades, rating cleanup and active Storage eligibility. Root and independent SQL tests pass 19/19 in isolated PGlite. Real independent-session PostgreSQL and Supabase catalog/runtime verification remain required; historical production inventory below is preserved. [Current classifications](phase-7b-deployment-readiness.md#phase-7b2-resumed-security-assessment-2026-10-10) distinguish tested corrections from unresolved release gates. New verification queries Q14/Q15 were added locally and were not executed remotely.

Updated: 2026-10-09. Status: **BLOCKED for deployment; local readiness review complete**. Production inspection used read-only catalog SELECTs and one bounded nonsecret bucket configuration SELECT. No production application, auth-user, or storage-object records, secret settings, credentials, paths, or user counts were read. No remote writes, migrations, deployments, history repairs, commits, pushes, resets, or cleanup occurred.

The exact final query packet is [phase-7b-supabase-verification-queries.sql](phase-7b-supabase-verification-queries.sql), Q01–Q13 plus Q09b and Q11b: 15 independent SELECT blocks. Every final block was executed through the connected Supabase execute_sql tool against the project already identified in Phase 2A. Early multi-statement Q09/Q11 calls returned only their final result set; the saved packet splits them, and all final single-statement blocks were executed. Query definitions and summarized findings below are the durable evidence; no application records are included.

## Evidence classes

- **Verified live catalog/configuration:** object existence, columns/types, constraints, indexes, triggers, policies, effective/default ACLs, PostgreSQL version and the bucket privacy flag from this run.
- **Verified local-only:** the staged SQL and isolated PGlite behavior, including five defect reproductions. A local pass does not establish actual Supabase policy enforcement, Edge runtime behavior, or cross-session concurrency.
- **Inferred from repository:** intended feature behavior, existing rating RPC upsert paths, and expected future release objects.
- **Missing evidence:** reconciled historical applied SQL/artifacts; complete clean-init prerequisites; PostgreSQL/Supabase migration execution and two-session concurrency; actual REST/Storage behavior; query plans; deployed Edge readiness. No feature objects were found live.

## Existing prerequisites and actual schema

Q01 verifies eight prerequisite relations below present, with RLS enabled. Q02/Q03 verify compatible identities and definitions. public.users uses **user_id**, not id; the new tables reference auth.users(id) directly. No claim is made that a reduced fixture reproduces the complete existing schema.

| Object | Required columns/types and relevant actual definitions | Evidence/classification |
| --- | --- | --- |
| auth.users | id UUID NOT NULL, PK(id). Only identity-key metadata inspected. | Live verified Q01–Q03; system auth behavior outside fixture proof. |
| public.users | user_id UUID NOT NULL, PK(user_id), FK auth.users(id) ON DELETE CASCADE. | Live verified; prerequisite profile identity, not a new collection FK. |
| public.destinations | id UUID PK default gen_random_uuid(); name TEXT NOT NULL; address/city TEXT nullable; lat/lng NUMERIC nullable; created_by UUID nullable; created_at TIMESTAMPTZ NOT NULL default now(); state_id INTEGER nullable. | Live verified Q02/Q03. Feed/reveal use id,name,address,city,lat,lng. Coordinate/content validity was not inspected. |
| public.destination_ratings | id UUID PK default gen_random_uuid(); destination_id UUID NOT NULL FK destinations(id) CASCADE; crawl_id UUID NOT NULL FK crawls(crawl_id) CASCADE; user_id UUID nullable FK auth.users(id) CASCADE; crispiness/sauce/meat/overall SMALLINT nullable; weight_score NUMERIC generated expression; created_at TIMESTAMPTZ NOT NULL default now(); tag_id BIGINT nullable; wings_eaten SMALLINT nullable default 0; sauce_style SMALLINT nullable; flavor_vibe SMALLINT[] nullable; spice_level SMALLINT nullable; would_order_again BOOLEAN nullable; is_buffacoin BOOLEAN NOT NULL default false; buffacoin_operation_id UUID nullable. | Live verified. Fixture omits required crawl_id, score generation, existing triggers and uniqueness; it cannot validate actual rating RPC insertion. UNIQUE(destination_id,crawl_id,user_id) permits multiple ratings at one destination across crawls. |
| public.wing_media_submissions | id UUID PK; destination_id UUID NOT NULL; user_id UUID nullable; media_type/status TEXT NOT NULL; owner_deleted_at/withdrawn_at TIMESTAMPTZ nullable; consent_version TEXT NOT NULL; consented_at TIMESTAMPTZ NOT NULL; attribution_preference TEXT NOT NULL; processed_storage_path/thumbnail_storage_path TEXT nullable; created_at TIMESTAMPTZ NOT NULL; like_count/dislike_count INTEGER NOT NULL default 0. These are all columns read by the new boundary or predicate. | Live verified Q02; existing gallery counters remain separate. More complete column inventory below. |
| public.wing_media_photo_votes | submission_id/user_id UUID NOT NULL, PK(submission_id,user_id); vote SMALLINT NOT NULL CHECK -1/+1; created_at TIMESTAMPTZ NOT NULL default now(); submission FK CASCADE; auth user FK CASCADE. | Live verified. Existing mutable gallery system, never repurposed for Jury. |
| storage.objects | bucket_id/name TEXT nullable; id UUID PK; owner UUID nullable; created_at/updated_at/last_accessed_at TIMESTAMPTZ nullable default now(); metadata/user_metadata JSONB nullable; path_tokens TEXT[] generated; version/owner_id TEXT nullable; archived_at TIMESTAMPTZ nullable; is_delete_marker/is_versioned BOOLEAN NOT NULL default false. | Live schema verified Q02–Q04; zero object rows read. Versioning differs from reduced fixture. |
| storage.buckets | id/name TEXT NOT NULL; id PK; configuration includes public BOOLEAN; bucket wing-submissions exists with public=false. | Live verified Q12 returns id/public only. Existing original-upload policy inspected, no public wing-submissions SELECT policy found Q07. Privacy flag alone does not certify signed URL lifecycle/withdrawal. |

Complete existing media column inventory from Q02 (all names are definitions, not record contents): id,user_id,owner_pseudonym_id,owner_deleted_at,rating_id,destination_id,media_type,original_storage_path,processed_storage_path,thumbnail_storage_path,status,moderation_status,wing_verification_status,wing_confidence,quality_score,content_score,duplicate_group,perceptual_hash,consent_version,consented_at,attribution_preference,user_caption,reviewer_notes,priority,approved_at,approved_by,rejected_at,rejection_reason,featured_at,withdrawn_at,original_retain_until,created_at,updated_at,correlation_id,original_deleted_at,submission_source,reviewed_at,reviewed_by,is_publish_priority,priority_set_at,priority_set_by,like_count,dislike_count. The feature does not expose original paths, moderation, owner identity, consent metadata, or processing details.

Existing required functions: Q06 verifies auth.uid() returns UUID and auth.jwt() returns JSONB, both stable invokers. Built-in pg_advisory_xact_lock/hashtextextended support the staged lock strategy in PGlite; cross-session correctness remains unverified. Q13 additionally verifies all three rating-entry RPC definitions below live without invoking them. All three are SECURITY DEFINER with EXECUTE ACLs for postgres,authenticated,service_role and no PUBLIC/anon entry. Do not modify existing rating/reward RPCs in this readiness review.

| Existing live RPC | Exact argument types in declaration order | Return / search path / rating event |
| --- | --- | --- |
| submit_validated_restaurant_rating | UUID,UUID,DOUBLE PRECISION,DOUBLE PRECISION,DOUBLE PRECISION,SMALLINT,SMALLINT,SMALLINT,SMALLINT,SMALLINT,BIGINT,SMALLINT,SMALLINT,BOOLEAN,SMALLINT[] | JSONB; pg_catalog,public. New Home rating INSERT; idempotent replay returns prior operation without INSERT/UPDATE. |
| submit_validated_crawl_rating | UUID,UUID,DOUBLE PRECISION,DOUBLE PRECISION,DOUBLE PRECISION,SMALLINT,SMALLINT,SMALLINT,SMALLINT,SMALLINT,BIGINT,SMALLINT,SMALLINT,BOOLEAN,SMALLINT[] | JSONB; public. INSERT ON CONFLICT(destination_id,crawl_id,user_id) DO UPDATE of scores/attributes; conflict does not change identity. |
| submit_buffacoin_rating_v1 | UUID,UUID,TEXT,INTEGER,JSONB | TABLE(operation_id UUID,rating_id UUID,crawl_id UUID,debit_ledger_id UUID,new_balance INTEGER); public. New operation INSERT after wallet debit; idempotent replay returns prior operation. Repository onboarding replay delegates to this transaction. |

The exact parameter names/order/defaults are returned by Q13. Home leading UUID is operation ID; Crawl leading UUID is crawl ID; second UUID is destination ID. Both share latitude,longitude,accuracy,crispiness,sauce,meat,overall,wings_eaten,tag_id,sauce_style,spice_level,would_order_again,flavor_vibe. Buffacoin arguments are operation ID,destination ID,state code,coin cost,rating JSON. Actual callable integration and complete dependent reward/provenance tables remain unverified. The staged AFTER INSERT trigger catches the new Home/Buffacoin/Crawl insert but not the Crawl conflict UPDATE; the broader cleanup contract must explicitly handle relevant updates. Existing successful same-identity ratings normally already cleared Want to Try on their original INSERT.

## Architecture and boundary dependencies

The client saved-list service reads destination_ratings for UX eligibility and writes the two owner-scoped collection tables; database triggers remain the authority. Favorites require any existing persisted personal rating, including Buffacoin. Want to Try requires no personal rating and clears at authoritative rating completion. No list is added to another user's profile or Journey response.

The repository-only Wing Jury boundary uses three Edge Functions: feed reads media/destinations and excludes authenticated permanent votes; vote derives identity from verified bearer auth and inserts using the authenticated client; reveal rechecks eligibility, requires the signed-in user's permanent verdict, and reads only that user's rating/list state. Guest votes stay in memory and guest reveal's verdict signal is a UI boundary. Service-role readers remain server-side. Public media uses private wing-submissions canonical derivatives and 300-second signed URLs; signed URL privacy/withdrawal and object existence require runtime checks. Originals and moderation/consent/owner details do not enter the client DTO.

Feed selects at most 250 destinations and 500 photo candidates per request, then sorts/filter-pages locally with a base64 JSON cursor. That cursor includes destination_id and is client-decodable, contradicting the intended blind pre-vote DTO; the security review records the identity leak. Those bounds limit request work but do not prove full-catalog coverage, SQL index selection, or count freshness. Reveal computes restaurant averages from the latest 1,000 rows, so its displayed rating_count is bounded and needs contract reconciliation if a restaurant can exceed that size. Jury Likes count +1 verdicts only; gallery likes and restaurant scores remain separate.

Neither new database objects nor deployed Edge behavior was established by this review. Catalog exposure hints cannot certify the actual API configuration. Both feature flags stay false.

## New tables: local-only, absent live

All four are **absent live** in Q01. Therefore their production columns, triggers, policies, grants, counters and behavior are absent, not verified. The following is the exact staged contract, locally executed only:

| New table | Complete staged columns | Keys/checks/FKs |
| --- | --- | --- |
| public.user_destination_favorites | user_id UUID NOT NULL; destination_id UUID NOT NULL; created_at TIMESTAMPTZ NOT NULL default now() | PK(user_id,destination_id); both auth.users and destinations FKs ON DELETE CASCADE. Existing personal rating required on INSERT. |
| public.user_want_to_try | user_id UUID NOT NULL; destination_id UUID NOT NULL; created_at TIMESTAMPTZ NOT NULL default now() | Same PK/FKs. No personal rating permitted on INSERT. |
| public.wing_jury_votes | submission_id UUID NOT NULL; user_id UUID NOT NULL; vote SMALLINT NOT NULL; created_at TIMESTAMPTZ NOT NULL default now() | PK(submission_id,user_id); CHECK vote IN(-1,0,1); media FK ON DELETE RESTRICT; auth user FK ON DELETE CASCADE. |
| public.wing_jury_photo_vote_counts | submission_id UUID PK; like_count/neutral_count/dislike_count INTEGER NOT NULL default 0; updated_at TIMESTAMPTZ NOT NULL default now() | Media FK ON DELETE CASCADE; each counter CHECK >=0; total_nonnegative check. Only +1 contributes to Likes. |

No new bucket, view, public RPC, sequence, rating table or gallery-vote change is staged. private schema already exists live; all nine feature function identifiers below are absent live Q06/Q10.

## Complete function and trigger inventory

All functions are SECURITY DEFINER. lock_user_destination and require_authenticated_user use search_path=pg_catalog; other functions use pg_catalog,public,private with schema-qualified relations. require_authenticated_user and is_public_wing_jury_photo are stable. Others are default volatile. Creation owner and effective ACLs must be verified for the future candidate, rather than inferred from postgres-owned existing tables.

| Private function/signature | Staged purpose / trigger |
| --- | --- |
| lock_user_destination(UUID,UUID) RETURNS VOID | Shared transaction advisory lock; internal helper, no direct API execute. |
| require_authenticated_user() RETURNS UUID | Reject missing UID and is_anonymous=true; internal helper. |
| validate_favorite_insert() RETURNS TRIGGER | user_destination_favorites_validate_insert BEFORE INSERT on favorites; require owner/rating. |
| validate_want_to_try_insert() RETURNS TRIGGER | user_want_to_try_validate_insert BEFORE INSERT on Want to Try; require owner/unrated. |
| remove_want_to_try_after_rating() RETURNS TRIGGER | destination_ratings_remove_want_to_try AFTER INSERT on destination_ratings only. |
| remove_favorite_after_rating_delete() RETURNS TRIGGER | destination_ratings_remove_invalid_favorite AFTER DELETE on destination_ratings; currently unconditional. |
| is_public_wing_jury_photo(UUID) RETURNS BOOLEAN | Approved/consented/nonwithdrawn/live-owner canonical processed-photo predicate with storage metadata existence. |
| validate_wing_jury_vote_insert() RETURNS TRIGGER | wing_jury_votes_validate_insert BEFORE INSERT; owner and eligible-photo guard. |
| refresh_wing_jury_photo_vote_counts() RETURNS TRIGGER | wing_jury_votes_refresh_counts AFTER INSERT only; advisory lock and aggregate upsert. |

Six new triggers above are absent live. Existing rating triggers verified Q05: destination_rating_friend_notification AFTER INSERT; guard_buffacoin_rating_writes BEFORE INSERT OR UPDATE OF is_buffacoin; trg_rating_after_insert AFTER INSERT. New triggers must coexist without modifying historical rating notifications/rewards. Existing gallery triggers validate BEFORE INSERT/UPDATE and refresh counts AFTER INSERT/DELETE/UPDATE; Jury must not touch them. Existing media lifecycle/approval/owner-pseudonymization triggers must continue operating.

## Policies, grants and indexes

All four staged public tables enable RLS. Nine policies are intended:

- user_destination_favorites_own_select / own_insert / own_delete: authenticated SELECT and DELETE USING user_id=(select auth.uid()); INSERT WITH CHECK same.
- user_want_to_try_own_select / own_insert / own_delete: same own-user rules.
- wing_jury_votes_own_select / own_insert: same own-user rules, no UPDATE/DELETE policy.
- wing_jury_photo_vote_counts_public_select: authenticated SELECT USING private.is_public_wing_jury_photo(submission_id). Despite the policy name, anon is not granted SELECT.

Staged table grants revoke all from PUBLIC and anon, then grant authenticated SELECT/INSERT/DELETE on collections, SELECT/INSERT on votes, SELECT on counts. **This does not revoke authenticated default/existing rights.** Q09b verifies production postgres/public default ACL grants ALL to authenticated (and anon/service_role); Q08 verifies wide inherited table ACL patterns on baseline tables. Future DDL must explicitly REVOKE ALL from authenticated on every new table before granting only required operations. Grant service_role explicitly for Edge SELECTs rather than relying on environment defaults. No general global default-ACL change is proposed.

All nine private functions revoke EXECUTE from PUBLIC, anon,authenticated; only is_public_wing_jury_photo receives authenticated EXECUTE. Q09 verifies private has no anon/authenticated/service_role USAGE or CREATE. This observed boundary is not classified as a proven count-query failure: prebound policy evaluation succeeds in the reduced fixture. Verify real PostgreSQL/PostgREST behavior before granting extra schema privileges. Keep private outside exposed schemas; Q11 pgrst.db_schemas returns NULL, which cannot establish actual API exposure.

Six explicit new indexes (all absent live Q04):

| Index | Staged definition/purpose |
| --- | --- |
| user_destination_favorites_destination_idx | (destination_id,created_at DESC), reverse FK support. |
| user_want_to_try_destination_idx | (destination_id,created_at DESC), reverse FK support. |
| wing_jury_votes_user_idx | (user_id,created_at DESC), user feed exclusion and auth-user FK support. |
| wing_jury_photo_vote_counts_like_idx | (like_count DESC,submission_id). |
| wing_media_submissions_wing_jury_candidate_idx | (destination_id,created_at,id), partial photo/approved/non-null processed path/live owner/nonwithdrawn filter. |
| wing_jury_votes_submission_vote_idx | (submission_id,vote), aggregate counting. |

Four new PKs imply four additional unique indexes. Existing live media destination/created-time indexes and gallery user index are present/valid; storage has bucket/name and active/version-aware indexes. Rating indexes include destination/crawl/user uniqueness, crawl/user/created time, created time, Buffacoin operation uniqueness; no dedicated (user_id,destination_id) or (destination_id,created_at DESC) index was found. Evaluate local plans for eligibility/latest-rating/reveal; add a forward-only index only when plans justify it. No production EXPLAIN or application scan was run.

## Reproduced defects and required forward changes

[phase-7b-readiness-findings.test.mjs](../crawl/tests/database/phase-7b-readiness-findings.test.mjs) contains five **passing defect reproductions** against unchanged staging SQL. Passing means the defect was observed; none is an acceptance pass.

1. **Critical privilege contract:** production-style default grants retain authenticated UPDATE/DELETE/TRUNCATE on Jury votes. Ordinary REST UPDATE/DELETE still encounter absent RLS policies; the report does not claim those operations currently succeed or that REST exposes TRUNCATE. An isolated SQL-session TRUNCATE succeeds and leaves counts stale because RLS does not govern TRUNCATE. Explicitly clear authenticated privileges for every new relation and prove effective ACLs.
2. **Favorite validity after deletion:** two personal ratings at one restaurant are allowed by the real destination/crawl/user unique key. Deleting only one removes the Favorite even though a qualifying rating remains. Under shared lock, delete only when no qualifying personal rating remains.
3. **Rating lifecycle:** moving a personal rating to a Want to Try destination by UPDATE leaves the save. Rating upserts exist in repository code. Cover relevant INSERT/UPDATE/DELETE and future withdrawal semantics with old/new identity handling and consistent lock order. Updating a rating away can also invalidate a Favorite on the old destination. A simple same-identity score UPDATE normally had prior INSERT cleanup already; do not overstate every upsert as failing.
4. **Account deletion counts:** auth.users ON DELETE CASCADE removes the user's Jury votes; insert-only refresh leaves Likes unchanged. Decide and implement the approved lifecycle: count refresh for cascaded deletion or intentionally retained anonymized immutable verdicts. Current FK/count combination violates aggregate correctness. Ordinary user vote edits/deletes remain forbidden.
5. **Storage version compatibility:** fixture with only archived/delete-marker metadata still passes the SQL eligibility predicate and permits a direct vote. The production schema contains these fields. Match active, non-delete-marker Storage semantics under tested versioning, or use a tested trusted live-object boundary. No claim was made that production holds such a record. Edge createSignedUrls alone must not be treated as a proven existence check; validate fetchability and withdrawal behavior in a disposable runtime.

Additional unresolved risks: genuine concurrent duplicate/count/save-rating behavior needs two actual PostgreSQL sessions; identifier hash advisory locking and snapshot behavior were only exercised in one PGlite engine. User-created timestamps and high-volume direct votes should be assessed in the security review. Existing broad baseline ACLs are observed context, not authorization to rewrite historical grants.

## Forward-only migration plan and stop conditions

No release migration draft was created or promoted. Existing staging remains outside supabase/migrations. Catalog prerequisites exist, but defects, historical evidence and real runtime gates fail; copying the staged file into the deploy queue would be misleading.

1. Preserve all historical files, timestamps, hashes, manifest and remote ledger. Obtain full ordered applied-ledger statements/deployment artifacts and compare definitions to Phase 2A findings. Live catalog existence does not prove applied bytes or historical replay. Supplied Phase 2A ledger evidence is 35 rows through 20261009201342; this review did not retrieve ledger SQL.
2. Establish a disposable PostgreSQL17/Supabase runtime and an explicit clean-init baseline contract, including auth helpers/roles/default ACLs, actual crawl/rating requirements, storage versioning and existing gallery tables/functions/policies. Existing exports are incomplete. Missing prerequisites must become separately reviewed forward-only baseline additions/fixture setup; never replay a local historical file merely because its version is absent remotely.
3. Resolve the five staging defects and security findings in the authorized local staging area, preserving current application behavior and gallery/reward systems. Validate all expected ACLs, policies, trigger interactions, counts and concurrency against both clean initialization and a production-shaped schema.
4. Only after those gates and separate release-migration authorization, discover CLI help and generate a unique new migration using **supabase migration new wing_jury_saved_destinations_foundation** in a disposable scratch project. Skill requires CLI generation, not a hand-invented filename. Keep any review draft outside this repository's deploy queue until promotion is approved. Verify generated version exceeds the complete reconciled remote/local maximum and does not collide; timestamps are opaque ordered version identifiers. Use one reviewed transaction (or dependency-ordered separately generated prerequisites followed by foundation).
5. Future candidate must assert prerequisite columns/types/FKs/schema defaults and detect conflicting feature objects before changes. Avoid CREATE TABLE IF NOT EXISTS silently accepting incompatible structures. Explicitly REVOKE ALL authenticated/PUBLIC/anon then regrant narrow table rights; grant service_role required reads; fixed-path private helpers; supported Storage active-version predicate; lifecycle-correct triggers; validated constraints and measured indexes. Do not rewrite applied historical bytes or use migration repair/reset/push from this review.
6. Review candidate diff, run local advisors/security review and actual auth-role/guest/cross-user tests, then deploy only with separately authorized migration/function actions. Both production feature flags remain false until separate enablement authorization and live/device verification.

## Validation and practical limits

- Existing Phase 2B fixture alone: **7/7 PASS**.
- Existing fixture plus five readiness reproductions: **12/12 PASS**, zero failures/TODOs. Five passes document defects.
- Root coordinated combined fixture/findings/Edge/service run: **38 total, 32 PASS, 6 failing TODO regressions, 0 unexpected failures**. The TODOs are unresolved required behavior, not release passes.
- Root historical migration integrity: remains blocked with **69 roots, duplicate 20260729200000, 5 content checksum mismatches, 17 unmanifested roots**. No historical SQL, manifest or metadata repair performed.
- Root RLS-named suite: **50/52 PASS**; two historical integrity assertions fail. Not a live RLS execution.
- Root database:harness: **FAIL exit 1, ENOENT missing crawl/supabase/contracts/buffago-baseline-v1.json**. Not a clean-init pass; no replacement fake contract or test relaxation.
- Supabase CLI **2.107.0**; Docker client **29.4.2**, context desktop-linux; docker version cannot connect to missing dockerDesktopLinuxEngine named pipe. Daemon/runtime unavailable. No reset/start/application attempted.
- Live PostgreSQL **17.6** (Q11); pgcrypto **1.3**, no ltree/btree_gist entries in Q11b. Local config major version17 does not mean identical server version/runtime.
- Supabase changelog and official function documentation reviewed. The September 25 PG15.19/17.11 notice describes extension/custom-operator upgrade concerns; this review makes no upgrade/reindex/crypto changes. Version-compatibility proof still requires the actual local/release runtime. See [official notice](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes) and [database function security guidance](https://supabase.com/docs/guides/database/functions).
- Live objects/ACL metadata and private bucket configuration verified; no actual user authorization, deployed Edge handler, Storage fetchability, real concurrency, representative query plan, device screenshot or production feature behavior is claimed.

Read [Phase 7B security review](phase-7b-security-review.md) and [Phase 2A reconciliation](phase-2a-database-baseline-reconciliation.md) together with this report. The next authorized action is local remediation and disposable-runtime/baseline validation. Deployment remains blocked.


## Full media and bucket column definitions

This completes the prerequisite column inventory from final Q02. It contains definitions only. No bucket lifecycle configuration value or media record was retrieved.

| Relation | Column | Type | Nullability | Default/generated expression |
| --- | --- | --- | --- | --- |
| public.wing_media_submissions | id | uuid | NOT NULL | gen_random_uuid() |
| public.wing_media_submissions | user_id | uuid | nullable | none |
| public.wing_media_submissions | owner_pseudonym_id | uuid | NOT NULL | gen_random_uuid() |
| public.wing_media_submissions | owner_deleted_at | timestamp with time zone | nullable | none |
| public.wing_media_submissions | rating_id | uuid | nullable | none |
| public.wing_media_submissions | destination_id | uuid | NOT NULL | none |
| public.wing_media_submissions | media_type | text | NOT NULL | none |
| public.wing_media_submissions | original_storage_path | text | NOT NULL | none |
| public.wing_media_submissions | processed_storage_path | text | nullable | none |
| public.wing_media_submissions | thumbnail_storage_path | text | nullable | none |
| public.wing_media_submissions | status | text | NOT NULL | 'uploaded'::text |
| public.wing_media_submissions | moderation_status | text | NOT NULL | 'pending'::text |
| public.wing_media_submissions | wing_verification_status | text | NOT NULL | 'pending'::text |
| public.wing_media_submissions | wing_confidence | numeric(5,4) | nullable | none |
| public.wing_media_submissions | quality_score | numeric(6,3) | nullable | none |
| public.wing_media_submissions | content_score | numeric(8,3) | nullable | none |
| public.wing_media_submissions | duplicate_group | uuid | nullable | none |
| public.wing_media_submissions | perceptual_hash | text | nullable | none |
| public.wing_media_submissions | consent_version | text | NOT NULL | none |
| public.wing_media_submissions | consented_at | timestamp with time zone | NOT NULL | none |
| public.wing_media_submissions | attribution_preference | text | NOT NULL | none |
| public.wing_media_submissions | user_caption | text | nullable | none |
| public.wing_media_submissions | reviewer_notes | text | nullable | none |
| public.wing_media_submissions | priority | integer | NOT NULL | 0 |
| public.wing_media_submissions | approved_at | timestamp with time zone | nullable | none |
| public.wing_media_submissions | approved_by | uuid | nullable | none |
| public.wing_media_submissions | rejected_at | timestamp with time zone | nullable | none |
| public.wing_media_submissions | rejection_reason | text | nullable | none |
| public.wing_media_submissions | featured_at | timestamp with time zone | nullable | none |
| public.wing_media_submissions | withdrawn_at | timestamp with time zone | nullable | none |
| public.wing_media_submissions | original_retain_until | timestamp with time zone | nullable | none |
| public.wing_media_submissions | created_at | timestamp with time zone | NOT NULL | now() |
| public.wing_media_submissions | updated_at | timestamp with time zone | NOT NULL | now() |
| public.wing_media_submissions | correlation_id | uuid | NOT NULL | gen_random_uuid() |
| public.wing_media_submissions | original_deleted_at | timestamp with time zone | nullable | none |
| public.wing_media_submissions | submission_source | text | NOT NULL | 'rating'::text |
| public.wing_media_submissions | reviewed_at | timestamp with time zone | nullable | none |
| public.wing_media_submissions | reviewed_by | uuid | nullable | none |
| public.wing_media_submissions | is_publish_priority | boolean | NOT NULL | false |
| public.wing_media_submissions | priority_set_at | timestamp with time zone | nullable | none |
| public.wing_media_submissions | priority_set_by | uuid | nullable | none |
| public.wing_media_submissions | like_count | integer | NOT NULL | 0 |
| public.wing_media_submissions | dislike_count | integer | NOT NULL | 0 |
| storage.buckets | id | text | NOT NULL | none |
| storage.buckets | name | text | NOT NULL | none |
| storage.buckets | owner | uuid | nullable | none |
| storage.buckets | created_at | timestamp with time zone | nullable | now() |
| storage.buckets | updated_at | timestamp with time zone | nullable | now() |
| storage.buckets | public | boolean | nullable | false |
| storage.buckets | avif_autodetection | boolean | nullable | false |
| storage.buckets | file_size_limit | bigint | nullable | none |
| storage.buckets | allowed_mime_types | text[] | nullable | none |
| storage.buckets | owner_id | text | nullable | none |
| storage.buckets | type | storage.buckettype | NOT NULL | 'STANDARD'::storage.buckettype |
| storage.buckets | versioning_status | text | NOT NULL | 'DISABLED'::text |
| storage.buckets | lifecycle_configuration | jsonb | nullable | none |
| storage.buckets | lifecycle_configuration_generation | uuid | nullable | none |
