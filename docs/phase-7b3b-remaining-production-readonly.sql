-- Phase 7B.3B REMAINING evidence ONLY. ChatGPT connected Supabase target must
-- independently display project ref vhfxnizaxdanmvmouuaf. SQL alone cannot prove it.
-- All SELECTs; no function business execution, user rows, settings secrets,
-- function bodies, raw ledger statements, JWTs, storage paths or credentials.
begin read only;
set local search_path=pg_catalog,public;
set local statement_timeout='30s';

-- B01: observed runtime/session; this must be repeated through actual executor.
select current_database() database,current_user execution_role,session_user,
 current_setting('server_version_num') server_version_num,
 current_setting('transaction_isolation') isolation,
 (select rolbypassrls from pg_roles where rolname=current_user) bypassrls;

-- B02: exact existing ledger shape/ownership/ACL, then complete ordered ledger.
select c.relowner::regrole owner,c.relacl,c.relrowsecurity,
 a.attname,format_type(a.atttypid,a.atttypmod) type,a.attnotnull,
 pg_get_expr(d.adbin,d.adrelid) default_expression
from pg_class c join pg_attribute a on a.attrelid=c.oid
left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
where c.oid='supabase_migrations.schema_migrations'::regclass and a.attnum>0 and not a.attisdropped order by a.attnum;
select conname,pg_get_constraintdef(oid,true),convalidated from pg_constraint where conrelid='supabase_migrations.schema_migrations'::regclass;
select tgname,tgenabled,tgtype,tgfoid::regprocedure function,tgnargs,md5(tgargs::text) args_md5 from pg_trigger where not tgisinternal and tgrelid='supabase_migrations.schema_migrations'::regclass;
select rulename,md5(pg_get_ruledef(oid,true)) definition_md5 from pg_rewrite where ev_class='supabase_migrations.schema_migrations'::regclass;
select e.evtname,e.evtevent,e.evtenabled,e.evttags,e.evtowner::regrole owner,
 e.evtfoid::regprocedure function,md5(p.prosrc) body_md5 from pg_event_trigger e join pg_proc p on p.oid=e.evtfoid order by e.evtname;
select version,name,cardinality(statements) statement_count,
 md5(coalesce(statements::text,'')) entire_statement_array_md5
from supabase_migrations.schema_migrations order by version;

-- B03: authority, inherited rights and default grants (no role escalation).
select r.rolname,r.rolsuper,r.rolinherit,r.rolcreaterole,r.rolcreatedb,r.rolbypassrls
from pg_roles r where r.rolname in ('postgres','anon','authenticated','service_role','supabase_auth_admin','supabase_storage_admin') order by r.rolname;
select roleid::regrole granted_role,member::regrole member,admin_option,inherit_option,set_option from pg_auth_members order by 1,2;
select api.rolname api_role,parent.rolname reachable_set_role from pg_roles api cross join pg_roles parent
where api.rolname in ('anon','authenticated','service_role') and api.oid<>parent.oid and pg_has_role(api.oid,parent.oid,'SET') order by 1,2;
select r.role,n.schema,has_schema_privilege(r.role,n.schema,'USAGE') usage,
 has_schema_privilege(r.role,n.schema,'CREATE') create_privilege
from (values('postgres'),('anon'),('authenticated'),('service_role')) r(role)
cross join (values('public'),('private'),('auth'),('storage'),('supabase_migrations')) n(schema) order by 1,2;
select r.role,t.relation,p.privilege,has_table_privilege(r.role,t.relation,p.privilege) effective
from (values('postgres'),('anon'),('authenticated'),('service_role')) r(role)
cross join (values('auth.users'),('public.destinations'),('public.crawls'),('public.destination_ratings'),('public.wing_media_submissions'),('storage.objects'),('supabase_migrations.schema_migrations')) t(relation)
cross join (values('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRIGGER'),('REFERENCES'),('TRUNCATE'),('MAINTAIN')) p(privilege) order by 1,2,3;
select defaclrole::regrole owner,case when defaclnamespace=0 then '(global)' else defaclnamespace::regnamespace::text end schema,
 defaclobjtype,defaclacl from pg_default_acl order by 1,2,3;

-- B04: complete conflicts: overloads, relations/types, indexes, trigger names.
select n.nspname,c.relname,c.relkind,c.relowner::regrole owner from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname in ('public','private') and c.relname in ('user_destination_favorites','user_want_to_try','wing_jury_votes','wing_jury_photo_vote_counts','user_destination_favorites_pkey','user_want_to_try_pkey','wing_jury_votes_pkey','wing_jury_photo_vote_counts_pkey','user_destination_favorites_destination_idx','user_want_to_try_destination_idx','wing_jury_votes_user_idx','wing_jury_photo_vote_counts_like_idx','wing_media_submissions_wing_jury_candidate_idx','wing_jury_votes_submission_vote_idx') order by 1,2;
select n.nspname,t.typname from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname in ('public','private') and (t.typname like 'wing_jury_%' or t.typname in ('user_destination_favorites','user_want_to_try')) order by 1,2;
select p.oid::regprocedure signature,p.proowner::regrole owner,p.prosecdef,
 (select array_agg(v) from unnest(p.proconfig) v where v like 'search_path=%') search_path,
 md5(coalesce(p.proconfig::text,'')) full_config_md5,p.proacl,md5(p.prosrc) source_md5
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname in ('public','private') and p.proname in ('lock_user_destination','require_authenticated_user','validate_favorite_insert','validate_want_to_try_insert','remove_want_to_try_after_rating','lock_rating_collection_identities','remove_favorite_after_rating_delete','is_public_wing_jury_photo','wing_jury_restaurant_rating_summary','wing_jury_feed_candidates','validate_wing_jury_vote_insert','enforce_wing_jury_vote_immutability','refresh_wing_jury_photo_vote_counts') order by 1;
select tgrelid::regclass relation,tgname,tgenabled,tgtype,tgfoid::regprocedure function,
 tgnargs,md5(tgargs::text) argument_md5,md5(coalesce(pg_get_expr(tgqual,tgrelid),'')) when_md5
from pg_trigger where not tgisinternal and (tgname like 'destination_ratings_%' or tgname like 'wing_jury_%' or tgname like 'user_destination_favorites_%' or tgname like 'user_want_to_try_%') order by 1,2;

-- B05: full FK definitions/mappings/deferrability, existing indexes/constraints.
select conrelid::regclass relation,conname,contype,confrelid::regclass referenced_relation,
 conkey,confkey,condeferrable,condeferred,convalidated,pg_get_constraintdef(oid,true) definition
from pg_constraint where conrelid in ('public.destination_ratings'::regclass,'public.wing_media_submissions'::regclass,'auth.users'::regclass,'public.destinations'::regclass,'public.crawls'::regclass)
or confrelid in ('public.wing_media_submissions'::regclass,'auth.users'::regclass,'public.destinations'::regclass,'public.crawls'::regclass) order by 1,2;
select i.indrelid::regclass relation,i.indexrelid::regclass index,i.indisvalid,i.indisready,pg_get_indexdef(i.indexrelid) definition
from pg_index i where i.indrelid in ('public.destination_ratings'::regclass,'public.wing_media_submissions'::regclass,'storage.objects'::regclass) order by 1,2;

-- B06: relevant trigger/RPC metadata and catalog-recorded dependencies ONLY.
-- PL/pgSQL/dynamic-SQL dependencies are incomplete in pg_depend. This query is
-- NOT proof of behavior/lock order/deletion orchestration. Screened source and
-- actual caller/runtime artifacts are required for the named residual gates.
with relevant as (
 select distinct tgfoid oid from pg_trigger where not tgisinternal and tgrelid in ('auth.users'::regclass,'public.users'::regclass,'public.destination_ratings'::regclass,'public.wing_media_submissions'::regclass,'public.wing_media_photo_votes'::regclass,'storage.objects'::regclass)
 union select oid from pg_proc where proname in ('submit_validated_restaurant_rating','submit_validated_crawl_rating','submit_buffacoin_rating_v1','can_user_appear_socially','friend_pair_is_blocked','withdraw_wing_submission','prepare_wing_account_media_cleanup','complete_wing_account_media_cleanup','wing_apply_owner_pseudonymization'))
select p.oid::regprocedure signature,p.proowner::regrole owner,l.lanname,p.prosecdef,p.provolatile,
 (select array_agg(v) from unnest(p.proconfig) v where v like 'search_path=%') search_path,
 md5(coalesce(p.proconfig::text,'')) full_config_md5,p.proacl,md5(p.prosrc) body_md5
from relevant r join pg_proc p on p.oid=r.oid join pg_language l on l.oid=p.prolang order by 1;
with relevant as (select distinct tgfoid oid from pg_trigger where not tgisinternal and tgrelid in ('auth.users'::regclass,'public.users'::regclass,'public.destination_ratings'::regclass,'public.wing_media_submissions'::regclass,'storage.objects'::regclass)
 union select oid from pg_proc where proname in ('submit_validated_restaurant_rating','submit_validated_crawl_rating','submit_buffacoin_rating_v1','can_user_appear_socially','friend_pair_is_blocked','withdraw_wing_submission','prepare_wing_account_media_cleanup','complete_wing_account_media_cleanup'))
select r.oid::regprocedure signature,d.deptype,pg_describe_object(d.refclassid,d.refobjid,d.refobjsubid) dependency
from relevant r join pg_depend d on d.classid='pg_proc'::regclass and d.objid=r.oid order by 1,2,3;

-- B07: observable active/idle-in-transaction age and blockers, without SQL text.
select pid,usename,state,wait_event_type,wait_event,
 clock_timestamp()-xact_start transaction_age,pg_blocking_pids(pid) blocking_pids
from pg_stat_activity where datname=current_database() and pid<>pg_backend_pid()
 and (xact_start < clock_timestamp()-interval '30 seconds' or cardinality(pg_blocking_pids(pid))>0) order by xact_start;
rollback;
