-- Keep weekly assignment creation idempotent in ensure_engagement_assignments;
-- this only enriches the existing dashboard response with its canonical definition.
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
    from public.limited_time_events e where e.enabled and e.environment = 'production'
      and e.feature_flag = 'limited_time_events'
      and now() between e.starts_at and e.ends_at
      and v_level >= coalesce((e.eligibility->>'min_level')::integer, 1)
      and v_level <= coalesce((e.eligibility->>'max_level')::integer, 2147483647);
  return jsonb_build_object('assignments', v_assignments, 'streak', v_streak, 'events', v_events);
end;
$$;
