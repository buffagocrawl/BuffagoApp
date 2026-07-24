\set ON_ERROR_STOP on

do $$
declare
  v_user uuid := '10000000-0000-0000-0000-000000000001';
  v_event uuid := '20000000-0000-0000-0000-000000000001';
  v_outbox uuid;
  v_duplicate uuid;
  v_result jsonb;
  v_cancelled integer;
begin
  if (
    select count(*)
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'notification_preferences'
       and column_name in (
         'legendary_start', 'legendary_expiry',
         'legendary_completion', 'legendary_reward_ready'
       )
       and is_nullable = 'NO'
       and column_default = 'false'
  ) <> 4 then
    raise exception 'legendary preference columns are not fail-closed';
  end if;

  if has_function_privilege(
    'anon',
    'public.buffaverse_queue_legendary_notification(uuid,uuid,text)',
    'execute'
  ) or has_function_privilege(
    'authenticated',
    'public.buffaverse_queue_legendary_notification(uuid,uuid,text)',
    'execute'
  ) then
    raise exception 'client role can execute Legendary enqueue';
  end if;

  insert into auth.users(id) values (v_user);
  insert into public.notification_preferences(user_id, quiet_hours_enabled)
  values (v_user, false);
  insert into public.buffaverse_event_instances(
    id, event_type_id, lifecycle_status, starts_at, ends_at, display_metadata
  ) values (
    v_event,
    'legendary_restaurant',
    'active',
    now() - interval '1 hour',
    now() + interval '2 hours',
    '{"restaurant_id":"30000000-0000-0000-0000-000000000001","restaurant_name":"Fixture Wings"}'
  );

  v_outbox := public.buffaverse_queue_legendary_notification(v_user, v_event, 'start');
  if v_outbox is not null or exists(select 1 from public.notification_outbox) then
    raise exception 'disabled flags allowed an outbox row';
  end if;

  update public.buffaverse_feature_flags set enabled = true;
  update public.notification_preferences set legendary_start = true where user_id = v_user;

  v_outbox := public.buffaverse_queue_legendary_notification(v_user, v_event, 'start');
  v_duplicate := public.buffaverse_queue_legendary_notification(v_user, v_event, 'start');
  if v_outbox is null or v_duplicate <> v_outbox then
    raise exception 'Legendary enqueue is not idempotent';
  end if;
  if (select count(*) from public.notification_outbox) <> 1 then
    raise exception 'Legendary enqueue created duplicate rows';
  end if;

  v_result := public.buffaverse_legendary_notification_eligibility(v_outbox);
  if not coalesce((v_result ->> 'eligible')::boolean, false) then
    raise exception 'valid Legendary outbox failed eligibility';
  end if;

  update public.buffaverse_feature_flags
     set enabled = false
   where flag_key = 'buffaverse.legendary_restaurants.notifications';
  v_result := public.buffaverse_legendary_notification_eligibility(v_outbox);
  if v_result ->> 'reason' <> 'feature_disabled' then
    raise exception 'kill switch did not suppress delivery';
  end if;

  v_cancelled := public.buffaverse_cancel_legendary_notifications(
    v_event,
    'feature_disabled'
  );
  if v_cancelled <> 1 or (
    select status <> 'cancelled'
      from public.notification_outbox
     where id = v_outbox
  ) then
    raise exception 'Legendary cancellation boundary failed';
  end if;
end
$$;

select 'BUFFAVERSE_PHASE2_NOTIFICATION_VALIDATION_PASSED' as result;

