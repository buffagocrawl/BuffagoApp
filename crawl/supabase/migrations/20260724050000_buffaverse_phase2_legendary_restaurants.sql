-- Buffaverse Phase 2: Legendary Restaurants
-- Additive, review-only migration. Production flags intentionally default false.
-- No reward issuance occurs here; reward rows are opaque pending references.

begin;

insert into public.buffaverse_feature_flags(flag_key, description, enabled, environment, parent_flag_key)
values
  ('buffaverse.legendary_restaurants', 'Legendary Restaurants event type kill switch', false, 'production', 'buffaverse.enabled'),
  ('buffaverse.legendary_restaurants.home_hero', 'Legendary Restaurants home hero', false, 'production', 'buffaverse.legendary_restaurants'),
  ('buffaverse.legendary_restaurants.map_marker', 'Legendary Restaurants map marker', false, 'production', 'buffaverse.legendary_restaurants'),
  ('buffaverse.legendary_restaurants.detail', 'Legendary Restaurants detail experience', false, 'production', 'buffaverse.legendary_restaurants'),
  ('buffaverse.legendary_restaurants.participation', 'Legendary Restaurants participation', false, 'production', 'buffaverse.legendary_restaurants'),
  ('buffaverse.legendary_restaurants.sharing', 'Legendary Restaurants sharing', false, 'production', 'buffaverse.legendary_restaurants'),
  ('buffaverse.legendary_restaurants.notifications', 'Legendary Restaurants notifications', false, 'production', 'buffaverse.legendary_restaurants')
on conflict (flag_key) do update set enabled = false;

insert into public.buffaverse_event_types(
  event_type_id, version, display_name, description, supported_lifecycle_states,
  supported_geographies, supported_progress_models, supported_reward_models,
  display_capabilities, analytics_mapping, feature_flag_key, enabled, environment
) values (
  'legendary_restaurant', 1, 'Legendary Restaurant',
  'A short, explainable Buffago-curated restaurant discovery event.',
  array['draft','scheduled','active','paused','completed','expired','cancelled','settlement_pending','settled','settlement_failed'],
  array['local','state','global'], array['counter'], array['external'],
  '{"marker":true,"countdown":true,"share":true,"sponsorship_disclaimer":true}'::jsonb,
  '{"created":"legendary_event_created","completed":"legendary_completion_recorded"}'::jsonb,
  'buffaverse.legendary_restaurants', false, 'production'
) on conflict (event_type_id, version) do update set enabled = false, feature_flag_key = excluded.feature_flag_key;

create table if not exists public.buffaverse_legendary_restaurant_events (
  event_instance_id uuid primary key references public.buffaverse_event_instances(id) on delete restrict,
  restaurant_id uuid not null references public.destinations(id) on delete restrict,
  reason_code text not null check (reason_code in ('underexplored_local_gem','first_review_bounty','community_favorite_milestone','sauce_style_spotlight','new_restaurant_discovery','town_exploration','limited_local_rotation','statewide_discovery','manual_curation')),
  reason_label text not null check (char_length(reason_label) between 3 and 120),
  selection_scope text not null check (selection_scope in ('local','state','global')),
  selection_window_key text not null check (char_length(selection_window_key) between 8 and 120),
  cooldown_until timestamptz not null,
  sponsorship_disclaimer text not null default 'Buffago-curated event. This restaurant is not a sponsor unless explicitly stated by Buffago.',
  created_at timestamptz not null default now()
);

create index if not exists buffaverse_legendary_restaurant_events_restaurant_idx
  on public.buffaverse_legendary_restaurant_events(restaurant_id, cooldown_until desc);
create index if not exists buffaverse_legendary_active_restaurant_idx
  on public.buffaverse_legendary_restaurant_events(restaurant_id, event_instance_id);

create table if not exists public.buffaverse_legendary_selection_audit (
  id uuid primary key default gen_random_uuid(),
  selection_window_key text not null,
  restaurant_id uuid references public.destinations(id) on delete restrict,
  reason_code text,
  eligible boolean not null,
  rejection_code text,
  input_fingerprint text not null check (char_length(input_fingerprint) = 32),
  evaluated_at timestamptz not null default now()
);
create index if not exists buffaverse_legendary_selection_audit_window_idx
  on public.buffaverse_legendary_selection_audit(selection_window_key, evaluated_at desc);

create table if not exists public.buffaverse_legendary_participations (
  id uuid primary key default gen_random_uuid(),
  event_instance_id uuid not null references public.buffaverse_event_instances(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('started','completed','rejected')) default 'started',
  qualifying_action text,
  qualifying_action_ref uuid,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  last_request_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(event_instance_id, user_id),
  unique(event_instance_id, user_id, qualifying_action_ref)
);
create index if not exists buffaverse_legendary_participations_user_idx
  on public.buffaverse_legendary_participations(user_id, updated_at desc);

create table if not exists public.buffaverse_legendary_reward_references (
  id uuid primary key default gen_random_uuid(),
  event_instance_id uuid not null references public.buffaverse_event_instances(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete cascade,
  participation_id uuid not null references public.buffaverse_legendary_participations(id) on delete restrict,
  reward_kind text not null default 'external' check (reward_kind in ('external','xp','buffacoin','badge')),
  reward_key text not null,
  settlement_status text not null default 'pending' check (settlement_status in ('pending','ready','settled','failed')),
  created_at timestamptz not null default now(),
  unique(event_instance_id, user_id),
  unique(reward_key)
);
create index if not exists buffaverse_legendary_reward_references_user_idx
  on public.buffaverse_legendary_reward_references(user_id, created_at desc);

comment on table public.buffaverse_legendary_reward_references is 'Opaque pending references only. This phase never mints or settles rewards.';

alter table public.buffaverse_legendary_restaurant_events enable row level security;
alter table public.buffaverse_legendary_selection_audit enable row level security;
alter table public.buffaverse_legendary_participations enable row level security;
alter table public.buffaverse_legendary_reward_references enable row level security;

revoke all on public.buffaverse_legendary_restaurant_events from anon, authenticated;
revoke all on public.buffaverse_legendary_selection_audit from anon, authenticated;
revoke all on public.buffaverse_legendary_participations from anon, authenticated;
revoke all on public.buffaverse_legendary_reward_references from anon, authenticated;
grant select on public.buffaverse_legendary_participations, public.buffaverse_legendary_reward_references to authenticated;
grant all on public.buffaverse_legendary_restaurant_events, public.buffaverse_legendary_selection_audit, public.buffaverse_legendary_participations, public.buffaverse_legendary_reward_references to service_role;

drop policy if exists buffaverse_legendary_participations_own_read on public.buffaverse_legendary_participations;
create policy buffaverse_legendary_participations_own_read on public.buffaverse_legendary_participations for select to authenticated using (user_id = auth.uid());
drop policy if exists buffaverse_legendary_rewards_own_read on public.buffaverse_legendary_reward_references;
create policy buffaverse_legendary_rewards_own_read on public.buffaverse_legendary_reward_references for select to authenticated using (user_id = auth.uid());

create or replace function public.buffaverse_record_legendary_action(
  p_event_instance_id uuid, p_action text, p_action_ref uuid default null, p_idempotency_key text default null
) returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_user uuid := auth.uid(); v_event public.buffaverse_event_instances%rowtype; v_legendary public.buffaverse_legendary_restaurant_events%rowtype; v_part public.buffaverse_legendary_participations%rowtype; v_reward uuid;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if p_action not in ('open','save','navigate','rating_completed') then raise exception 'invalid_legendary_action'; end if;
  if p_idempotency_key is null or char_length(p_idempotency_key) not between 8 and 200 then raise exception 'invalid_idempotency_key'; end if;
  select * into v_event from public.buffaverse_event_instances where id = p_event_instance_id for share;
  if not found then raise exception 'event_not_found'; end if;
  select * into v_legendary from public.buffaverse_legendary_restaurant_events where event_instance_id = p_event_instance_id;
  if not found then raise exception 'legendary_event_not_found'; end if;
  if v_event.lifecycle_status <> 'active' or now() < v_event.starts_at or now() >= v_event.ends_at then raise exception 'legendary_event_not_active'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_event_instance_id::text || ':' || v_user::text, 0));
  select * into v_part from public.buffaverse_legendary_participations where event_instance_id = p_event_instance_id and user_id = v_user for update;
  if p_action = 'rating_completed' then
    if p_action_ref is null or not exists (select 1 from public.destination_ratings r where r.id = p_action_ref and r.user_id = v_user and r.destination_id = v_legendary.restaurant_id and r.created_at between v_event.starts_at and v_event.ends_at) then
      raise exception 'qualifying_rating_not_verified';
    end if;
    if v_part.status = 'completed' then
      select id into v_reward from public.buffaverse_legendary_reward_references where event_instance_id = p_event_instance_id and user_id = v_user;
      return jsonb_build_object('status','completed','duplicate',true,'reward_reference_id',v_reward);
    end if;
    if v_part.id is null then
      insert into public.buffaverse_legendary_participations(event_instance_id,user_id,status,qualifying_action,qualifying_action_ref,completed_at,last_request_key) values (p_event_instance_id,v_user,'completed','rating_completed',p_action_ref,now(),p_idempotency_key) returning * into v_part;
    else
      update public.buffaverse_legendary_participations set status='completed', qualifying_action='rating_completed', qualifying_action_ref=p_action_ref, completed_at=now(), updated_at=now(), last_request_key=p_idempotency_key where id=v_part.id returning * into v_part;
    end if;
    insert into public.buffaverse_legendary_reward_references(event_instance_id,user_id,participation_id,reward_key) values (p_event_instance_id,v_user,v_part.id,'legendary_restaurant:' || p_event_instance_id::text || ':' || v_user::text) on conflict (event_instance_id,user_id) do nothing returning id into v_reward;
    if v_reward is null then select id into v_reward from public.buffaverse_legendary_reward_references where event_instance_id=p_event_instance_id and user_id=v_user; end if;
    return jsonb_build_object('status','completed','duplicate',false,'reward_reference_id',v_reward);
  end if;
  if v_part.id is null then insert into public.buffaverse_legendary_participations(event_instance_id,user_id,status,qualifying_action,last_request_key) values (p_event_instance_id,v_user,'started',p_action,p_idempotency_key) returning * into v_part; else update public.buffaverse_legendary_participations set updated_at=now(), last_request_key=p_idempotency_key where id=v_part.id; end if;
  return jsonb_build_object('status','started','duplicate',false);
end; $$;

revoke all on function public.buffaverse_record_legendary_action(uuid,text,uuid,text) from public, anon;
grant execute on function public.buffaverse_record_legendary_action(uuid,text,uuid,text) to authenticated;

create or replace function public.buffaverse_create_legendary_event(
  p_restaurant_id uuid, p_reason_code text, p_reason_label text, p_selection_scope text,
  p_selection_window_key text, p_starts_at timestamptz, p_ends_at timestamptz,
  p_title text, p_summary text, p_state_id integer default null
) returns uuid language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_event_id uuid; v_name text; v_existing uuid;
begin
  if p_starts_at is null or p_ends_at <= p_starts_at then raise exception 'invalid_event_window'; end if;
  if p_ends_at - p_starts_at > interval '7 days' then raise exception 'legendary_window_too_long'; end if;
  if p_reason_code not in ('underexplored_local_gem','first_review_bounty','community_favorite_milestone','sauce_style_spotlight','new_restaurant_discovery','town_exploration','limited_local_rotation','statewide_discovery','manual_curation') then raise exception 'invalid_reason_code'; end if;
  if p_selection_scope not in ('local','state','global') then raise exception 'invalid_selection_scope'; end if;
  if p_selection_scope = 'state' and p_state_id is null then raise exception 'state_required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('legendary-restaurant:' || p_restaurant_id::text, 0));
  select name into v_name from public.destinations where id = p_restaurant_id and lat is not null and lng is not null;
  if v_name is null then raise exception 'restaurant_not_eligible'; end if;
  select e.event_instance_id into v_existing
    from public.buffaverse_legendary_restaurant_events e join public.buffaverse_event_instances i on i.id=e.event_instance_id
   where e.restaurant_id=p_restaurant_id and i.lifecycle_status in ('scheduled','active','paused') and i.ends_at > now() limit 1;
  if v_existing is not null then raise exception 'legendary_event_conflict'; end if;
  if exists (select 1 from public.buffaverse_legendary_restaurant_events e where e.restaurant_id=p_restaurant_id and e.cooldown_until > p_starts_at) then raise exception 'legendary_restaurant_cooldown'; end if;
  insert into public.buffaverse_event_instances(event_type_id,event_type_version,lifecycle_status,geographic_scope,state_id,starts_at,ends_at,eligibility,participation_rules,progress_model,progress_target,reward_reference_kind,reward_reference_key,title,summary,display_metadata,feature_flag_key,visibility,source)
  values ('legendary_restaurant',1,'scheduled',p_selection_scope,p_state_id,p_starts_at,p_ends_at,jsonb_build_object('restaurant_id',p_restaurant_id,'reason_code',p_reason_code),jsonb_build_object('qualifying_action','rating_completed','max_completions_per_user',1), 'counter',1,'external','legendary_restaurant_pending',p_title,p_summary,jsonb_build_object('restaurant_id',p_restaurant_id,'restaurant_name',v_name,'reason_code',p_reason_code,'reason_label',p_reason_label,'qualifying_action','Complete an eligible rating during the event window','sponsorship_disclaimer','Buffago-curated event. Not sponsored unless explicitly stated by Buffago.','marker_key','legendary-star-flame'),'buffaverse.legendary_restaurants','private','system') returning id into v_event_id;
  insert into public.buffaverse_legendary_restaurant_events(event_instance_id,restaurant_id,reason_code,reason_label,selection_scope,selection_window_key,cooldown_until)
  values (v_event_id,p_restaurant_id,p_reason_code,p_reason_label,p_selection_scope,p_selection_window_key,p_starts_at + interval '28 days');
  return v_event_id;
end; $$;

revoke all on function public.buffaverse_create_legendary_event(uuid,text,text,text,text,timestamptz,timestamptz,text,text,integer) from public, anon, authenticated;
grant execute on function public.buffaverse_create_legendary_event(uuid,text,text,text,text,timestamptz,timestamptz,text,text,integer) to service_role;

create or replace function public.buffaverse_expire_legendary_events() returns integer
language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_count integer;
begin
  update public.buffaverse_event_instances set lifecycle_status='expired', updated_at=now()
   where event_type_id='legendary_restaurant' and lifecycle_status in ('scheduled','active','paused') and ends_at <= now();
  get diagnostics v_count = row_count;
  return v_count;
end; $$;
revoke all on function public.buffaverse_expire_legendary_events() from public, anon, authenticated;
grant execute on function public.buffaverse_expire_legendary_events() to service_role;

-- Runtime scheduler: deterministic, service-only, bounded, and explainable.
create or replace function public.buffaverse_run_legendary_scheduler(
  p_window_key text, p_starts_at timestamptz, p_ends_at timestamptz,
  p_scope text default 'local', p_state_id integer default null, p_limit integer default 3
) returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_restaurant record; v_created uuid; v_count integer := 0; v_limit integer := greatest(1, least(coalesce(p_limit, 3), 10)); v_reason text; v_fingerprint text;
begin
  if p_window_key is null or p_window_key = '' or p_ends_at <= p_starts_at then raise exception 'invalid_scheduler_window'; end if;
  if p_scope not in ('local','state','global') then raise exception 'invalid_scheduler_scope'; end if;
  if p_scope = 'state' and p_state_id is null then raise exception 'state_required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('legendary-scheduler:' || p_window_key, 0));
  for v_restaurant in
    select d.id, d.name, d.state_id, md5(d.id::text || ':' || p_window_key) as fingerprint
      from public.destinations d
     where d.lat is not null and d.lng is not null
       and (p_scope <> 'state' or d.state_id = p_state_id)
       and not exists (select 1 from public.buffaverse_legendary_restaurant_events le join public.buffaverse_event_instances ei on ei.id = le.event_instance_id where le.restaurant_id = d.id and ei.lifecycle_status in ('scheduled','active','paused') and ei.ends_at > now())
       and not exists (select 1 from public.buffaverse_legendary_restaurant_events le where le.restaurant_id = d.id and le.cooldown_until > p_starts_at)
     order by md5(d.id::text || ':' || p_window_key), d.id
     limit v_limit
  loop
    v_reason := case when p_scope = 'local' then 'underexplored_local_gem' when p_scope = 'state' then 'statewide_discovery' else 'town_exploration' end;
    v_fingerprint := v_restaurant.fingerprint;
    insert into public.buffaverse_legendary_selection_audit(selection_window_key, restaurant_id, reason_code, eligible, input_fingerprint)
      values (p_window_key, v_restaurant.id, v_reason, true, v_fingerprint)
      on conflict do nothing;
    begin
      v_created := public.buffaverse_create_legendary_event(v_restaurant.id, v_reason, case when p_scope = 'local' then 'A local spot worth a Legendary stop' else 'A statewide Buffago discovery moment' end, p_scope, p_window_key, p_starts_at, p_ends_at, 'Legendary at ' || left(v_restaurant.name, 88), 'Complete an eligible rating before this limited-time mission ends.', p_state_id);
      v_count := v_count + 1;
    exception when others then
      insert into public.buffaverse_legendary_selection_audit(selection_window_key, restaurant_id, reason_code, eligible, rejection_code, input_fingerprint)
        values (p_window_key, v_restaurant.id, v_reason, false, sqlerrm, v_fingerprint);
    end;
  end loop;
  return jsonb_build_object('window_key', p_window_key, 'created', v_count, 'limit', v_limit, 'idempotent', true);
end; $$;
revoke all on function public.buffaverse_run_legendary_scheduler(text,timestamptz,timestamptz,text,integer,integer) from public, anon, authenticated;
grant execute on function public.buffaverse_run_legendary_scheduler(text,timestamptz,timestamptz,text,integer,integer) to service_role;

create or replace function public.buffaverse_transition_legendary_event(p_event_instance_id uuid, p_action text, p_confirmation text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_status text;
begin
  if p_confirmation <> 'CONFIRM_LEGENDARY_OPERATION' then raise exception 'explicit_confirmation_required'; end if;
  if p_action not in ('pause','resume','cancel','extend') then raise exception 'invalid_lifecycle_action'; end if;
  if p_action = 'extend' then update public.buffaverse_event_instances set ends_at = greatest(ends_at, now()) + interval '1 hour', updated_at = now() where id = p_event_instance_id and event_type_id='legendary_restaurant' and lifecycle_status in ('scheduled','active','paused');
  else update public.buffaverse_event_instances set lifecycle_status = case when p_action='pause' then 'paused' when p_action='resume' then 'active' else 'cancelled' end, updated_at=now() where id=p_event_instance_id and event_type_id='legendary_restaurant' and lifecycle_status in ('scheduled','active','paused'); end if;
  select lifecycle_status into v_status from public.buffaverse_event_instances where id=p_event_instance_id;
  return jsonb_build_object('event_id', p_event_instance_id, 'action', p_action, 'status', v_status);
end; $$;
revoke all on function public.buffaverse_transition_legendary_event(uuid,text,text) from public, anon, authenticated;
grant execute on function public.buffaverse_transition_legendary_event(uuid,text,text) to service_role;

do $$ begin
  if to_regclass('public.notification_outbox') is not null then
    execute 'alter table public.notification_outbox drop constraint if exists notification_outbox_event_type_check';
    execute $sql$alter table public.notification_outbox add constraint notification_outbox_event_type_check check (event_type in ('streak_at_risk','streak_comeback','friend_rating','crawl_proximity','legendary_start','legendary_expiry','legendary_completion','legendary_reward_ready'))$sql$;
  end if;
end $$;

commit;

-- Rollback: disable the child flags first; after review, drop only Phase 2 tables/functions.
