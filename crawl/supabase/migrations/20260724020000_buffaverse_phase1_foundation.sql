-- Buffaverse Phase 1 database foundation.
-- Additive, default-off, and reward-reference-only. This migration must not be
-- deployed through a blind `supabase db push`; see the Phase 1 migration plan.

create table public.buffaverse_feature_flags (
  flag_key text primary key
    check (flag_key ~ '^buffaverse\.[a-z0-9_.-]+$'),
  description text not null check (char_length(description) between 3 and 240),
  enabled boolean not null default false,
  environment text not null default 'development'
    check (environment in ('development', 'preview', 'production')),
  parent_flag_key text references public.buffaverse_feature_flags(flag_key),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint buffaverse_feature_flags_not_self_parent
    check (parent_flag_key is null or parent_flag_key <> flag_key)
);

comment on table public.buffaverse_feature_flags is
  'Server-owned Buffaverse kill switches. Every Phase 1 flag defaults disabled.';

insert into public.buffaverse_feature_flags
  (flag_key, description, parent_flag_key)
values
  ('buffaverse.enabled', 'Entire Buffaverse experience', null),
  ('buffaverse.home', 'Buffaverse home entry point', 'buffaverse.enabled'),
  ('buffaverse.feed', 'Buffaverse event feed', 'buffaverse.enabled'),
  ('buffaverse.participation', 'Buffaverse event participation', 'buffaverse.enabled'),
  ('buffaverse.admin_actions', 'Buffaverse administrative event actions', 'buffaverse.enabled'),
  ('buffaverse.analytics', 'Buffaverse analytics instrumentation', 'buffaverse.enabled'),
  ('buffaverse.event_type.foundation_probe', 'Development-only architecture probe', 'buffaverse.enabled');

create table public.buffaverse_event_types (
  event_type_id text not null
    check (event_type_id ~ '^[a-z][a-z0-9_]{2,63}$'),
  version integer not null check (version > 0),
  display_name text not null check (char_length(display_name) between 3 and 80),
  description text not null check (char_length(description) between 3 and 500),
  supported_lifecycle_states text[] not null,
  supported_geographies text[] not null,
  supported_progress_models text[] not null,
  supported_reward_models text[] not null,
  display_capabilities jsonb not null default '{}'::jsonb
    check (jsonb_typeof(display_capabilities) = 'object'),
  analytics_mapping jsonb not null default '{}'::jsonb
    check (jsonb_typeof(analytics_mapping) = 'object'),
  feature_flag_key text not null
    references public.buffaverse_feature_flags(flag_key),
  enabled boolean not null default false,
  environment text not null default 'development'
    check (environment in ('development', 'preview', 'production')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  primary key (event_type_id, version),
  constraint buffaverse_event_types_lifecycle_nonempty
    check (cardinality(supported_lifecycle_states) > 0),
  constraint buffaverse_event_types_geographies_nonempty
    check (cardinality(supported_geographies) > 0),
  constraint buffaverse_event_types_progress_nonempty
    check (cardinality(supported_progress_models) > 0),
  constraint buffaverse_event_types_rewards_nonempty
    check (cardinality(supported_reward_models) > 0)
);

comment on table public.buffaverse_event_types is
  'Versioned server-owned event-type registry; definitions are capabilities, not completed features.';

insert into public.buffaverse_event_types (
  event_type_id,
  version,
  display_name,
  description,
  supported_lifecycle_states,
  supported_geographies,
  supported_progress_models,
  supported_reward_models,
  display_capabilities,
  analytics_mapping,
  feature_flag_key
) values (
  'foundation_probe',
  1,
  'Foundation Probe',
  'Disabled development-only definition used to validate Phase 1 extension points.',
  array['draft', 'scheduled', 'active', 'paused', 'completed', 'failed',
        'expired', 'cancelled', 'settlement_pending', 'settled', 'settlement_failed'],
  array['global', 'state', 'local'],
  array['none', 'counter', 'milestone'],
  array['none', 'reference_only'],
  '{"hero":true,"progress":true,"primary_cta":true}'::jsonb,
  '{"impression":"buffaverse_event_impression","open":"buffaverse_event_opened"}'::jsonb,
  'buffaverse.event_type.foundation_probe'
);

create table public.buffaverse_event_instances (
  id uuid primary key default gen_random_uuid(),
  event_type_id text not null,
  event_type_version integer not null,
  lifecycle_status text not null default 'draft'
    check (lifecycle_status in (
      'draft', 'scheduled', 'active', 'paused', 'completed', 'failed',
      'expired', 'cancelled', 'settlement_pending', 'settled', 'settlement_failed'
    )),
  geographic_scope text not null
    check (geographic_scope in ('global', 'state', 'local')),
  state_id integer references public.states(state_id),
  geography_key text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  eligibility_schema_version integer not null default 1
    check (eligibility_schema_version > 0),
  eligibility jsonb not null default '{}'::jsonb
    check (jsonb_typeof(eligibility) = 'object'),
  participation_rules_schema_version integer not null default 1
    check (participation_rules_schema_version > 0),
  participation_rules jsonb not null default '{}'::jsonb
    check (jsonb_typeof(participation_rules) = 'object'),
  progress_model text not null
    check (progress_model in ('none', 'counter', 'milestone')),
  progress_target integer check (progress_target is null or progress_target > 0),
  reward_reference_kind text not null default 'none'
    check (reward_reference_kind in ('none', 'xp', 'buffacoin', 'badge', 'external')),
  reward_reference_key text,
  title text not null check (char_length(title) between 3 and 100),
  summary text not null check (char_length(summary) between 3 and 500),
  display_metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(display_metadata) = 'object'),
  feature_flag_key text not null references public.buffaverse_feature_flags(flag_key),
  visibility text not null default 'private'
    check (visibility in ('private', 'public')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  source text not null default 'admin'
    check (source in ('admin', 'system', 'migration', 'development_fixture')),
  correlation_id uuid not null default gen_random_uuid(),
  foreign key (event_type_id, event_type_version)
    references public.buffaverse_event_types(event_type_id, version),
  constraint buffaverse_event_instances_time_order
    check (ends_at > starts_at),
  constraint buffaverse_event_instances_geography_shape
    check (
      (geographic_scope = 'global' and state_id is null and geography_key is null)
      or (geographic_scope = 'state' and state_id is not null and geography_key is null)
      or (geographic_scope = 'local' and geography_key is not null)
    ),
  constraint buffaverse_event_instances_progress_shape
    check (
      (progress_model = 'none' and progress_target is null)
      or (progress_model <> 'none' and progress_target is not null)
    ),
  constraint buffaverse_event_instances_reward_reference_shape
    check (
      (reward_reference_kind = 'none' and reward_reference_key is null)
      or (reward_reference_kind <> 'none' and reward_reference_key is not null)
    )
);

comment on column public.buffaverse_event_instances.reward_reference_key is
  'Opaque reference only. Phase 1 performs no reward issuance or settlement.';

create table public.buffaverse_event_lifecycle_history (
  id uuid primary key default gen_random_uuid(),
  event_instance_id uuid not null
    references public.buffaverse_event_instances(id) on delete restrict,
  from_status text,
  to_status text not null check (to_status in (
    'draft', 'scheduled', 'active', 'paused', 'completed', 'failed',
    'expired', 'cancelled', 'settlement_pending', 'settled', 'settlement_failed'
  )),
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 200),
  request_fingerprint text not null check (char_length(request_fingerprint) = 32),
  actor_source text not null
    check (actor_source in ('admin', 'system', 'scheduler', 'migration')),
  actor_id uuid,
  trigger_source text not null check (char_length(trigger_source) between 2 and 100),
  correlation_id uuid not null,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  constraint buffaverse_lifecycle_history_idempotency_key_uq unique (idempotency_key)
);

comment on table public.buffaverse_event_lifecycle_history is
  'Append-only lifecycle audit. Normal clients receive no write or read grant.';

create index buffaverse_event_instances_feed_idx
  on public.buffaverse_event_instances
  (lifecycle_status, starts_at, ends_at, geographic_scope, state_id)
  where visibility = 'public';

create index buffaverse_event_instances_type_idx
  on public.buffaverse_event_instances (event_type_id, event_type_version, lifecycle_status);

create index buffaverse_event_instances_flag_idx
  on public.buffaverse_event_instances (feature_flag_key, lifecycle_status);

create index buffaverse_event_lifecycle_history_instance_time_idx
  on public.buffaverse_event_lifecycle_history (event_instance_id, occurred_at desc);

create or replace function public.buffaverse_touch_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger buffaverse_feature_flags_touch_updated_at
before update on public.buffaverse_feature_flags
for each row execute function public.buffaverse_touch_updated_at();

create trigger buffaverse_event_types_touch_updated_at
before update on public.buffaverse_event_types
for each row execute function public.buffaverse_touch_updated_at();

create trigger buffaverse_event_instances_touch_updated_at
before update on public.buffaverse_event_instances
for each row execute function public.buffaverse_touch_updated_at();

create or replace function public.buffaverse_transition_event(
  p_event_instance_id uuid,
  p_to_status text,
  p_idempotency_key text,
  p_actor_source text,
  p_trigger_source text,
  p_actor_id uuid default null,
  p_expected_from_status text default null,
  p_correlation_id uuid default gen_random_uuid(),
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_event public.buffaverse_event_instances%rowtype;
  v_existing public.buffaverse_event_lifecycle_history%rowtype;
  v_history_id uuid;
  v_allowed boolean := false;
  v_request_fingerprint text;
begin
  if p_idempotency_key is null or char_length(p_idempotency_key) not between 8 and 200 then
    raise exception 'invalid_idempotency_key';
  end if;
  if p_actor_source not in ('admin', 'system', 'scheduler', 'migration') then
    raise exception 'invalid_actor_source';
  end if;
  if p_trigger_source is null or char_length(p_trigger_source) not between 2 and 100 then
    raise exception 'invalid_trigger_source';
  end if;
  if p_metadata is null or jsonb_typeof(p_metadata) <> 'object' then
    raise exception 'invalid_metadata';
  end if;

  -- Serialize every use of a key before inspecting history. This prevents a
  -- check-then-insert race, including concurrent retries for different events.
  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key, 0));

  v_request_fingerprint := md5(concat_ws('|',
    p_event_instance_id::text,
    p_to_status,
    coalesce(p_expected_from_status, ''),
    p_actor_source,
    p_trigger_source,
    coalesce(p_actor_id::text, ''),
    p_metadata::text
  ));

  select *
    into v_existing
    from public.buffaverse_event_lifecycle_history
   where idempotency_key = p_idempotency_key;

  if found then
    if v_existing.request_fingerprint <> v_request_fingerprint then
      raise exception 'idempotency_key_conflict';
    end if;
    return v_existing.id;
  end if;

  select *
    into v_event
    from public.buffaverse_event_instances
   where id = p_event_instance_id
   for update;

  if not found then
    raise exception 'event_not_found';
  end if;
  if p_expected_from_status is not null
     and v_event.lifecycle_status <> p_expected_from_status then
    raise exception 'lifecycle_precondition_failed';
  end if;

  v_allowed := case v_event.lifecycle_status
    when 'draft' then p_to_status in ('scheduled', 'cancelled')
    when 'scheduled' then p_to_status in ('active', 'paused', 'expired', 'cancelled', 'failed')
    when 'active' then p_to_status in ('paused', 'completed', 'expired', 'cancelled', 'failed')
    when 'paused' then p_to_status in ('scheduled', 'active', 'expired', 'cancelled', 'failed')
    when 'completed' then p_to_status in ('settlement_pending', 'settled', 'settlement_failed')
    when 'settlement_pending' then p_to_status in ('settled', 'settlement_failed')
    when 'settlement_failed' then p_to_status in ('settlement_pending', 'settled')
    else false
  end;

  if not v_allowed then
    raise exception 'invalid_lifecycle_transition:%->%',
      v_event.lifecycle_status, p_to_status;
  end if;

  update public.buffaverse_event_instances
     set lifecycle_status = p_to_status,
         updated_by = p_actor_id,
         correlation_id = p_correlation_id
   where id = p_event_instance_id;

  insert into public.buffaverse_event_lifecycle_history (
    event_instance_id, from_status, to_status, idempotency_key, request_fingerprint,
    actor_source, actor_id, trigger_source, correlation_id, metadata
  ) values (
    p_event_instance_id, v_event.lifecycle_status, p_to_status, p_idempotency_key, v_request_fingerprint,
    p_actor_source, p_actor_id, p_trigger_source, p_correlation_id, p_metadata
  )
  returning id into v_history_id;

  return v_history_id;
end;
$$;

revoke all on function public.buffaverse_touch_updated_at() from public, anon, authenticated;
revoke all on function public.buffaverse_transition_event(
  uuid, text, text, text, text, uuid, text, uuid, jsonb
) from public, anon, authenticated;
grant execute on function public.buffaverse_transition_event(
  uuid, text, text, text, text, uuid, text, uuid, jsonb
) to service_role;

alter table public.buffaverse_feature_flags enable row level security;
alter table public.buffaverse_event_types enable row level security;
alter table public.buffaverse_event_instances enable row level security;
alter table public.buffaverse_event_lifecycle_history enable row level security;

revoke all on public.buffaverse_feature_flags from public, anon, authenticated;
revoke all on public.buffaverse_event_types from public, anon, authenticated;
revoke all on public.buffaverse_event_instances from public, anon, authenticated;
revoke all on public.buffaverse_event_lifecycle_history from public, anon, authenticated;

grant select on public.buffaverse_feature_flags to anon, authenticated;
grant select on public.buffaverse_event_types to anon, authenticated;
grant select on public.buffaverse_event_instances to anon, authenticated;

create policy buffaverse_flags_client_read
on public.buffaverse_feature_flags
for select to anon, authenticated
using (true);

create policy buffaverse_event_types_enabled_read
on public.buffaverse_event_types
for select to anon, authenticated
using (
  enabled
  and environment = 'production'
  and exists (
    select 1
      from public.buffaverse_feature_flags root
     where root.flag_key = 'buffaverse.enabled'
       and root.enabled
       and root.environment = 'production'
  )
  and exists (
    select 1
      from public.buffaverse_feature_flags own_flag
     where own_flag.flag_key = buffaverse_event_types.feature_flag_key
       and own_flag.enabled
       and own_flag.environment = 'production'
  )
);

create policy buffaverse_event_instances_public_read
on public.buffaverse_event_instances
for select to anon, authenticated
using (
  visibility = 'public'
  and lifecycle_status in ('scheduled', 'active', 'paused', 'completed')
  and exists (
    select 1
      from public.buffaverse_feature_flags root
     where root.flag_key = 'buffaverse.enabled'
       and root.enabled
       and root.environment = 'production'
  )
  and exists (
    select 1
      from public.buffaverse_feature_flags feed
     where feed.flag_key = 'buffaverse.feed'
       and feed.enabled
       and feed.environment = 'production'
  )
  and exists (
    select 1
      from public.buffaverse_feature_flags own_flag
     where own_flag.flag_key = buffaverse_event_instances.feature_flag_key
       and own_flag.enabled
       and own_flag.environment = 'production'
  )
);

create view public.buffaverse_event_feed
with (security_invoker = true)
as
select
  event.id,
  event.event_type_id,
  event.event_type_version,
  event.lifecycle_status,
  event.geographic_scope,
  event.state_id,
  event.geography_key,
  event.starts_at,
  event.ends_at,
  event.progress_model,
  event.progress_target,
  event.reward_reference_kind,
  event.reward_reference_key,
  event.title,
  event.summary,
  event.display_metadata,
  event.updated_at
from public.buffaverse_event_instances event
where event.lifecycle_status in ('scheduled', 'active')
  and event.ends_at > now()
order by
  case event.lifecycle_status when 'active' then 0 else 1 end,
  event.starts_at,
  event.id;

comment on view public.buffaverse_event_feed is
  'RLS-invoker feed source. Clients must apply a bounded range/pagination request.';

create view public.buffaverse_admin_event_visibility
with (security_invoker = true)
as
select
  event.id,
  event.event_type_id,
  event.event_type_version,
  event.lifecycle_status,
  event.geographic_scope,
  event.state_id,
  event.geography_key,
  event.starts_at,
  event.ends_at,
  event.feature_flag_key,
  flag.enabled as feature_flag_enabled,
  event.source,
  event.correlation_id,
  event.created_at,
  event.updated_at,
  (
    select max(history.occurred_at)
    from public.buffaverse_event_lifecycle_history history
    where history.event_instance_id = event.id
  ) as last_transition_at,
  (
    select count(*)::integer
    from public.buffaverse_event_lifecycle_history history
    where history.event_instance_id = event.id
  ) as transition_count
from public.buffaverse_event_instances event
join public.buffaverse_feature_flags flag
  on flag.flag_key = event.feature_flag_key;

revoke all on public.buffaverse_event_feed from public;
grant select on public.buffaverse_event_feed to anon, authenticated, service_role;

revoke all on public.buffaverse_admin_event_visibility from public, anon, authenticated;
grant select on public.buffaverse_admin_event_visibility to service_role;

grant all on public.buffaverse_feature_flags to service_role;
grant all on public.buffaverse_event_types to service_role;
grant all on public.buffaverse_event_instances to service_role;
grant select, insert on public.buffaverse_event_lifecycle_history to service_role;

-- Forward-fix strategy: keep all flags disabled, revoke view/RPC grants if needed,
-- and correct additive objects in a new migration. Do not drop event audit history.
