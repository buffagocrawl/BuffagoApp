-- Phase 7B read-only catalog verification; project vhfxnizaxdanmvmouuaf.
-- Prepared 2026-10-09. Run each numbered block separately in a read-only session.
-- These SELECTs inspect definitions/ACLs and nonsecret bucket id/public config only:
-- no application/auth/storage object rows, user identifiers, object paths, writes,
-- secrets, migration-history edits, or deployed changes. One SELECT per block.
-- Missing objects return absent/empty results. Expected outcomes describe release
-- gates, not assertions that anything has been deployed.

-- Q01: Relation existence and RLS flags. Expected: all prerequisite relations present; four new relations absent before release, present with relrowsecurity=true after local candidate application.
with expected(name) as (values ('auth.users'),('public.users'),('public.destinations'),('public.destination_ratings'),('public.wing_media_submissions'),('public.wing_media_photo_votes'),('storage.objects'),('storage.buckets'),('public.user_destination_favorites'),('public.user_want_to_try'),('public.wing_jury_votes'),('public.wing_jury_photo_vote_counts')) select e.name, c.oid is not null as exists, c.relkind, c.relrowsecurity, c.relforcerowsecurity, pg_get_userbyid(c.relowner) as owner from expected e left join pg_class c on c.oid=to_regclass(e.name) order by e.name;

-- Q02: Columns/types/defaults. Compare complete output to review inventory; auth.users/public.users include identity key columns only to keep identity metadata narrowly scoped.
select n.nspname as schema_name,c.relname as table_name,a.attname as column_name,format_type(a.atttypid,a.atttypmod) as data_type,a.attnotnull as not_null,pg_get_expr(d.adbin,d.adrelid) as column_default from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_attribute a on a.attrelid=c.oid left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum where c.oid in (select to_regclass(x) from unnest(array['auth.users','public.users','public.destinations','public.destination_ratings','public.wing_media_submissions','public.wing_media_photo_votes','storage.objects','storage.buckets','public.user_destination_favorites','public.user_want_to_try','public.wing_jury_votes','public.wing_jury_photo_vote_counts']) x) and a.attnum>0 and not a.attisdropped and (n.nspname<>'auth' and c.relname<>'users' or a.attname in ('id','user_id')) order by n.nspname,c.relname,a.attnum;

-- Q03: PK/FK/check definitions and validation. Expected new-table PKs/checks/cascade or restrict actions as specified; prerequisite IDs must be compatible UUID unique targets.
select con.conrelid::regclass::text as table_name,con.conname,con.contype,con.convalidated,pg_get_constraintdef(con.oid,true) as definition from pg_constraint con where con.conrelid in (select to_regclass(x) from unnest(array['auth.users','public.users','public.destinations','public.destination_ratings','public.wing_media_submissions','public.wing_media_photo_votes','storage.objects','storage.buckets','public.user_destination_favorites','public.user_want_to_try','public.wing_jury_votes','public.wing_jury_photo_vote_counts']) x) order by table_name,con.conname;

-- Q04: Indexes and validity. Expected six explicit new indexes plus four new PK indexes; inspect baseline rating/feed/storage support, no production EXPLAIN or row scan.
select i.indrelid::regclass::text as table_name,c.relname as index_name,i.indisvalid,i.indisready,pg_get_indexdef(i.indexrelid) as definition from pg_index i join pg_class c on c.oid=i.indexrelid where i.indrelid in (select to_regclass(x) from unnest(array['auth.users','public.users','public.destinations','public.destination_ratings','public.wing_media_submissions','public.wing_media_photo_votes','storage.objects','storage.buckets','public.user_destination_favorites','public.user_want_to_try','public.wing_jury_votes','public.wing_jury_photo_vote_counts']) x) order by table_name,index_name;

-- Q05: Trigger definitions. Expected six staged triggers; inspect all rating/media/vote triggers for coexistence before release.
select t.tgrelid::regclass::text as table_name,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid,true) as definition from pg_trigger t where not t.tgisinternal and t.tgrelid in (select to_regclass(x) from unnest(array['auth.users','public.users','public.destinations','public.destination_ratings','public.wing_media_submissions','public.wing_media_photo_votes','storage.objects','storage.buckets','public.user_destination_favorites','public.user_want_to_try','public.wing_jury_votes','public.wing_jury_photo_vote_counts']) x) order by table_name,t.tgname;

-- Q06: Staged private functions and auth prerequisite signatures. Expected nine private functions with fixed search_path, required definer behavior; auth.uid() UUID and auth.jwt() JSONB.
select n.nspname as schema_name,p.proname,pg_get_function_identity_arguments(p.oid) as identity_arguments,pg_get_function_result(p.oid) as result_type,p.prosecdef as security_definer,p.provolatile,p.proconfig,pg_get_userbyid(p.proowner) as owner,p.proacl::text as acl,case when n.nspname='private' then pg_get_functiondef(p.oid) else null end as definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname='private' and p.proname in ('lock_user_destination','require_authenticated_user','validate_favorite_insert','validate_want_to_try_insert','remove_want_to_try_after_rating','remove_favorite_after_rating_delete','is_public_wing_jury_photo','validate_wing_jury_vote_insert','refresh_wing_jury_photo_vote_counts')) or (n.nspname='auth' and p.proname in ('uid','jwt')) order by schema_name,p.proname,identity_arguments;

-- Q07: RLS policy definitions. Expected own-user policies on collections/votes, eligible-photo count SELECT; no extra permissive policy widening access. Catalog existence is not an authorization test.
select schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check from pg_policies where schemaname||'.'||tablename in ('auth.users','public.users','public.destinations','public.destination_ratings','public.wing_media_submissions','public.wing_media_photo_votes','storage.objects','storage.buckets','public.user_destination_favorites','public.user_want_to_try','public.wing_jury_votes','public.wing_jury_photo_vote_counts') order by schemaname,tablename,policyname;

-- Q08: Effective table privileges for API roles. Expected anon no access to four new tables; authenticated collections SELECT/INSERT/DELETE, votes SELECT/INSERT, counts SELECT only; service_role explicit needed operations.
select c.oid::regclass::text as table_name,r.rolname as role_name,has_table_privilege(r.oid,c.oid,'SELECT') as can_select,has_table_privilege(r.oid,c.oid,'INSERT') as can_insert,has_table_privilege(r.oid,c.oid,'UPDATE') as can_update,has_table_privilege(r.oid,c.oid,'DELETE') as can_delete,has_table_privilege(r.oid,c.oid,'TRUNCATE') as can_truncate,has_table_privilege(r.oid,c.oid,'REFERENCES') as can_reference,has_table_privilege(r.oid,c.oid,'TRIGGER') as can_trigger,c.relacl::text as explicit_acl from pg_class c cross join pg_roles r where c.oid in (select to_regclass(x) from unnest(array['auth.users','public.users','public.destinations','public.destination_ratings','public.wing_media_submissions','public.wing_media_photo_votes','storage.objects','storage.buckets','public.user_destination_favorites','public.user_want_to_try','public.wing_jury_votes','public.wing_jury_photo_vote_counts']) x) and r.rolname in ('anon','authenticated','service_role') order by table_name,role_name;

-- Q09: Schema privileges. Observed private has no API-role USAGE/CREATE. Keep it non-exposed; evaluate prebound policy/function invocation in real PostgreSQL rather than adding broad USAGE without need.
select n.nspname as schema_name,r.rolname as role_name,has_schema_privilege(r.oid,n.oid,'USAGE') as can_use,has_schema_privilege(r.oid,n.oid,'CREATE') as can_create,n.nspacl::text as explicit_acl from pg_namespace n cross join pg_roles r where n.nspname in ('public','private','auth','storage') and r.rolname in ('anon','authenticated','service_role') order by schema_name,role_name;

-- Q09b: Default privileges alone (separate call because execute_sql returns only last result set). Expected narrow privileges must be explicitly established by candidate DDL.
select pg_get_userbyid(d.defaclrole) as owner,n.nspname as schema_name,d.defaclobjtype,d.defaclacl::text as default_acl from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace where n.nspname in ('public','private') or d.defaclnamespace=0 order by owner,schema_name,d.defaclobjtype;

-- Q10: Effective private-function execution. Expected authenticated only is_public_wing_jury_photo; anon none; other helpers not directly executable by either.
select n.nspname as schema_name,p.proname,pg_get_function_identity_arguments(p.oid) as identity_arguments,r.rolname as role_name,has_function_privilege(r.oid,p.oid,'EXECUTE') as can_execute from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join pg_roles r where n.nspname='private' and p.proname in ('lock_user_destination','require_authenticated_user','validate_favorite_insert','validate_want_to_try_insert','remove_want_to_try_after_rating','remove_favorite_after_rating_delete','is_public_wing_jury_photo','validate_wing_jury_vote_insert','refresh_wing_jury_photo_vote_counts') and r.rolname in ('anon','authenticated','service_role') order by p.proname,identity_arguments,role_name;

-- Q11: Safe environment metadata and exposure hint. Expected PG17 local match checked; NULL pgrst.db_schemas does not prove runtime exposure. Never read arbitrary settings or secrets.
select current_setting('server_version') as server_version,current_setting('server_version_num') as server_version_num,current_setting('pgrst.db_schemas',true) as database_exposure_hint;

-- Q11b: Relevant installed extension metadata only.
select extname,extversion from pg_extension where extname in ('pgcrypto','ltree','btree_gist') order by extname;

-- Q12: Nonsecret bucket configuration only. Expected exactly wing-submissions with public=false; no objects/paths/owners returned.
select id, public from storage.buckets where id='wing-submissions';

-- Q13: Existing rating RPC definitions/signatures/ACLs only. Expected real persisted INSERT/UPSERT entry points share destination_ratings; inspect event semantics without invoking a function or reading rating records.
select n.nspname as schema_name,p.proname,pg_get_function_identity_arguments(p.oid) as identity_arguments,pg_get_function_result(p.oid) as result_type,p.prosecdef as security_definer,p.proconfig,p.proacl::text as acl,pg_get_functiondef(p.oid) as definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('submit_validated_restaurant_rating','submit_validated_crawl_rating','submit_buffacoin_rating_v1') order by p.proname,identity_arguments;

-- Phase 7B.2 additions, prepared locally 2026-10-10; NOT executed remotely in
-- this phase. Earlier Q01-Q13 blocks retain their Phase 7B.1 inventory purpose.
-- Q14: All feature read wrappers and added private trigger helpers. Expect fixed
-- trusted paths, no PUBLIC/anon/authenticated execution of service wrappers;
-- service_role only wrappers; no API execution of private trigger/lock helpers.
select n.nspname as schema_name,p.proname,pg_get_function_identity_arguments(p.oid) as identity_arguments,pg_get_function_result(p.oid) as result_type,p.prosecdef as security_definer,p.proconfig,p.proacl::text as acl,pg_get_functiondef(p.oid) as definition,r.rolname,has_function_privilege(r.oid,p.oid,'EXECUTE') as can_execute from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join pg_roles r where ((n.nspname='public' and p.proname in ('is_public_wing_jury_photo','wing_jury_restaurant_rating_summary')) or (n.nspname='private' and p.proname in ('lock_user_destination','lock_rating_collection_identities','enforce_wing_jury_vote_immutability'))) and r.rolname in ('anon','authenticated','service_role') order by schema_name,p.proname,identity_arguments,r.rolname;

-- Q15: Feature trigger inventory after hardening (policies are inspected in Q07).
-- Expect BEFORE rating identity locks, AFTER INSERT/UPDATE cleanup,
-- last-rating Favorite removal on UPDATE/DELETE, vote UPDATE/DELETE immutability
-- and INSERT/DELETE count maintenance. No unrelated definitions are replaced.
select t.tgrelid::regclass::text as table_name,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid,true) as definition from pg_trigger t where not t.tgisinternal and t.tgrelid in (select to_regclass(x) from unnest(array['public.destination_ratings','public.user_destination_favorites','public.user_want_to_try','public.wing_jury_votes']) x) order by table_name,t.tgname;
