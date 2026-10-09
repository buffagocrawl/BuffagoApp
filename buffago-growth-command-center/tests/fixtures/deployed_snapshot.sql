-- Read-only copy of production RPC inspected 2026-10-08, used only by tests.
CREATE OR REPLACE FUNCTION public.get_buffago_growth_snapshot()
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
rating_counts as (
  select
    count(*)::int as total,
    count(*) filter (
      where created_at >= (select ts from clock) - interval '24 hours'
    )::int as current_24h,
    count(*) filter (
      where created_at >= (select ts from clock) - interval '48 hours'
        and created_at < (select ts from clock) - interval '24 hours'
    )::int as previous_24h,
    count(*) filter (
      where created_at >= (select ts from clock) - interval '7 days'
    )::int as current_7d,
    count(*) filter (
      where created_at >= (select ts from clock) - interval '14 days'
        and created_at < (select ts from clock) - interval '7 days'
    )::int as previous_7d
  from public.destination_ratings
),
active_counts as (
  select
    count(distinct coalesce(user_id::text, anonymous_id)) filter (
      where event_name = 'app_opened'
        and occurred_at >= (select ts from clock) - interval '24 hours'
        and coalesce(user_id::text, anonymous_id) is not null
    )::int as current_24h,
    count(distinct coalesce(user_id::text, anonymous_id)) filter (
      where event_name = 'app_opened'
        and occurred_at >= (select ts from clock) - interval '48 hours'
        and occurred_at < (select ts from clock) - interval '24 hours'
        and coalesce(user_id::text, anonymous_id) is not null
    )::int as previous_24h,
    count(distinct coalesce(user_id::text, anonymous_id)) filter (
      where event_name = 'app_opened'
        and occurred_at >= (select ts from clock) - interval '7 days'
        and coalesce(user_id::text, anonymous_id) is not null
    )::int as current_7d,
    count(distinct coalesce(user_id::text, anonymous_id)) filter (
      where event_name = 'app_opened'
        and occurred_at >= (select ts from clock) - interval '14 days'
        and occurred_at < (select ts from clock) - interval '7 days'
        and coalesce(user_id::text, anonymous_id) is not null
    )::int as previous_7d
  from public.user_events
),
new_user_counts as (
  select
    count(*) filter (
      where created_at >= (select ts from clock) - interval '7 days'
    )::int as current_7d,
    count(*) filter (
      where created_at >= (select ts from clock) - interval '14 days'
        and created_at < (select ts from clock) - interval '7 days'
    )::int as previous_7d
  from public.users
),
feedback_counts as (
  select
    count(*) filter (
      where coalesce(lower(status), 'open') not in ('closed','resolved','done')
    )::int as open_total,
    count(*) filter (
      where coalesce(lower(status), 'open') not in ('closed','resolved','done')
        and created_at >= (select ts from clock) - interval '24 hours'
    )::int as new_open_24h,
    min(created_at) filter (
      where coalesce(lower(status), 'open') not in ('closed','resolved','done')
    ) as oldest_open_at
  from public.user_feedback
),
ios_latest as (
  select downloads_total, downloads_daily, store_rating, store_rating_count, metric_date, fetched_at
  from public.buffago_store_metrics_daily
  where platform = 'ios'
  order by metric_date desc, fetched_at desc
  limit 1
),
android_latest as (
  select downloads_total, downloads_daily, store_rating, store_rating_count, metric_date, fetched_at
  from public.buffago_store_metrics_daily
  where platform = 'android'
  order by metric_date desc, fetched_at desc
  limit 1
),
store_windows as (
  select
    platform,
    count(downloads_daily) filter (
      where metric_date between (select local_today from clock) - 6 and (select local_today from clock)
    )::int as current_days_available,
    sum(downloads_daily) filter (
      where metric_date between (select local_today from clock) - 6 and (select local_today from clock)
    )::bigint as current_7d,
    count(downloads_daily) filter (
      where metric_date between (select local_today from clock) - 13 and (select local_today from clock) - 7
    )::int as previous_days_available,
    sum(downloads_daily) filter (
      where metric_date between (select local_today from clock) - 13 and (select local_today from clock) - 7
    )::bigint as previous_7d
  from public.buffago_store_metrics_daily
  where metric_date between (select local_today from clock) - 13 and (select local_today from clock)
  group by platform
),
days as (
  select generate_series(
    (select local_today from clock) - 13,
    (select local_today from clock),
    interval '1 day'
  )::date as day
),
daily_ratings as (
  select
    (created_at at time zone 'America/New_York')::date as day,
    count(*)::int as value
  from public.destination_ratings
  where created_at >= ((select local_today from clock) - 13)::timestamp at time zone 'America/New_York'
  group by 1
),
daily_active as (
  select
    day,
    count(distinct actor)::int as value
  from (
    select
      (occurred_at at time zone 'America/New_York')::date as day,
      coalesce(user_id::text, anonymous_id) as actor
    from public.user_events
    where event_name = 'app_opened'
      and occurred_at >= ((select local_today from clock) - 13)::timestamp at time zone 'America/New_York'
      and coalesce(user_id::text, anonymous_id) is not null
  ) x
  group by day
),
daily_new_users as (
  select
    (created_at at time zone 'America/New_York')::date as day,
    count(*)::int as value
  from public.users
  where created_at >= ((select local_today from clock) - 13)::timestamp at time zone 'America/New_York'
  group by 1
),
daily_store as (
  select
    metric_date as day,
    max(downloads_daily) filter (where platform='ios')::int as ios_downloads,
    max(downloads_daily) filter (where platform='android')::int as android_downloads
  from public.buffago_store_metrics_daily
  where metric_date between (select local_today from clock) - 13 and (select local_today from clock)
  group by metric_date
),
history as (
  select jsonb_agg(
    jsonb_build_object(
      'date', d.day,
      'wing_ratings', coalesce(r.value, 0),
      'active_users', coalesce(a.value, 0),
      'new_users', coalesce(u.value, 0),
      'ios_downloads', s.ios_downloads,
      'android_downloads', s.android_downloads
    )
    order by d.day
  ) as items
  from days d
  left join daily_ratings r on r.day = d.day
  left join daily_active a on a.day = d.day
  left join daily_new_users u on u.day = d.day
  left join daily_store s on s.day = d.day
)
select jsonb_build_object(
  'generated_at', (select ts from clock),
  'timezone', 'America/New_York',
  'product_pulse', jsonb_build_object(
    'wing_ratings', jsonb_build_object(
      'total', r.total,
      'last_24h', r.current_24h,
      'previous_24h', r.previous_24h,
      'change_pct',
        case
          when r.previous_24h = 0 then null
          else round(((r.current_24h - r.previous_24h)::numeric / r.previous_24h::numeric) * 100, 1)
        end,
      'direction',
        case
          when r.current_24h > r.previous_24h then 'up'
          when r.current_24h < r.previous_24h then 'down'
          else 'flat'
        end
    ),
    'active_users', jsonb_build_object(
      'definition', 'Distinct signed-in user_id or anonymous_id with app_opened in rolling 24h',
      'last_24h', a.current_24h,
      'previous_24h', a.previous_24h,
      'change_pct',
        case
          when a.previous_24h = 0 then null
          else round(((a.current_24h - a.previous_24h)::numeric / a.previous_24h::numeric) * 100, 1)
        end,
      'direction',
        case
          when a.current_24h > a.previous_24h then 'up'
          when a.current_24h < a.previous_24h then 'down'
          else 'flat'
        end
    ),
    'feedback', jsonb_build_object(
      'open_total', f.open_total,
      'new_open_24h', f.new_open_24h,
      'oldest_open_at', f.oldest_open_at
    ),
    'store', jsonb_build_object(
      'ios', jsonb_build_object(
        'downloads_total', i.downloads_total,
        'downloads_daily', i.downloads_daily,
        'store_rating', i.store_rating,
        'store_rating_count', i.store_rating_count,
        'metric_date', i.metric_date,
        'fetched_at', i.fetched_at
      ),
      'android', jsonb_build_object(
        'downloads_total', d.downloads_total,
        'downloads_daily', d.downloads_daily,
        'store_rating', d.store_rating,
        'store_rating_count', d.store_rating_count,
        'metric_date', d.metric_date,
        'fetched_at', d.fetched_at
      )
    )
  ),
  'growth_7d', jsonb_build_object(
    'window', 'rolling_7d_vs_previous_7d',
    'wing_ratings', jsonb_build_object(
      'current', r.current_7d,
      'previous', r.previous_7d,
      'change_pct',
        case
          when r.previous_7d = 0 then null
          else round(((r.current_7d - r.previous_7d)::numeric / r.previous_7d::numeric) * 100, 1)
        end,
      'direction',
        case
          when r.current_7d > r.previous_7d then 'up'
          when r.current_7d < r.previous_7d then 'down'
          else 'flat'
        end
    ),
    'active_users', jsonb_build_object(
      'current', a.current_7d,
      'previous', a.previous_7d,
      'change_pct',
        case
          when a.previous_7d = 0 then null
          else round(((a.current_7d - a.previous_7d)::numeric / a.previous_7d::numeric) * 100, 1)
        end,
      'direction',
        case
          when a.current_7d > a.previous_7d then 'up'
          when a.current_7d < a.previous_7d then 'down'
          else 'flat'
        end
    ),
    'new_users', jsonb_build_object(
      'current', n.current_7d,
      'previous', n.previous_7d,
      'change_pct',
        case
          when n.previous_7d = 0 then null
          else round(((n.current_7d - n.previous_7d)::numeric / n.previous_7d::numeric) * 100, 1)
        end,
      'direction',
        case
          when n.current_7d > n.previous_7d then 'up'
          when n.current_7d < n.previous_7d then 'down'
          else 'flat'
        end
    ),
    'downloads', jsonb_build_object(
      'ios', jsonb_build_object(
        'current', iw.current_7d,
        'previous', iw.previous_7d,
        'current_days_available', coalesce(iw.current_days_available, 0),
        'previous_days_available', coalesce(iw.previous_days_available, 0),
        'change_pct',
          case
            when iw.previous_7d is null or iw.previous_7d = 0 or iw.current_7d is null then null
            else round(((iw.current_7d - iw.previous_7d)::numeric / iw.previous_7d::numeric) * 100, 1)
          end
      ),
      'android', jsonb_build_object(
        'current', aw.current_7d,
        'previous', aw.previous_7d,
        'current_days_available', coalesce(aw.current_days_available, 0),
        'previous_days_available', coalesce(aw.previous_days_available, 0),
        'change_pct',
          case
            when aw.previous_7d is null or aw.previous_7d = 0 or aw.current_7d is null then null
            else round(((aw.current_7d - aw.previous_7d)::numeric / aw.previous_7d::numeric) * 100, 1)
          end
      )
    )
  ),
  'history_14d', h.items
)
from rating_counts r
cross join active_counts a
cross join new_user_counts n
cross join feedback_counts f
cross join history h
left join ios_latest i on true
left join android_latest d on true
left join store_windows iw on iw.platform = 'ios'
left join store_windows aw on aw.platform = 'android';
$function$

