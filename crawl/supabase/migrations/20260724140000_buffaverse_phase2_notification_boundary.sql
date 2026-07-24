-- Buffaverse Phase 2 corrective migration: Legendary notification boundary.
-- Additive only. Does not enqueue notifications or enable any feature flag.

begin;

alter table public.notification_preferences
  add column legendary_start boolean not null default false,
  add column legendary_expiry boolean not null default false,
  add column legendary_completion boolean not null default false,
  add column legendary_reward_ready boolean not null default false;

create or replace function public.buffaverse_queue_legendary_notification(
  p_user_id uuid,
  p_event_instance_id uuid,
  p_kind text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.buffaverse_event_instances%rowtype;
  v_pref public.notification_preferences%rowtype;
  v_outbox_id uuid;
  v_event_type text;
  v_enabled boolean := false;
  v_dedupe text;
  v_deep_link text;
  v_expires_at timestamptz;
begin
  if p_user_id is null or p_event_instance_id is null then
    raise exception 'legendary_notification_target_required';
  end if;
  if p_kind not in ('start', 'expiry', 'completion', 'reward_ready') then
    raise exception 'legendary_notification_kind_invalid';
  end if;

  select *
    into v_event
    from public.buffaverse_event_instances
   where id = p_event_instance_id
     and event_type_id = 'legendary_restaurant';
  if not found then
    raise exception 'legendary_event_not_found';
  end if;

  select *
    into v_pref
    from public.notification_preferences
   where user_id = p_user_id;
  if not found then
    return null;
  end if;

  select coalesce(root.enabled, false)
         and coalesce(parent.enabled, false)
         and coalesce(child.enabled, false)
    into v_enabled
    from public.buffaverse_feature_flags root
    join public.buffaverse_feature_flags parent
      on parent.flag_key = 'buffaverse.legendary_restaurants'
    join public.buffaverse_feature_flags child
      on child.flag_key = 'buffaverse.legendary_restaurants.notifications'
   where root.flag_key = 'buffaverse.enabled';
  if not coalesce(v_enabled, false) then
    return null;
  end if;

  v_event_type := 'legendary_' || p_kind;
  v_enabled := case p_kind
    when 'start' then v_pref.legendary_start
    when 'expiry' then v_pref.legendary_expiry
    when 'completion' then v_pref.legendary_completion
    when 'reward_ready' then v_pref.legendary_reward_ready
    else false
  end;
  if not v_enabled then
    return null;
  end if;

  if p_kind in ('start', 'expiry') then
    if v_event.lifecycle_status not in ('scheduled', 'active')
       or now() >= v_event.ends_at then
      return null;
    end if;
  elsif p_kind = 'completion' then
    if not exists (
      select 1
        from public.buffaverse_legendary_participations participation
       where participation.event_instance_id = p_event_instance_id
         and participation.user_id = p_user_id
         and participation.status = 'completed'
    ) then
      return null;
    end if;
  elsif p_kind = 'reward_ready' then
    if not exists (
      select 1
        from public.buffaverse_legendary_reward_references reward
       where reward.event_instance_id = p_event_instance_id
         and reward.user_id = p_user_id
         and reward.settlement_status = 'ready'
    ) then
      return null;
    end if;
  end if;

  -- A hard per-user cap protects against scheduler errors across all
  -- Legendary notification kinds.
  if (
    select count(*)
      from public.notification_outbox outbox
     where outbox.user_id = p_user_id
       and outbox.event_type in (
         'legendary_start', 'legendary_expiry',
         'legendary_completion', 'legendary_reward_ready'
       )
       and outbox.created_at >= now() - interval '24 hours'
       and outbox.status not in ('cancelled', 'suppressed')
  ) >= 3 then
    return null;
  end if;

  v_dedupe := 'legendary:' || p_event_instance_id::text || ':' || p_kind;
  v_deep_link := 'buffago://legendary/' || p_event_instance_id::text;
  v_expires_at := case
    when p_kind in ('start', 'expiry') then v_event.ends_at
    else now() + interval '7 days'
  end;

  insert into public.notification_outbox(
    user_id,
    event_type,
    source_entity_type,
    source_entity_id,
    deduplication_key,
    eligible_at,
    expires_at,
    deep_link,
    fallback_route,
    copy_data
  ) values (
    p_user_id,
    v_event_type,
    'buffaverse_event_instance',
    p_event_instance_id::text,
    v_dedupe,
    now(),
    v_expires_at,
    v_deep_link,
    '/(tabs)/home',
    jsonb_build_object(
      'event_instance_id', p_event_instance_id,
      'restaurant_id', v_event.display_metadata ->> 'restaurant_id',
      'restaurant_name', v_event.display_metadata ->> 'restaurant_name',
      'kind', p_kind
    )
  )
  on conflict (user_id, event_type, deduplication_key) do nothing
  returning id into v_outbox_id;

  if v_outbox_id is null then
    select id
      into v_outbox_id
      from public.notification_outbox
     where user_id = p_user_id
       and event_type = v_event_type
       and deduplication_key = v_dedupe;
  end if;

  return v_outbox_id;
end;
$$;

create or replace function public.buffaverse_cancel_legendary_notifications(
  p_event_instance_id uuid,
  p_reason text default 'event_unavailable'
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  if p_event_instance_id is null then
    raise exception 'legendary_event_id_required';
  end if;
  if p_reason not in (
    'event_cancelled', 'event_paused', 'event_expired',
    'feature_disabled', 'event_unavailable'
  ) then
    raise exception 'legendary_notification_cancel_reason_invalid';
  end if;

  update public.notification_outbox
     set status = 'cancelled',
         suppression_reason = p_reason,
         updated_at = now()
   where source_entity_type = 'buffaverse_event_instance'
     and source_entity_id = p_event_instance_id::text
     and event_type in (
       'legendary_start', 'legendary_expiry',
       'legendary_completion', 'legendary_reward_ready'
     )
     and status in ('queued', 'retry', 'processing');
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.buffaverse_legendary_notification_eligibility(
  p_outbox_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_outbox public.notification_outbox%rowtype;
  v_event public.buffaverse_event_instances%rowtype;
  v_pref public.notification_preferences%rowtype;
  v_kind text;
  v_enabled boolean := false;
  v_local_time time;
begin
  select *
    into v_outbox
    from public.notification_outbox
   where id = p_outbox_id
     and event_type in (
       'legendary_start', 'legendary_expiry',
       'legendary_completion', 'legendary_reward_ready'
     );
  if not found or v_outbox.status not in ('queued', 'retry', 'processing') then
    return jsonb_build_object('eligible', false, 'reason', 'outbox_unavailable');
  end if;
  if v_outbox.expires_at is not null and now() >= v_outbox.expires_at then
    return jsonb_build_object('eligible', false, 'reason', 'expired');
  end if;

  select *
    into v_event
    from public.buffaverse_event_instances
   where id::text = v_outbox.source_entity_id
     and event_type_id = 'legendary_restaurant';
  if not found or v_event.lifecycle_status in ('paused', 'cancelled', 'expired', 'failed') then
    return jsonb_build_object('eligible', false, 'reason', 'event_unavailable');
  end if;

  select *
    into v_pref
    from public.notification_preferences
   where user_id = v_outbox.user_id;
  if not found then
    return jsonb_build_object('eligible', false, 'reason', 'preference_missing');
  end if;

  select coalesce(root.enabled, false)
         and coalesce(parent.enabled, false)
         and coalesce(child.enabled, false)
    into v_enabled
    from public.buffaverse_feature_flags root
    join public.buffaverse_feature_flags parent
      on parent.flag_key = 'buffaverse.legendary_restaurants'
    join public.buffaverse_feature_flags child
      on child.flag_key = 'buffaverse.legendary_restaurants.notifications'
   where root.flag_key = 'buffaverse.enabled';
  if not coalesce(v_enabled, false) then
    return jsonb_build_object('eligible', false, 'reason', 'feature_disabled');
  end if;

  v_kind := replace(v_outbox.event_type, 'legendary_', '');
  v_enabled := case v_kind
    when 'start' then v_pref.legendary_start
    when 'expiry' then v_pref.legendary_expiry
    when 'completion' then v_pref.legendary_completion
    when 'reward_ready' then v_pref.legendary_reward_ready
    else false
  end;
  if not v_enabled then
    return jsonb_build_object('eligible', false, 'reason', 'category_disabled');
  end if;

  v_local_time := (
    now() at time zone public.engagement_safe_timezone(v_pref.timezone)
  )::time;
  if v_pref.quiet_hours_enabled and (
    (
      v_pref.quiet_start < v_pref.quiet_end
      and v_local_time >= v_pref.quiet_start
      and v_local_time < v_pref.quiet_end
    )
    or (
      v_pref.quiet_start >= v_pref.quiet_end
      and (v_local_time >= v_pref.quiet_start or v_local_time < v_pref.quiet_end)
    )
  ) then
    return jsonb_build_object('eligible', false, 'reason', 'quiet_hours');
  end if;

  return jsonb_build_object('eligible', true, 'reason', 'eligible');
end;
$$;

revoke all on function public.buffaverse_queue_legendary_notification(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.buffaverse_cancel_legendary_notifications(uuid, text)
  from public, anon, authenticated;
revoke all on function public.buffaverse_legendary_notification_eligibility(uuid)
  from public, anon, authenticated;

grant execute on function public.buffaverse_queue_legendary_notification(uuid, uuid, text)
  to service_role;
grant execute on function public.buffaverse_cancel_legendary_notifications(uuid, text)
  to service_role;
grant execute on function public.buffaverse_legendary_notification_eligibility(uuid)
  to service_role;

comment on function public.buffaverse_queue_legendary_notification(uuid, uuid, text)
  is 'Service-role-only, preference-gated, capped, deduplicated Legendary outbox enqueue. Never calls a push provider.';
comment on function public.buffaverse_legendary_notification_eligibility(uuid)
  is 'Final internal delivery boundary for Legendary outbox rows. Provider delivery remains external.';

commit;

-- Forward-disable: leave all Buffaverse flags false and cancel queued rows with
-- buffaverse_cancel_legendary_notifications(event_id, 'feature_disabled').
