\set ON_ERROR_STOP on
\echo 'Referral-system-v1 staging schema verification (read-only)'
\echo 'Run after applying the proposed migration to STAGING only.'

begin read only;

-- 1. Repository contract: core relations and columns.
select 'core_relations' as check_name,
  count(to_regclass(required.name))=12 as passed,
  array_agg(required.name order by required.name)
    filter(where to_regclass(required.name) is null) as missing
from (values
  ('public.users'),('public.crawls'),('public.routes'),
  ('public.route_ordered_destinations'),('public.destinations'),
  ('public.destination_ratings'),('public.xp_ledger'),('public.badge_catalog'),
  ('public.user_badges'),('public.user_events'),('public.notification_outbox'),
  ('public.notification_preferences')
) required(name);

select 'pgcrypto_extension_schema' as check_name,
  e.extname='pgcrypto' and n.nspname='extensions' as passed,
  n.nspname as installed_schema
from pg_extension e join pg_namespace n on n.oid=e.extnamespace
where e.extname='pgcrypto';

select 'required_columns' as check_name,
  count(*) filter(where c.column_name is not null)=count(*) as passed,
  array_agg(format('%s.%s',r.table_name,r.column_name))
    filter(where c.column_name is null) as missing
from (values
  ('xp_ledger','referral_id'),('xp_ledger','idempotency_key'),
  ('destination_ratings','id'),('destination_ratings','user_id'),
  ('destination_ratings','destination_id'),('destination_ratings','crawl_id'),
  ('destination_ratings','is_buffacoin'),('destinations','lat'),('destinations','lng'),
  ('crawls','route_id'),('crawls','user_id'),('badge_catalog','code'),
  ('user_badges','user_id'),('notification_outbox','event_type')
) r(table_name,column_name)
left join information_schema.columns c on c.table_schema='public'
 and c.table_name=r.table_name and c.column_name=r.column_name;

-- 2. Referral relations, RLS, policies, and grants.
select c.relname as referral_relation,c.relrowsecurity as rls_enabled
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in(
  'referral_reward_config','referral_codes','referral_attributions',
  'referral_rewards','referral_abuse_signals','referral_in_app_notifications'
) order by c.relname;

select schemaname,tablename,policyname,roles,cmd,qual,with_check
from pg_policies where schemaname='public' and tablename like 'referral_%'
order by tablename,policyname;

select grantee,table_name,privilege_type
from information_schema.role_table_grants
where table_schema='public' and table_name like 'referral_%'
order by table_name,grantee,privilege_type;

-- 3. Functions and execution privileges.
select p.proname,pg_get_function_identity_arguments(p.oid) as arguments,
  p.prosecdef as security_definer,
  has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
  has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,
  has_function_privilege('service_role',p.oid,'EXECUTE') as service_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and (
  p.proname like '%referral%' or p.proname='submit_validated_crawl_rating'
) order by p.proname;

-- 4. Constraints and indexes: invitee/rating/reward/ledger idempotency.
select c.conname,c.contype,pg_get_constraintdef(c.oid)
from pg_constraint c join pg_class t on t.oid=c.conrelid
join pg_namespace n on n.oid=t.relnamespace
where n.nspname='public' and (
  t.relname like 'referral_%' or
  (t.relname='xp_ledger' and c.conname='xp_ledger_referral_id_fkey')
) order by t.relname,c.conname;

select tablename,indexname,indexdef from pg_indexes
where schemaname='public' and (
  tablename like 'referral_%' or
  (tablename='xp_ledger' and indexname like '%idempotency%')
) order by tablename,indexname;

select 'xp_referral_fk_validated' as check_name,c.convalidated as passed
from pg_constraint c
where c.conname='xp_ledger_referral_id_fkey';

-- 5. Rating validation and settlement must live in one function body.
select 'rating_and_settlement_single_rpc' as check_name,
  pg_get_functiondef(p.oid) like '%insert into public.destination_ratings%' and
  pg_get_functiondef(p.oid) like '%settle_referral_for_rating_internal(v_user,v_rating_id)%' and
  pg_get_functiondef(p.oid) like '%v_distance_m>804.67%' as passed
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='submit_validated_crawl_rating';

-- 6. Referral badge catalog and progress source.
select code,name,xp_reward,category,tier,is_active
from public.badge_catalog where code in('referral_1','referral_5','referral_10')
order by tier;

select 'badge_source_verified_attributions' as check_name,
  pg_get_functiondef(p.oid) like
    '%status in(''qualified'',''rewarded'')%' as passed
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='sync_verified_referral_badges_internal';

-- 7. Notifications, supported types, and dispatcher-compatible rows.
select conname,pg_get_constraintdef(oid)
from pg_constraint where conrelid='public.notification_outbox'::regclass
  and contype='c' and pg_get_constraintdef(oid) like '%event_type%';

select event_type,count(*) from public.notification_outbox
where event_type like 'referral_%' group by event_type order by event_type;

-- 8. Triggers.
select event_object_schema,event_object_table,trigger_name,event_manipulation,
  action_timing,action_statement
from information_schema.triggers
where trigger_name='auth_user_referral_code'
   or event_object_table in('referral_codes','referral_attributions','destination_ratings')
order by event_object_table,trigger_name;

-- 9. Dry-run reconciliation must not mutate.
select public.reconcile_referrals(true) as reconciliation_dry_run;

-- 10. Current consistency and duplicate scan.
select idempotency_key,count(*) from public.xp_ledger
where source in('referral_qualification','referral_reversal')
group by idempotency_key having count(*)>1;
select referral_attribution_id,recipient_role,reward_type,count(*)
from public.referral_rewards group by 1,2,3 having count(*)>1;
select invitee_user_id,count(*) from public.referral_attributions
where invitee_user_id is not null group by invitee_user_id having count(*)>1;
select qualifying_rating_id,count(*) from public.referral_attributions
where qualifying_rating_id is not null group by qualifying_rating_id having count(*)>1;

rollback;
