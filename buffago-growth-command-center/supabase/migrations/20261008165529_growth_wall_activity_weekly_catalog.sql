begin;
-- Follow-up to the DEPLOYED redesign; never reapply an earlier migration.
-- No raw events or mobile instrumentation are changed.
create schema if not exists buffago_growth_internal;
revoke all on schema buffago_growth_internal from public, anon, authenticated;
grant usage on schema buffago_growth_internal to service_role;
create table if not exists buffago_growth_internal.excluded_accounts (
  email text primary key check (email = lower(email))
);
alter table buffago_growth_internal.excluded_accounts enable row level security;
revoke all on buffago_growth_internal.excluded_accounts from public, anon, authenticated;
grant select on buffago_growth_internal.excluded_accounts to service_role;
-- The only dashboard SQL location containing the exclusion addresses.
insert into buffago_growth_internal.excluded_accounts(email) values
  ('blemire9@gmail.com'), ('branden.lemire@outlook.com') on conflict do nothing;

create or replace view buffago_growth_internal.excluded_users as
select u.id from auth.users u
join buffago_growth_internal.excluded_accounts x on lower(u.email) = x.email;
create or replace view buffago_growth_internal.excluded_devices as
select distinct e.anonymous_id from public.user_events e
join buffago_growth_internal.excluded_users u on u.id = e.user_id
where e.anonymous_id is not null;
-- Historical association uses ALL event names/platforms, including later associations.
create or replace view buffago_growth_internal.external_mobile_opens as
select e.* from public.user_events e
where e.event_name = 'app_opened' and lower(e.platform) in ('ios','android')
  and not exists (select 1 from buffago_growth_internal.excluded_users u where u.id = e.user_id)
  and not exists (select 1 from buffago_growth_internal.excluded_devices d where d.anonymous_id = e.anonymous_id);
revoke all on all tables in schema buffago_growth_internal from public, anon, authenticated;
grant select on all tables in schema buffago_growth_internal to service_role;

-- Canonical deployed public-status helper includes publishing lifecycle states.
-- A public photo also needs an existing display asset; originals alone do not qualify.
create or replace function public.buffago_growth_catalog_health()
returns jsonb language sql stable security invoker set search_path='' as $$
with counts as (
 select count(*) total,
 count(*) filter(where not exists(select 1 from public.destination_ratings r where r.destination_id=d.id)) no_ratings,
 count(*) filter(where not exists(
   select 1 from public.wing_media_submissions s
   where s.destination_id=d.id and s.media_type='photo'
     and public.wing_media_is_public_status(s.status)
     and s.withdrawn_at is null
     and exists(select 1 from storage.objects o where o.bucket_id='wing-submissions'
       and o.name in (s.processed_storage_path,s.thumbnail_storage_path))
 )) no_photos from public.destinations d
)
select jsonb_build_object(
 'restaurants_without_ratings',jsonb_build_object('count',no_ratings,'percentage',coalesce(round(no_ratings*100.0/nullif(total,0),1),0)),
 'restaurants_without_photos',jsonb_build_object('count',no_photos,'percentage',coalesce(round(no_photos*100.0/nullif(total,0),1),0))) from counts;
$$;
revoke all on function public.buffago_growth_catalog_health() from public,anon,authenticated;
grant execute on function public.buffago_growth_catalog_health() to service_role;

CREATE OR REPLACE FUNCTION public.buffago_growth_monthly_chart_history()
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
  from buffago_growth_internal.external_mobile_opens
  where event_name = 'app_opened'
    and lower(platform) in ('ios','android')
),
device_windows as (
  select distinct on (w.name,e.anonymous_id) w.name,e.anonymous_id,e.platform
  from (values ('all_time',null::timestamptz,null::timestamptz),
    ('last_24h',now()-interval '24 hours',now()),
    ('previous_24h',now()-interval '48 hours',now()-interval '24 hours')) w(name,starts_at,ends_at)
  join mobile_events e on (w.starts_at is null or e.occurred_at>=w.starts_at)
    and (w.ends_at is null or e.occurred_at<w.ends_at)
  where e.anonymous_id is not null
  order by w.name,e.anonymous_id,e.occurred_at desc,e.platform desc
), device_counts as (
  select jsonb_object_agg(name,payload) payload from (
    select w.name,jsonb_build_object('total',count(d.anonymous_id),
      'ios',count(d.anonymous_id) filter(where d.platform='ios'),
      'android',count(d.anonymous_id) filter(where d.platform='android')) payload
    from (values ('all_time'),('last_24h'),('previous_24h')) w(name)
    left join device_windows d using(name) group by w.name
  ) windows
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
    'accounts', (select count(*)::int from public.users),
    'users_created', (select count(*)::int from public.users)
  ) as payload
),
open_work as (
  select coalesce(sum(coalesce(item_count,0)) filter (where lower(status)='open'),0)::int as total
  from public."00_Open_Work"
),
tracking as (
  select date_trunc('month', min(occurred_at) at time zone 'America/New_York')::date as first_month
  from public.user_events where event_name='app_opened' and lower(platform) in ('ios','android')
),
months as (
  select
    generate_series(
      least(date '2026-06-01', (select current_month_local::date from clock) - interval '11 months'),
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
  where occurred_at >= (date '2026-06-01'::timestamp at time zone 'America/New_York')
  group by 1
),
monthly_ratings as (
  select
    date_trunc('month', created_at at time zone 'America/New_York')::date as month_start,
    count(*)::int as wing_ratings
  from public.destination_ratings
  where created_at >= (date '2026-06-01'::timestamp at time zone 'America/New_York')
  group by 1
),
monthly_accounts as (
  select
    date_trunc('month', created_at at time zone 'America/New_York')::date as month_start,
    count(*)::int as new_accounts
  from public.users
  where created_at >= (date '2026-06-01'::timestamp at time zone 'America/New_York')
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
)
select payload from monthly_history;
$function$;
revoke all on function public.buffago_growth_monthly_chart_history() from public,anon,authenticated;
grant execute on function public.buffago_growth_monthly_chart_history() to service_role;

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
  from buffago_growth_internal.external_mobile_opens
  where event_name = 'app_opened'
    and lower(platform) in ('ios','android')
),
device_windows as (
  select distinct on (w.name,e.anonymous_id) w.name,e.anonymous_id,e.platform
  from (values ('all_time',null::timestamptz,null::timestamptz),
    ('last_24h',now()-interval '24 hours',now()),
    ('previous_24h',now()-interval '48 hours',now()-interval '24 hours')) w(name,starts_at,ends_at)
  join mobile_events e on (w.starts_at is null or e.occurred_at>=w.starts_at)
    and (w.ends_at is null or e.occurred_at<w.ends_at)
  where e.anonymous_id is not null
  order by w.name,e.anonymous_id,e.occurred_at desc,e.platform desc
), device_counts as (
  select jsonb_object_agg(name,payload) payload from (
    select w.name,jsonb_build_object('total',count(d.anonymous_id),
      'ios',count(d.anonymous_id) filter(where d.platform='ios'),
      'android',count(d.anonymous_id) filter(where d.platform='android')) payload
    from (values ('all_time'),('last_24h'),('previous_24h')) w(name)
    left join device_windows d using(name) group by w.name
  ) windows
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
    'accounts', (select count(*)::int from public.users),
    'users_created', (select count(*)::int from public.users)
  ) as payload
),
open_work as (
  select coalesce(sum(coalesce(item_count,0)) filter (where lower(status)='open'),0)::int as total
  from public."00_Open_Work"
),
tracking as (
  select date_trunc('month', min(occurred_at) at time zone 'America/New_York')::date as first_month
  from public.user_events where event_name='app_opened' and lower(platform) in ('ios','android')
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
    'monthly_history', public.buffago_growth_monthly_chart_history(),
    'catalog_health', public.buffago_growth_catalog_health(),
    'open_work', jsonb_build_object('total', (select total from open_work))
  ),
  'marketing', (select payload from marketing)
);
$function$;

create or replace function public.buffago_growth_recent_activity()
returns jsonb language sql stable security invoker set search_path='' as $$
with latest as (
 select e.user_id,max(e.occurred_at) occurred_at from public.user_events e
 where e.event_name='app_opened' and e.user_id is not null
 and not exists(select 1 from buffago_growth_internal.excluded_users u where u.id=e.user_id)
 group by e.user_id
), logins as (
 select l.user_id,l.occurred_at,coalesce(
   nullif(btrim(u.display_name),''),nullif(btrim(u.username),''),'User '||left(l.user_id::text,8)) display_name
 from latest l left join public.users u on u.user_id=l.user_id
 order by l.occurred_at desc,l.user_id limit 10
), safe_logins as (
 select user_id,occurred_at,case when display_name like '%@%' then 'User '||left(user_id::text,8)
 else left(display_name,80) end display_name from logins
), ratings as (
 select left(d.name,100) destination_name,left(d.city,60) city,r.created_at,r.id
 from public.destination_ratings r join public.destinations d on d.id=r.destination_id
 where not exists(select 1 from buffago_growth_internal.excluded_users u where u.id=r.user_id)
 order by r.created_at desc,r.id desc limit 10
)
select jsonb_build_object(
 'logins',coalesce((select jsonb_agg(jsonb_build_object('user_id',user_id,'display_name',display_name,'occurred_at',occurred_at)
 order by occurred_at desc,user_id) from safe_logins),'[]'::jsonb),
 'ratings',coalesce((select jsonb_agg(jsonb_build_object('destination_name',destination_name,'city',city,'created_at',created_at)
 order by created_at desc,id desc) from ratings),'[]'::jsonb));
$$;
revoke all on function public.buffago_growth_recent_activity() from public,anon,authenticated;
grant execute on function public.buffago_growth_recent_activity() to service_role;

create table if not exists public.buffago_growth_weekly_plans (
 week_start date primary key check(extract(isodow from week_start)=1),
 plan jsonb not null,created_at timestamptz not null default now()
);
alter table public.buffago_growth_weekly_plans enable row level security;
revoke all on public.buffago_growth_weekly_plans from public,anon,authenticated;
grant select,insert,update on public.buffago_growth_weekly_plans to service_role;

create or replace function public.buffago_growth_week_start(p_now timestamptz)
returns date language sql immutable set search_path='' as $$
 select date_trunc('week',p_now at time zone 'America/New_York')::date;
$$;

-- Pure deterministic selector: score factors summarize MAU/devices/ratings/accounts.
create or replace function public.buffago_growth_select_weekly_plan(p_week date,p_marketing jsonb,p_os jsonb,p_pulse jsonb)
returns jsonb language plpgsql immutable security invoker set search_path='' as $$
declare
 constraint_key text; goal text; step text; tactics text; result text; reason text;
 experiment jsonb := p_os->'current_experiment';
 insight text := nullif(p_os#>>'{marketing_insight,title}','');
begin
 select key into constraint_key from jsonb_each(coalesce(p_marketing->'factors','{}'::jsonb))
 where coalesce(case when jsonb_typeof(value)='object' then value->>'score' else value#>>'{}' end,'') ~ '^[0-9]+$'
 order by (case when jsonb_typeof(value)='object' then value->>'score' else value#>>'{}' end)::numeric,key limit 1;
 case constraint_key
 when 'acquisition' then
  goal := 'Acquire 3 qualified active users from one measurable channel.';
  step := 'Launch one tracked local acquisition test.';
  tactics := 'Choose one restaurant and one local audience. Share one creative with a tagged app link; record channel clicks and first opens. Keep the test to one channel.';
  result := '3 attributable or likely incremental mobile users; at least one repeat open. Compare with the pre-test baseline.';
 when 'mau' then
  goal := 'Bring 3 recent visitors back for a second app visit.';
  step := 'Invite recent visitors to one restaurant discovery challenge.';
  tactics := 'Use one existing opt-in community channel. Feature one verified restaurant and ask visitors to reopen Buffago, choose their next visit and return later this week.';
  result := '3 returning active users and at least one repeat open on a different day; compare with the prior week.';
 when 'engagement' then
  goal := 'Generate 3 new restaurant ratings from existing visitors.';
  step := 'Ask your community to rate their latest wing visit.';
  tactics := 'Feature one real restaurant in an existing community channel. Link to its destination and ask for honest ratings after a visit; check new ratings without assuming attribution.';
  result := '3 new destination ratings by Sunday; record the destination and compare with its pre-test count.';
 when 'account_growth' then
  goal := 'Convert 3 existing mobile visitors into new accounts.';
  step := 'Test one account-benefit message with current visitors.';
  tactics := 'Use one existing community channel to explain saving a wing history. Link to the app, invite account creation and record campaign clicks and new accounts.';
  result := '3 new public user profiles by Sunday; compare with the pre-test baseline and note attribution limits.';
 else
  goal := 'Establish a measurable external-user growth baseline.';
  step := 'Verify tracking with one external volunteer.';
  tactics := 'Confirm a mobile app open and a restaurant rating appear in the next snapshot. Record the baseline before selecting a campaign; keep founder devices excluded.';
  result := 'One verified external mobile open and rating, with a documented baseline.';
 end case;
 reason := case when constraint_key is null then 'Growth history is insufficient for a confident campaign choice.'
 else replace(constraint_key,'_',' ')||' is the weakest available Marketing Score factor.' end;
 if nullif(experiment->>'title','') is not null then
   tactics := tactics||' Align this test with the active experiment: '||left(experiment->>'title',100)||'.';
   reason := reason||' Continue the active experiment rather than splitting effort.';
 end if;
 if insight is not null then reason := reason||' Insight: '||left(insight,120)||'.'; end if;
 if coalesce((p_pulse#>>'{pending_photos,total}')::numeric,0)>0 then
   reason := reason||' Review pending photos before featuring community content.';
 elsif coalesce((p_pulse#>>'{open_work,total}')::numeric,0)>0 then
   reason := reason||' Clear any operational issue that blocks this test.';
 end if;
 return jsonb_build_object('week_start',p_week,'goal',goal,'next_step',step,'what_to_do',tactics,
  'expected_result',result,'timeline','Launch Monday. Check Wednesday. Review Sunday.','why',reason);
end;
$$;

create or replace function public.buffago_growth_weekly_goal()
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare
 week_key date := public.buffago_growth_week_start(now()); saved jsonb; data jsonb;
begin
 select plan into saved from public.buffago_growth_weekly_plans where week_start=week_key;
 if saved is not null then return saved; end if;
 data := public.buffago_growth_command_center_redesign();
 insert into public.buffago_growth_weekly_plans(week_start,plan)
 values(week_key,public.buffago_growth_select_weekly_plan(week_key,data->'marketing',
  public.get_buffago_growth_os_state(),public.buffago_product_pulse_operations()||(data->'product_pulse')))
 on conflict(week_start) do nothing;
 -- First committed plan wins concurrent refreshes. Explicit DB edits remain stable.
 select plan into saved from public.buffago_growth_weekly_plans where week_start=week_key;
 return saved;
end;
$$;
revoke all on function public.buffago_growth_week_start(timestamptz),
 public.buffago_growth_select_weekly_plan(date,jsonb,jsonb,jsonb),public.buffago_growth_weekly_goal() from public,anon,authenticated;
grant execute on function public.buffago_growth_week_start(timestamptz),
 public.buffago_growth_select_weekly_plan(date,jsonb,jsonb,jsonb),public.buffago_growth_weekly_goal() to service_role;

-- Patch deployed definitions in place: CREATE OR REPLACE retains owner and ACL.
-- The RPC must be VOLATILE because selecting a new week's plan persists it.
do $migration$
declare definition text; marker text := '''generated_at'', (select ts from clock),';
begin
 definition := pg_get_functiondef('public.get_buffago_growth_snapshot()'::regprocedure);
 if strpos(definition,'''marketing_weekly_goal''')=0 then
   if strpos(definition,marker)=0 then raise exception 'Unexpected deployed snapshot definition'; end if;
   definition := replace(definition,marker,marker||' ''recent_activity'', public.buffago_growth_recent_activity(), ''marketing_weekly_goal'', public.buffago_growth_weekly_goal(),');
 end if;
 definition := replace(definition,'from public.user_events','from buffago_growth_internal.external_mobile_opens');
 definition := replace(definition,'STABLE','VOLATILE');
 definition := replace(definition,'Distinct signed-in user_id or anonymous_id with app_opened in rolling 24h',
   'External mobile distinct coalesce(user_id, anonymous_id) app_opened in rolling 24h; internal users and historical devices excluded');
 execute definition;
 definition := pg_get_functiondef('public.get_buffago_growth_os_state()'::regprocedure);
 definition := replace(definition,'from public.user_events','from buffago_growth_internal.external_mobile_opens');
 definition := replace(definition,'''label'', ''Monthly Active Users''','''label'', ''Rolling 30-day MAU''');
 definition := replace(definition,'Distinct signed-in user_id or anonymous_id with app_opened in rolling 30 days',
   'External mobile distinct coalesce(user_id, anonymous_id) app_opened in rolling 30 days; internal users and historical devices excluded');
 execute definition;
end;
$migration$;

commit;
