import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationUrl = new URL('../../supabase/migrations/20260717123000_add_verified_growth_foundation.sql', import.meta.url);
const sql = (await readFile(migrationUrl, 'utf8')).toLowerCase();

test('growth tables enable RLS and claims cannot self-approve', () => {
  for (const table of ['mission_assignments', 'restaurant_claims', 'restaurant_promotions']) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.doesNotMatch(sql, /for update[\s\S]{0,180}restaurant_claims[\s\S]{0,180}auth\.uid\(\)/);
  assert.match(sql, /revoke update, delete on public\.restaurant_claims from authenticated/);
});

test('mission rewards are idempotent and promotions stay separate from destinations', () => {
  assert.match(sql, /unique \(user_id, mission_key, period_start\)/);
  assert.match(sql, /unique \(mission_assignment_id\)/);
  assert.doesNotMatch(sql, /update public\.destinations/);
  assert.match(sql, /promotion_kind/);
});

test('owner metrics are aggregate and gated by approved ownership', () => {
  assert.match(sql, /count\(dr\.\*\)/);
  assert.match(sql, /rc\.status = 'approved'/);
  assert.doesNotMatch(sql, /dr\.user_id/);
});
