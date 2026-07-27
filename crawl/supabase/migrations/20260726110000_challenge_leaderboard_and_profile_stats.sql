-- Authoritative weekly challenge read model. Completion credit is immutable and
-- derived from verified weekly mission assignments; no user-profile counters exist.
create table if not exists public.weekly_challenge_completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mission_assignment_id uuid not null references public.mission_assignments(id) on delete cascade,
  challenge_week_start date not null,
  completed_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (mission_assignment_id),
  unique (user_id, mission_assignment_id)
);
alter table public.weekly_challenge_completions enable row level security;
revoke all on public.weekly_challenge_completions from anon, authenticated;
create index if not exists weekly_challenge_completions_week_user_idx
  on public.weekly_challenge_completions(challenge_week_start, user_id, completed_at);
create index if not exists weekly_challenge_completions_user_week_idx
  on public.weekly_challenge_completions(user_id, challenge_week_start desc);

create or replace function public.record_weekly_challenge_completion()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- The assignment is authoritative: only a verified, in-window weekly completion
  -- can create one immutable credit. The unique assignment key makes races idempotent.
  if new.period_kind = 'weekly' and new.completed_at is not null
     and new.completed_at < new.expires_at
     and new.completed_at >= (new.period_start::timestamp at time zone new.assignment_timezone) then
    insert into public.weekly_challenge_completions
      (user_id, mission_assignment_id, challenge_week_start, completed_at)
    values (new.user_id, new.id, new.period_start, new.completed_at)
    on conflict (mission_assignment_id) do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists mission_assignment_weekly_challenge_completion on public.mission_assignments;
create trigger mission_assignment_weekly_challenge_completion
after insert or update of completed_at on public.mission_assignments
for each row execute function public.record_weekly_challenge_completion();

-- Explicit, rerunnable backfill: only existing verified, in-window assignments
-- are included. It never manufactures credit from progress, events, or profiles.
insert into public.weekly_challenge_completions
  (user_id, mission_assignment_id, challenge_week_start, completed_at)
select m.user_id, m.id, m.period_start, m.completed_at
from public.mission_assignments m
where m.period_kind = 'weekly' and m.completed_at is not null
  and m.completed_at < m.expires_at
  and m.completed_at >= (m.period_start::timestamp at time zone m.assignment_timezone)
on conflict (mission_assignment_id) do nothing;

create or replace function public.get_challenge_leaderboard(
  p_period text default 'week', p_limit integer default 25
)
returns table (
  rank bigint, user_id uuid, username text, display_name text, avatar_url text,
  challenge_count bigint, challenge_xp bigint, is_current_user boolean
)
language sql stable security definer set search_path = public as $$
  with boundary as (
    select date_trunc('week', now() at time zone coalesce((select timezone from public.user_engagement_preferences where user_id = auth.uid()), 'UTC'))::date as week_start
  ), credits as (
    select c.user_id, c.mission_assignment_id, c.completed_at
    from public.weekly_challenge_completions c cross join boundary b
    where p_period = 'all_time' or c.challenge_week_start = b.week_start
  ), totals as (
    select c.user_id, count(*)::bigint as challenge_count,
      coalesce(sum(case when l.source = 'weekly_challenge' then l.amount else 0 end), 0)::bigint as challenge_xp,
      max(c.completed_at) as reached_at
    from credits c
    left join public.mission_reward_receipts r on r.mission_assignment_id = c.mission_assignment_id and r.user_id = c.user_id
    left join public.xp_ledger l on l.id = r.xp_ledger_id and l.user_id = c.user_id
    group by c.user_id
  ), ranked as (
    select dense_rank() over (order by t.challenge_count desc, t.challenge_xp desc, t.reached_at asc, t.user_id asc) as rank,
      t.*, u.username, u.avatar_url
    from totals t join public.users u on u.user_id = t.user_id
    where public.can_user_appear_socially(t.user_id) or t.user_id = auth.uid()
  )
  select rank, user_id, username, username as display_name, avatar_url, challenge_count, challenge_xp,
    user_id = auth.uid() as is_current_user
  from ranked
  where rank <= greatest(1, least(coalesce(p_limit, 25), 100)) or user_id = auth.uid()
  order by rank, user_id;
$$;

create or replace function public.get_public_challenge_stats(p_target_user_id uuid)
returns table(total_completed bigint, this_week_completed bigint, current_weekly_streak integer, best_weekly_streak integer)
language sql stable security definer set search_path = public as $$
  -- A qualifying week has >=1 immutable verified completion. Current streak ends
  -- this week, or the immediately prior week while the active week has none.
  with allowed as (select p_target_user_id as user_id where auth.uid() is not null and (p_target_user_id = auth.uid() or (public.can_user_appear_socially(auth.uid()) and public.can_user_appear_socially(p_target_user_id) and not public.friend_pair_is_blocked(auth.uid(), p_target_user_id)))),
  boundary as (select date_trunc('week', now() at time zone coalesce((select timezone from public.user_engagement_preferences where user_id = p_target_user_id), 'UTC'))::date as week_start),
  weeks as (select distinct c.challenge_week_start from public.weekly_challenge_completions c join allowed a on a.user_id=c.user_id),
  grouped as (select challenge_week_start, challenge_week_start - ((row_number() over(order by challenge_week_start))::int * 7) as grp from weeks),
  runs as (select count(*)::int as length, max(challenge_week_start) as ending_week from grouped group by grp),
  stats as (select count(*)::bigint as total from public.weekly_challenge_completions c join allowed a on a.user_id=c.user_id)
  select s.total,
    (select count(*)::bigint from public.weekly_challenge_completions c cross join boundary b join allowed a on a.user_id=c.user_id where c.challenge_week_start=b.week_start),
    coalesce((select length from runs cross join boundary b where ending_week = b.week_start or (ending_week = b.week_start - 7 and not exists(select 1 from weeks where challenge_week_start=b.week_start)) order by ending_week desc limit 1),0),
    coalesce((select max(length) from runs),0)
  from stats s;
$$;

revoke all on function public.record_weekly_challenge_completion() from public, anon, authenticated;
revoke all on function public.get_challenge_leaderboard(text, integer) from public, anon;
revoke all on function public.get_public_challenge_stats(uuid) from public, anon;
grant execute on function public.get_challenge_leaderboard(text, integer), public.get_public_challenge_stats(uuid) to authenticated;
comment on table public.weekly_challenge_completions is 'Immutable, idempotent credit for verified in-window weekly mission assignment completion.';
