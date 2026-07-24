import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  new URL('../../supabase/migrations/20260724012000_daily_engagement_notifications.sql', import.meta.url),
  'utf8',
);
const retention = readFileSync(
  new URL('../../supabase/migrations/20260723143000_engagement_retention.sql', import.meta.url),
  'utf8',
);

test('daily checks and notification events have database uniqueness guarantees', () => {
  assert.match(migration, /unique \(user_id, local_date\)/i);
  assert.match(migration, /unique \(user_id, event_type, deduplication_key\)/i);
  assert.match(migration, /unique \(user_id, installation_id\)/i);
  assert.match(migration, /deduplication_key text not null unique/i);
  assert.match(retention, /unique \(user_id, action_type, action_ref\)/i);
  assert.match(retention, /p_idempotency_key := 'engagement:' \|\| v_assignment.id/i);
});

test('device time is ignored and timezone changes are pinned', () => {
  assert.match(retention, /v_at timestamptz := now\(\)/i);
  assert.match(retention, /resolve_engagement_timezone\(p_timezone\)/i);
  assert.match(migration, /pending_since <= now\(\) - interval '24 hours'/i);
  assert.match(migration, /next_eligible_at/i);
});

test('RLS and grants prevent client writes to protected state', () => {
  for (const table of [
    'push_installations', 'notification_preferences', 'notification_outbox',
    'notification_delivery_attempts', 'crawl_proximity_receipts',
  ]) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
  }
  assert.match(migration, /revoke all on public\.engagement_timezone_state[\s\S]*from anon, authenticated/i);
  assert.doesNotMatch(migration, /grant (insert|update|delete).*notification_outbox.*authenticated/i);
});

test('new notification preferences and risky flags default off', () => {
  assert.match(migration, /friend_activity boolean not null default false/i);
  assert.match(migration, /crawl_proximity boolean not null default false/i);
  assert.match(migration, /\('background_geofencing', false, 0\)/i);
  assert.match(migration, /\('friend_rating_push', false, 0\)/i);
});

test('policy creation is rerun-safe after a partial Supabase migration', () => {
  assert.match(retention, /if not exists \(select 1 from pg_policies/i);
  assert.match(retention, /engagement_definitions_read/i);
  assert.match(retention, /notification_readiness_own_read/i);
  assert.match(migration, /if not exists \(select 1 from pg_policies/i);
  assert.match(migration, /engagement_flags_authenticated_read/i);
  assert.match(migration, /if not exists \(select 1 from pg_trigger/i);
});

test('delivery rechecks privacy, friendship, quiet hours, and source state', () => {
  assert.match(migration, /notification_delivery_eligibility/i);
  assert.match(migration, /friend_pair_is_blocked/i);
  assert.match(migration, /can_user_appear_socially/i);
  assert.match(migration, /quiet_hours/i);
  assert.match(migration, /source_ineligible/i);
});
