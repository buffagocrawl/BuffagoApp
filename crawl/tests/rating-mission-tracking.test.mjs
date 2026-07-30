import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { recordSavedRatingMission } from '../lib/engagement/ratingMissionTracking.js';

const home = readFileSync(new URL('../app/(tabs)/home/index.jsx', import.meta.url), 'utf8');
const crawl = readFileSync(new URL('../app/crawl/[id].jsx', import.meta.url), 'utf8');

function engagementDouble({ fail = false } = {}) {
  const calls = [];
  const receipts = new Set();
  const mission = { current: 0, target: 3, completions: 0, rewards: 0 };
  return {
    calls, receipts, mission,
    client: {
      rpc: async (name, params) => {
        calls.push({ name, params });
        if (fail) return { data: null, error: { code: '503', message: 'private backend detail' } };
        const key = `${params.p_action_type}:${params.p_action_ref}`;
        if (!receipts.has(key)) {
          receipts.add(key);
          const wasComplete = mission.current >= mission.target;
          mission.current = Math.min(mission.target, mission.current + 1);
          if (!wasComplete && mission.current === mission.target) { mission.completions += 1; mission.rewards += 1; }
        }
        return { data: { accepted: true }, error: null };
      },
    },
  };
}

for (const [name, source, rpc] of [
  ['Home', home, 'submit_validated_restaurant_rating'],
  ['crawl', crawl, 'submit_validated_crawl_rating'],
]) {
  test(`${name} records the returned authenticated rating id after its canonical commit`, () => {
    assert.match(source, new RegExp(rpc));
    assert.match(source, /submittedRatingId[\s\S]{0,120}rating_id/);
    const commit = source.indexOf(`'${rpc}'`);
    const mission = source.indexOf('recordSavedRatingMission({');
    assert.ok(commit >= 0 && mission > commit, 'mission tracking follows the canonical rating commit');
    assert.match(source, /userId: uid|userId,/);
    assert.match(source, /timezone: resolvedDeviceTimezone\(\)/);
  });
}

test('successful rating records rating_created once, then refreshes the dashboard', async () => {
  const state = engagementDouble();
  const order = [];
  const result = await recordSavedRatingMission({
    supabase: state.client, userId: 'user-1', submittedRatingId: 'rating-1', timezone: 'America/New_York',
    refreshMissionSummary: async () => order.push('refresh'),
  });
  assert.equal(result.recorded, true);
  assert.deepEqual(state.calls[0], { name: 'record_engagement_action', params: {
    p_action_type: 'rating_created', p_action_ref: 'rating-1', p_occurred_at: null, p_timezone: 'America/New_York',
  } });
  assert.deepEqual(order, ['refresh']);
  assert.equal(state.receipts.size, 1);
});

test('guest and failed ratings never create qualifying-action receipts', async () => {
  const guest = engagementDouble();
  const result = await recordSavedRatingMission({ supabase: guest.client, userId: null, submittedRatingId: 'guest-rating' });
  assert.equal(result.skipped, true);
  assert.equal(guest.calls.length, 0);
  // The component only reaches the helper below `if (error) throw error`.
  for (const source of [home, crawl]) assert.ok(source.indexOf('if (error) throw error;') < source.indexOf('recordSavedRatingMission({'));
});

test('replay is receipt-idempotent and weekly progress caps at 3 with one completion and reward', async () => {
  const state = engagementDouble();
  for (const ratingId of ['rating-1', 'rating-1', 'rating-2', 'rating-3', 'rating-4']) {
    await recordSavedRatingMission({ supabase: state.client, userId: 'user-1', submittedRatingId: ratingId });
  }
  assert.equal(state.receipts.size, 4, 'the replay does not create a duplicate receipt');
  assert.equal(state.mission.current, 3);
  assert.equal(state.mission.completions, 1);
  assert.equal(state.mission.rewards, 1);
});

test('mission RPC failure is handled after save without refreshing or exposing raw backend detail', async () => {
  const state = engagementDouble({ fail: true });
  const diagnostics = [];
  const result = await recordSavedRatingMission({
    supabase: state.client, userId: 'user-1', submittedRatingId: 'rating-1',
    refreshMissionSummary: async () => assert.fail('must not refresh after a failed receipt'),
    onDiagnostic: async (event) => diagnostics.push(event),
  });
  assert.equal(result.recorded, false);
  assert.deepEqual(diagnostics, [{ event: 'qualifying_action_failed', ratingIdPresent: true, actionType: 'rating_created', category: 'backend_unavailable' }]);
  assert.doesNotMatch(JSON.stringify(diagnostics), /private backend detail/);
});

test('Home fetches authoritative mission progress on focus as well as after a qualifying action', () => {
  assert.match(home, /useFocusEffect\([\s\S]*refreshMissionSummary\(\)/);
  assert.match(home, /await recordSavedRatingMission\([\s\S]*refreshMissionSummary,/);
});
