import assert from 'node:assert/strict';
import test from 'node:test';

import { privacyPreferencesFromUser } from '../lib/privacyPreferences.js';

test('privacy preferences preserve backward-compatible defaults', () => {
  assert.deepEqual(privacyPreferencesFromUser({}), {
    shareUsername: true,
    shareLocation: true,
    hideVisitDate: false,
    socialFeedVisible: true,
    publicProfile: true,
  });
});

test('social opt out maps to a visible user-facing feed preference', () => {
  assert.equal(privacyPreferencesFromUser({ social_opt_out: true }).socialFeedVisible, false);
});
