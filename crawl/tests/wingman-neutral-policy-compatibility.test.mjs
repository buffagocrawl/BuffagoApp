// Read-only compatibility probe: no provider calls or production writes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mobileModule } from './helpers/mobile-runtime.mjs';

const policy = mobileModule('supabase/functions/_shared/wingmanConfidence.ts', {});
for (const status of ['unknown', 'supports', 'unavailable', 'conflicting']) {
  test(`installed approval policy with neutral score and ${status} evidence`, () => {
    assert.equal(policy.canApproveWingman({
      matchConfidence: .95, wingConfidence: .5, verifiedRestaurant: true,
      locationStatus: 'verified', wingEvidenceStatus: status,
    }), ['unknown', 'supports'].includes(status));
  });
}

test('neutral unknown evidence is eligible with accepted legacy client logging and messaging', async () => {
  const logs = [], requests = [];
  const { WingmanService } = mobileModule('lib/Wingman/WingmanService.ts', {
    '../wingmanAsync': mobileModule('lib/wingmanAsync.ts', {}),
    '../../supabase/functions/_shared/wingmanConfidence': policy,
    '../supabase': { supabase: {
      functions: { invoke: async (_, request) => {
        requests.push(request.body);
        return { error: null, data: {
          normalized_name: 'Fixture Restaurant', city: 'Buffalo', state: 'NY',
          address: '1 Main St', lat: 42.9, lng: -78.8, confidence: .95,
          is_real_restaurant: true, verified_place: true, location_status: 'verified',
          wings_probability: .5, wing_evidence_status: 'unknown',
          wing_evidence: 'No accessible menu; neutral eligibility only.',
          needs_city: false, needs_more_info: false,
        } };
      } },
      from: () => ({ insert: async row => { logs.push(row); return { error: null }; } }),
    } },
  });
  const result = await new WingmanService().run({
    rawInput: 'Fixture Restaurant', stateId: 1, stateCode: 'NY', city: 'Buffalo',
  });
  assert.equal(requests.length, 1);
  assert.equal(result.shouldInsertDestination, true);
  assert.equal(result.ai.wingEvidenceStatus, 'unknown');
  // Accepted temporary product tradeoff: legacy wording and confidence labels.
  assert.equal(result.decisionReason, 'high_confidence_match_with_wings');
  assert.match(result.userMessage, /detected wings/);
  assert.equal(logs[0].wings_confidence, 'medium');
  assert.equal(logs[0].decision_reason, 'high_confidence_match_with_wings');
});
