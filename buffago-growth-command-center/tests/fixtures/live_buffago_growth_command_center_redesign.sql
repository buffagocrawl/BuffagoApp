CREATE OR REPLACE FUNCTION public.buffago_growth_command_center_redesign()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
with
clock as (
  select
    now() as ts,
    (now() at time zone 'America/New_York')::date as local_today,
    date_trunc('month', now() at time zone 'America/New_York') as current_month_local
),
bounds as (
  select
    current_month_local at time zone 'America/New_York' as current_month_start,
    (current_month_local - interval '1 month') at time zone 'America/New_York' as previous_month_start,
    (current_month_local + interval '1 month') at time zone 'America/New_York' as next_month_start
  from clock
),
mobile_events as (
  select
    occurred_at,
    lower(platform) as platform,
    anonymous_id,
    coalesce(user_id::text, anonymous_id) as actor
  from public.user_events
  where event_name = 'app_opened'
    and lower(platform) in ('ios','android')
),
device_counts as (
  select jsonb_build_object(
    'all_time', jsonb_build_object(
      'total', count(distinct anonymous_id),
      'ios', count(distinct anonymous_id) filter (where platform='ios'),
      'android', count(distinct anonymous_id) filter (where platform='android')
    ),
    'last_24h', jsonb_build_object(
      'total', count(distinct anonymous_id) filter (where occurred_at >= (select ts from clock) - interval '24 hours'),
      'ios', count(distinct anonymous_id) filter (where occurred_at >= (select ts from clock) - interval '24 hours' and platform='ios'),
      'android', count(distinct anonymous_id) filter (where occurred_at >= (select ts from clock) - interval '24 hours' and platform='android')
    ),
    'previous_24h', jsonb_build_object(
      'total', count(distinct anonymous_id) filter (
        where occurred_at >= (select ts from clock) - interval '48 hours'
          and occurred_at < (select ts from clock) - interval '24 hours'
      ),
      'ios', count(distinct anonymous_id) filter (
        where occurred_at >= (select ts from clock) - interval '48 hours'
          and occurred_at < (select ts from clock) - interval '24 hours'
          and platform='ios'
      ),
      'android', count(distinct anonymous_id) filter (
        where occurred_at >= (select ts from clock) - interval '48 hours'
          and occurred_at < (select ts from clock) - interval '24 hours'
          and platform='android'
      )
    )
  ) as payload
  from mobile_events
),
calendar_mau as (
  select jsonb_build_object(
    'previous_month', jsonb_build_object(
      'month', to_char((select previous_month_start from bounds) at time zone 'America/New_York','YYYY-MM'),
      'value', count(distinct actor) filter (
        where occurred_at >= (select previous_month_start from bounds)
          and occurred_at < (select current_month_start from bounds)
          and actor is not null
      )
    ),
    'current_month', jsonb_build_object(
      'month', to_char((select current_month_start from bounds) at time zone 'America/New_York','YYYY-MM'),
      'value', count(distinct actor) filter (
        where occurred_at >= (select current_month_start from bounds)
          and occurred_at < (select ts from clock)
          and actor is not null
      )
    )
  ) as payload
  from mobile_events
),
totals as (
  select jsonb_build_object(
    'wing_ratings', (select count(*)::int from public.destination_ratings),
    'restaurants', (select count(*)::int from public.destinations),
    'accounts', (select count(*)::int from public.users)
  ) as payload
),
open_work as (
  select coalesce(sum(coalesce(item_count,0)) filter (where lower(status)='open'),0)::int as total
  from public."00_Open_Work"
),
tracking as (
  select date_trunc('month', min(occurred_at) at time zone 'America/New_York')::date as first_month
  from mobile_events
),
months as (
  select
    generate_series(
      (select current_month_local::date from clock) - interval '11 months',
      (select current_month_local::date from clock),
      interval '1 month'
    )::date as month_start
),
monthly_mobile as (
  select
    date_trunc('month', occurred_at at time zone 'America/New_York')::date as month_start,
    count(distinct actor)::int as mau,
    count(distinct anonymous_id)::int as unique_devices
  from mobile_events
  where occurred_at >= (((select current_month_local from clock) - interval '11 months') at time zone 'America/New_York')
  group by 1
),
monthly_ratings as (
  select
    date_trunc('month', created_at at time zone 'America/New_York')::date as month_start,
    count(*)::int as wing_ratings
  from public.destination_ratings
  where created_at >= (((select current_month_local from clock) - interval '11 months') at time zone 'America/New_York')
  group by 1
),
monthly_accounts as (
  select
    date_trunc('month', created_at at time zone 'America/New_York')::date as month_start,
    count(*)::int as new_accounts
  from public.users
  where created_at >= (((select current_month_local from clock) - interval '11 months') at time zone 'America/New_York')
  group by 1
),
monthly as (
  select
    m.month_start,
    case when t.first_month is not null and m.month_start >= t.first_month then coalesce(mm.mau,0) else null end::int as mau,
    case when t.first_month is not null and m.month_start >= t.first_month then coalesce(mm.unique_devices,0) else null end::int as unique_devices,
    coalesce(r.wing_ratings,0)::int as wing_ratings,
    coalesce(a.new_accounts,0)::int as new_accounts,
    (t.first_month is not null and m.month_start >= t.first_month) as app_open_tracking_available
  from months m
  cross join tracking t
  left join monthly_mobile mm using(month_start)
  left join monthly_ratings r using(month_start)
  left join monthly_accounts a using(month_start)
),
monthly_history as (
  select jsonb_agg(
    jsonb_build_object(
      'month', to_char(month_start,'YYYY-MM'),
      'mau', mau,
      'unique_devices', unique_devices,
      'wing_ratings', wing_ratings,
      'new_accounts', new_accounts,
      'app_open_tracking_available', app_open_tracking_available
    )
    order by month_start
  ) as payload
  from monthly
),
series as (
  select 'mau'::text as factor, month_start, mau::numeric as value
  from monthly where mau is not null
  union all
  select 'acquisition', month_start, unique_devices::numeric
  from monthly where unique_devices is not null
  union all
  select 'engagement', month_start, wing_ratings::numeric
  from monthly
  union all
  select 'account_growth', month_start, new_accounts::numeric
  from monthly
),
ranked as (
  select
    factor,
    month_start,
    value,
    row_number() over (partition by factor order by month_start) as rn,
    count(*) over (partition by factor) as cnt
  from series
),
halves as (
  select
    factor,
    month_start,
    value,
    rn,
    cnt,
    case when rn <= floor(cnt/2.0) then 'prior' else 'recent' end as half,
    row_number() over (
      partition by factor, (case when rn <= floor(cnt/2.0) then 0 else 1 end)
      order by month_start
    )::numeric as recency_weight
  from ranked
),
factor_avgs as (
  select
    factor,
    sum(value * recency_weight) filter (where half='prior')
      / nullif(sum(recency_weight) filter (where half='prior'),0) as prior_avg,
    sum(value * recency_weight) filter (where half='recent')
      / nullif(sum(recency_weight) filter (where half='recent'),0) as recent_avg,
    max(cnt) as months_available
  from halves
  group by factor
),
factor_scores as (
  select
    factor,
    prior_avg,
    recent_avg,
    months_available,
    case
      when prior_avg is null or recent_avg is null then null
      else greatest(
        0,
        least(
          100,
          round(50 + 50 * greatest(-1, least(1, (recent_avg - prior_avg) / (prior_avg + 5))))
        )
      )::int
    end as score
  from factor_avgs
),
factor_weights as (
  select * from (values
    ('mau'::text, 0.40::numeric),
    ('acquisition'::text, 0.25::numeric),
    ('engagement'::text, 0.20::numeric),
    ('account_growth'::text, 0.15::numeric)
  ) v(factor, weight)
),
score_calc as (
  select
    round(sum(fs.score * fw.weight) / nullif(sum(fw.weight) filter (where fs.score is not null),0))::int as score,
    jsonb_object_agg(
      fw.factor,
      jsonb_build_object(
        'score', fs.score,
        'weight', fw.weight,
        'prior_avg', case when fs.prior_avg is null then null else round(fs.prior_avg,1) end,
        'recent_avg', case when fs.recent_avg is null then null else round(fs.recent_avg,1) end,
        'months_available', fs.months_available
      )
      order by fw.factor
    ) as factors
  from factor_weights fw
  left join factor_scores fs using(factor)
),
app_months as (
  select count(*)::int as n from monthly where app_open_tracking_available
),
score_explanation as (
  select
    case
      when (select n from app_months) < 6 then
        'App-open tracking currently covers ' || (select n from app_months) ||
        ' months, so score confidence is limited. ' ||
        case
          when coalesce((select score from factor_scores where factor='mau'),50) < 40
            then 'MAU momentum is the biggest current weakness.'
          when coalesce((select score from factor_scores where factor='acquisition'),50) < 40
            then 'Device acquisition is the biggest current weakness.'
          when coalesce((select score from factor_scores where factor='engagement'),50) < 40
            then 'Rating engagement is the biggest current weakness.'
          when coalesce((select score from factor_scores where factor='account_growth'),50) < 40
            then 'Account growth is the biggest current weakness.'
          else 'Recent growth signals are mixed.'
        end
      else
        case
          when coalesce((select score from factor_scores where factor='mau'),50) >= 60
            and coalesce((select score from factor_scores where factor='acquisition'),50) >= 60
            then 'MAU and device acquisition are both improving.'
          when coalesce((select score from factor_scores where factor='mau'),50) < 40
            then 'MAU momentum remains weak and needs focused acquisition and retention work.'
          when coalesce((select score from factor_scores where factor='acquisition'),50) < 40
            then 'Device acquisition is lagging relative to the prior period.'
          when coalesce((select score from factor_scores where factor='engagement'),50) < 40
            then 'User acquisition is healthier than rating engagement.'
          when coalesce((select score from factor_scores where factor='account_growth'),50) < 40
            then 'Traffic is not converting into account growth strongly enough.'
          else 'Growth signals are mixed without one dominant weakness.'
        end
    end as text
),
marketing as (
  select jsonb_build_object(
    'score', (select score from score_calc),
    'score_version', 'v1',
    'confidence', case
      when (select n from app_months) < 6 then 'limited'
      when (select n from app_months) <= 8 then 'medium'
      else 'high'
    end,
    'explanation', (select text from score_explanation),
    'factors', (select factors from score_calc)
  ) as payload
)
select jsonb_build_object(
  'product_pulse', jsonb_build_object(
    'device_opens', (select payload from device_counts),
    'calendar_mau', (select payload from calendar_mau),
    'totals', (select payload from totals),
    'monthly_history', (select payload from monthly_history),
    'open_work', jsonb_build_object('total', (select total from open_work))
  ),
  'marketing', (select payload from marketing)
);
$function$;
