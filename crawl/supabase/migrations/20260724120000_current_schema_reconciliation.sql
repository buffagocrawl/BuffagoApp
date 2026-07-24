-- Buffago Current Supported Schema Contract v1 reconciliation.
-- This is a forward-only compatibility migration, not a historical baseline.
-- Run the generated current-supported-schema-preflight.sql before this file.
-- It preserves rows, preferences, engagement history, RLS, and the migration ledger.

begin;

-- Fail closed for incompatible shared objects. The reconciliation never coerces
-- legacy columns or replaces shared tables.
do $$
declare v_environment text := lower(coalesce(current_setting('app.environment', true), 'unknown'));
begin
  if to_regclass('public.limited_time_events') is not null then
    if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='limited_time_events' and column_name='campaign_id' and data_type='text')
       or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='limited_time_events' and column_name='starts_at' and data_type='timestamp with time zone')
       or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='limited_time_events' and column_name='eligibility' and data_type='jsonb') then
      raise exception 'current_schema_incompatible public.limited_time_events required campaign_id text, starts_at timestamptz, eligibility jsonb';
    end if;
  else
    -- Compatibility creation path for supported non-production environments only.
    if v_environment not in ('development', 'staging') then
      raise exception 'current_schema_missing public.limited_time_events compatibility creation requires app.environment=development|staging';
    end if;
    create table public.limited_time_events (
      id uuid primary key default gen_random_uuid(),
      campaign_id text not null unique check (campaign_id ~ '^[a-z0-9_]+$'),
      title text not null check (char_length(title) between 3 and 80),
      description text not null check (char_length(description) between 3 and 240),
      cta_label text not null check (char_length(cta_label) between 2 and 40),
      cta_route text not null check (char_length(cta_route) between 1 and 160),
      starts_at timestamptz not null,
      ends_at timestamptz not null,
      reward_multiplier numeric(4,2) not null default 1 check (reward_multiplier between 1 and 5),
      eligibility jsonb not null default '{}'::jsonb,
      feature_flag text not null default 'limited_time_events',
      enabled boolean not null default false,
      environment text not null default 'development' check (environment in ('development','staging','production')),
      created_at timestamptz not null default now(),
      check (ends_at > starts_at)
    );
  end if;
end $$;

create index if not exists limited_time_events_active_idx
  on public.limited_time_events(enabled, starts_at, ends_at);
alter table public.limited_time_events enable row level security;
revoke all on public.limited_time_events from anon, authenticated;
grant select on public.limited_time_events to authenticated;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='limited_time_events' and policyname='limited_events_read') then
    create policy limited_events_read on public.limited_time_events for select to authenticated
      using (enabled and environment in ('staging','production'));
  end if;
end $$;

-- Release-owned notification state is created only when absent. Existing rows
-- and user choices are retained; existing incompatible definitions fail above in
-- the contract preflight and are never altered here.
create table if not exists public.engagement_feature_flags (
  flag_key text primary key check (flag_key ~ '^[a-z0-9_]+$'),
  enabled boolean not null default false,
  rollout_percent integer not null default 0 check (rollout_percent between 0 and 100),
  updated_at timestamptz not null default now()
);
alter table public.engagement_feature_flags enable row level security;
revoke all on public.engagement_feature_flags from anon, authenticated;
grant select on public.engagement_feature_flags to authenticated;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='engagement_feature_flags' and policyname='engagement_flags_authenticated_read') then
    create policy engagement_flags_authenticated_read on public.engagement_feature_flags for select to authenticated using (true);
  end if;
end $$;
insert into public.engagement_feature_flags(flag_key, enabled, rollout_percent) values
  ('new_daily_engagement', false, 0), ('daily_reward_ui', false, 0),
  ('streak_at_risk_push', false, 0), ('comeback_push', false, 0),
  ('friend_rating_push', false, 0), ('crawl_proximity_push', false, 0),
  ('background_geofencing', false, 0), ('notification_settings', false, 0)
on conflict (flag_key) do nothing;

-- Reconciliation intentionally does not mark historical migrations applied.
-- 20260723143000_engagement_retention.sql owns meaningful-action tables/RPCs;
-- 20260724012000_daily_engagement_notifications.sql owns notification tables,
-- RPCs, trigger, and delivery contract. Apply those in ledger order first in
-- environments where they are not already recorded, then run this migration.

do $$
declare missing text;
begin
  select string_agg(x, ', ' order by x) into missing from (
    select name as x from (values
      ('public.record_engagement_action(text,text,timestamptz,text)'),
      ('public.claim_engagement_reward(uuid)'),
      ('public.check_daily_engagement(text)'),
      ('public.register_push_installation(text,text,text,text,text,text,text)'),
      ('public.notification_delivery_eligibility(uuid)')
    ) v(name) where to_regprocedure(name) is null
  ) q;
  if missing is not null then raise exception 'current_schema_reconciliation_missing_release_function %', missing; end if;
end $$;

-- Only the server dispatcher may evaluate delivery eligibility or queue the
-- scheduled streak scan. These grants do not authorize clients to enqueue or
-- deliver notifications.
grant execute on function public.notification_delivery_eligibility(uuid),
  public.queue_streak_at_risk_notifications() to service_role;

comment on table public.limited_time_events is
  'Current supported schema compatibility object; ownership chronology is unresolved and this release reads it without claiming historical creation.';
comment on table public.engagement_feature_flags is
  'Release-owned flags. All daily-engagement and notification categories default disabled.';

commit;

-- Rollback: disable release flags and stop dispatch/geofencing. Do not drop
-- shared tables, delete preferences/history, or alter the migration ledger.
