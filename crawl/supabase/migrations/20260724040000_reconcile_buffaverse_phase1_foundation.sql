-- Targeted forward reconciliation for an already-materialized pre-correction
-- Buffaverse foundation. Never drop Phase 1 tables or views.

do $$
declare
  expected record;
begin
  for expected in
    select * from (values
      ('buffaverse_feature_flags','flag_key','text'),
      ('buffaverse_feature_flags','enabled','bool'),
      ('buffaverse_event_types','event_type_id','text'),
      ('buffaverse_event_types','version','int4'),
      ('buffaverse_event_instances','id','uuid'),
      ('buffaverse_event_instances','lifecycle_status','text'),
      ('buffaverse_event_instances','feature_flag_key','text'),
      ('buffaverse_event_lifecycle_history','id','uuid'),
      ('buffaverse_event_lifecycle_history','event_instance_id','uuid'),
      ('buffaverse_event_lifecycle_history','idempotency_key','text')
    ) as required(table_name, column_name, udt_name)
  loop
    if not exists (
      select 1 from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = expected.table_name
        and c.column_name = expected.column_name
        and c.udt_name = expected.udt_name
    ) then
      raise exception 'buffaverse_core_column_incompatible:%:%', expected.table_name, expected.column_name;
    end if;
  end loop;

  if exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('buffaverse_event_feed','buffaverse_admin_event_visibility')
      and c.relkind <> 'v'
  ) then
    raise exception 'buffaverse_feed_relation_incompatible';
  end if;

  if exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('buffaverse_feature_flags','buffaverse_event_types','buffaverse_event_instances','buffaverse_event_lifecycle_history')
      and not c.relrowsecurity
  ) then
    raise exception 'buffaverse_rls_disabled_on_existing_table';
  end if;

  -- The remainder of this block performs the targeted additive correction.
end;
$$;

do $$
begin
  if to_regclass('public.buffaverse_feature_flags') is null
     or to_regclass('public.buffaverse_event_types') is null
     or to_regclass('public.buffaverse_event_instances') is null
     or to_regclass('public.buffaverse_event_lifecycle_history') is null
     or to_regclass('public.buffaverse_event_feed') is null
     or to_regclass('public.buffaverse_admin_event_visibility') is null then
    raise exception 'buffaverse_phase1_reconcile_requires_existing_foundation';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'buffaverse_event_lifecycle_history'
      and column_name = 'request_fingerprint'
      and (udt_name <> 'text' or is_nullable <> 'NO')
  ) then
    raise exception 'buffaverse_request_fingerprint_materially_incompatible';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'buffaverse_event_lifecycle_history'
      and column_name = 'request_fingerprint'
  ) then
    if exists (select 1 from public.buffaverse_event_lifecycle_history) then
      raise exception 'buffaverse_existing_history_requires_approved_fingerprint_backfill';
    end if;
    alter table public.buffaverse_event_lifecycle_history
      add column request_fingerprint text;
    alter table public.buffaverse_event_lifecycle_history
      alter column request_fingerprint set not null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.buffaverse_event_lifecycle_history'::regclass
      and conname = 'buffaverse_event_lifecycle_history_request_fingerprint_check'
      and pg_get_constraintdef(oid, true) = 'CHECK (char_length(request_fingerprint) = 32)'
  ) then
    if exists (
      select 1 from pg_constraint
      where conrelid = 'public.buffaverse_event_lifecycle_history'::regclass
        and conname = 'buffaverse_event_lifecycle_history_request_fingerprint_check'
    ) then
      raise exception 'buffaverse_request_fingerprint_check_materially_incompatible';
    end if;
    alter table public.buffaverse_event_lifecycle_history
      add constraint buffaverse_event_lifecycle_history_request_fingerprint_check
      check (char_length(request_fingerprint) = 32);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.buffaverse_event_lifecycle_history'::regclass
      and conname = 'buffaverse_lifecycle_history_idempotency_key_uq'
      and pg_get_constraintdef(oid, true) = 'UNIQUE (idempotency_key)'
  ) then
    if exists (
      select idempotency_key
      from public.buffaverse_event_lifecycle_history
      group by idempotency_key
      having count(*) > 1
    ) then
      raise exception 'buffaverse_duplicate_idempotency_keys_require_approved_cleanup';
    end if;
    if exists (
      select 1 from pg_constraint
      where conrelid = 'public.buffaverse_event_lifecycle_history'::regclass
        and conname = 'buffaverse_lifecycle_history_idempotency_key_uq'
    ) then
      raise exception 'buffaverse_idempotency_constraint_materially_incompatible';
    end if;
    alter table public.buffaverse_event_lifecycle_history
      add constraint buffaverse_lifecycle_history_idempotency_key_uq
      unique (idempotency_key);
  end if;
end;
$$;

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

  select * into v_existing
    from public.buffaverse_event_lifecycle_history
   where idempotency_key = p_idempotency_key;

  if found then
    if v_existing.request_fingerprint <> v_request_fingerprint then
      raise exception 'idempotency_key_conflict';
    end if;
    return v_existing.id;
  end if;

  select * into v_event
    from public.buffaverse_event_instances
   where id = p_event_instance_id
   for update;

  if not found then raise exception 'event_not_found'; end if;
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
    raise exception 'invalid_lifecycle_transition:%->%', v_event.lifecycle_status, p_to_status;
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
    p_event_instance_id, v_event.lifecycle_status, p_to_status, p_idempotency_key,
    v_request_fingerprint, p_actor_source, p_actor_id, p_trigger_source,
    p_correlation_id, p_metadata
  ) returning id into v_history_id;

  return v_history_id;
end;
$$;

revoke all on function public.buffaverse_touch_updated_at() from public, anon, authenticated;
revoke all on function public.buffaverse_transition_event(uuid, text, text, text, text, uuid, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.buffaverse_transition_event(uuid, text, text, text, text, uuid, text, uuid, jsonb) to service_role;

revoke all on public.buffaverse_event_feed from public, anon, authenticated, service_role;
grant select on public.buffaverse_event_feed to anon, authenticated, service_role;
revoke all on public.buffaverse_admin_event_visibility from public, anon, authenticated, service_role;
grant select on public.buffaverse_admin_event_visibility to service_role;
revoke all on public.buffaverse_event_lifecycle_history from public, anon, authenticated, service_role;
grant select, insert on public.buffaverse_event_lifecycle_history to service_role;
