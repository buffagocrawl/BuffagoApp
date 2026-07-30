-- Weekly rating missions are backed by the saved rating rows, not by the
-- optional Wing Shot flow. The event ledger is deliberately assignment- and
-- destination-scoped so retries and re-ratings cannot double count a place.
create table if not exists public.mission_progress_events (
  id uuid primary key default gen_random_uuid(),
  mission_assignment_id uuid not null references public.mission_assignments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  action_type text not null check (action_type = 'rating_created'),
  action_ref uuid not null references public.destination_ratings(id) on delete cascade,
  destination_id uuid not null references public.destinations(id) on delete cascade,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (mission_assignment_id, destination_id),
  unique (mission_assignment_id, action_ref)
);

alter table public.mission_progress_events enable row level security;
revoke all on public.mission_progress_events from public, anon, authenticated;
grant select on public.mission_progress_events to authenticated;
drop policy if exists mission_progress_events_select_own on public.mission_progress_events;
create policy mission_progress_events_select_own on public.mission_progress_events
  for select to authenticated using (user_id = auth.uid());

create index if not exists mission_progress_events_assignment_idx
  on public.mission_progress_events(mission_assignment_id, occurred_at);

create or replace function public.reconcile_weekly_rating_missions(
  p_user_id uuid,
  p_now timestamptz default now(),
  p_timezone text default 'UTC'
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_assignment public.mission_assignments%rowtype;
  v_count integer;
begin
  if p_user_id is null then return; end if;

  -- Assignment creation stays in ensure_engagement_assignments, which has the
  -- caller's canonical timezone. This function only reconciles an assignment
  -- that already exists, avoiding a UTC fallback from the insert trigger.

  for v_assignment in
    select *
    from public.mission_assignments
    where user_id = p_user_id
      and period_kind = 'weekly'
      and action_type = 'rating_created'
      and expires_at > p_now
    order by period_start
    for update
  loop
    -- Select the first saved eligible rating for each destination. The rating
    -- RPCs already enforce their location and score rules; these score checks
    -- also fail closed for any legacy/direct rows encountered by reconciliation.
    insert into public.mission_progress_events (
      mission_assignment_id, user_id, action_type, action_ref,
      destination_id, occurred_at
    )
    select v_assignment.id, p_user_id, 'rating_created', candidate.id,
      candidate.destination_id, candidate.created_at
    from (
      select distinct on (dr.destination_id)
        dr.id, dr.destination_id, dr.created_at
      from public.destination_ratings dr
      where dr.user_id = p_user_id
        and dr.destination_id is not null
        and dr.created_at >= (v_assignment.period_start::timestamp at time zone v_assignment.assignment_timezone)
        and dr.created_at < v_assignment.expires_at
        and not coalesce(dr.is_buffacoin, false)
        and dr.crispiness between 1 and 10
        and dr.sauce between 1 and 10
        and dr.meat between 1 and 10
        and dr.overall between 1 and 10
      order by dr.destination_id, dr.created_at, dr.id
    ) candidate
    on conflict (mission_assignment_id, destination_id) do nothing;

    select count(*)::integer into v_count
    from public.mission_progress_events e
    where e.mission_assignment_id = v_assignment.id;

    update public.mission_assignments
    set progress = least(target, v_count),
        started_at = coalesce(started_at, (
          select min(e.occurred_at) from public.mission_progress_events e
          where e.mission_assignment_id = v_assignment.id
        )),
        completed_at = case
          when v_count >= target then coalesce(completed_at, p_now)
          else null
        end,
        updated_at = now()
    where id = v_assignment.id;

    -- Reward settlement remains server-authoritative and uses the existing
    -- assignment/XP idempotency keys. Only the transition to completed invokes
    -- it here; dashboard reconciliation also settles an already-completed but
    -- unclaimed assignment exactly once.
    if v_count >= v_assignment.target then
      perform public.claim_engagement_reward(v_assignment.id);
    end if;
  end loop;
end;
$$;

revoke all on function public.reconcile_weekly_rating_missions(uuid, timestamptz, text) from public, anon, authenticated;

create or replace function public.reconcile_weekly_rating_mission_after_insert()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.user_id is not null then
    perform public.reconcile_weekly_rating_missions(new.user_id, now(), 'UTC');
  end if;
  return new;
end;
$$;

revoke all on function public.reconcile_weekly_rating_mission_after_insert() from public, anon, authenticated;

drop trigger if exists destination_ratings_weekly_mission_reconciliation on public.destination_ratings;
create trigger destination_ratings_weekly_mission_reconciliation
  after insert on public.destination_ratings
  for each row execute function public.reconcile_weekly_rating_mission_after_insert();

-- Dashboard reads are also a reusable repair path for ratings saved before the
-- trigger was deployed or when a client lost its post-commit request.
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
  perform public.reconcile_weekly_rating_missions(v_user, now(), p_timezone);
  select public.xp_level_for(coalesce(u.xp, 0)) into v_level
    from public.users u where u.user_id = v_user;
  select coalesce(jsonb_agg(
    to_jsonb(m) || jsonb_strip_nulls(jsonb_build_object(
      'mission_type', d.mission_key,
      'title', d.title,
      'description', d.description,
      'metadata', d.eligibility
    )) order by m.period_kind
  ), '[]') into v_assignments
    from public.mission_assignments m
    left join public.engagement_mission_definitions d on d.mission_key = m.mission_key
    where m.user_id = v_user and m.expires_at > now();
  select coalesce(to_jsonb(s), jsonb_build_object('current_streak',0,'longest_streak',0))
    into v_streak from public.user_engagement_streaks s where s.user_id = v_user;
  select coalesce(jsonb_agg(to_jsonb(e) order by e.starts_at), '[]') into v_events
    from public.limited_time_events e
    where e.enabled and e.environment = 'production'
      and e.feature_flag = 'limited_time_events'
      and now() between e.starts_at and e.ends_at
      and v_level >= coalesce((e.eligibility->>'min_level')::integer, 1)
      and v_level <= coalesce((e.eligibility->>'max_level')::integer, 2147483647);
  return jsonb_build_object('assignments', v_assignments, 'streak', v_streak, 'events', v_events);
end;
$$;

revoke all on function public.get_engagement_dashboard(text) from public, anon;
grant execute on function public.get_engagement_dashboard(text) to authenticated;
