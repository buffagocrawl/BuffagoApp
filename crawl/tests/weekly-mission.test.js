import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWeeklyMissionFromAssignment, loadWeeklyMission, weeklyMissionResult } from '../lib/weeklyMission.js';

const weekly = { id: 'assignment-1', mission_key: 'weekly_three_ratings', period_kind: 'weekly', title: 'Three spots this week', target: 3, progress: 1, reward_xp: 125, expires_at: '2026-07-27T04:00:00.000Z' };

test('weekly mission uses the server assignment and caps existing progress', () => {
  const summary = buildWeeklyMissionFromAssignment({ ...weekly, progress: 99 });
  assert.equal(summary.items[0].current, 3);
  assert.equal(summary.completedCount, 1);
});

test('a legitimate missing weekly assignment is an intentional empty state', () => {
  assert.equal(weeklyMissionResult({ assignments: [] }), null);
  assert.equal(weeklyMissionResult({ assignments: [{ period_kind: 'daily' }] }), null);
});

test('loadWeeklyMission calls the assignment-creating dashboard RPC and recovers on retry', async () => {
  let calls = 0;
  const client = { rpc: async (name, args) => {
    calls += 1;
    assert.equal(name, 'get_engagement_dashboard');
    assert.equal(args.p_timezone, 'America/New_York');
    return calls === 1 ? { error: { code: '57014' } } : { data: { assignments: [weekly] }, error: null };
  } };
  await assert.rejects(() => loadWeeklyMission(client, { timezone: 'America/New_York' }), { message: 'backend_unavailable' });
  assert.equal((await loadWeeklyMission(client, { timezone: 'America/New_York' })).assignmentId, 'assignment-1');
  assert.equal(calls, 2);
});

test('the assignment RPC is idempotent from the client perspective', async () => {
  let calls = 0;
  const client = { rpc: async () => { calls += 1; return { data: { assignments: [weekly] }, error: null }; } };
  const [first, second] = await Promise.all([loadWeeklyMission(client), loadWeeklyMission(client)]);
  assert.equal(first.assignmentId, second.assignmentId);
  assert.equal(calls, 2);
});
