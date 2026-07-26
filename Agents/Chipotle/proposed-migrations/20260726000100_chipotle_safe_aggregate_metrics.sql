-- PROPOSED ONLY — reviewed for production reconciliation on 2026-07-26.
-- Do not apply without database-owner approval. It creates read-only aggregate
-- RPCs and returns no email, user ID, session ID, token, metadata, or raw event.

begin;

create or replace function public.chipotle_auth_account_counts(p_start timestamptz, p_end timestamptz)
returns table (registered_users bigint, new_users bigint)
language sql
security definer
set search_path = auth, public, pg_temp
as $$
  select
    count(*)::bigint as registered_users,
    count(*) filter (
      where u.created_at >= p_start
        and u.created_at < p_end
    )::bigint as new_users
  from auth.users u;
$$;

create or replace function public.chipotle_activity_rollup(p_anchor_date date)
returns table (
  dau bigint,
  wau bigint,
  mau bigint,
  d1_eligible bigint,
  d1_returned bigint,
  d1_retention_ratio numeric,
  d7_eligible bigint,
  d7_returned bigint,
  d7_retention_ratio numeric,
  d30_eligible bigint,
  d30_returned bigint,
  d30_retention_ratio numeric
)
language sql
security definer
set search_path = public, pg_temp
as $$
  with activity as (
    -- Anonymous and signed-in IDs are converted to an internal key and never
    -- leave this function. Events lacking both identifiers are excluded.
    select (occurred_at at time zone 'America/New_York')::date as activity_date,
           coalesce('u:' || user_id::text, 'a:' || anonymous_id) as identity_key
    from public.user_events
    where occurred_at >= ((p_anchor_date - 30)::timestamp at time zone 'America/New_York')
      and occurred_at < ((p_anchor_date + 1)::timestamp at time zone 'America/New_York')
      and (user_id is not null or anonymous_id is not null)
    group by 1, 2
  ), counts as (
    select
      count(distinct identity_key) filter (where activity_date = p_anchor_date)::bigint as dau,
      count(distinct identity_key) filter (where activity_date between p_anchor_date - 6 and p_anchor_date)::bigint as wau,
      count(distinct identity_key) filter (where activity_date between p_anchor_date - 29 and p_anchor_date)::bigint as mau
    from activity
  ), retention as (
    select
      count(distinct identity_key) filter (where activity_date = p_anchor_date - 1)::bigint as d1_eligible,
      count(distinct identity_key) filter (where activity_date = p_anchor_date - 1 and identity_key in (select identity_key from activity where activity_date = p_anchor_date))::bigint as d1_returned,
      count(distinct identity_key) filter (where activity_date = p_anchor_date - 7)::bigint as d7_eligible,
      count(distinct identity_key) filter (where activity_date = p_anchor_date - 7 and identity_key in (select identity_key from activity where activity_date = p_anchor_date))::bigint as d7_returned,
      count(distinct identity_key) filter (where activity_date = p_anchor_date - 30)::bigint as d30_eligible,
      count(distinct identity_key) filter (where activity_date = p_anchor_date - 30 and identity_key in (select identity_key from activity where activity_date = p_anchor_date))::bigint as d30_returned
    from activity
  )
  select c.dau, c.wau, c.mau, r.d1_eligible, r.d1_returned,
         round(r.d1_returned::numeric / nullif(r.d1_eligible, 0), 4),
         r.d7_eligible, r.d7_returned,
         round(r.d7_returned::numeric / nullif(r.d7_eligible, 0), 4),
         r.d30_eligible, r.d30_returned,
         round(r.d30_returned::numeric / nullif(r.d30_eligible, 0), 4)
  from counts c cross join retention r;
$$;

revoke all on function public.chipotle_auth_account_counts(timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.chipotle_activity_rollup(date) from public, anon, authenticated;
grant execute on function public.chipotle_auth_account_counts(timestamptz, timestamptz) to service_role;
grant execute on function public.chipotle_activity_rollup(date) to service_role;

comment on function public.chipotle_auth_account_counts(timestamptz, timestamptz) is
  'Chipotle-only aggregate account counts. Returns counts; no auth user attributes.';
comment on function public.chipotle_activity_rollup(date) is
  'Chipotle-only aggregate DAU/WAU/MAU and D1/D7/D30 return counts/ratios. Returns no identities or raw events.';

commit;
