alter table public.users
  add column if not exists social_opt_out boolean not null default false;

comment on column public.users.social_opt_out is
  'When true, the user is hidden from public social feeds, friend discovery, and leaderboards. Ratings still count toward restaurant aggregates.';

create or replace function public.can_user_appear_socially(user_id uuid)
returns boolean
language sql
stable
as $$
  select coalesce(
    (
      select not u.social_opt_out
      from public.users u
      where u.user_id = $1
    ),
    false
  );
$$;

create or replace view public.socially_visible_users as
select
  u.user_id,
  u.username,
  u.avatar_url,
  u.created_at,
  u.xp,
  u.facebook_connected,
  u.facebook_connected_at
from public.users u
where public.can_user_appear_socially(u.user_id);

create or replace view public.socially_visible_destination_ratings as
select dr.*
from public.destination_ratings dr
where dr.user_id is not null
  and public.can_user_appear_socially(dr.user_id);

create or replace view public.socially_visible_crawls as
select c.*
from public.crawls c
where c.user_id is not null
  and public.can_user_appear_socially(c.user_id);

create or replace view public.v_social_feed as
select
  dr.user_id,
  dr.weight_score,
  dr.created_at,
  d.id as destination_id,
  d.name as destination_name,
  d.city as destination_city,
  d.state_id as destination_state_id,
  u.username
from public.destination_ratings dr
join public.destinations d on d.id = dr.destination_id
join public.users u on u.user_id = dr.user_id
where public.can_user_appear_socially(dr.user_id);

create or replace view public.analytics_social_opt_out_summary as
select
  count(*)::bigint as total_users,
  count(*) filter (where social_opt_out)::bigint as total_users_opted_out,
  round(
    count(*) filter (where social_opt_out)::numeric / nullif(count(*), 0),
    4
  ) as opt_out_rate
from public.users;

create or replace view public.analytics_social_opt_out_by_account_age as
select
  case
    when created_at >= now() - interval '7 days' then '0_7_days'
    when created_at >= now() - interval '30 days' then '8_30_days'
    when created_at >= now() - interval '90 days' then '31_90_days'
    else '91_plus_days'
  end as account_age_bucket,
  count(*)::bigint as total_users,
  count(*) filter (where social_opt_out)::bigint as total_users_opted_out,
  round(
    count(*) filter (where social_opt_out)::numeric / nullif(count(*), 0),
    4
  ) as opt_out_rate
from public.users
group by 1;

create or replace view public.analytics_social_opt_out_by_facebook_link as
select
  facebook_connected,
  count(*)::bigint as total_users,
  count(*) filter (where social_opt_out)::bigint as total_users_opted_out,
  round(
    count(*) filter (where social_opt_out)::numeric / nullif(count(*), 0),
    4
  ) as opt_out_rate
from public.users
group by facebook_connected;

grant execute on function public.can_user_appear_socially(uuid) to anon, authenticated;

grant select on
  public.v_social_feed,
  public.socially_visible_users,
  public.socially_visible_destination_ratings,
  public.socially_visible_crawls,
  public.analytics_social_opt_out_summary,
  public.analytics_social_opt_out_by_account_age,
  public.analytics_social_opt_out_by_facebook_link
to anon, authenticated;
