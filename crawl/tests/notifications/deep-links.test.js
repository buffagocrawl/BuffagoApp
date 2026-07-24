import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseNotificationDeepLink,
  resolveNotificationDestination,
} from '../../lib/notifications/deepLinks.js';

const ID = '123e4567-e89b-42d3-a456-426614174000';

test('notification routes cover rating, crawl, streak, and friend activity', () => {
  assert.equal(parseNotificationDeepLink(`buffago://rating/${ID}`).route, `/profile/history/${ID}`);
  assert.equal(parseNotificationDeepLink(`buffago://crawl/${ID}?destination=${ID}`).route, `/crawl/${ID}`);
  assert.match(parseNotificationDeepLink('buffago://engagement/today').route, /home/);
  assert.match(parseNotificationDeepLink('buffago://friends/activity').route, /leaderboards/);
});

test('cold-start expired session preserves return route through auth', async () => {
  const result = await resolveNotificationDestination({
    url: `buffago://crawl/${ID}`,
    isAuthenticated: false,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'authentication_required');
  assert.match(result.fallback, /returnTo/);
});

test('deleted, private, or stale destination falls back safely', async () => {
  const result = await resolveNotificationDestination({
    url: `buffago://rating/${ID}`,
    isAuthenticated: true,
    canAccess: async () => false,
  });
  assert.deepEqual(result, {
    ok: false, reason: 'destination_unavailable', fallback: '/(tabs)/home',
  });
});

test('malformed and unsupported links never route to arbitrary content', () => {
  assert.equal(parseNotificationDeepLink('https://evil.example/x').ok, false);
  assert.equal(parseNotificationDeepLink(null).fallback, '/(tabs)/home');
});
