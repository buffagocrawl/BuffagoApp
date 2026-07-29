import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sql = readFileSync(
  new URL('../supabase/migrations/20260729125000_wing_shots_social_community.sql', import.meta.url),
  'utf8',
);

test('social rewards describe visits and explicitly deny follow verification', () => {
  assert.match(sql, /Instagram Community Visitor/);
  assert.match(sql, /Facebook Community Visitor/);
  assert.match(sql, /does not claim a verified follow/);
  assert.match(sql, /verification_state[^;]*visited_not_follow_verified/s);
  assert.match(sql, /'follow_verified', false/);
  assert.doesNotMatch(sql, /verified_(instagram|facebook)_follow/);
});

test('visit completion is owner-bound, delayed, expiring, and one-time', () => {
  assert.match(sql, /user_id = v_user_id[\s\S]*for update/);
  assert.match(sql, /now\(\) < v_intent\.eligible_after/);
  assert.match(sql, /now\(\) >= v_intent\.expires_at/);
  assert.match(sql, /unique \(user_id, platform\)/);
  assert.match(sql, /'social-community-visit:' \|\| v_user_id::text/);
});

test('community XP is modest, idempotent, and cannot be claimed by direct table writes', () => {
  assert.match(sql, /v_xp integer := 10/);
  assert.match(sql, /xp_amount integer not null check \(xp_amount between 1 and 25\)/);
  assert.match(sql, /p_idempotency_key :=/);
  assert.match(sql, /revoke all on[\s\S]*from public, anon, authenticated/);
  assert.doesNotMatch(sql, /grant\s+(insert|update|delete)[^;]*to authenticated/i);
});

test('award records are append-only except one-way deletion pseudonymization', () => {
  assert.match(sql, /before update or delete on public\.social_community_reward_events/);
  assert.match(sql, /social_community_reward_is_append_only/);
  assert.match(sql, /old\.user_id is not null[\s\S]*new\.user_id is null/);
  assert.match(sql, /social_community_reward_owner_deletion_shape/);
  assert.match(sql, /social_visit_owner_deletion_shape/);
});
