import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const route = readFileSync(new URL('../../app/r/[code].jsx', import.meta.url), 'utf8');

test('referral deep-link route uses centralized validation and attribution', () => {
  assert.match(route, /recognizeReferral\(referralCode\.trim\(\)/);
  assert.match(route, /source: 'shared_link'/);
  assert.match(route, /placement: 'deep_link_route'/);
  assert.doesNotMatch(route, /AsyncStorage\.setItem/);
  assert.doesNotMatch(route, /PENDING_REFERRAL_KEY/);
});

test('disabled referral deep-link state does not promise a saved invitation', () => {
  assert.match(route, /!REFERRALS_ENABLED/);
  assert.match(route, /Referral invitations are not available right now/);
  assert.doesNotMatch(route, /Youâ€™ve/);
});
