import test from 'node:test';
import assert from 'node:assert/strict';
import { challengeLabel, normalizeChallengeLeaderboard, loadChallengeLeaderboard, loadPublicChallengeStats } from '../lib/challengeStats.js';

test('challenge labels use singular and plural wording', () => {
  assert.equal(challengeLabel(1), '1 challenge');
  assert.equal(challengeLabel(3), '3 challenges');
});

test('leaderboard normalization keeps server rank and safe fallbacks', () => {
  const [row] = normalizeChallengeLeaderboard([{ user_id: 'abcdef123', rank: 29, challenge_count: 3, challenge_xp: 650 }]);
  assert.equal(row.rank, 29);
  assert.equal(row.username, 'Winglet_abcdef');
  assert.equal(row.completions, 3);
  assert.equal(row.xp, 650);
});

test('challenge RPCs are bounded and never aggregate client-side', async () => {
  const calls = [];
  const client = { rpc: async (name, args) => { calls.push([name, args]); return name === 'get_public_challenge_stats' ? { data: [{ total_completed: 18, this_week_completed: 3, current_weekly_streak: 4, best_weekly_streak: 7 }] } : { data: [{ user_id: 'u', rank: 1, username: 'WingKing92', challenge_count: 4, challenge_xp: 650 }] }; } };
  const rows = await loadChallengeLeaderboard(client, 'week');
  const stats = await loadPublicChallengeStats(client, 'u');
  assert.equal(rows[0].completions, 4);
  assert.deepEqual(stats, { total: 18, thisWeek: 3, currentStreak: 4, bestStreak: 7 });
  assert.deepEqual(calls[0], ['get_challenge_leaderboard', { p_period: 'week', p_limit: 25 }]);
});
