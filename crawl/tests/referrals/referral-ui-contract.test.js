import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const hub = readFileSync(new URL('../../app/referrals.jsx', import.meta.url), 'utf8');
const bridge = readFileSync(new URL('../../components/ReferralAttributionBridge.jsx', import.meta.url), 'utf8');
const referralLib = readFileSync(new URL('../../lib/referrals.js', import.meta.url), 'utf8');

test('Referral Hub includes stable loading error empty summary share and manual entry states', () => {
  for (const phrase of [
    'Wings taste better with friends.',
    'Loading your wing crew',
    'Retry',
    'No invitations yet',
    'Invite Friends',
    'Have a friend’s code?',
    'accessibilityLabel',
  ]) assert.match(hub, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('deferred attribution listens for cold warm and auth transitions', () => {
  assert.match(bridge, /Linking\.addEventListener\('url'/);
  assert.match(bridge, /Linking\.getInitialURL\(\)/);
  assert.match(bridge, /claimPendingReferral\(\{ placement: 'auth_transition' \}\)/);
  assert.match(referralLib, /PENDING_REFERRAL_KEY/);
  assert.match(referralLib, /AsyncStorage\.setItem\(PENDING_REFERRAL_KEY/);
});

test('native share copy uses centralized reward and configurable URL', () => {
  assert.match(referralLib, /EXPO_PUBLIC_REFERRAL_BASE_URL/);
  assert.match(referralLib, /Share\.share/);
  assert.match(referralLib, /we’ll both earn \$\{Number\(rewardAmount/);
});
