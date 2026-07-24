-- Daily engagement and push foundation.
-- Additive and reversible. Existing streak, mission, XP, friendship, rating, and crawl
-- rows are not rewritten. Background proximity remains disabled by feature flag.

begin;

create table if not exists public.engagement_timezone_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  effective_timezone text not null default 'UTC',
  pending_timezone text,
  pending_since timestamptz,
  last_changed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.daily_engagement_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  local_date date not null,
  timezone text not null,
  checked_at timestamptz not null default now(),
  qualified_at timestamptz,
  qualifying_action_type text,
  qualifying_action_ref text,
  unique (user_id, local_date)
);

create table if not exists public.push_installations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  installation_id text not null check (char_length(installation_id) between 16 and 160),
  expo_push_token text,
  token_fingerprint text,
  platform text not null check (platform in ('ios', 'android')),
  app_version text,
  locale text,
  timezone text not null default 'UTC',
  permission_status text not null default 'undetermined'
    check (permission_status in ('undetermined', 'granted', 'denied', 'provisional')),
  last_seen_at timestamptz not null default now(),
  token_created_at timestamptz,
  last_delivery_succeeded_at timestamptz,
  invalidated_at timestamptz,
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, installation_id)
);
create unique index if not exists push_installations_active_token_idx
  on public.push_installations(expo_push_token)
  where expo_push_token is not null and invalidated_at is null;
create index if not exists push_installations_delivery_idx
  on public.push_installations(user_id, last_seen_at desc)
  where permission_status in ('granted', 'provisional')
    and invalidated_at is null and disabled_at is null;

create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  daily_streak_reminders boolean not null default false,
  streak_at_risk boolean not null default false,
  comeback boolean not null default false,
  friend_activity boolean not null default false,
  crawl_proximity boolean not null default false,
  product_announcements boolean not null default false,
  quiet_hours_enabled boolean not null default true,
  quiet_start time not null default '22:00',
  quiet_end time not null default '08:00',
  reminder_local_time time not null default '18:30',
  timezone text not null default 'UTC',
  updated_at timestamptz not null default now()
);

create table if not exists public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in (
    'streak_at_risk', 'streak_comeback', 'friend_rating', 'crawl_proximity'
  )),
  source_entity_type text not null,
  source_entity_id text not null,
  deduplication_key text not null,
  eligible_at timestamptz not null default now(),
  expires_at timestamptz,
  status text not null default 'queued' check (status in (
    'queued', 'processing', 'sent', 'suppressed', 'retry', 'failed', 'cancelled'
  )),
  suppression_reason text,
  failure_code text,
  retry_count integer not null default 0 check (retry_count between 0 and 12),
  next_attempt_at timestamptz not null default now(),
  sent_at timestamptz,
  deep_link text not null,
  fallback_route text not null default '/(tabs)/home',
  copy_data jsonb not null default '{}'::jsonb,
  correlation_id uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, event_type, deduplication_key)
);
create index if not exists notification_outbox_dispatch_idx
  on public.notification_outbox(next_attempt_at, eligible_at)
  where status in ('queued', 'retry');

create table if not exists public.notification_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  outbox_id uuid not null references public.notification_outbox(id) on delete cascade,
  installation_id uuid references public.push_installations(id) on delete set null,
  attempt_number integer not null check (attempt_number > 0),
  provider text not null default 'expo',
  provider_ticket_id text,
  status text not null check (status in ('submitted', 'succeeded', 'retryable_failure', 'permanent_failure')),
  failure_code text,
  attempted_at timestamptz not null default now(),
  unique (outbox_id, installation_id, attempt_number)
);

create table if not exists public.crawl_proximity_receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  crawl_id uuid not null,
  destination_id uuid not null,
  installation_id text not null,
  entered_at timestamptz not null default now(),
  accuracy_class text not null check (accuracy_class in ('precise', 'approximate', 'unknown')),
  notified_at timestamptz,
  deduplication_key text not null unique,
  created_at timestamptz not null default now()
);
create index if not exists crawl_proximity_user_time_idx
  on public.crawl_proximity_receipts(user_id, entered_at desc);

create table if not exists public.engagement_feature_flags (
  flag_key text primary key check (flag_key ~ '^[a-z0-9_]+$'),
  enabled boolean not null default false,
  rollout_percent integer not null default 0 check (rollout_percent between 0 and 100),
  updated_at timestamptz not null default now()
);
insert into public.engagement_feature_flags(flag_key, enabled, rollout_percent) values
  ('new_daily_engagement', false, 0),
  ('daily_reward_ui', false, 0),
  ('streak_at_risk_push', false, 0),
  ('comeback_push', false, 0),
  ('friend_rating_push', false, 0),
  ('crawl_proximity_push', false, 0),
  ('background_geofencing', false, 0),
  ('notification_settings', false, 0)
on conflict (flag_key) do nothing;

alter table public.engagement_timezone_state enable row level security;
alter table public.daily_engagement_checks enable row level security;
alter table public.push_installations enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.notification_outbox enable row level security;
alter table public.notification_delivery_attempts enable row level security;
alter table public.crawl_proximity_receipts enable row level security;
alter table public.engagement_feature_flags enable row level security;

revoke all on public.engagement_timezone_state, public.daily_engagement_checks,
  public.push_installations, public.notification_preferences, public.notification_outbox,
  public.notification_delivery_attempts, public.crawl_proximity_receipts,
  public.engagement_feature_flags from anon, authenticated;
grant select on public.engagement_timezone_state, public.daily_engagement_checks,
  public.push_installations, public.notification_preferences, public.notification_outbox,
  public.crawl_proximity_receipts, public.engagement_feature_flags to authenticated;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='engagement_timezone_state' and policyname='engagement_timezone_own_read') then
    create policy engagement_timezone_own_read on public.engagement_timezone_state for select to authenticated using (user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='daily_engagement_checks' and policyname='daily_engagement_checks_own_read') then
    create policy daily_engagement_checks_own_read on public.daily_engagement_checks for select to authenticated using (user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='push_installations' and policyname='push_installations_own_read') then
    create policy push_installations_own_read on public.push_installations for select to authenticated using (user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='notification_preferences' and policyname='notification_preferences_own_read') then
    create policy notification_preferences_own_read on public.notification_preferences for select to authenticated using (user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='notification_outbox' and policyname='notification_outbox_own_read') then
    create policy notification_outbox_own_read on public.notification_outbox for select to authenticated using (user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='crawl_proximity_receipts' and policyname='crawl_proximity_own_read') then
    create policy crawl_proximity_own_read on public.crawl_proximity_receipts for select to authenticated using (user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='engagement_feature_flags' and policyname='engagement_flags_authenticated_read') then
    create policy engagement_flags_authenticated_read on public.engagement_feature_flags for select to authenticated using (true);
  end if;
end $$;

create or replace function public.resolve_engagement_timezone(p_reported_timezone text default 'UTC')
returns text language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_reported text := public.engagement_safe_timezone(p_reported_timezone);
  v_state public.engagement_timezone_state%rowtype;
begin
  if v_user is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  insert into public.engagement_timezone_state(user_id, effective_timezone)
  values (v_user, v_reported) on conflict (user_id) do nothing;
  select * into v_state from public.engagement_timezone_state where user_id = v_user for update;

  if v_reported = v_state.effective_timezone then
    if v_state.pending_timezone is not null then
      update public.engagement_timezone_state
        set pending_timezone = null, pending_since = null, updated_at = now()
      where user_id = v_user;
    end if;
    return v_state.effective_timezone;
  end if;

  if v_state.pending_timezone is distinct from v_reported then
    update public.engagement_timezone_state
      set pending_timezone = v_reported, pending_since = now(), updated_at = now()
    where user_id = v_user;
    return v_state.effective_timezone;
  end if;

  -- A timezone must remain consistently reported for 24 hours. This supports travel
  -- while preventing repeated timezone flips from minting extra local days.
  if v_state.pending_since <= now() - interval '24 hours'
     and v_state.last_changed_at <= now() - interval '24 hours' then
    update public.engagement_timezone_state
      set effective_timezone = v_reported, pending_timezone = null, pending_since = null,
          last_changed_at = now(), updated_at = now()
    where user_id = v_user;
    return v_reported;
  end if;
  return v_state.effective_timezone;
end;
$$;

create or replace function public.check_daily_engagement(p_reported_timezone text default 'UTC')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_timezone text := public.resolve_engagement_timezone(p_reported_timezone);
  v_today date := (now() at time zone v_timezone)::date;
  v_check public.daily_engagement_checks%rowtype;
  v_streak public.user_engagement_streaks%rowtype;
begin
  insert into public.daily_engagement_checks(user_id, local_date, timezone)
  values (v_user, v_today, v_timezone)
  on conflict (user_id, local_date) do update set checked_at = excluded.checked_at
  returning * into v_check;
  select * into v_streak from public.user_engagement_streaks where user_id = v_user;
  return jsonb_build_object(
    'server_time', now(), 'local_date', v_today, 'timezone', v_timezone,
    'qualified_today', coalesce(v_streak.last_qualified_date = v_today, false),
    'current_streak', coalesce(v_streak.current_streak, 0),
    'longest_streak', coalesce(v_streak.longest_streak, 0),
    'next_eligible_at', ((v_today + 1)::timestamp at time zone v_timezone)
  );
end;
$$;

create or replace function public.register_push_installation(
  p_installation_id text,
  p_expo_push_token text,
  p_platform text,
  p_app_version text,
  p_locale text,
  p_timezone text,
  p_permission_status text
) returns public.push_installations
language plpgsql security definer set search_path = public as $$
declare v_result public.push_installations;
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if p_platform not in ('ios', 'android') then raise exception 'invalid_platform'; end if;
  if p_permission_status not in ('undetermined','granted','denied','provisional')
    then raise exception 'invalid_permission_status'; end if;
  insert into public.push_installations(
    user_id, installation_id, expo_push_token, token_fingerprint, platform,
    app_version, locale, timezone, permission_status, token_created_at,
    invalidated_at, disabled_at
  ) values (
    auth.uid(), p_installation_id, nullif(p_expo_push_token, ''),
    case when nullif(p_expo_push_token, '') is null then null
      else encode(sha256(convert_to(p_expo_push_token, 'UTF8')), 'hex') end,
    p_platform, left(p_app_version, 40), left(p_locale, 40),
    public.engagement_safe_timezone(p_timezone), p_permission_status,
    case when nullif(p_expo_push_token, '') is null then null else now() end,
    null, case when p_permission_status in ('granted','provisional') then null else now() end
  ) on conflict (user_id, installation_id) do update set
    expo_push_token = excluded.expo_push_token,
    token_fingerprint = excluded.token_fingerprint,
    platform = excluded.platform, app_version = excluded.app_version,
    locale = excluded.locale, timezone = excluded.timezone,
    permission_status = excluded.permission_status, last_seen_at = now(),
    token_created_at = case when push_installations.expo_push_token is distinct from excluded.expo_push_token
      then excluded.token_created_at else push_installations.token_created_at end,
    invalidated_at = null, disabled_at = excluded.disabled_at, updated_at = now()
  returning * into v_result;
  return v_result;
end;
$$;

create or replace function public.update_notification_preferences(
  p_daily_streak_reminders boolean,
  p_streak_at_risk boolean,
  p_comeback boolean,
  p_friend_activity boolean,
  p_crawl_proximity boolean,
  p_product_announcements boolean,
  p_quiet_hours_enabled boolean,
  p_quiet_start time,
  p_quiet_end time,
  p_reminder_local_time time,
  p_timezone text
) returns public.notification_preferences
language plpgsql security definer set search_path = public as $$
declare v_result public.notification_preferences;
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  insert into public.notification_preferences values (
    auth.uid(), p_daily_streak_reminders, p_streak_at_risk, p_comeback,
    p_friend_activity, p_crawl_proximity, p_product_announcements,
    p_quiet_hours_enabled, coalesce(p_quiet_start, '22:00'),
    coalesce(p_quiet_end, '08:00'), coalesce(p_reminder_local_time, '18:30'),
    public.engagement_safe_timezone(p_timezone), now()
  ) on conflict (user_id) do update set
    daily_streak_reminders = excluded.daily_streak_reminders,
    streak_at_risk = excluded.streak_at_risk, comeback = excluded.comeback,
    friend_activity = excluded.friend_activity, crawl_proximity = excluded.crawl_proximity,
    product_announcements = excluded.product_announcements,
    quiet_hours_enabled = excluded.quiet_hours_enabled,
    quiet_start = excluded.quiet_start, quiet_end = excluded.quiet_end,
    reminder_local_time = excluded.reminder_local_time,
    timezone = excluded.timezone, updated_at = now()
  returning * into v_result;
  return v_result;
end;
$$;

create or replace function public.enqueue_friend_rating_notification()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.can_user_appear_socially(new.user_id) then return new; end if;
  insert into public.notification_outbox(
    user_id, event_type, source_entity_type, source_entity_id, deduplication_key,
    deep_link, fallback_route, copy_data, expires_at
  )
  select
    case when f.requester_id = new.user_id then f.addressee_id else f.requester_id end,
    'friend_rating', 'destination_rating', new.id::text, 'rating:' || new.id::text,
    'buffago://rating/' || new.id::text, '/(tabs)/home',
    jsonb_build_object('actor_id', new.user_id, 'rating_id', new.id,
      'destination_id', new.destination_id),
    now() + interval '3 days'
  from public.friendships f
  join public.notification_preferences np
    on np.user_id = case when f.requester_id = new.user_id then f.addressee_id else f.requester_id end
   and np.friend_activity
  join public.engagement_feature_flags flag
    on flag.flag_key = 'friend_rating_push' and flag.enabled
  where f.status = 'accepted'
    and new.user_id in (f.requester_id, f.addressee_id)
    and not public.friend_pair_is_blocked(f.requester_id, f.addressee_id)
  on conflict (user_id, event_type, deduplication_key) do nothing;
  return new;
end;
$$;
do $$ begin
  if not exists (select 1 from pg_trigger where tgrelid='public.destination_ratings'::regclass and tgname='destination_rating_friend_notification') then
    create trigger destination_rating_friend_notification
      after insert on public.destination_ratings for each row
      execute function public.enqueue_friend_rating_notification();
  end if;
end $$;

create or replace function public.record_crawl_proximity(
  p_crawl_id uuid,
  p_destination_id uuid,
  p_installation_id text,
  p_accuracy_class text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_key text;
  v_allowed boolean := false;
  v_outbox_count integer := 0;
begin
  if p_accuracy_class not in ('precise','approximate','unknown') then
    raise exception 'invalid_accuracy_class';
  end if;
  select exists(
    select 1 from public.crawls c
    join public.routes r on r.id = c.route_id
    where c.crawl_id = p_crawl_id and c.user_id = v_user
      and c.status not in ('completed','abandoned','cancelled')
      and p_destination_id in (r.stop1_id,r.stop2_id,r.stop3_id,r.stop4_id,r.stop5_id)
  ) into v_allowed;
  if not v_allowed then raise exception 'crawl_proximity_ineligible' using errcode = '42501'; end if;
  if p_accuracy_class <> 'precise' then
    return jsonb_build_object('queued', false, 'reason', 'location_accuracy_insufficient');
  end if;
  if exists(select 1 from public.crawl_proximity_receipts
    where user_id = v_user and destination_id = p_destination_id
      and entered_at > now() - interval '24 hours') then
    return jsonb_build_object('queued', false, 'reason', 'location_cooldown');
  end if;
  if exists(select 1 from public.crawl_proximity_receipts
    where user_id = v_user and entered_at > now() - interval '4 hours') then
    return jsonb_build_object('queued', false, 'reason', 'global_cooldown');
  end if;
  v_key := 'crawl:' || p_crawl_id::text || ':destination:' || p_destination_id::text ||
    ':day:' || (now() at time zone 'UTC')::date::text;
  insert into public.crawl_proximity_receipts(
    user_id,crawl_id,destination_id,installation_id,accuracy_class,deduplication_key
  ) values (v_user,p_crawl_id,p_destination_id,p_installation_id,p_accuracy_class,v_key)
  on conflict (deduplication_key) do nothing;
  insert into public.notification_outbox(
    user_id,event_type,source_entity_type,source_entity_id,deduplication_key,
    deep_link,fallback_route,copy_data,expires_at
  ) select v_user,'crawl_proximity','crawl',p_crawl_id::text,v_key,
    'buffago://crawl/' || p_crawl_id::text || '?destination=' || p_destination_id::text,
    '/(tabs)/home',jsonb_build_object('crawl_id',p_crawl_id,'destination_id',p_destination_id),
    now() + interval '2 hours'
  from public.notification_preferences np
  join public.engagement_feature_flags flag
    on flag.flag_key = 'crawl_proximity_push' and flag.enabled
  where np.user_id = v_user and np.crawl_proximity
  on conflict (user_id,event_type,deduplication_key) do nothing;
  get diagnostics v_outbox_count = row_count;
  return jsonb_build_object(
    'queued', v_outbox_count = 1,
    'reason', case when v_outbox_count = 1 then 'queued' else 'preference_or_flag_disabled' end,
    'deduplication_key', v_key
  );
end;
$$;

create or replace function public.notification_delivery_eligibility(p_outbox_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_event public.notification_outbox%rowtype;
  v_pref public.notification_preferences%rowtype;
  v_local_time time;
  v_enabled boolean := false;
  v_valid boolean := true;
  v_actor uuid;
begin
  -- Service-role-only delivery authorization. Client roles are revoked below.
  select * into v_event from public.notification_outbox where id = p_outbox_id;
  if not found or v_event.status not in ('queued','retry','processing') then
    return jsonb_build_object('eligible',false,'reason','event_unavailable');
  end if;
  select * into v_pref from public.notification_preferences where user_id = v_event.user_id;
  if not found then return jsonb_build_object('eligible',false,'reason','preference_missing'); end if;
  v_enabled := case v_event.event_type
    when 'streak_at_risk' then v_pref.streak_at_risk
    when 'streak_comeback' then v_pref.comeback
    when 'friend_rating' then v_pref.friend_activity
    when 'crawl_proximity' then v_pref.crawl_proximity
    else false end;
  if not v_enabled then return jsonb_build_object('eligible',false,'reason','category_disabled'); end if;

  v_local_time := (now() at time zone public.engagement_safe_timezone(v_pref.timezone))::time;
  if v_pref.quiet_hours_enabled and (
    (v_pref.quiet_start < v_pref.quiet_end and v_local_time >= v_pref.quiet_start and v_local_time < v_pref.quiet_end)
    or (v_pref.quiet_start >= v_pref.quiet_end and (v_local_time >= v_pref.quiet_start or v_local_time < v_pref.quiet_end))
  ) then return jsonb_build_object('eligible',false,'reason','quiet_hours'); end if;

  if v_event.event_type = 'streak_at_risk' then
    v_valid := exists(
      select 1 from public.user_engagement_streaks s
      where s.user_id = v_event.user_id and s.current_streak >= 2
        and s.last_qualified_date < (now() at time zone v_pref.timezone)::date
    );
  elsif v_event.event_type = 'friend_rating' then
    select dr.user_id into v_actor from public.destination_ratings dr
      where dr.id::text = v_event.source_entity_id;
    v_valid := v_actor is not null
      and public.can_user_appear_socially(v_actor)
      and exists(select 1 from public.friendships f
        where f.status = 'accepted'
          and least(f.requester_id,f.addressee_id) = least(v_actor,v_event.user_id)
          and greatest(f.requester_id,f.addressee_id) = greatest(v_actor,v_event.user_id))
      and not public.friend_pair_is_blocked(v_actor,v_event.user_id);
  elsif v_event.event_type = 'crawl_proximity' then
    v_valid := exists(select 1 from public.crawls c
      where c.crawl_id::text = v_event.source_entity_id and c.user_id = v_event.user_id
        and c.status not in ('completed','abandoned','cancelled'));
  end if;
  return jsonb_build_object('eligible',v_valid,
    'reason',case when v_valid then 'eligible' else 'source_ineligible' end);
end;
$$;

create or replace function public.queue_streak_at_risk_notifications()
returns integer language plpgsql security definer set search_path = public as $$
declare v_count integer := 0;
begin
  insert into public.notification_outbox(
    user_id,event_type,source_entity_type,source_entity_id,deduplication_key,
    eligible_at,expires_at,deep_link,fallback_route,copy_data
  )
  select s.user_id,'streak_at_risk','engagement_streak',s.user_id::text,
    'streak-at-risk:' || ((now() at time zone p.timezone)::date)::text,
    now(),(((now() at time zone p.timezone)::date + 1)::timestamp at time zone p.timezone),
    'buffago://engagement/today','/(tabs)/home',
    jsonb_build_object('streak_length',s.current_streak)
  from public.user_engagement_streaks s
  join public.notification_preferences p on p.user_id=s.user_id and p.streak_at_risk
  join public.engagement_feature_flags f on f.flag_key='streak_at_risk_push' and f.enabled
  where s.current_streak >= 2
    and s.last_qualified_date < (now() at time zone p.timezone)::date
    and (now() at time zone p.timezone)::time >= p.reminder_local_time
    and (now() at time zone p.timezone)::time < p.reminder_local_time + interval '30 minutes'
  on conflict (user_id,event_type,deduplication_key) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.resolve_engagement_timezone(text),
  public.check_daily_engagement(text),
  public.register_push_installation(text,text,text,text,text,text,text),
  public.update_notification_preferences(boolean,boolean,boolean,boolean,boolean,boolean,boolean,time,time,time,text),
  public.record_crawl_proximity(uuid,uuid,text,text),
  public.notification_delivery_eligibility(uuid),
  public.queue_streak_at_risk_notifications() from public, anon, authenticated;
grant execute on function public.resolve_engagement_timezone(text),
  public.check_daily_engagement(text),
  public.register_push_installation(text,text,text,text,text,text,text),
  public.update_notification_preferences(boolean,boolean,boolean,boolean,boolean,boolean,boolean,time,time,time,text),
  public.record_crawl_proximity(uuid,uuid,text,text) to authenticated;

comment on table public.daily_engagement_checks is
  'Server-timestamped daily observation only; opening the app never grants XP, coins, or streak credit.';
comment on table public.notification_outbox is
  'Auditable business events separated from provider delivery attempts.';
comment on table public.crawl_proximity_receipts is
  'Stores eligibility/delivery cooldown state, never a continuous location trail or coordinates.';

commit;

-- Rollback: disable all engagement_feature_flags; drop the rating trigger and new
-- RPCs; stop the notification dispatcher; then drop the new tables in reverse order.
-- Retain notification_preferences and timezone state if preserving user choices is desired.
