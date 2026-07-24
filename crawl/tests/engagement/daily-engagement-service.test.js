import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkDailyEngagement,
  dailyEngagementViewModel,
} from '../../lib/engagement/dailyEngagementService.js';

test('daily engagement check sends timezone context but no device timestamp', async () => {
  let call;
  const data = { local_date: '2026-07-23', qualified_today: false, current_streak: 4 };
  const client = { rpc: async (name, params) => (call = { name, params }, { data, error: null }) };
  assert.equal((await checkDailyEngagement(client, 'America/New_York')).local_date, '2026-07-23');
  assert.deepEqual(call, {
    name: 'check_daily_engagement',
    params: { p_reported_timezone: 'America/New_York' },
  });
  assert.equal('p_occurred_at' in call.params, false);
});

test('view model distinguishes pending and confirmed meaningful activity', () => {
  const pending = dailyEngagementViewModel({ qualified_today: false }, { pending: true });
  assert.equal(pending.pending, true);
  assert.match(pending.cta.label, /Rate, battle, or continue/);
  const done = dailyEngagementViewModel({
    qualified_today: true, current_streak: 5, longest_streak: 9,
  });
  assert.equal(done.currentStreak, 5);
  assert.match(done.cta.label, /friends/);
});

test('RPC failures never create a locally confirmed reward', async () => {
  await assert.rejects(
    () => checkDailyEngagement({ rpc: async () => ({ error: { code: 'offline' } }) }, 'UTC'),
    /Daily engagement check failed/,
  );
});
