import test from 'node:test';
import assert from 'node:assert/strict';
import {
  claimMissionReward,
  loadRetentionDashboard,
  recordQualifyingAction,
} from '../../lib/engagement/retentionService.js';

test('dashboard and action service use narrow RPC contracts', async () => {
  const calls = [];
  const supabase = {
    rpc: async (name, params) => {
      calls.push({ name, params });
      return { data: { ok: true }, error: null };
    },
  };
  await loadRetentionDashboard(supabase, { timezone: 'America/New_York' });
  await recordQualifyingAction(supabase, {
    actionType: 'rating_created', actionRef: 'rating-123', timezone: 'America/New_York',
  });
  await claimMissionReward(supabase, 'assignment-123');
  assert.deepEqual(calls.map(({ name }) => name), [
    'get_engagement_dashboard', 'record_engagement_action', 'claim_engagement_reward',
  ]);
  assert.equal(calls[1].params.p_action_ref, 'rating-123');
});

test('service rejects incomplete input and exposes RPC failure without private payloads', async () => {
  assert.throws(
    () => recordQualifyingAction({ rpc() {} }, { actionType: 'rating_created' }),
    /actionType and actionRef/
  );
  const supabase = { rpc: async () => ({ data: null, error: { message: 'database detail' } }) };
  await assert.rejects(() => loadRetentionDashboard(supabase), /Retention request failed/);
});
