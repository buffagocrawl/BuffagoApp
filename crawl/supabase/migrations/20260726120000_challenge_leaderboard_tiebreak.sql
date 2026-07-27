-- Completion count is the leaderboard metric. XP is display-only and must not
-- influence a tie, so qualifying completion time and then user ID break ties.
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
    select dense_rank() over (order by t.challenge_count desc, t.reached_at asc, t.user_id asc) as rank,
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

revoke all on function public.get_challenge_leaderboard(text, integer) from public, anon;
grant execute on function public.get_challenge_leaderboard(text, integer) to authenticated;
