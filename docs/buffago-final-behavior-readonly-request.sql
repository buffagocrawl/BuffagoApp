-- NOT EXECUTED. Separate read-only connection authorization is required.
-- Only project vhfxnizaxdanmvmouuaf. No DDL, application rows, ledger SQL,
-- role changes, or secret/configuration dumps. Reuse B01-B07 evidence.
-- Operator: return metadata first; compare raw/LF MD5 against checkout bodies.
-- Return a body only when no approved exact local match exists, after screening
-- it for credentials, personal data and secret-bearing literal/config values.
-- A redacted body cannot support complete parity; report any such limitation.

-- R1: missing consumed business helper fingerprints and callable authority.
-- Existing matched Home/Crawl/Buffacoin/prepare/complete/withdraw/upload/approval,
-- gallery, owner-pseudonymization, Buffacoin guard and notification bodies are
-- deliberately omitted. Candidate transitive referral helpers are called by
-- the existing local settlement implementation; correspondence is unverified.
with requested(schema_name,function_name) as (values
 ('public','Badge_Add_Rating_Milestones'),
 ('public','mango_clear_ineligible_priority'),
 ('public','settle_referral_for_rating_internal'),
 ('public','referral_profile_eligibility'),
 ('public','award_referral_xp_internal'),
 ('public','sync_verified_referral_badges_internal'),
 ('public','enqueue_referral_push_internal'),
 ('public','can_user_appear_socially'),
 ('public','friend_pair_is_blocked'),
 ('public','wing_transition_submission'),
 ('public','wing_photo_processing_blocker'),
 ('public','flag_referral_account_deletion'),
 ('storage','protect_delete'),
 ('storage','update_updated_at_column')
)
select r.schema_name,r.function_name,p.oid::regprocedure::text as signature,
 p.proowner::regrole::text as owner,l.lanname,p.prosecdef,p.provolatile,
 p.proacl::text as acl,md5(p.prosrc) as source_md5,
 array(select cfg from unnest(p.proconfig) cfg where cfg like 'search_path=%') as search_path,
 md5(coalesce(p.proconfig::text,'')) as configuration_md5,
 array(select split_part(cfg,'=',1) from unnest(p.proconfig) cfg) as configuration_keys
from requested r left join pg_namespace n on n.nspname=r.schema_name
left join pg_proc p on p.pronamespace=n.oid and p.proname=r.function_name
left join pg_language l on l.oid=p.prolang
order by r.schema_name,r.function_name,signature;

-- R2: the two applicable handler bindings/configuration/fingerprints only.
select e.evtname,e.evtevent,e.evtenabled,e.evttags,
 e.evtowner::regrole::text as event_owner,p.oid::regprocedure::text as handler,
 p.proowner::regrole::text as function_owner,l.lanname,p.prosecdef,
 p.provolatile,p.proleakproof,p.proparallel,p.prorettype::regtype::text as return_type,
 p.proacl::text as acl,md5(p.prosrc) as source_md5,
 array(select cfg from unnest(p.proconfig) cfg where cfg like 'search_path=%') as search_path,
 md5(coalesce(p.proconfig::text,'')) as configuration_md5,
 array(select split_part(cfg,'=',1) from unnest(p.proconfig) cfg) as configuration_keys
from pg_event_trigger e join pg_proc p on p.oid=e.evtfoid
join pg_language l on l.oid=p.prolang
where e.evtname in ('issue_pg_graphql_access','pgrst_ddl_watch')
order by e.evtname;

-- R3: narrowly screened missing implementations, after R1/R2 comparison.
-- This SELECT returns just known-unmatched Badge/Mango and unavailable event
-- bodies, not a broad database-source dump. Operator must screen before sharing.
with requested as (
 select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in
   ('Badge_Add_Rating_Milestones','mango_clear_ineligible_priority')
 union select e.evtfoid from pg_event_trigger e
 where e.evtname in ('issue_pg_graphql_access','pgrst_ddl_watch')
)
select p.oid::regprocedure::text as signature,md5(p.prosrc) as source_md5,
 p.prosrc as source_for_operator_screening
from requested r join pg_proc p on p.oid=r.oid
order by signature;

-- If another R1 fingerprint has no local match, replace the exact signature
-- below with the returned regprocedure identifier, have the operator screen it,
-- and use only this single-row SELECT. Do not broaden the requested scope.
-- select p.oid::regprocedure::text,md5(p.prosrc),p.prosrc
-- from pg_proc p where p.oid=to_regprocedure('public.EXACT_APPROVED_SIGNATURE');
