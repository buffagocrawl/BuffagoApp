-- NOT EXECUTED. Separate scoped operator read-only approval required.
-- Only project vhfxnizaxdanmvmouuaf; no application/Storage/Auth rows.
-- Return the already retrieved nine R3 bodies from retained results separately;
-- this draft asks only for the two newly necessary exact implementations.
begin read only;
set local lock_timeout='5s';
set local statement_timeout='60s';
with requested(signature,expected_source_md5) as (values
 ('public.xp_level_for(integer)','5fba55f09b21a6b0824b9abd87fadf59'),
 ('public.delete_account_data(uuid)',null)
)
select r.signature as requested_signature,p.oid::regprocedure::text as actual_signature,
 p.proowner::regrole::text as owner,l.lanname,p.prosecdef,p.provolatile,
 pg_get_function_arguments(p.oid) as arguments,p.prorettype::regtype::text as return_type,
 p.proacl::text as acl,md5(p.prosrc) as source_md5,
 md5(coalesce(p.proconfig::text,'')) as config_md5,
 array(select cfg from unnest(p.proconfig) cfg where cfg like 'search_path=%') as search_path,
 case when r.expected_source_md5 is null or md5(p.prosrc)=r.expected_source_md5
 then p.prosrc else null end as body_for_operator_screening
from requested r left join pg_proc p on p.oid=to_regprocedure(r.signature)
left join pg_language l on l.oid=p.prolang order by r.signature;
rollback;
-- Screen before sharing. Redacted or fingerprint-drifted bodies cannot close
-- exact compatibility. Any dependency follow-up must use an exact signature.
