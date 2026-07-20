import test from 'node:test';
import assert from 'node:assert/strict';

import { ANALYTICS_EVENTS, sanitizeAnalyticsMetadata } from '../../lib/analyticsSchema.js';

test('canonical funnel event names remain stable', () => {
  assert.equal(ANALYTICS_EVENTS.ACTIVATION_COMPLETED, 'activation_completed');
  assert.equal(ANALYTICS_EVENTS.AUTH_CALLBACK_FAILED, 'auth_callback_failed');
  assert.equal(ANALYTICS_EVENTS.OWNER_DASHBOARD_VIEWED, 'owner_dashboard_viewed');
});

test('analytics metadata rejects secrets, contact data, nested payloads, and raw errors', () => {
  const safe = sanitizeAnalyticsMetadata({
    source: 'home',
    elapsed_ms: 321,
    is_guest: true,
    access_token: 'do-not-send',
    email: 'private@example.com',
    error_message: 'sensitive provider response',
    provider_payload: { id: 'private' },
  });

  assert.deepEqual(safe, { source: 'home', elapsed_ms: 321, is_guest: true });
});

test('analytics strings are bounded', () => {
  assert.equal(sanitizeAnalyticsMetadata({ source: 'x'.repeat(200) }).source.length, 120);
});
