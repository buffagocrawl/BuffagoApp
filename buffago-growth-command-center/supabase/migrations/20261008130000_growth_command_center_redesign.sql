-- Extend the existing device-authenticated snapshot without removing legacy
-- fields or changing the snapshot RPC's owner, grants, or security mode.
-- Mobile app metrics deliberately exclude web, null, unknown and other platforms.
create or replace function public.buffago_product_pulse_growth()
returns jsonb language sql stable security invoker
set search_path = ''
as $$
with clock as (
  select now() as ts,
    (now() at time zone 'America/New_York')::date as local_today,
    date_trunc('month', now() at time zone 'America/New_York')::date as this_month
), bounds as (
  select *, (this_month - interval '1 month')::date as previous_month from clock
), mobile_events as (
  select e.anonymous_id, e.user_id, e.platform, e.occurred_at
  from public.user_events e
  where e.event_name = 'app_opened'
    and lower(e.platform) in ('ios', 'android')
), windows(name, starts_at, ends_at) as (
  values ('all_time', null::timestamptz, null::timestamptz),
         ('last_24h', (select ts from clock) - interval '24 hours', null::timestamptz),
         ('previous_24h', (select ts from clock) - interval '48 hours', (select ts from clock) - interval '24 hours')
), window_devices as (
  -- A device seen with both mobile labels in one window is assigned its latest
  -- observed platform, so distinct total always equals iOS plus Android.
  select distinct on (w.name, e.anonymous_id)
    w.name, e.anonymous_id, lower(e.platform) as platform
  from windows w join mobile_events e
    on (w.starts_at is null or e.occurred_at >= w.starts_at)
   and (w.ends_at is null or e.occurred_at < w.ends_at)
  where e.anonymous_id is not null
  order by w.name, e.anonymous_id, e.occurred_at desc, lower(e.platform) desc
), device_windows as (
  select
    count(*) filter(where name='all_time') as all_total,
    count(*) filter(where name='all_time' and platform='ios') as all_ios,
    count(*) filter(where name='all_time' and platform='android') as all_android,
    count(*) filter(where name='last_24h') as day_total,
    count(*) filter(where name='last_24h' and platform='ios') as day_ios,
    count(*) filter(where name='last_24h' and platform='android') as day_android,
    count(*) filter(where name='previous_24h') as previous_total,
    count(*) filter(where name='previous_24h' and platform='ios') as previous_ios,
    count(*) filter(where name='previous_24h' and platform='android') as previous_android
  from window_devices
), calendar_values as (
  select
    count(distinct coalesce(e.user_id::text, e.anonymous_id)) filter (
      where e.occurred_at >= (b.previous_month::timestamp at time zone 'America/New_York')
        and e.occurred_at < (b.this_month::timestamp at time zone 'America/New_York')
        and coalesce(e.user_id::text, e.anonymous_id) is not null) as previous_mau,
    count(distinct coalesce(e.user_id::text, e.anonymous_id)) filter (
      where e.occurred_at >= (b.this_month::timestamp at time zone 'America/New_York')
        and e.occurred_at <= b.ts
        and coalesce(e.user_id::text, e.anonymous_id) is not null) as current_mau
  from mobile_events e cross join bounds b
), telemetry as (
  select min(occurred_at) as first_open from mobile_events
), months as (
  -- Keep the full chart range from first mobile instrumentation, plus the
  -- trailing year needed by Marketing Score when tracking began more recently.
  select generate_series(
    coalesce(
      least(
        (select date_trunc('month', first_open at time zone 'America/New_York')::date from telemetry),
        ((select this_month from clock) - interval '11 months')::date
      ),
      ((select this_month from clock) - interval '11 months')::date
    )::timestamp,
    (select this_month from clock)::timestamp,
    interval '1 month'
  )::date as month
), monthly_events as (
  select (e.occurred_at at time zone 'America/New_York')::date
      - (extract(day from (e.occurred_at at time zone 'America/New_York')::date)::int - 1) as month,
    count(distinct coalesce(e.user_id::text, e.anonymous_id)) filter (
      where coalesce(e.user_id::text, e.anonymous_id) is not null) as mau,
    count(distinct e.anonymous_id) as devices
  from mobile_events e
  group by 1
), monthly_ratings as (
  select date_trunc('month', created_at at time zone 'America/New_York')::date as month, count(*) as total
  from public.destination_ratings group by 1
), monthly_accounts as (
  select date_trunc('month', created_at at time zone 'America/New_York')::date as month, count(*) as total
  from public.users group by 1
), monthly_history as (
  select jsonb_agg(jsonb_build_object(
    'month', m.month,
    'app_open_tracking_available', t.first_open is not null and m.month >= date_trunc('month', t.first_open at time zone 'America/New_York')::date,
    'mau', case when t.first_open is not null and m.month >= date_trunc('month', t.first_open at time zone 'America/New_York')::date then coalesce(e.mau, 0) else null end,
    'unique_devices', case when t.first_open is not null and m.month >= date_trunc('month', t.first_open at time zone 'America/New_York')::date then coalesce(e.devices, 0) else null end,
    'wing_ratings', coalesce(r.total, 0),
    'new_accounts', coalesce(a.total, 0)
  ) order by m.month) as items
  from months m cross join telemetry t
  left join monthly_events e using(month)
  left join monthly_ratings r using(month)
  left join monthly_accounts a using(month)
), open_work as (
  select coalesce(sum(coalesce(item_count, 0)), 0) as total
  from public."00_Open_Work" where lower(status) = 'open'
)
select jsonb_build_object(
  'device_opens', jsonb_build_object(
    'all_time', jsonb_build_object('total', d.all_total, 'ios', d.all_ios, 'android', d.all_android),
    'last_24h', jsonb_build_object('total', d.day_total, 'ios', d.day_ios, 'android', d.day_android),
    'previous_24h', jsonb_build_object('total', d.previous_total, 'ios', d.previous_ios, 'android', d.previous_android)
  ),
  'calendar_mau', jsonb_build_object(
    'previous_month', jsonb_build_object('month', to_char(b.previous_month, 'YYYY-MM-01'), 'value', c.previous_mau),
    'current_month', jsonb_build_object('month', to_char(b.this_month, 'YYYY-MM-01'), 'value', c.current_mau)
  ),
  'totals', jsonb_build_object(
    'wing_ratings', (select count(*) from public.destination_ratings),
    'restaurants', (select count(*) from public.destinations),
    'accounts', (select count(*) from public.users)
  ),
  'monthly_history', (select items from monthly_history),
  'open_work', jsonb_build_object('total', open_work.total)
)
from device_windows d cross join bounds b cross join calendar_values c cross join open_work;
$$;
revoke all on function public.buffago_product_pulse_growth() from public, anon, authenticated;
grant execute on function public.buffago_product_pulse_growth() to service_role;

-- Marketing Score v1: for each factor, compare the recency-weighted average
-- of the newer and older halves of available months. Month weights
-- rise linearly from 1.0 to 2.0 over the trailing 12 slots. Factor = round(
-- 50 + 50 * clamp((recent - prior) / (prior + 5), -1, 1)). The pseudocount 5
-- limits small-denominator swings. Available factors are weighted 40/25/20/15
-- for MAU, mobile devices, ratings and accounts; missing factors are omitted and
-- remaining weights are renormalized. Confidence uses tracked app-open months.
create or replace function public.buffago_marketing_factor(p_months jsonb, p_key text, p_app_open boolean)
returns integer language sql immutable
set search_path = ''
as $$
with values_by_month as (
  select (e.ordinality - 1)::numeric as idx,
    (e.value ->> p_key)::numeric as value,
    row_number() over(order by e.ordinality desc) as recency,
    count(*) over() as observed_months
  from jsonb_array_elements(coalesce(p_months, '[]'::jsonb)) with ordinality e(value, ordinality)
  where (e.value ->> p_key) is not null
    and (not p_app_open or e.value ->> 'app_open_tracking_available' = 'true')
), averages as (
  select
    sum(value * (1 + idx / 11)) filter(where recency <= ceil(observed_months::numeric / 2)) /
      nullif(sum(1 + idx / 11) filter(where recency <= ceil(observed_months::numeric / 2)), 0) as recent,
    sum(value * (1 + idx / 11)) filter(where recency > ceil(observed_months::numeric / 2)) /
      nullif(sum(1 + idx / 11) filter(where recency > ceil(observed_months::numeric / 2)), 0) as previous
  from values_by_month
)
select case when recent is null or previous is null then null::integer
  else round(50 + 50 * greatest(-1::numeric, least(1::numeric, (recent - previous) / (previous + 5))))::integer end
from averages;
$$;
revoke all on function public.buffago_marketing_factor(jsonb, text, boolean) from public, anon, authenticated;
grant execute on function public.buffago_marketing_factor(jsonb, text, boolean) to service_role;

create or replace function public.buffago_marketing_score(p_months jsonb)
returns jsonb language sql immutable
set search_path = ''
as $$
with recent_months as (
  -- Keep scoring on the intended trailing 12 months even as chart history grows.
  select coalesce(jsonb_agg(value order by ordinality), '[]'::jsonb) as items
  from jsonb_array_elements(coalesce(p_months, '[]'::jsonb)) with ordinality e(value, ordinality)
  where ordinality > greatest(jsonb_array_length(coalesce(p_months, '[]'::jsonb)) - 12, 0)
), factors as (
  select
    public.buffago_marketing_factor(recent_months.items, 'mau', true) as mau,
    public.buffago_marketing_factor(recent_months.items, 'unique_devices', true) as acquisition,
    public.buffago_marketing_factor(recent_months.items, 'wing_ratings', false) as engagement,
    public.buffago_marketing_factor(recent_months.items, 'new_accounts', false) as account_growth,
    (select count(*) from jsonb_array_elements(recent_months.items) m
      where m ->> 'app_open_tracking_available' = 'true') as tracked
  from recent_months
), scored as (
  select *, round((coalesce(mau * .40, 0) + coalesce(acquisition * .25, 0) +
                      coalesce(engagement * .20, 0) + coalesce(account_growth * .15, 0)) /
       nullif((case when mau is not null then .40 else 0 end) +
              (case when acquisition is not null then .25 else 0 end) +
              (case when engagement is not null then .20 else 0 end) +
              (case when account_growth is not null then .15 else 0 end), 0))::integer as score
  from factors
), factor_rows as (
  select s.*, f.label, f.value as factor_value
  from scored s
  cross join lateral (values
    ('MAU'::text, mau), ('device acquisition', acquisition),
    ('rating engagement', engagement), ('new-account growth', account_growth)
  ) f(label, value)
), extremes as (
  select
    (select label from factor_rows where factor_value is not null order by factor_value desc, label limit 1) as strongest,
    (select label from factor_rows where factor_value is not null order by factor_value asc, label limit 1) as weakest,
    (select factor_value from factor_rows where factor_value is not null order by factor_value desc, label limit 1) as strongest_value,
    (select factor_value from factor_rows where factor_value is not null order by factor_value asc, label limit 1) as weakest_value
  from scored limit 1
)
select jsonb_build_object(
  'score', coalesce(score, 0), 'score_version', 'v1',
  'confidence', case when tracked < 6 then 'limited' when tracked <= 8 then 'medium' else 'high' end,
  'factors', jsonb_build_object('mau', mau, 'acquisition', acquisition, 'engagement', engagement, 'account_growth', account_growth),
  'explanation', case
    when strongest_value >= 55 and weakest_value <= 45 and strongest <> weakest then strongest || ' is improving while ' || weakest || ' remains weak.'
    when weakest_value <= 45 and strongest_value - weakest_value >= 15 then weakest || ' is weak; ' || strongest || ' is holding up.'
    when weakest_value <= 45 then 'Growth momentum is soft, led by weakness in ' || weakest || '.'
    when strongest_value >= 55 then strongest || ' leads current growth momentum.'
    else 'Growth factors are broadly steady.' end
    || case when tracked < 9 then ' App-open tracking covers ' || tracked || ' months, so score confidence is ' || case when tracked < 6 then 'limited' when tracked <= 8 then 'medium' else 'high' end || '.' else '' end
) from scored cross join extremes;
$$;
revoke all on function public.buffago_marketing_score(jsonb) from public, anon, authenticated;
grant execute on function public.buffago_marketing_score(jsonb) to service_role;

-- Add only the Growth Command Center fields to the applied operations helper
-- output. The existing helper remains responsible for operational legacy keys,
-- including pending_photos. The snapshot RPC remains SECURITY DEFINER with its
-- existing owner and grants.
do $migration$
declare
  definition text := pg_get_functiondef('public.get_buffago_growth_snapshot()'::regprocedure);
  old_marker text := '''product_pulse'', public.buffago_product_pulse_operations() || jsonb_build_object(';
  new_marker text := '''product_pulse'', public.buffago_product_pulse_operations() || public.buffago_product_pulse_growth() || jsonb_build_object(';
  growth_marker text := '''growth_7d'', jsonb_build_object(';
begin
  if strpos(definition, new_marker) > 0
     and strpos(definition, '''marketing'', public.buffago_marketing_score(') > 0 then
    return;
  end if;
  if strpos(definition, old_marker) > 0 then
    if (length(definition) - length(replace(definition, old_marker, ''))) / length(old_marker) <> 1 then
      raise exception 'Unexpected Product Pulse snapshot patch; inspect before applying Growth Command Center migration';
    end if;
    definition := replace(definition, old_marker, new_marker);
  elsif strpos(definition, new_marker) = 0 then
    raise exception 'Applied Product Pulse operations helper not found in snapshot RPC';
  end if;
  if strpos(definition, '''marketing'', public.buffago_marketing_score(') = 0 then
    if (length(definition) - length(replace(definition, growth_marker, ''))) / length(growth_marker) <> 1 then
      raise exception 'Unexpected Growth OS snapshot definition; inspect before adding Marketing Score';
    end if;
    definition := replace(definition, growth_marker,
      '''marketing'', public.buffago_marketing_score(public.buffago_product_pulse_growth()->''monthly_history''), ' || growth_marker);
  end if;
  execute definition;
end;
$migration$;
