import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sql = (await readFile(new URL('../../supabase/migrations/20260726110000_challenge_leaderboard_and_profile_stats.sql', import.meta.url), 'utf8')).toLowerCase();
const rankingSql = (await readFile(new URL('../../supabase/migrations/20260726120000_challenge_leaderboard_tiebreak.sql', import.meta.url), 'utf8')).toLowerCase();

test('weekly challenge credit is immutable, assignment-bound, and idempotent', () => {
  assert.match(sql, /create table if not exists public\.weekly_challenge_completions/);
  assert.match(sql, /unique \(mission_assignment_id\)/);
  assert.match(sql, /after insert or update of completed_at/);
  assert.match(sql, /new\.period_kind = 'weekly'/);
  assert.match(sql, /new\.completed_at < new\.expires_at/);
  assert.match(sql, /on conflict \(mission_assignment_id\) do nothing/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /new\.completed_at is not null/);
  assert.doesNotMatch(sql, /progress.*weekly_challenge_completions/);
});

test('leaderboard uses verified completion records, deterministic completion-time ties, and a bounded current-user row', () => {
  assert.match(sql, /from public\.weekly_challenge_completions/);
  assert.match(rankingSql, /l\.source = 'weekly_challenge'/);
  assert.match(rankingSql, /challenge_count desc, t\.reached_at asc, t\.user_id asc/);
  assert.doesNotMatch(rankingSql, /challenge_count desc, t\.challenge_xp desc/);
  assert.match(rankingSql, /rank <= greatest\(1, least\(coalesce\(p_limit, 25\), 100\)\) or user_id = auth\.uid\(\)/);
  assert.match(rankingSql, /public\.can_user_appear_socially/);
});

test('profile and leaderboard read the same immutable completion source', () => {
  const sourceReferences = sql.match(/from public\.weekly_challenge_completions/g) || [];
  assert.ok(sourceReferences.length >= 3);
  assert.match(sql, /get_challenge_leaderboard/);
  assert.match(sql, /get_public_challenge_stats/);
});

test('profile stats derive qualifying weeks and document active-week grace behavior', () => {
  assert.match(sql, /get_public_challenge_stats/);
  assert.match(sql, /select distinct c\.challenge_week_start/);
  assert.match(sql, /this week, or the immediately prior week while the active week has none/);
  assert.match(sql, /max\(length\)/);
  assert.match(sql, /ending_week = b\.week_start - 7/);
});

test('indexes serve week leaderboard and per-profile streak queries', () => {
  assert.match(sql, /weekly_challenge_completions_week_user_idx/);
  assert.match(sql, /weekly_challenge_completions_user_week_idx/);
});
