\set ON_ERROR_STOP on

create extension if not exists pgcrypto;
create schema auth;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;

create table auth.users (
  id uuid primary key
);
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create table public.states (
  state_id integer primary key,
  state_code text not null unique
);

create table public.destinations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  lat double precision,
  lng double precision,
  state_id integer references public.states(state_id)
);

create table public.destination_ratings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  destination_id uuid not null references public.destinations(id),
  created_at timestamptz not null default now()
);

create table public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  event_type text not null,
  source_entity_type text not null,
  source_entity_id text not null,
  deduplication_key text not null,
  eligible_at timestamptz not null default now(),
  expires_at timestamptz,
  status text not null default 'queued',
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
