-- Phase 7B.2.6: FOUR pending read-only catalog SELECTs, NOT executed remotely.
-- Intended project: vhfxnizaxdanmvmouuaf. Human must verify connector project
-- before execution and preserve each result separately with project/date.
-- Existing Q01-Q13 + Q09b/Q11b were executed in Phase 7B.1; do not repeat them.
-- This packet fills only newer-name and insufficiently retained definition gaps.
-- No application/auth-user/storage-object rows, stored migration SQL, secrets,
-- arbitrary settings, writes, EXPLAIN ANALYZE or existing RPC calls are read/run.
-- Function bodies are NOT returned: source may contain literal credentials.
-- MD5 below is a catalog comparison fingerprint, NOT deployed-file provenance.

-- RV01 [REQUIRED BEFORE DRAFT]: newer feature namespace collisions.
-- Resolves names not included in the old nine-helper inventory or old Q14.
-- Expected: five function names absent (all overloads), two newer rating trigger
-- names absent; proposed index names free across ALL public relations, and no
-- orphan/custom type occupies a proposed table's composite-type name. Q04 only
-- inspected indexes attached to its listed relations, not global collisions.
-- Original nine helpers/four table relations were already verified absent.
-- Different result: STOP replacement of that object;
-- review ownership/definition in a separately scoped safe artifact. Do not let
-- CREATE OR REPLACE or DROP TRIGGER silently replace it. No function is invoked.
with wanted_functions(schema_name, object_name) as (values
  ('private','lock_rating_collection_identities'),
  ('private','enforce_wing_jury_vote_immutability'),
  ('public','is_public_wing_jury_photo'),
  ('public','wing_jury_restaurant_rating_summary'),
  ('public','wing_jury_feed_candidates')
), wanted_triggers(object_name) as (values
  ('destination_ratings_lock_collection_identities'),
  ('destination_ratings_update_want_to_try')
), wanted_indexes(object_name) as (values
  ('user_destination_favorites_destination_idx'),
  ('user_want_to_try_destination_idx'),('wing_jury_votes_user_idx'),
  ('wing_jury_photo_vote_counts_like_idx'),
  ('wing_media_submissions_wing_jury_candidate_idx'),
  ('wing_jury_votes_submission_vote_idx'),
  ('user_destination_favorites_pkey'),('user_want_to_try_pkey'),
  ('wing_jury_votes_pkey'),('wing_jury_photo_vote_counts_pkey')
), wanted_types(object_name) as (values
  ('user_destination_favorites'),('user_want_to_try'),
  ('wing_jury_votes'),('wing_jury_photo_vote_counts')
)
select 'function' as object_type, w.schema_name, w.object_name,
       p.oid is not null as exists,
       pg_get_function_identity_arguments(p.oid) as signature,
       pg_get_function_result(p.oid) as result_type,
       pg_get_userbyid(p.proowner) as owner,
       p.prokind::text as kind,
       p.prosecdef as security_definer,
       (select string_agg(setting, ',' order by setting)
        from unnest(p.proconfig) setting
        where setting ~ '^(search_path|row_security)=') as configuration,
       p.proacl::text as acl
from wanted_functions w
left join pg_namespace n on n.nspname=w.schema_name
left join pg_proc p on p.pronamespace=n.oid and p.proname=w.object_name
union all
select 'trigger', 'public', w.object_name, t.oid is not null,
       case when t.oid is not null then
         'event_bits=' || t.tgtype::text || '; enabled=' || t.tgenabled::text end,
       null, null, null, null, null, null
from wanted_triggers w
left join pg_trigger t on t.tgrelid=to_regclass('public.destination_ratings')
  and t.tgname=w.object_name and not t.tgisinternal
union all
select 'index_namespace', 'public', w.object_name, c.oid is not null,
       case when c.relkind in ('i','I') then pg_get_indexdef(c.oid) end,
       null, pg_get_userbyid(c.relowner), c.relkind::text, null, null, null
from wanted_indexes w
left join pg_namespace n on n.nspname='public'
left join pg_class c on c.relnamespace=n.oid and c.relname=w.object_name
union all
select 'type_namespace', 'public', w.object_name, typ.oid is not null,
       null, null, pg_get_userbyid(typ.typowner), typ.typtype::text,
       null, null, null
from wanted_types w
left join pg_namespace n on n.nspname='public'
left join pg_type typ on typ.typnamespace=n.oid and typ.typname=w.object_name
order by object_type, schema_name, object_name, signature;

-- RV02 [REQUIRED BEFORE DRAFT]: omitted catalog detail, NOT all baseline columns.
-- Q02/Q03 summaries establish main UUID keys but do not preserve media FK/check
-- definitions or the crawls target needed by the existing rating RPCs/fixture.
-- Expected: crawls is a table with UUID unique/PK crawl_id; media id is a valid
-- UUID PK; required media/consent/status checks allow the staged predicate;
-- destination/rating/owner FK actions and incoming media/account/destination
-- deletion edges are recorded, not inferred. These are needed to assess the
-- new Jury media ON DELETE RESTRICT FK against existing hard-delete/cascades.
-- Different result: classify exact incompatibility A, adapt only NEW SQL or a
-- separately approved forward prerequisite. Never replay a historical file.
with targets as (
  select to_regclass('public.wing_media_submissions') as oid
  union all select to_regclass('public.crawls')
)
select 'relation' as detail, c.oid::regclass::text as object_name,
       c.relkind::text as definition, null::boolean as validated
from pg_class c join targets x on x.oid=c.oid
union all
select 'crawl_key', c.oid::regclass::text || '.' || a.attname,
       format_type(a.atttypid,a.atttypmod) ||
         case when a.attnotnull then ' NOT NULL' else ' NULLABLE' end, null
from pg_class c join pg_attribute a on a.attrelid=c.oid
where c.oid=to_regclass('public.crawls') and a.attname='crawl_id'
  and a.attnum>0 and not a.attisdropped
union all
select 'constraint', con.conrelid::regclass::text || '.' || con.conname,
       pg_get_constraintdef(con.oid,true), con.convalidated
from pg_constraint con
where (con.conrelid in (select oid from targets)
       and con.contype in ('p','u','f','c'))
   or (con.contype='f' and con.confrelid in (
       to_regclass('auth.users'),to_regclass('public.destinations'),
       to_regclass('public.wing_media_submissions')))
order by detail,object_name;

-- RV03 [REQUIRED BEFORE DRAFT for rating trigger coexistence; other attached
-- lifecycle functions are APPLICATION review]: old Q05 was executed but raw
-- trigger names/definitions and attached-function identity were not retained
-- in the saved summary. Capture this narrow attachment set, not Q05's full list.
-- Expected: existing rating reward/provenance/mission triggers are retained;
-- gallery counters/validation stay attached to gallery, never Jury; account and
-- media deletion/storage lifecycle are recorded. Rows may be empty per table.
-- Different result: inspect exact events/order/enabled states and fingerprint
-- changes; do not replace existing triggers. Before application, review safe
-- schema-only source for any locking/identity-changing attached function not
-- already understood, and test those interactions in a disposable replica.
-- Bodies, trigger argument values and arbitrary per-function settings omitted
-- intentionally. tgtype event bits are decoded below; WHEN/column-specific
-- details requiring safe source review are flagged without literal values.
select t.tgrelid::regclass::text as relation_name, t.tgname,
       t.tgenabled, t.tgtype as trigger_type_bits,
       (t.tgtype::integer & 1)<>0 as for_each_row,
       (t.tgtype::integer & 2)<>0 as before_event,
       (t.tgtype::integer & 64)<>0 as instead_of_event,
       (t.tgtype::integer & 4)<>0 as on_insert,
       (t.tgtype::integer & 8)<>0 as on_delete,
       (t.tgtype::integer & 16)<>0 as on_update,
       (t.tgtype::integer & 32)<>0 as on_truncate,
       t.tgattr::text as update_column_numbers,
       t.tgqual is not null as has_when_clause,
       t.tgnargs as argument_count,
       n.nspname as function_schema, p.proname as function_name,
       pg_get_function_identity_arguments(p.oid) as signature,
       pg_get_function_result(p.oid) as result_type,
       pg_get_userbyid(p.proowner) as owner,
       p.prosecdef as security_definer, p.provolatile,
       (select string_agg(setting, ',' order by setting)
        from unnest(p.proconfig) setting
        where setting ~ '^(search_path|row_security)=') as trusted_settings,
       p.proacl::text as acl,
       md5(p.prosrc) as catalog_body_md5
from pg_trigger t
join pg_proc p on p.oid=t.tgfoid
join pg_namespace n on n.oid=p.pronamespace
where not t.tgisinternal and t.tgrelid in (
  to_regclass('public.destination_ratings'),
  to_regclass('public.wing_media_submissions'),
  to_regclass('public.wing_media_photo_votes'),
  to_regclass('auth.users'), to_regclass('public.users'),
  to_regclass('storage.objects')
)
order by relation_name,t.tgname;

-- RV04 [REQUIRED BEFORE DRAFT]: effective privilege assumptions and missing
-- saved policy details. Q08/Q09b established broad defaults; this does not prove
-- API-role flags/inherited memberships or preserve exact owner-read policies.
-- Expected: anon/authenticated are not superuser/BYPASSRLS nor able to inherit
-- privileged owners; service_role is the trusted server role; API roles cannot
-- CREATE in trusted paths; current authenticated ratings/destinations reads and
-- service destination/media/rating reads remain sufficient under existing RLS.
-- postgres and current prerequisite owners are also projected for approved DDL
-- owner selection; do not assume the connected reader is the eventual creator.
-- SELECT plus UPDATE authority is needed for existing metadata SHARE locks;
-- TRIGGER/schema authority is needed for attaching the new rating triggers.
-- Different result: STOP relying on direct REVOKE as the complete boundary;
-- classify exact security incompatibility A and design separately reviewed
-- role-specific remediation. Do not modify global baseline grants in this phase.
-- Dashboard/PostgREST exposed-schema configuration is NOT established by SQL
-- schema USAGE; verify private remains unexposed separately before application.
with roles as (
  select oid,rolname,rolsuper,rolbypassrls,rolinherit
  from pg_roles where rolname in ('anon','authenticated','service_role','postgres')
    or oid in (select relowner from pg_class where oid in (
      to_regclass('auth.users'),to_regclass('public.destinations'),
      to_regclass('public.destination_ratings'),
      to_regclass('public.wing_media_submissions'),to_regclass('storage.objects')))
), targets as (
  select to_regclass(x) as oid from unnest(array[
    'public.destinations','public.destination_ratings',
    'public.wing_media_submissions','storage.objects','auth.users']) x
)
select jsonb_build_object(
  'roles', (select coalesce(jsonb_agg(jsonb_build_object(
    'name',r.rolname,'superuser',r.rolsuper,'bypassrls',r.rolbypassrls,
    'inherit',r.rolinherit,
    'reachable_memberships',(select coalesce(jsonb_agg(jsonb_build_object(
      'name',parent.rolname,'superuser',parent.rolsuper,
      'bypassrls',parent.rolbypassrls,'inherit',parent.rolinherit,
      'usable_now',pg_has_role(r.oid,parent.oid,'USAGE'))
      order by parent.rolname),'[]'::jsonb) from pg_roles parent
      where parent.oid<>r.oid and pg_has_role(r.oid,parent.oid,'MEMBER'))
  ) order by r.rolname),'[]'::jsonb) from roles r),
  'schema_privileges',(select coalesce(jsonb_agg(jsonb_build_object(
    'schema',n.nspname,'role',r.rolname,
    'usage',has_schema_privilege(r.oid,n.oid,'USAGE'),
    'create',has_schema_privilege(r.oid,n.oid,'CREATE')
  ) order by n.nspname,r.rolname),'[]'::jsonb)
    from pg_namespace n cross join roles r
    where n.nspname in ('public','private','auth','storage')),
  'baseline_reads',(select coalesce(jsonb_agg(jsonb_build_object(
    'relation',c.oid::regclass::text,'role',r.rolname,
    'select',has_table_privilege(r.oid,c.oid,'SELECT'),
    'update_for_row_lock',has_table_privilege(r.oid,c.oid,'UPDATE'),
    'trigger',has_table_privilege(r.oid,c.oid,'TRIGGER'),
    'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,
    'owner',pg_get_userbyid(c.relowner)
  ) order by c.oid::regclass::text,r.rolname),'[]'::jsonb)
    from pg_class c join targets x on x.oid=c.oid cross join roles r),
  'client_read_policies',(select coalesce(jsonb_agg(jsonb_build_object(
    'schema',schemaname,'table',tablename,'name',policyname,
    'permissive',permissive,'roles',roles,'command',cmd,
    'using',qual,'with_check',with_check
  ) order by tablename,policyname),'[]'::jsonb) from pg_policies
    where schemaname='public' and tablename in ('destinations','destination_ratings')
      and cmd in ('SELECT','ALL'))
) as missing_privilege_contract;
