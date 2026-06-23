begin;

create extension if not exists pgcrypto;

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  addressee_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint friendships_no_self check (requester_id <> addressee_id)
);

create unique index if not exists friendships_unique_pair_idx
  on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index if not exists friendships_requester_status_idx
  on public.friendships (requester_id, status, created_at desc);
create index if not exists friendships_addressee_status_idx
  on public.friendships (addressee_id, status, created_at desc);
create index if not exists friendships_status_created_idx
  on public.friendships (status, created_at desc);

create table if not exists public.user_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint user_blocks_no_self check (blocker_id <> blocked_id)
);

create index if not exists user_blocks_blocked_idx
  on public.user_blocks (blocked_id, created_at desc);

create table if not exists public.social_activity_reads (
  user_id uuid primary key references auth.users(id) on delete cascade,
  friend_requests_seen_at timestamptz not null default 'epoch',
  friend_activity_seen_at timestamptz not null default 'epoch',
  updated_at timestamptz not null default now()
);

create index if not exists social_activity_reads_activity_idx
  on public.social_activity_reads (user_id, friend_activity_seen_at);

create table if not exists public.friend_invite_codes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  code uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now(),
  rotated_at timestamptz not null default now()
);

alter table public.friendships enable row level security;
alter table public.user_blocks enable row level security;
alter table public.social_activity_reads enable row level security;
alter table public.friend_invite_codes enable row level security;

drop policy if exists friendships_select_participant on public.friendships;
create policy friendships_select_participant
  on public.friendships for select to authenticated
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

drop policy if exists blocks_select_owner on public.user_blocks;
create policy blocks_select_owner
  on public.user_blocks for select to authenticated
  using (auth.uid() = blocker_id);

drop policy if exists social_reads_select_owner on public.social_activity_reads;
create policy social_reads_select_owner
  on public.social_activity_reads for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists invite_codes_select_owner on public.friend_invite_codes;
create policy invite_codes_select_owner
  on public.friend_invite_codes for select to authenticated
  using (auth.uid() = user_id);

revoke insert, update, delete on public.friendships from anon, authenticated;
revoke insert, update, delete on public.user_blocks from anon, authenticated;
revoke insert, update, delete on public.social_activity_reads from anon, authenticated;
revoke insert, update, delete on public.friend_invite_codes from anon, authenticated;
grant select on public.friendships, public.user_blocks, public.social_activity_reads, public.friend_invite_codes
  to authenticated;

create or replace function public.friend_pair_is_blocked(p_user_a uuid, p_user_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_blocks b
    where (b.blocker_id = p_user_a and b.blocked_id = p_user_b)
       or (b.blocker_id = p_user_b and b.blocked_id = p_user_a)
  );
$$;

create or replace function public.friend_relationship_status(p_target_user_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_row public.friendships%rowtype;
begin
  if v_me is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if p_target_user_id is null or p_target_user_id = v_me then return 'none'; end if;
  if not public.can_user_appear_socially(v_me) or not public.can_user_appear_socially(p_target_user_id) then
    return 'unavailable';
  end if;

  if public.friend_pair_is_blocked(v_me, p_target_user_id) then return 'blocked'; end if;

  select * into v_row
  from public.friendships
  where least(requester_id, addressee_id) = least(v_me, p_target_user_id)
    and greatest(requester_id, addressee_id) = greatest(v_me, p_target_user_id)
  limit 1;

  if not found then return 'none'; end if;
  if v_row.status = 'accepted' then return 'friends'; end if;
  if v_row.requester_id = v_me then return 'pending_sent'; end if;
  return 'pending_received';
end;
$$;

create or replace function public.search_users_for_friends(p_query text, p_limit integer default 20)
returns table (
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  relationship_status text
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_me uuid := auth.uid();
  v_query text := trim(coalesce(p_query, ''));
begin
  if v_me is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if length(v_query) < 2 then return; end if;
  if not public.can_user_appear_socially(v_me) then return; end if;

  return query
  select
    u.user_id,
    u.username,
    nullif(trim(coalesce(au.raw_user_meta_data ->> 'display_name', au.raw_user_meta_data ->> 'full_name')), ''),
    u.avatar_url,
    public.friend_relationship_status(u.user_id)
  from public.users u
  left join auth.users au on au.id = u.user_id
  where u.user_id <> v_me
    and public.can_user_appear_socially(u.user_id)
    and not public.friend_pair_is_blocked(v_me, u.user_id)
    and (
      u.username ilike '%' || replace(replace(v_query, '%', '\%'), '_', '\_') || '%' escape '\'
      or coalesce(au.raw_user_meta_data ->> 'display_name', au.raw_user_meta_data ->> 'full_name', '')
        ilike '%' || replace(replace(v_query, '%', '\%'), '_', '\_') || '%' escape '\'
      or (
        position('@' in v_query) > 1
        and lower(au.email) = lower(v_query)
      )
    )
  order by
    case when lower(u.username) = lower(v_query) then 0 else 1 end,
    u.username nulls last
  limit greatest(1, least(coalesce(p_limit, 20), 50));
end;
$$;

create or replace function public.get_safe_social_profile(p_target_user_id uuid)
returns table (
  user_id uuid,
  username text,
  avatar_url text
)
language sql
stable
security definer
set search_path = public
as $$
  select u.user_id, u.username, u.avatar_url
  from public.users u
  where u.user_id = p_target_user_id
    and auth.uid() is not null
    and (
      u.user_id = auth.uid()
      or (
        public.can_user_appear_socially(auth.uid())
        and public.can_user_appear_socially(u.user_id)
        and not public.friend_pair_is_blocked(auth.uid(), u.user_id)
      )
    );
$$;

create or replace function public.send_friend_request(p_target_user_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_existing public.friendships%rowtype;
begin
  if v_me is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if p_target_user_id is null or p_target_user_id = v_me then
    raise exception 'invalid_friend_target' using errcode = '22023';
  end if;
  if not public.can_user_appear_socially(v_me) or not public.can_user_appear_socially(p_target_user_id) then
    raise exception 'social_features_unavailable' using errcode = '42501';
  end if;
  if public.friend_pair_is_blocked(v_me, p_target_user_id) then
    raise exception 'friend_pair_blocked' using errcode = '42501';
  end if;

  select * into v_existing
  from public.friendships
  where least(requester_id, addressee_id) = least(v_me, p_target_user_id)
    and greatest(requester_id, addressee_id) = greatest(v_me, p_target_user_id)
  for update;

  if found then
    if v_existing.status = 'accepted' then return 'friends'; end if;
    if v_existing.requester_id = v_me then return 'pending_sent'; end if;

    update public.friendships
    set status = 'accepted', responded_at = now(), updated_at = now()
    where id = v_existing.id;
    return 'friends';
  end if;

  insert into public.friendships (requester_id, addressee_id)
  values (v_me, p_target_user_id);
  return 'pending_sent';
exception
  when unique_violation then
    return public.friend_relationship_status(p_target_user_id);
end;
$$;

create or replace function public.accept_friend_request(p_requester_user_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if not public.can_user_appear_socially(v_me)
     or not public.can_user_appear_socially(p_requester_user_id)
     or public.friend_pair_is_blocked(v_me, p_requester_user_id) then
    raise exception 'friend_request_unavailable' using errcode = '42501';
  end if;

  update public.friendships
  set status = 'accepted', responded_at = now(), updated_at = now()
  where requester_id = p_requester_user_id
    and addressee_id = v_me
    and status = 'pending';

  if not found then raise exception 'friend_request_not_pending' using errcode = 'P0002'; end if;
  return 'friends';
end;
$$;

create or replace function public.decline_friend_request(p_requester_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  delete from public.friendships
  where requester_id = p_requester_user_id and addressee_id = v_me and status = 'pending';
  if not found then raise exception 'friend_request_not_pending' using errcode = 'P0002'; end if;
  return true;
end;
$$;

create or replace function public.cancel_friend_request(p_addressee_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  delete from public.friendships
  where requester_id = v_me and addressee_id = p_addressee_user_id and status = 'pending';
  if not found then raise exception 'friend_request_not_pending' using errcode = 'P0002'; end if;
  return true;
end;
$$;

create or replace function public.remove_friend(p_friend_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  delete from public.friendships
  where status = 'accepted'
    and least(requester_id, addressee_id) = least(v_me, p_friend_user_id)
    and greatest(requester_id, addressee_id) = greatest(v_me, p_friend_user_id);
  if not found then raise exception 'friendship_not_found' using errcode = 'P0002'; end if;
  return true;
end;
$$;

create or replace function public.block_user(p_target_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if p_target_user_id is null or p_target_user_id = v_me then
    raise exception 'invalid_block_target' using errcode = '22023';
  end if;

  insert into public.user_blocks (blocker_id, blocked_id)
  values (v_me, p_target_user_id)
  on conflict do nothing;

  delete from public.friendships
  where least(requester_id, addressee_id) = least(v_me, p_target_user_id)
    and greatest(requester_id, addressee_id) = greatest(v_me, p_target_user_id);
  return true;
end;
$$;

create or replace function public.unblock_user(p_target_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  delete from public.user_blocks where blocker_id = v_me and blocked_id = p_target_user_id;
  return found;
end;
$$;

create or replace function public.get_friends()
returns table (
  user_id uuid,
  username text,
  avatar_url text,
  friends_since timestamptz,
  recent_rating_at timestamptz,
  recent_destination_name text,
  recent_weight_score numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with friend_ids as (
    select
      case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end as user_id,
      coalesce(f.responded_at, f.updated_at, f.created_at) as friends_since
    from public.friendships f
    where f.status = 'accepted'
      and (f.requester_id = auth.uid() or f.addressee_id = auth.uid())
  )
  select
    u.user_id,
    u.username,
    u.avatar_url,
    fi.friends_since,
    rr.created_at,
    rr.destination_name,
    rr.weight_score
  from friend_ids fi
  join public.users u on u.user_id = fi.user_id
  left join lateral (
    select dr.created_at, d.name as destination_name, dr.weight_score
    from public.destination_ratings dr
    join public.destinations d on d.id = dr.destination_id
    where dr.user_id = fi.user_id
    order by dr.created_at desc
    limit 1
  ) rr on true
  where public.can_user_appear_socially(auth.uid())
    and public.can_user_appear_socially(fi.user_id)
    and not public.friend_pair_is_blocked(auth.uid(), fi.user_id)
  order by coalesce(rr.created_at, fi.friends_since) desc;
$$;

create or replace function public.get_pending_friend_invites()
returns table (
  friendship_id uuid,
  direction text,
  user_id uuid,
  username text,
  avatar_url text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    f.id,
    case when f.addressee_id = auth.uid() then 'incoming' else 'outgoing' end,
    case when f.addressee_id = auth.uid() then f.requester_id else f.addressee_id end,
    u.username,
    u.avatar_url,
    f.created_at
  from public.friendships f
  join public.users u
    on u.user_id = case when f.addressee_id = auth.uid() then f.requester_id else f.addressee_id end
  where f.status = 'pending'
    and (f.requester_id = auth.uid() or f.addressee_id = auth.uid())
    and public.can_user_appear_socially(auth.uid())
    and public.can_user_appear_socially(u.user_id)
    and not public.friend_pair_is_blocked(auth.uid(), u.user_id)
  order by (f.addressee_id = auth.uid()) desc, f.created_at desc;
$$;

create or replace function public.get_blocked_users()
returns table (
  user_id uuid,
  username text,
  avatar_url text,
  blocked_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select u.user_id, u.username, u.avatar_url, b.created_at
  from public.user_blocks b
  left join public.users u on u.user_id = b.blocked_id
  where b.blocker_id = auth.uid()
  order by b.created_at desc;
$$;

create or replace function public.get_friends_feed(
  p_state_id integer default null,
  p_limit integer default 25,
  p_offset integer default 0
)
returns table (
  rating_id uuid,
  user_id uuid,
  username text,
  avatar_url text,
  destination_id uuid,
  destination_name text,
  destination_city text,
  destination_state_id integer,
  weight_score numeric,
  created_at timestamptz,
  is_buffacoin boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with allowed_users as (
    select auth.uid() as user_id
    union
    select case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end
    from public.friendships f
    where f.status = 'accepted'
      and (f.requester_id = auth.uid() or f.addressee_id = auth.uid())
  )
  select
    dr.id,
    dr.user_id,
    u.username,
    u.avatar_url,
    d.id,
    d.name,
    d.city,
    d.state_id,
    dr.weight_score,
    dr.created_at,
    coalesce(dr.is_buffacoin, false)
  from public.destination_ratings dr
  join allowed_users au on au.user_id = dr.user_id
  join public.users u on u.user_id = dr.user_id
  join public.destinations d on d.id = dr.destination_id
  where auth.uid() is not null
    and public.can_user_appear_socially(auth.uid())
    and public.can_user_appear_socially(dr.user_id)
    and not public.friend_pair_is_blocked(auth.uid(), dr.user_id)
    and (p_state_id is null or d.state_id = p_state_id)
  order by dr.created_at desc
  limit greatest(1, least(coalesce(p_limit, 25), 100))
  offset greatest(coalesce(p_offset, 0), 0);
$$;

create or replace function public.get_friends_leaderboard(p_state_id integer default null)
returns table (
  rating_id uuid,
  user_id uuid,
  username text,
  avatar_url text,
  xp integer,
  destination_id uuid,
  destination_state_id integer,
  weight_score numeric,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with allowed_users as (
    select auth.uid() as user_id
    union
    select case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end
    from public.friendships f
    where f.status = 'accepted'
      and (f.requester_id = auth.uid() or f.addressee_id = auth.uid())
  )
  select
    dr.id,
    dr.user_id,
    u.username,
    u.avatar_url,
    coalesce(u.xp, 0),
    dr.destination_id,
    d.state_id,
    dr.weight_score,
    dr.created_at
  from public.destination_ratings dr
  join allowed_users au on au.user_id = dr.user_id
  join public.users u on u.user_id = dr.user_id
  join public.destinations d on d.id = dr.destination_id
  where auth.uid() is not null
    and public.can_user_appear_socially(auth.uid())
    and public.can_user_appear_socially(dr.user_id)
    and not public.friend_pair_is_blocked(auth.uid(), dr.user_id)
    and (p_state_id is null or d.state_id = p_state_id)
  order by dr.created_at desc;
$$;

create or replace function public.get_social_badge_counts()
returns table (
  pending_invites bigint,
  unseen_friend_activity bigint,
  total bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with reads as (
    select
      coalesce(s.friend_requests_seen_at, 'epoch'::timestamptz) as requests_seen,
      coalesce(s.friend_activity_seen_at, 'epoch'::timestamptz) as activity_seen
    from (select 1) seed
    left join public.social_activity_reads s on s.user_id = auth.uid()
  ),
  pending as (
    select count(*)::bigint as n
    from public.friendships f, reads r
    where f.addressee_id = auth.uid()
      and f.status = 'pending'
      and f.created_at > r.requests_seen
      and public.can_user_appear_socially(f.requester_id)
      and not public.friend_pair_is_blocked(auth.uid(), f.requester_id)
  ),
  friend_ids as (
    select case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end as user_id
    from public.friendships f
    where f.status = 'accepted'
      and (f.requester_id = auth.uid() or f.addressee_id = auth.uid())
  ),
  activity as (
    select count(distinct dr.id)::bigint as n
    from public.destination_ratings dr
    join friend_ids fi on fi.user_id = dr.user_id
    cross join reads r
    where dr.created_at > r.activity_seen
      and public.can_user_appear_socially(dr.user_id)
      and not public.friend_pair_is_blocked(auth.uid(), dr.user_id)
  )
  select pending.n, activity.n, pending.n + activity.n
  from pending, activity;
$$;

create or replace function public.mark_friend_activity_seen(p_kind text default 'activity')
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if p_kind not in ('activity', 'requests', 'all') then
    raise exception 'invalid_seen_kind' using errcode = '22023';
  end if;

  insert into public.social_activity_reads (
    user_id,
    friend_requests_seen_at,
    friend_activity_seen_at,
    updated_at
  )
  values (
    v_me,
    case when p_kind in ('requests', 'all') then now() else 'epoch'::timestamptz end,
    case when p_kind in ('activity', 'all') then now() else 'epoch'::timestamptz end,
    now()
  )
  on conflict (user_id) do update
  set friend_requests_seen_at =
        case when p_kind in ('requests', 'all') then now()
             else social_activity_reads.friend_requests_seen_at end,
      friend_activity_seen_at =
        case when p_kind in ('activity', 'all') then now()
             else social_activity_reads.friend_activity_seen_at end,
      updated_at = now();
  return true;
end;
$$;

create or replace function public.get_friend_invite_code(p_rotate boolean default false)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_code uuid;
begin
  if v_me is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if not public.can_user_appear_socially(v_me) then
    raise exception 'social_features_unavailable' using errcode = '42501';
  end if;

  insert into public.friend_invite_codes (user_id)
  values (v_me)
  on conflict (user_id) do update
  set code = case when p_rotate then gen_random_uuid() else friend_invite_codes.code end,
      rotated_at = case when p_rotate then now() else friend_invite_codes.rotated_at end
  returning code into v_code;
  return v_code;
end;
$$;

create or replace function public.resolve_friend_invite_code(p_code uuid)
returns table (
  user_id uuid,
  username text,
  avatar_url text,
  relationship_status text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    u.user_id,
    u.username,
    u.avatar_url,
    public.friend_relationship_status(u.user_id)
  from public.friend_invite_codes c
  join public.users u on u.user_id = c.user_id
  where c.code = p_code
    and c.user_id <> auth.uid()
    and public.can_user_appear_socially(auth.uid())
    and public.can_user_appear_socially(c.user_id)
    and not public.friend_pair_is_blocked(auth.uid(), c.user_id);
$$;

revoke all on function public.friend_pair_is_blocked(uuid, uuid) from public, anon;
revoke all on function public.friend_relationship_status(uuid) from public, anon;
revoke all on function public.search_users_for_friends(text, integer) from public, anon;
revoke all on function public.get_safe_social_profile(uuid) from public, anon;
revoke all on function public.send_friend_request(uuid) from public, anon;
revoke all on function public.accept_friend_request(uuid) from public, anon;
revoke all on function public.decline_friend_request(uuid) from public, anon;
revoke all on function public.cancel_friend_request(uuid) from public, anon;
revoke all on function public.remove_friend(uuid) from public, anon;
revoke all on function public.block_user(uuid) from public, anon;
revoke all on function public.unblock_user(uuid) from public, anon;
revoke all on function public.get_friends() from public, anon;
revoke all on function public.get_pending_friend_invites() from public, anon;
revoke all on function public.get_blocked_users() from public, anon;
revoke all on function public.get_friends_feed(integer, integer, integer) from public, anon;
revoke all on function public.get_friends_leaderboard(integer) from public, anon;
revoke all on function public.get_social_badge_counts() from public, anon;
revoke all on function public.mark_friend_activity_seen(text) from public, anon;
revoke all on function public.get_friend_invite_code(boolean) from public, anon;
revoke all on function public.resolve_friend_invite_code(uuid) from public, anon;
grant execute on function public.friend_pair_is_blocked(uuid, uuid) to authenticated;
grant execute on function public.friend_relationship_status(uuid) to authenticated;
grant execute on function public.search_users_for_friends(text, integer) to authenticated;
grant execute on function public.get_safe_social_profile(uuid) to authenticated;
grant execute on function public.send_friend_request(uuid) to authenticated;
grant execute on function public.accept_friend_request(uuid) to authenticated;
grant execute on function public.decline_friend_request(uuid) to authenticated;
grant execute on function public.cancel_friend_request(uuid) to authenticated;
grant execute on function public.remove_friend(uuid) to authenticated;
grant execute on function public.block_user(uuid) to authenticated;
grant execute on function public.unblock_user(uuid) to authenticated;
grant execute on function public.get_friends() to authenticated;
grant execute on function public.get_pending_friend_invites() to authenticated;
grant execute on function public.get_blocked_users() to authenticated;
grant execute on function public.get_friends_feed(integer, integer, integer) to authenticated;
grant execute on function public.get_friends_leaderboard(integer) to authenticated;
grant execute on function public.get_social_badge_counts() to authenticated;
grant execute on function public.mark_friend_activity_seen(text) to authenticated;
grant execute on function public.get_friend_invite_code(boolean) to authenticated;
grant execute on function public.resolve_friend_invite_code(uuid) to authenticated;

commit;
