import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(new URL('../../supabase/migrations/20260730214940_weekly_mission_rating_reconciliation.sql', import.meta.url), 'utf8');
const home = await readFile(new URL('../../app/(tabs)/home/index.jsx', import.meta.url), 'utf8');

test('rating reconciliation is sourced from committed ratings and distinct destinations', () => {
  assert.match(migration, /after insert on public\.destination_ratings/);
  assert.match(migration, /dr\.user_id = p_user_id/);
  assert.match(migration, /dr\.created_at >= \(v_assignment\.period_start::timestamp at time zone v_assignment\.assignment_timezone\)/);
  assert.match(migration, /not coalesce\(dr\.is_buffacoin, false\)/);
  assert.match(migration, /distinct on \(dr\.destination_id\)/);
  assert.match(migration, /unique \(mission_assignment_id, destination_id\)/);
});

test('reconciliation repairs missed progress and caps completion server-side', () => {
  assert.match(migration, /create or replace function public\.get_engagement_dashboard/);
  assert.match(migration, /perform public\.reconcile_weekly_rating_missions\(v_user, now\(\), p_timezone\)/);
  assert.match(migration, /progress = least\(target, v_count\)/);
  assert.match(migration, /completed_at = case/);
  assert.match(migration, /perform public\.claim_engagement_reward\(v_assignment\.id\)/);
});

test('rating trigger is independent of optional Wing Shot outcomes', () => {
  assert.match(migration, /reconcile_weekly_rating_mission_after_insert/);
  assert.match(migration, /after insert on public\.destination_ratings/);
  assert.doesNotMatch(migration, /wing_shot.*reconcile|reconcile.*wing_shot/i);
  assert.match(home, /if \(uid && submittedRatingId\) await refreshMissionSummary\(\);/);
  assert.match(home, /refreshMissionSummary,\n      openRestaurantPeek/);
});

test('ledger, reward, and privileged functions retain user isolation', () => {
  assert.match(migration, /alter table public\.mission_progress_events enable row level security/);
  assert.match(migration, /using \(user_id = auth\.uid\(\)\)/);
  assert.match(migration, /revoke all on function public\.reconcile_weekly_rating_missions\(uuid, timestamptz, text\) from public, anon, authenticated/);
  assert.match(migration, /on conflict \(mission_assignment_id, destination_id\) do nothing/);
  assert.match(migration, /perform public\.claim_engagement_reward\(v_assignment\.id\)/);
});
