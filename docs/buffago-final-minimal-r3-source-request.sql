-- DRAFT, NOT EXECUTED. Separate operator approval required.
-- Only project vhfxnizaxdanmvmouuaf. Screen outputs before sharing.
-- Nine necessary bodies: five unavailable, four mismatched. Do not repeat R1/R2.
-- No application rows, credentials, Storage paths or production DDL.
begin read only;
set local lock_timeout='5s';
set local statement_timeout='60s';
with requested(signature,expected_md5) as (values
 ('public."Badge_Add_Rating_Milestones"()','298aa31f809efe43252005021f089fc1'),
 ('public.mango_clear_ineligible_priority()','e6afd97295efcd4fd14542212290b7f0'),
 ('public.friend_pair_is_blocked(uuid,uuid)','dbb0188e6e65df3e38d401d995812e50'),
 ('storage.protect_delete()','998d324ea2b1abc49351e8c2367b5796'),
 ('storage.update_updated_at_column()','7596e66a7698d5a6b5129c5ce9b24c5f'),
 ('public.reserve_wing_submission_upload(uuid,text,text,bigint,text,text,text,text,uuid,uuid,text)','b743ef604059e9ffa454dc8085caad9b'),
 ('public.finalize_wing_submission_upload(uuid,text,uuid)','d7c7c9a5f47e72f04450197be6f76b53')
), targets as (
 select r.signature as requested_signature,r.expected_md5,to_regprocedure(r.signature)::oid as oid from requested r
 union all
 select e.evtname,case e.evtname when 'issue_pg_graphql_access' then 'dd3f3e2bb94cff45ef24b9cecb6af1c8' else '7f27b8118fea5c88b0164331292859e3' end,e.evtfoid
 from pg_event_trigger e where e.evtname in ('issue_pg_graphql_access','pgrst_ddl_watch')
)
select t.requested_signature,t.expected_md5,n.nspname as schema_name,
 p.oid::regprocedure::text as actual_signature,md5(p.prosrc) as actual_md5,
 md5(coalesce(p.proconfig::text,'')) as config_md5,p.proowner::regrole::text as owner,
 l.lanname,p.prosecdef,p.provolatile,p.proparallel,p.prorettype::regtype::text as return_type,
 pg_get_function_arguments(p.oid) as arguments,p.proacl::text as acl,
 -- Do not substitute a changed or redacted implementation as an exact match.
 case when md5(p.prosrc)=t.expected_md5 then p.prosrc else null end as source_for_operator_screening
from targets t left join pg_proc p on p.oid=t.oid
left join pg_namespace n on n.oid=p.pronamespace
left join pg_language l on l.oid=p.prolang order by t.requested_signature;

-- Newly discovered transitive dependency: METADATA ONLY first, no body.
-- Match xp_level_for against checkout before requesting its source separately.
select p.oid::regprocedure::text as signature,p.proowner::regrole::text as owner,
 l.lanname,p.prosecdef,p.provolatile,p.proacl::text as acl,
 md5(p.prosrc) as source_md5,md5(coalesce(p.proconfig::text,'')) as config_md5,
 array(select cfg from unnest(p.proconfig) cfg where cfg like 'search_path=%') as search_path
from pg_proc p join pg_language l on l.oid=p.prolang
where p.oid=to_regprocedure('public.xp_level_for(integer)');
rollback;
