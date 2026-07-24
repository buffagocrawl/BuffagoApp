import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = new URL(
  '../../supabase/migrations/20260723143000_engagement_retention.sql',
  import.meta.url
);
const sql = (await readFile(migration, 'utf8')).toLowerCase();

test('retention tables have RLS, ownership policies, constraints, and indexes', () => {
  for (const table of [
    'engagement_action_receipts',
    'user_engagement_streaks',
    'limited_time_events',
    'user_engagement_preferences',
    'in_app_notification_readiness',
  ]) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.match(sql, /unique \(user_id, action_type, action_ref\)/);
  assert.match(sql, /unique\(user_id, notification_type, source_id\)/);
  assert.match(sql, /engagement_actions_user_date_idx/);
  assert.match(sql, /notification_readiness_unread_idx/);
});

test('retention migration bootstraps mission primitives when growth foundation is absent', () => {
  assert.match(sql, /create table if not exists public\.mission_assignments/);
  assert.match(sql, /create table if not exists public\.mission_reward_receipts/);
  assert.match(sql, /mission_assignments_select_own/);
  assert.match(sql, /mission_receipts_select_own/);
});

test('assignment and reward operations are server-authoritative and idempotent', () => {
  assert.match(sql, /security definer set search_path = public/);
  assert.match(sql, /on conflict \(user_id, mission_key, period_start\) do nothing/);
  assert.match(sql, /for update/);
  assert.match(sql, /public\.award_xp\(/);
  assert.match(sql, /'engagement:' \|\| v_assignment\.id::text/);
  assert.match(sql, /on conflict \(mission_assignment_id\) do nothing/);
  assert.doesNotMatch(sql, /grant (insert|update|delete) on public\.engagement_action_receipts to authenticated/);
});

test('engagement progress verifies canonical source ownership before writing receipts', () => {
  assert.match(sql, /from public\.destination_ratings dr[\s\S]*dr\.user_id = v_user/);
  assert.match(sql, /from public\.user_wing_battle_votes vote[\s\S]*vote\.user_id = v_user/);
  assert.match(sql, /from public\.mission_assignments assignment[\s\S]*assignment\.user_id = v_user/);
  assert.match(sql, /qualifying_action_not_found/);
  const verification = sql.indexOf('qualifying_action_not_found');
  const receipt = sql.indexOf('insert into public.engagement_action_receipts');
  assert.ok(verification > -1 && receipt > verification);
});

test('daily, weekly, streak, timezone, notifications, and disabled event fixture exist', () => {
  assert.match(sql, /period_kind in \('daily', 'weekly'\)/);
  assert.match(sql, /weekly_three_ratings/);
  assert.match(sql, /last_qualified_date = v_date - 1/);
  assert.match(sql, /engagement_safe_timezone/);
  assert.match(sql, /push_capable boolean not null default false/);
  assert.match(sql, /dev_double_xp_weekend/);
  assert.match(sql, /2, false, 'development'/);
});

test('limited events enforce the supported flag and level eligibility server-side', () => {
  assert.match(sql, /e\.feature_flag = 'limited_time_events'/);
  assert.match(sql, /eligibility->>'min_level'/);
  assert.match(sql, /eligibility->>'max_level'/);
});

test('rollback guidance is documented and production event reads exclude fixtures', () => {
  assert.match(sql, /rollback guidance/);
  assert.match(sql, /e\.enabled and e\.environment = 'production'/);
});
