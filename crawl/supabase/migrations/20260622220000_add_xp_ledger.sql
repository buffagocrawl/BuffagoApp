create table if not exists public.xp_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  amount integer not null,
  source text not null,
  reason text,
  idempotency_key text not null,
  destination_id uuid null,
  crawl_id uuid null,
  route_id uuid null,
  badge_id bigint null,
  battle_id bigint null,
  challenge_id uuid null,
  referral_id uuid null,
  level_before integer null,
  level_after integer null,
  xp_before integer not null,
  xp_after integer not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint xp_ledger_amount_nonzero check (amount <> 0),
  constraint xp_ledger_source_format check (source ~ '^[a-z0-9_]+$')
);

create unique index if not exists xp_ledger_idempotency_key_unique
  on public.xp_ledger (idempotency_key);

create index if not exists xp_ledger_user_time_idx
  on public.xp_ledger (user_id, created_at desc);

create index if not exists xp_ledger_source_time_idx
  on public.xp_ledger (source, created_at desc);

create index if not exists xp_ledger_destination_time_idx
  on public.xp_ledger (destination_id, created_at desc)
  where destination_id is not null;

create index if not exists xp_ledger_crawl_time_idx
  on public.xp_ledger (crawl_id, created_at desc)
  where crawl_id is not null;

create index if not exists xp_ledger_route_time_idx
  on public.xp_ledger (route_id, created_at desc)
  where route_id is not null;

alter table public.xp_ledger enable row level security;

revoke all on public.xp_ledger from anon, authenticated;
grant select on public.xp_ledger to authenticated;

drop policy if exists "xp_ledger_select_own" on public.xp_ledger;
create policy "xp_ledger_select_own"
on public.xp_ledger
for select
to authenticated
using (auth.uid() = user_id);

create or replace function public.xp_level_for(p_xp integer)
returns integer
language sql
stable
as $$
  select coalesce(
    (
      select max(level)
      from public.level_thresholds
      where xp_required <= greatest(coalesce(p_xp, 0), 0)
    ),
    1
  );
$$;

create or replace function public.award_xp(
  p_amount integer,
  p_source text,
  p_reason text default null,
  p_user_id uuid default auth.uid(),
  p_idempotency_key text default null,
  p_destination_id uuid default null,
  p_crawl_id uuid default null,
  p_route_id uuid default null,
  p_badge_id bigint default null,
  p_battle_id bigint default null,
  p_challenge_id uuid default null,
  p_referral_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns table (
  awarded boolean,
  amount integer,
  xp_before integer,
  xp_after integer,
  level_before integer,
  level_after integer,
  ledger_id uuid,
  reason text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := coalesce(p_user_id, auth.uid());
  v_source text := lower(coalesce(nullif(trim(p_source), ''), 'unknown'));
  v_amount integer := coalesce(p_amount, 0);
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
  v_idempotency_key text;
  v_existing public.xp_ledger%rowtype;
  v_xp_before integer;
  v_xp_after integer;
  v_level_before integer;
  v_level_after integer;
  v_ledger_id uuid;
begin
  if v_user_id is null then
    raise exception 'award_xp requires a user id';
  end if;

  if auth.uid() is not null and v_user_id <> auth.uid() then
    raise exception 'cannot award XP to a different user';
  end if;

  if v_amount = 0 then
    raise exception 'award_xp amount must be non-zero';
  end if;

  if v_source !~ '^[a-z0-9_]+$' then
    raise exception 'award_xp source must be snake_case';
  end if;

  insert into public.users (user_id, xp)
  values (v_user_id, 0)
  on conflict (user_id) do nothing;

  v_idempotency_key := coalesce(
    nullif(trim(p_idempotency_key), ''),
    concat_ws(
      ':',
      'xp',
      v_user_id::text,
      v_source,
      coalesce(p_destination_id::text, 'none'),
      coalesce(p_crawl_id::text, 'none'),
      coalesce(p_route_id::text, 'none'),
      coalesce(p_badge_id::text, 'none'),
      coalesce(p_battle_id::text, 'none'),
      coalesce(p_challenge_id::text, 'none'),
      coalesce(p_referral_id::text, 'none'),
      coalesce(v_reason, 'none')
    )
  );

  select *
  into v_existing
  from public.xp_ledger
  where idempotency_key = v_idempotency_key
  limit 1;

  if found then
    return query
    select
      false,
      v_existing.amount,
      v_existing.xp_before,
      v_existing.xp_after,
      v_existing.level_before,
      v_existing.level_after,
      v_existing.id,
      'duplicate'::text;
    return;
  end if;

  select coalesce(xp, 0)
  into v_xp_before
  from public.users
  where user_id = v_user_id
  for update;

  v_xp_after := greatest(0, v_xp_before + v_amount);
  v_level_before := public.xp_level_for(v_xp_before);
  v_level_after := public.xp_level_for(v_xp_after);

  update public.users
  set xp = v_xp_after
  where user_id = v_user_id;

  insert into public.xp_ledger (
    user_id,
    amount,
    source,
    reason,
    idempotency_key,
    destination_id,
    crawl_id,
    route_id,
    badge_id,
    battle_id,
    challenge_id,
    referral_id,
    level_before,
    level_after,
    xp_before,
    xp_after,
    metadata
  )
  values (
    v_user_id,
    v_amount,
    v_source,
    v_reason,
    v_idempotency_key,
    p_destination_id,
    p_crawl_id,
    p_route_id,
    p_badge_id,
    p_battle_id,
    p_challenge_id,
    p_referral_id,
    v_level_before,
    v_level_after,
    v_xp_before,
    v_xp_after,
    v_metadata
  )
  returning id into v_ledger_id;

  insert into public.user_events (
    user_id,
    session_id,
    event_name,
    destination_id,
    crawl_id,
    route_id,
    metadata
  )
  values (
    v_user_id,
    gen_random_uuid(),
    'xp_awarded',
    p_destination_id,
    p_crawl_id,
    p_route_id,
    jsonb_build_object(
      'amount', v_amount,
      'source', v_source,
      'reason', v_reason,
      'ledger_id', v_ledger_id,
      'idempotency_key', v_idempotency_key,
      'level_before', v_level_before,
      'level_after', v_level_after,
      'xp_before', v_xp_before,
      'xp_after', v_xp_after
    ) || v_metadata
  )
  on conflict do nothing;

  if v_level_after > v_level_before then
    insert into public.user_events (
      user_id,
      session_id,
      event_name,
      destination_id,
      crawl_id,
      route_id,
      metadata
    )
    values (
      v_user_id,
      gen_random_uuid(),
      'level_up',
      p_destination_id,
      p_crawl_id,
      p_route_id,
      jsonb_build_object(
        'source', v_source,
        'ledger_id', v_ledger_id,
        'level_before', v_level_before,
        'level_after', v_level_after,
        'xp_before', v_xp_before,
        'xp_after', v_xp_after
      ) || v_metadata
    )
    on conflict do nothing;
  end if;

  return query
  select
    true,
    v_amount,
    v_xp_before,
    v_xp_after,
    v_level_before,
    v_level_after,
    v_ledger_id,
    coalesce(v_reason, v_source);
end;
$$;

drop function if exists public.xp_add(integer, text, uuid);

create function public.xp_add(
  amount integer,
  reason text,
  user_id uuid default auth.uid()
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select to_jsonb(x)
  from (
    select *
    from public.award_xp(
      p_amount := amount,
      p_source := coalesce(
        nullif(btrim(regexp_replace(lower(coalesce(reason, '')), '[^a-z0-9]+', '_', 'g'), '_'), ''),
        'legacy_xp_add'
      ),
      p_reason := reason,
      p_user_id := user_id,
      p_idempotency_key := null,
      p_metadata := jsonb_build_object('legacy_rpc', 'xp_add')
    )
    limit 1
  ) as x;
$$;

grant execute on function public.xp_level_for(integer) to anon, authenticated;
grant execute on function public.award_xp(integer, text, text, uuid, text, uuid, uuid, uuid, bigint, bigint, uuid, uuid, jsonb) to authenticated;
grant execute on function public.xp_add(integer, text, uuid) to authenticated;

comment on table public.xp_ledger is
  'Authoritative XP transaction ledger. users.xp is a cached balance updated by award_xp.';

comment on function public.award_xp(integer, text, text, uuid, text, uuid, uuid, uuid, bigint, bigint, uuid, uuid, jsonb) is
  'Server-side XP award function with idempotency, level audit fields, and product analytics events.';
