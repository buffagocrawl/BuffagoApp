import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const migrationPath = path.resolve(
  process.cwd(),
  'supabase/migrations/20260724140000_buffaverse_phase2_notification_boundary.sql'
);
const migration = fs.readFileSync(migrationPath, 'utf8');

test('Legendary notification migration is additive and creates no rows', () => {
  assert.match(migration, /alter table public\.notification_preferences/i);
  assert.doesNotMatch(migration, /\b(drop table|truncate|delete from)\b/i);
  assert.doesNotMatch(migration, /insert into public\.buffaverse_event_instances/i);
  assert.doesNotMatch(migration, /insert into public\.buffaverse_legendary_/i);
  assert.doesNotMatch(migration, /update public\.buffaverse_feature_flags\s+set\s+enabled\s*=\s*true/i);
});

test('Legendary notification enqueue is service-role only and triple-flag gated', () => {
  assert.match(migration, /revoke all on function public\.buffaverse_queue_legendary_notification[\s\S]*from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.buffaverse_queue_legendary_notification[\s\S]*to service_role/i);
  for (const flag of [
    'buffaverse.enabled',
    'buffaverse.legendary_restaurants',
    'buffaverse.legendary_restaurants.notifications',
  ]) {
    assert.match(migration, new RegExp(flag.replaceAll('.', '\\.')));
  }
});

test('Legendary notification boundary covers preferences, caps, dedupe, expiry, quiet hours, and cancellation', () => {
  for (const fragment of [
    'legendary_start boolean not null default false',
    'legendary_expiry boolean not null default false',
    'legendary_completion boolean not null default false',
    'legendary_reward_ready boolean not null default false',
    ">= 3",
    'on conflict (user_id, event_type, deduplication_key) do nothing',
    "now() >= v_outbox.expires_at",
    "'quiet_hours'",
    'buffaverse_cancel_legendary_notifications',
    "status = 'cancelled'",
  ]) {
    assert.ok(migration.toLowerCase().includes(fragment.toLowerCase()), `missing ${fragment}`);
  }
});

test('Legendary notification boundary never calls a provider or mints a reward', () => {
  assert.doesNotMatch(migration, /expo\.dev|fetch\(|http_post|net\.http|pg_net/i);
  assert.doesNotMatch(migration, /insert into public\.(xp_ledger|buffacoin_ledger)/i);
});
