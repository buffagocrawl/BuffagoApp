import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWeeklyMissionFromAssignment, loadWeeklyMission, weeklyMissionAction, weeklyMissionResult, weeklyMissionResetCopy } from '../lib/weeklyMission.js';

const weekly = { id: 'assignment-1', mission_key: 'weekly_three_ratings', period_kind: 'weekly', title: 'Three spots this week', target: 3, progress: 1, reward_xp: 125, expires_at: '2026-07-27T04:00:00.000Z' };

test('weekly mission uses the server assignment and caps existing progress', () => {
  const summary = buildWeeklyMissionFromAssignment({ ...weekly, progress: 99 });
  assert.equal(summary.items[0].current, 3);
  assert.equal(summary.completedCount, 1);
  assert.equal(summary.items[0].label, 'Three spots this week');
  assert.equal(summary.items[0].current, 3);
  assert.equal(summary.items[0].target, 3);
});

test('weekly mission retains its authoritative title and description and reset copy is friendly', () => {
  const summary = buildWeeklyMissionFromAssignment({ ...weekly, title: 'Visit 3 different wing spots', description: 'Explore three distinct places.' });
  assert.equal(summary.items[0].label, 'Visit 3 different wing spots');
  assert.equal(summary.items[0].detail, 'Explore three distinct places.');
  assert.doesNotMatch(summary.resetCopy, /12:00:00|AM|PM/);
  assert.equal(weeklyMissionResetCopy('2026-07-27T04:00:00.000Z', new Date('2026-07-25T12:00:00.000Z')), 'Ends in 2 days.');
});

test('known assignment types get truthful copy when the RPC row lacks definition fields', () => {
  const summary = buildWeeklyMissionFromAssignment({ ...weekly, title: '', description: '' });
  assert.equal(summary.items[0].label, 'Rate Wing Spots');
  assert.equal(summary.items[0].detail, 'Rate 3 wing spots before the weekly reset.');
  assert.equal(summary.nextMission.key, 'ratings');
});

test('missing mission metadata uses an honest fallback and no action route', () => {
  const warn = console.warn;
  const diagnostics = [];
  console.warn = (...args) => diagnostics.push(args);
  try {
    const summary = buildWeeklyMissionFromAssignment({ ...weekly, mission_key: 'unmapped', action_type: '', title: '', description: '' });
    assert.equal(summary.items[0].label, 'Mission details are temporarily unavailable.');
    assert.match(summary.items[0].detail, /cannot safely describe/);
    assert.equal(summary.nextMission, null);
    assert.equal(diagnostics[0][0], '[weekly-mission] unknown_definition');
  } finally { console.warn = warn; }
});

test('only supported mission types expose an action route', () => {
  assert.deepEqual(weeklyMissionAction('', 'rating_created'), { key: 'ratings', actionLabel: 'Find a wing spot' });
  assert.deepEqual(weeklyMissionAction('', 'crawl_stop_completed'), { key: 'crawl', actionLabel: 'View Crawls' });
  assert.deepEqual(weeklyMissionAction('', 'wingdex_discovery'), { key: 'wingdex', actionLabel: 'Explore Wingdex' });
  assert.deepEqual(weeklyMissionAction('', 'referral_completed'), { key: 'referrals', actionLabel: 'Invite a friend' });
  assert.equal(weeklyMissionAction('', 'unknown'), null);
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
