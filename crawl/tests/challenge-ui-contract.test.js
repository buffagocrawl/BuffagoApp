import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const leaderboard = await readFile(new URL('../components/ChallengeLeaderboard.jsx', import.meta.url), 'utf8');
const profile = await readFile(new URL('../components/WeeklyChallengeStats.jsx', import.meta.url), 'utf8');

test('challenge leaderboard supplies period controls and distinct loading, empty, error, and pinned-user states', () => {
  for (const text of ['This Week', 'All Time', 'Loading challenge rankings', 'Sign in to see your challenge rank', 'couldn’t load', 'No verified challenge completions', 'Your rank:']) assert.match(leaderboard, new RegExp(text));
  assert.match(leaderboard, /current\.rank > 25/);
});

test('public profile stat card stays compact and includes all weekly challenge measures', () => {
  for (const text of ['Weekly Challenges', 'completed', 'this week', '-week streak', 'Best:']) assert.match(profile, new RegExp(text));
  assert.match(profile, /numberOfLines/);
});
