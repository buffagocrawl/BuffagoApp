import test from 'node:test';
import assert from 'node:assert/strict';
import { ANALYTICS_EVENTS, sanitizeAnalyticsMetadata } from '../../lib/analyticsSchema.js';

test('referral funnel events are registered in the analytics catalog', () => {
  for (const event of [
    'referral_hub_viewed', 'referral_share_started', 'referral_share_completed',
    'referral_code_copied', 'referral_code_entered', 'referral_link_opened',
    'referral_claim_succeeded', 'referral_claim_failed', 'referred_user_signed_up',
    'referral_qualification_completed', 'referral_reward_issued',
    'referral_reward_failed', 'referral_badge_unlocked', 'referral_prompt_clicked',
  ]) assert.ok(Object.values(ANALYTICS_EVENTS).includes(event), `${event} is not cataloged`);
});

test('referral analytics strip sensitive and nested fields', () => {
  assert.deepEqual(sanitizeAnalyticsMetadata({
    placement: 'referral_hub',
    reward_amount: 250,
    email: 'friend@example.com',
    device_secret: 'hidden',
    referral: { internal: true },
  }), { placement: 'referral_hub', reward_amount: 250 });
});
