\set ON_ERROR_STOP on
\echo SCHEMA_VALIDATION
do $$
declare
  required text[] := array[
    'engagement_mission_definitions','engagement_action_receipts','user_engagement_streaks',
    'daily_engagement_checks','notification_outbox','notification_delivery_attempts',
    'push_installations','notification_preferences','engagement_feature_flags'
  ];
  item text;
begin
  foreach item in array required loop
    if to_regclass('public.' || item) is null then raise exception 'missing table %', item; end if;
  end loop;
  if not exists (select 1 from pg_proc where oid = 'public.check_daily_engagement(text)'::regprocedure) then raise exception 'missing daily RPC'; end if;
  if not exists (select 1 from pg_trigger where tgname = 'destination_rating_friend_notification') then raise exception 'missing rating trigger'; end if;
  raise notice 'schema_validation=PASS tables=% functions=% trigger=PASS', array_length(required,1),
    (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname in ('check_daily_engagement','record_engagement_action','register_push_installation','update_notification_preferences'));
end $$;

\echo RLS_VALIDATION
do $$
begin
  if not exists (select 1 from pg_policies where tablename='notification_outbox' and policyname='notification_outbox_own_read') then raise exception 'missing outbox RLS'; end if;
  if has_table_privilege('anon','public.notification_outbox','INSERT') then raise exception 'anon can insert outbox'; end if;
  if has_table_privilege('authenticated','public.notification_outbox','INSERT') then raise exception 'authenticated can insert outbox'; end if;
  if not (select relrowsecurity from pg_class where oid='public.notification_outbox'::regclass) then raise exception 'outbox RLS disabled'; end if;
  raise notice 'rls_tests=PASS direct_client_insert=DENIED outbox_rls=ON';
end $$;

\echo RPC_PERMISSION_VALIDATION
do $$
begin
  if has_function_privilege('anon','public.check_daily_engagement(text)','EXECUTE') then raise exception 'anon can execute daily RPC'; end if;
  if not has_function_privilege('authenticated','public.check_daily_engagement(text)','EXECUTE') then raise exception 'authenticated cannot execute daily RPC'; end if;
  raise notice 'rpc_permission_tests=PASS anon=DENIED authenticated=ALLOWED';
end $$;

\echo OUTBOX_DEDUP_VALIDATION
do $$
declare u uuid := '00000000-0000-0000-0000-000000000091'; c integer;
begin
  insert into auth.users(id,email,aud,role,encrypted_password,email_confirmed_at)
    values (u,'release-validation@example.invalid','authenticated','authenticated','x',now())
    on conflict (id) do nothing;
  insert into public.notification_outbox(user_id,event_type,source_entity_type,source_entity_id,deduplication_key,deep_link)
    values (u,'streak_at_risk','validation','release','release-dedupe','/engagement') on conflict do nothing;
  insert into public.notification_outbox(user_id,event_type,source_entity_type,source_entity_id,deduplication_key,deep_link)
    values (u,'streak_at_risk','validation','release','release-dedupe','/engagement') on conflict do nothing;
  select count(*) into c from public.notification_outbox where user_id=u and deduplication_key='release-dedupe';
  if c <> 1 then raise exception 'outbox dedupe count=%', c; end if;
  raise notice 'notification_outbox_deduplication=PASS rows=%', c;
end $$;
