import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ENGAGEMENT_FLAG_DEFAULTS,
  getEngagementFlags,
  isEngagementFeatureEnabled,
} from '../config/engagementFlags.js';

test('engagement flags have safe documented defaults', () => {
  assert.equal(ENGAGEMENT_FLAG_DEFAULTS.home_mission_dashboard, true);
  assert.equal(ENGAGEMENT_FLAG_DEFAULTS.limited_time_events, false);
});

test('engagement flags accept explicit Expo public overrides', () => {
  const env = {
    EXPO_PUBLIC_SOCIAL_FEED_V2: 'false',
    EXPO_PUBLIC_LIMITED_TIME_EVENTS: 'true',
  };
  const flags = getEngagementFlags(env);
  assert.equal(flags.social_feed_v2, false);
  assert.equal(flags.limited_time_events, true);
  assert.equal(isEngagementFeatureEnabled('unknown', env), false);
});
