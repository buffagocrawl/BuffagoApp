CREATE OR REPLACE FUNCTION public.get_buffago_growth_os_state()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
with
clock as (
  select
    now() as ts,
    (now() at time zone 'America/New_York')::date as local_today
),
mau as (
  select
    count(distinct coalesce(user_id::text, anonymous_id)) filter (
      where event_name = 'app_opened'
        and occurred_at >= (select ts from clock) - interval '30 days'
        and coalesce(user_id::text, anonymous_id) is not null
    )::int as current_30d,
    count(distinct coalesce(user_id::text, anonymous_id)) filter (
      where event_name = 'app_opened'
        and occurred_at >= (select ts from clock) - interval '60 days'
        and occurred_at < (select ts from clock) - interval '30 days'
        and coalesce(user_id::text, anonymous_id) is not null
    )::int as previous_30d
  from public.user_events
),
active_experiment as (
  select
    id,
    title,
    hypothesis,
    metric_name,
    target_value,
    current_value,
    unit,
    start_date,
    end_date,
    status,
    notes,
    updated_at
  from public.buffago_growth_experiments
  where status = 'active'
  order by updated_at desc
  limit 1
),
todays_move as (
  select
    id,
    move_date,
    title,
    why_it_matters,
    status,
    completed_at,
    updated_at
  from public.buffago_growth_moves
  where move_date = (select local_today from clock)
  limit 1
),
balance as (
  select
    count(*)::int as total,
    count(*) filter (where category='product')::int as product,
    count(*) filter (where category='growth')::int as growth,
    count(*) filter (where category='customer')::int as customer
  from public.buffago_founder_activity
  where occurred_at >= (select ts from clock) - interval '7 days'
),
latest_insight as (
  select
    id,
    title,
    body,
    source,
    created_at,
    expires_at
  from public.buffago_growth_insights
  where active = true
    and (expires_at is null or expires_at > (select ts from clock))
  order by created_at desc
  limit 1
)
select jsonb_build_object(
  'north_star', jsonb_build_object(
    'metric', 'mau_30d',
    'label', 'Monthly Active Users',
    'current', m.current_30d,
    'previous_30d', m.previous_30d,
    'change_pct',
      case
        when m.previous_30d = 0 then null
        else round(((m.current_30d - m.previous_30d)::numeric / m.previous_30d::numeric) * 100, 1)
      end,
    'direction',
      case
        when m.current_30d > m.previous_30d then 'up'
        when m.current_30d < m.previous_30d then 'down'
        else 'flat'
      end,
    'definition', 'Distinct signed-in user_id or anonymous_id with app_opened in rolling 30 days'
  ),
  'current_experiment',
    case when e.id is null then null else jsonb_build_object(
      'id', e.id,
      'title', e.title,
      'hypothesis', e.hypothesis,
      'metric_name', e.metric_name,
      'target_value', e.target_value,
      'current_value',
        case
          when lower(coalesce(e.metric_name,'')) = 'mau_30d' then m.current_30d::numeric
          else e.current_value
        end,
      'unit', e.unit,
      'start_date', e.start_date,
      'end_date', e.end_date,
      'status', e.status,
      'notes', e.notes,
      'progress_pct',
        case
          when e.target_value is null or e.target_value = 0 then null
          when lower(coalesce(e.metric_name,'')) = 'mau_30d'
            then round((m.current_30d::numeric / e.target_value) * 100, 1)
          when e.current_value is null then null
          else round((e.current_value / e.target_value) * 100, 1)
        end,
      'day_number',
        case
          when e.start_date is null then null
          else greatest(1, ((select local_today from clock) - e.start_date) + 1)
        end,
      'duration_days',
        case
          when e.start_date is null or e.end_date is null then null
          else greatest(1, (e.end_date - e.start_date) + 1)
        end,
      'updated_at', e.updated_at
    ) end,
  'todays_move',
    case when mv.id is null then null else jsonb_build_object(
      'id', mv.id,
      'date', mv.move_date,
      'title', mv.title,
      'why_it_matters', mv.why_it_matters,
      'status', mv.status,
      'completed_at', mv.completed_at,
      'updated_at', mv.updated_at
    ) end,
  'founder_balance_7d', jsonb_build_object(
    'tracked', b.total > 0,
    'product', b.product,
    'growth', b.growth,
    'customer', b.customer,
    'total', b.total,
    'window', 'rolling_7d'
  ),
  'marketing_insight',
    case when i.id is null then null else jsonb_build_object(
      'id', i.id,
      'title', i.title,
      'body', i.body,
      'source', i.source,
      'created_at', i.created_at,
      'expires_at', i.expires_at
    ) end
)
from mau m
cross join balance b
left join active_experiment e on true
left join todays_move mv on true
left join latest_insight i on true;
$function$;
