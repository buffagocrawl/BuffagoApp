\set ON_ERROR_STOP on

create extension if not exists pgcrypto;
create schema auth;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;

create table auth.users (
  id uuid primary key
);

create table public.notification_preferences (
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

create table public.buffaverse_feature_flags (
  flag_key text primary key,
  enabled boolean not null default false,
  environment text not null,
  parent_flag_key text
);

insert into public.buffaverse_feature_flags(flag_key, enabled, environment, parent_flag_key)
values
  ('buffaverse.enabled', false, 'production', null),
  ('buffaverse.legendary_restaurants', false, 'production', 'buffaverse.enabled'),
  (
    'buffaverse.legendary_restaurants.notifications',
    false,
    'production',
    'buffaverse.legendary_restaurants'
  );

create table public.buffaverse_event_instances (
  id uuid primary key default gen_random_uuid(),
  event_type_id text not null,
  lifecycle_status text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  display_metadata jsonb not null default '{}'::jsonb
);

create table public.buffaverse_legendary_participations (
  id uuid primary key default gen_random_uuid(),
  event_instance_id uuid not null references public.buffaverse_event_instances(id),
  user_id uuid not null references auth.users(id),
  status text not null,
  unique(event_instance_id, user_id)
);

create table public.buffaverse_legendary_reward_references (
  id uuid primary key default gen_random_uuid(),
  event_instance_id uuid not null references public.buffaverse_event_instances(id),
  user_id uuid not null references auth.users(id),
  participation_id uuid not null references public.buffaverse_legendary_participations(id),
  settlement_status text not null,
  unique(event_instance_id, user_id)
);

create table public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in (
    'streak_at_risk', 'streak_comeback', 'friend_rating', 'crawl_proximity',
    'legendary_start', 'legendary_expiry', 'legendary_completion',
    'legendary_reward_ready'
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
  retry_count integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  sent_at timestamptz,
  deep_link text not null,
  fallback_route text not null default '/(tabs)/home',
  copy_data jsonb not null default '{}'::jsonb,
  correlation_id uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, event_type, deduplication_key)
);

create or replace function public.engagement_safe_timezone(p_timezone text)
returns text
language sql
immutable
as $$
  select case when p_timezone = 'UTC' then 'UTC' else 'UTC' end
$$;

