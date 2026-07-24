-- Buffaverse Phase 2 corrective migration: preserve the Phase 1 geography
-- invariant for locally scoped Legendary events.

begin;

create or replace function public.buffaverse_create_legendary_event(
  p_restaurant_id uuid,
  p_reason_code text,
  p_reason_label text,
  p_selection_scope text,
  p_selection_window_key text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_title text,
  p_summary text,
  p_state_id integer default null
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_event_id uuid;
  v_name text;
  v_existing uuid;
  v_geography_key text;
begin
  if p_starts_at is null or p_ends_at <= p_starts_at then
    raise exception 'invalid_event_window';
  end if;
  if p_ends_at - p_starts_at > interval '7 days' then
    raise exception 'legendary_window_too_long';
  end if;
  if p_selection_window_key is null or btrim(p_selection_window_key) = '' then
    raise exception 'selection_window_key_required';
  end if;
  if p_reason_code not in (
    'underexplored_local_gem',
    'first_review_bounty',
    'community_favorite_milestone',
    'sauce_style_spotlight',
    'new_restaurant_discovery',
    'town_exploration',
    'limited_local_rotation',
    'statewide_discovery',
    'manual_curation'
  ) then
    raise exception 'invalid_reason_code';
  end if;
  if p_selection_scope not in ('local', 'state', 'global') then
    raise exception 'invalid_selection_scope';
  end if;
  if p_selection_scope = 'state' and p_state_id is null then
    raise exception 'state_required';
  end if;

  v_geography_key := case
    when p_selection_scope = 'local' then btrim(p_selection_window_key)
    else null
  end;

  perform pg_advisory_xact_lock(
    hashtextextended('legendary-restaurant:' || p_restaurant_id::text, 0)
  );

  select name
    into v_name
    from public.destinations
   where id = p_restaurant_id
     and lat is not null
     and lng is not null;
  if v_name is null then
    raise exception 'restaurant_not_eligible';
  end if;

  select legendary.event_instance_id
    into v_existing
    from public.buffaverse_legendary_restaurant_events legendary
    join public.buffaverse_event_instances event
      on event.id = legendary.event_instance_id
   where legendary.restaurant_id = p_restaurant_id
     and event.lifecycle_status in ('scheduled', 'active', 'paused')
     and event.ends_at > now()
   limit 1;
  if v_existing is not null then
    raise exception 'legendary_event_conflict';
  end if;

  if exists (
    select 1
      from public.buffaverse_legendary_restaurant_events legendary
     where legendary.restaurant_id = p_restaurant_id
       and legendary.cooldown_until > p_starts_at
  ) then
    raise exception 'legendary_restaurant_cooldown';
  end if;

  insert into public.buffaverse_event_instances(
    event_type_id,
    event_type_version,
    lifecycle_status,
    geographic_scope,
    state_id,
    geography_key,
    starts_at,
    ends_at,
    eligibility,
    participation_rules,
    progress_model,
    progress_target,
    reward_reference_kind,
    reward_reference_key,
    title,
    summary,
    display_metadata,
    feature_flag_key,
    visibility,
    source
  ) values (
    'legendary_restaurant',
    1,
    'scheduled',
    p_selection_scope,
    p_state_id,
    v_geography_key,
    p_starts_at,
    p_ends_at,
    jsonb_build_object(
      'restaurant_id', p_restaurant_id,
      'reason_code', p_reason_code
    ),
    jsonb_build_object(
      'qualifying_action', 'rating_completed',
      'max_completions_per_user', 1
    ),
    'counter',
    1,
    'external',
    'legendary_restaurant_pending',
    p_title,
    p_summary,
    jsonb_build_object(
      'restaurant_id', p_restaurant_id,
      'restaurant_name', v_name,
      'reason_code', p_reason_code,
      'reason_label', p_reason_label,
      'qualifying_action',
        'Complete an eligible rating during the event window',
      'sponsorship_disclaimer',
        'Buffago-curated event. Not sponsored unless explicitly stated by Buffago.',
      'marker_key', 'legendary-star-flame'
    ),
    'buffaverse.legendary_restaurants',
    'private',
    'system'
  )
  returning id into v_event_id;

  insert into public.buffaverse_legendary_restaurant_events(
    event_instance_id,
    restaurant_id,
    reason_code,
    reason_label,
    selection_scope,
    selection_window_key,
    cooldown_until
  ) values (
    v_event_id,
    p_restaurant_id,
    p_reason_code,
    p_reason_label,
    p_selection_scope,
    p_selection_window_key,
    p_starts_at + interval '28 days'
  );

  return v_event_id;
end;
$$;

revoke all on function public.buffaverse_create_legendary_event(
  uuid, text, text, text, text, timestamptz, timestamptz, text, text, integer
) from public, anon, authenticated;
grant execute on function public.buffaverse_create_legendary_event(
  uuid, text, text, text, text, timestamptz, timestamptz, text, text, integer
) to service_role;

comment on function public.buffaverse_create_legendary_event(
  uuid, text, text, text, text, timestamptz, timestamptz, text, text, integer
) is 'Service-only Legendary creator. Local events use the deterministic selection window key as the required Phase 1 geography key.';

commit;

-- Forward-disable: keep buffaverse.enabled and all Legendary child flags false.
