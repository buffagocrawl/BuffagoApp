-- Engagement retention foundation. Additive; existing mission and XP records remain valid.
-- Rollback guidance: drop the RPCs below, then the new tables in reverse dependency
-- order. Columns added to mission_assignments should remain during rollback to avoid
-- destroying production progress; the disabled development fixture can be deleted safely.

-- Some environments predate the verified-growth foundation migration. Define the
-- two mission primitives here as well so this migration is independently deployable.
create table if not exists public.mission_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mission_key text not null check (mission_key ~ '^[a-z0-9_]+$'),
  period_start date not null,
  expires_at timestamptz not null,
  target integer not null check (target > 0),
  progress integer not null default 0 check (progress >= 0),
  reward_xp integer not null default 0 check (reward_xp between 0 and 500),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, mission_key, period_start)
);

create table if not exists public.mission_reward_receipts (
  id uuid primary key default gen_random_uuid(),
  mission_assignment_id uuid not null
    references public.mission_assignments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  xp_ledger_id uuid references public.xp_ledger(id),
  created_at timestamptz not null default now(),
  unique (mission_assignment_id)
);

alter table public.mission_assignments enable row level security;
alter table public.mission_reward_receipts enable row level security;
revoke all on public.mission_assignments from anon;
revoke all on public.mission_reward_receipts from anon, authenticated;
grant select on public.mission_assignments to authenticated;
grant select on public.mission_reward_receipts to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'mission_assignments'
      and policyname = 'mission_assignments_select_own'
  ) then
    create policy mission_assignments_select_own on public.mission_assignments
      for select to authenticated using (user_id = auth.uid());
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'mission_reward_receipts'
      and policyname = 'mission_receipts_select_own'
  ) then
    create policy mission_receipts_select_own on public.mission_reward_receipts
      for select to authenticated using (user_id = auth.uid());
  end if;
end;
$$;

alter table public.mission_assignments
  add column if not exists period_kind text not null default 'daily'
    check (period_kind in ('daily', 'weekly')),
  add column if not exists action_type text,
  add column if not exists assignment_timezone text not null default 'UTC',
  add column if not exists claimed_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists mission_assignments_user_period_idx
  on public.mission_assignments(user_id, period_kind, period_start desc);
create index if not exists mission_assignments_open_idx
  on public.mission_assignments(user_id, expires_at)
  where completed_at is null;

create table if not exists public.engagement_mission_definitions (
  mission_key text primary key check (mission_key ~ '^[a-z0-9_]+$'),
  period_kind text not null check (period_kind in ('daily', 'weekly')),
  action_type text not null check (action_type in (
    'rating_created', 'battle_vote', 'crawl_stop_completed', 'mission_completed'
  )),
  title text not null check (char_length(title) between 3 and 80),
  description text not null check (char_length(description) between 3 and 180),
  target integer not null check (target between 1 and 20),
  reward_xp integer not null check (reward_xp between 0 and 500),
  enabled boolean not null default true,
  eligibility jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.engagement_mission_definitions
  (mission_key, period_kind, action_type, title, description, target, reward_xp)
values
  ('rate_one', 'daily', 'rating_created', 'Rate one wing spot', 'Put one plate on the record.', 1, 35),
  ('battle_three', 'daily', 'battle_vote', 'Call three wing battles', 'Three quick votes. No essay required.', 3, 30),
  ('crawl_progress', 'daily', 'crawl_stop_completed', 'Move your crawl forward', 'Finish one stop on an active crawl.', 1, 30),
  ('weekly_three_ratings', 'weekly', 'rating_created', 'Three spots this week', 'Rate three restaurants before the weekly reset.', 3, 125)
on conflict (mission_key) do update set
  title = excluded.title, description = excluded.description, target = excluded.target,
  reward_xp = excluded.reward_xp, updated_at = now();

create table if not exists public.engagement_action_receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action_type text not null check (action_type in (
    'rating_created', 'battle_vote', 'crawl_stop_completed', 'mission_completed'
  )),
  action_ref text not null check (char_length(action_ref) between 1 and 160),
  occurred_at timestamptz not null default now(),
  local_action_date date not null,
  timezone text not null default 'UTC',
  created_at timestamptz not null default now(),
  unique (user_id, action_type, action_ref)
);
create index if not exists engagement_actions_user_date_idx
  on public.engagement_action_receipts(user_id, local_action_date desc, action_type);

create table if not exists public.user_engagement_streaks (
  user_id uuid primary key references auth.users(id) on delete cascade,
  current_streak integer not null default 0 check (current_streak >= 0),
  longest_streak integer not null default 0 check (longest_streak >= current_streak),
  last_qualified_date date,
  timezone text not null default 'UTC',
  updated_at timestamptz not null default now()
);

create table if not exists public.limited_time_events (
  id uuid primary key default gen_random_uuid(),
  campaign_id text not null unique check (campaign_id ~ '^[a-z0-9_]+$'),
  title text not null check (char_length(title) between 3 and 80),
  description text not null check (char_length(description) between 3 and 240),
  cta_label text not null check (char_length(cta_label) between 2 and 40),
  cta_route text not null check (char_length(cta_route) between 1 and 160),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reward_multiplier numeric(4,2) not null default 1 check (reward_multiplier between 1 and 5),
  eligibility jsonb not null default '{}'::jsonb,
  feature_flag text not null default 'limited_time_events',
  enabled boolean not null default false,
  environment text not null default 'development'
    check (environment in ('development', 'staging', 'production')),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists limited_time_events_active_idx
  on public.limited_time_events(enabled, starts_at, ends_at);

insert into public.limited_time_events (
  campaign_id, title, description, cta_label, cta_route, starts_at, ends_at,
  reward_multiplier, enabled, environment
) values (
  'dev_double_xp_weekend', 'Double XP Wing Weekend',
  'Development fixture for validating time-boxed XP messaging.', 'Find wings',
  '/(tabs)/wingdex', '2099-01-02T00:00:00Z', '2099-01-05T00:00:00Z',
  2, false, 'development'
) on conflict (campaign_id) do nothing;

create table if not exists public.user_engagement_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  timezone text not null default 'UTC',
  mission_reminders boolean not null default true,
  streak_reminders boolean not null default true,
  weekly_reminders boolean not null default true,
  event_alerts boolean not null default true,
  push_capable boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.in_app_notification_readiness (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  notification_type text not null check (notification_type in (
    'mission_nearly_complete', 'streak_at_risk', 'weekly_ending', 'event_started'
  )),
  source_id text not null check (char_length(source_id) between 1 and 160),
  eligible_at timestamptz not null,
  expires_at timestamptz not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique(user_id, notification_type, source_id),
  check (expires_at > eligible_at)
);
create index if not exists notification_readiness_unread_idx
  on public.in_app_notification_readiness(user_id, eligible_at)
  where read_at is null;

alter table public.engagement_mission_definitions enable row level security;
alter table public.engagement_action_receipts enable row level security;
alter table public.user_engagement_streaks enable row level security;
alter table public.limited_time_events enable row level security;
alter table public.user_engagement_preferences enable row level security;
alter table public.in_app_notification_readiness enable row level security;

revoke all on public.engagement_mission_definitions, public.engagement_action_receipts,
  public.user_engagement_streaks, public.limited_time_events,
  public.user_engagement_preferences, public.in_app_notification_readiness
  from anon, authenticated;
grant select on public.engagement_mission_definitions, public.limited_time_events to authenticated;
grant select on public.engagement_action_receipts, public.user_engagement_streaks,
  public.user_engagement_preferences, public.in_app_notification_readiness to authenticated;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='engagement_mission_definitions' and policyname='engagement_definitions_read') then
    create policy engagement_definitions_read on public.engagement_mission_definitions for select to authenticated using (enabled);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='engagement_action_receipts' and policyname='engagement_actions_own_read') then
    create policy engagement_actions_own_read on public.engagement_action_receipts for select to authenticated using (user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='user_engagement_streaks' and policyname='engagement_streak_own_read') then
    create policy engagement_streak_own_read on public.user_engagement_streaks for select to authenticated using (user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='limited_time_events' and policyname='limited_events_read') then
    create policy limited_events_read on public.limited_time_events for select to authenticated using (enabled and environment in ('staging', 'production'));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='user_engagement_preferences' and policyname='engagement_preferences_own_read') then
    create policy engagement_preferences_own_read on public.user_engagement_preferences for select to authenticated using (user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='in_app_notification_readiness' and policyname='notification_readiness_own_read') then
    create policy notification_readiness_own_read on public.in_app_notification_readiness for select to authenticated using (user_id = auth.uid());
  end if;
end $$;

create or replace function public.engagement_safe_timezone(p_timezone text)
returns text language plpgsql stable set search_path = public as $$
begin
  perform now() at time zone coalesce(nullif(p_timezone, ''), 'UTC');
  return coalesce(nullif(p_timezone, ''), 'UTC');
exception when invalid_parameter_value then return 'UTC';
end;
$$;

-- Compatibility shim replaced by the hardening migration. Keeping the symbol in
-- this migration makes record_engagement_action independently deployable.
create or replace function public.resolve_engagement_timezone(p_reported_timezone text default 'UTC')
returns text language sql stable set search_path = public as $$
  select public.engagement_safe_timezone(p_reported_timezone);
$$;

create or replace function public.ensure_engagement_assignments(p_timezone text default 'UTC')
returns setof public.mission_assignments
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_tz text := public.engagement_safe_timezone(p_timezone);
  v_today date := (now() at time zone v_tz)::date;
  v_week date := date_trunc('week', now() at time zone v_tz)::date;
  v_daily public.engagement_mission_definitions%rowtype;
begin
  if v_user is null then raise exception 'authentication_required' using errcode = '42501'; end if;

  select * into v_daily from public.engagement_mission_definitions
  where period_kind = 'daily' and enabled
  order by hashtextextended(v_user::text || ':' || v_today::text || ':' || mission_key, 0)
  limit 1;

  if v_daily.mission_key is not null then
    insert into public.mission_assignments (
      user_id, mission_key, period_start, period_kind, action_type,
      assignment_timezone, expires_at, target, reward_xp
    ) values (
      v_user, v_daily.mission_key, v_today, 'daily', v_daily.action_type, v_tz,
      ((v_today + 1)::timestamp at time zone v_tz), v_daily.target, v_daily.reward_xp
    ) on conflict (user_id, mission_key, period_start) do nothing;
  end if;

  insert into public.mission_assignments (
    user_id, mission_key, period_start, period_kind, action_type,
    assignment_timezone, expires_at, target, reward_xp
  )
  select v_user, d.mission_key, v_week, 'weekly', d.action_type, v_tz,
    ((v_week + 7)::timestamp at time zone v_tz), d.target, d.reward_xp
  from public.engagement_mission_definitions d
  where d.mission_key = 'weekly_three_ratings' and d.enabled
  on conflict (user_id, mission_key, period_start) do nothing;

  return query select * from public.mission_assignments
    where user_id = v_user and expires_at > now()
    order by period_kind, period_start;
end;
$$;

create or replace function public.record_engagement_action(
  p_action_type text, p_action_ref text, p_occurred_at timestamptz default null,
  p_timezone text default 'UTC'
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  -- The device may report context, but eligibility time and the effective timezone
  -- are server-authoritative. resolve_engagement_timezone is added by the follow-up
  -- hardening migration and pins timezone changes behind a 24-hour confirmation.
  v_tz text := public.resolve_engagement_timezone(p_timezone);
  v_at timestamptz := now();
  v_date date := (v_at at time zone v_tz)::date;
  v_inserted_count integer := 0;
  v_streak public.user_engagement_streaks%rowtype;
  v_source_exists boolean := false;
begin
  if v_user is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if p_action_type not in ('rating_created','battle_vote','crawl_stop_completed','mission_completed')
    then raise exception 'invalid_action_type'; end if;
  if char_length(coalesce(p_action_ref, '')) not between 1 and 160
    then raise exception 'invalid_action_ref'; end if;

  -- Never trust a caller-provided reference as proof of a qualifying action.
  -- Each supported action must resolve to a canonical row owned by the caller.
  if p_action_type in ('rating_created', 'crawl_stop_completed') then
    if p_action_ref !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then raise exception 'invalid_action_ref'; end if;
    select exists(
      select 1 from public.destination_ratings dr
      where dr.id = p_action_ref::uuid
        and dr.user_id = v_user
        and (p_action_type <> 'crawl_stop_completed' or dr.crawl_id is not null)
    ) into v_source_exists;
  elsif p_action_type = 'battle_vote' then
    if p_action_ref !~ '^[0-9]+$'
      then raise exception 'invalid_action_ref'; end if;
    select exists(
      select 1 from public.user_wing_battle_votes vote
      where vote.user_id = v_user
        and vote.battle_id::text = p_action_ref
    ) into v_source_exists;
  elsif p_action_type = 'mission_completed' then
    if p_action_ref !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then raise exception 'invalid_action_ref'; end if;
    select exists(
      select 1 from public.mission_assignments assignment
      where assignment.id = p_action_ref::uuid
        and assignment.user_id = v_user
        and assignment.completed_at is not null
    ) into v_source_exists;
  end if;
  if not v_source_exists then
    raise exception 'qualifying_action_not_found' using errcode = '42501';
  end if;

  perform public.ensure_engagement_assignments(v_tz);
  insert into public.engagement_action_receipts
    (user_id, action_type, action_ref, occurred_at, local_action_date, timezone)
  values (v_user, p_action_type, p_action_ref, v_at, v_date, v_tz)
  on conflict (user_id, action_type, action_ref) do nothing;
  get diagnostics v_inserted_count = row_count;

  if v_inserted_count = 1 then
    update public.mission_assignments
      set progress = least(target, progress + 1),
          started_at = coalesce(started_at, v_at),
          completed_at = case when progress + 1 >= target then coalesce(completed_at, v_at) else completed_at end,
          updated_at = now()
    where user_id = v_user and action_type = p_action_type
      and v_at >= period_start::timestamp at time zone assignment_timezone
      and v_at < expires_at and completed_at is null;

    insert into public.user_engagement_streaks
      (user_id, current_streak, longest_streak, last_qualified_date, timezone)
    values (v_user, 1, 1, v_date, v_tz)
    on conflict (user_id) do update set
      current_streak = case
        when v_date < user_engagement_streaks.last_qualified_date then user_engagement_streaks.current_streak
        when user_engagement_streaks.last_qualified_date = v_date then user_engagement_streaks.current_streak
        when user_engagement_streaks.last_qualified_date = v_date - 1 then user_engagement_streaks.current_streak + 1
        else 1 end,
      longest_streak = greatest(user_engagement_streaks.longest_streak, case
        when v_date < user_engagement_streaks.last_qualified_date then user_engagement_streaks.current_streak
        when user_engagement_streaks.last_qualified_date = v_date then user_engagement_streaks.current_streak
        when user_engagement_streaks.last_qualified_date = v_date - 1 then user_engagement_streaks.current_streak + 1
        else 1 end),
      last_qualified_date = greatest(user_engagement_streaks.last_qualified_date, v_date),
      timezone = v_tz, updated_at = now();
  end if;

  select * into v_streak from public.user_engagement_streaks where user_id = v_user;
  return jsonb_build_object('accepted', v_inserted_count = 1, 'action_date', v_date,
    'current_streak', coalesce(v_streak.current_streak, 0),
    'longest_streak', coalesce(v_streak.longest_streak, 0));
end;
$$;

create or replace function public.claim_engagement_reward(p_assignment_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_assignment public.mission_assignments%rowtype;
  v_award record;
begin
  select * into v_assignment from public.mission_assignments
    where id = p_assignment_id and user_id = v_user for update;
  if not found then raise exception 'assignment_not_found' using errcode = 'P0002'; end if;
  if v_assignment.completed_at is null then raise exception 'assignment_incomplete'; end if;
  if v_assignment.expires_at <= v_assignment.completed_at then raise exception 'assignment_expired'; end if;

  select * into v_award from public.award_xp(
    p_amount := v_assignment.reward_xp,
    p_source := case when v_assignment.period_kind = 'weekly'
      then 'weekly_challenge' else 'daily_mission' end,
    p_reason := v_assignment.mission_key,
    p_user_id := v_user,
    p_idempotency_key := 'engagement:' || v_assignment.id::text,
    p_metadata := jsonb_build_object('assignment_id', v_assignment.id,
      'period_kind', v_assignment.period_kind)
  ) limit 1;

  insert into public.mission_reward_receipts
    (mission_assignment_id, user_id, xp_ledger_id)
  values (v_assignment.id, v_user, v_award.ledger_id)
  on conflict (mission_assignment_id) do nothing;
  update public.mission_assignments set claimed_at = coalesce(claimed_at, now()), updated_at = now()
    where id = v_assignment.id;
  return jsonb_build_object('awarded', v_award.awarded, 'xp', v_award.amount,
    'ledger_id', v_award.ledger_id, 'reason', v_award.reason);
end;
$$;

create or replace function public.update_engagement_preferences(
  p_timezone text default 'UTC', p_mission_reminders boolean default true,
  p_streak_reminders boolean default true, p_weekly_reminders boolean default true,
  p_event_alerts boolean default true
) returns public.user_engagement_preferences
language plpgsql security definer set search_path = public as $$
declare v_result public.user_engagement_preferences;
begin
  insert into public.user_engagement_preferences
    (user_id, timezone, mission_reminders, streak_reminders, weekly_reminders, event_alerts)
  values (auth.uid(), public.engagement_safe_timezone(p_timezone), p_mission_reminders,
    p_streak_reminders, p_weekly_reminders, p_event_alerts)
  on conflict (user_id) do update set timezone = excluded.timezone,
    mission_reminders = excluded.mission_reminders, streak_reminders = excluded.streak_reminders,
    weekly_reminders = excluded.weekly_reminders, event_alerts = excluded.event_alerts,
    updated_at = now()
  returning * into v_result;
  return v_result;
end;
$$;

create or replace function public.get_engagement_dashboard(p_timezone text default 'UTC')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_assignments jsonb;
  v_streak jsonb;
  v_events jsonb;
  v_level integer := 1;
begin
  perform public.ensure_engagement_assignments(p_timezone);
  select public.xp_level_for(coalesce(u.xp, 0)) into v_level
    from public.users u where u.user_id = v_user;
  select coalesce(jsonb_agg(to_jsonb(m) order by m.period_kind), '[]') into v_assignments
    from public.mission_assignments m where m.user_id = v_user and m.expires_at > now();
  select coalesce(to_jsonb(s), jsonb_build_object('current_streak',0,'longest_streak',0))
    into v_streak from public.user_engagement_streaks s where s.user_id = v_user;
  select coalesce(jsonb_agg(to_jsonb(e) order by e.starts_at), '[]') into v_events
    from public.limited_time_events e where e.enabled and e.environment = 'production'
      and e.feature_flag = 'limited_time_events'
      and now() between e.starts_at and e.ends_at
      and v_level >= coalesce((e.eligibility->>'min_level')::integer, 1)
      and v_level <= coalesce((e.eligibility->>'max_level')::integer, 2147483647);
  return jsonb_build_object('assignments', v_assignments, 'streak', v_streak, 'events', v_events);
end;
$$;

revoke all on function public.engagement_safe_timezone(text) from public, anon;
revoke all on function public.resolve_engagement_timezone(text) from public, anon;
revoke all on function public.ensure_engagement_assignments(text) from public, anon;
revoke all on function public.record_engagement_action(text,text,timestamptz,text) from public, anon;
revoke all on function public.claim_engagement_reward(uuid) from public, anon;
revoke all on function public.update_engagement_preferences(text,boolean,boolean,boolean,boolean) from public, anon;
revoke all on function public.get_engagement_dashboard(text) from public, anon;
grant execute on function public.ensure_engagement_assignments(text),
  public.record_engagement_action(text,text,timestamptz,text),
  public.claim_engagement_reward(uuid),
  public.update_engagement_preferences(text,boolean,boolean,boolean,boolean),
  public.get_engagement_dashboard(text) to authenticated;

comment on function public.record_engagement_action(text,text,timestamptz,text) is
  'Idempotently advances eligible daily/weekly assignments and a meaningful-action streak.';
comment on table public.in_app_notification_readiness is
  'Preference-aware in-app delivery queue/readiness model; does not claim push delivery capability.';
