import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSerranoEventMetadata } from '../../lib/analyticsSchema.js';
import { ROOT_RETRY_LIMIT, canRetryInSession, nextRetryCount } from '../../lib/errorRecovery.js';

test('Serrano event metadata carries common contract fields and excludes precise location', () => {
  const metadata = buildSerranoEventMetadata({ correlation_id: 'safe-correlation', latitude: 42.9, location_name: 'private' });
  assert.equal(metadata.event_version, 1);
  assert.equal(metadata.correlation_id, 'safe-correlation');
  assert.equal(typeof metadata.occurred_at, 'string');
  assert.equal(metadata.latitude, undefined);
  assert.equal(metadata.location_name, undefined);
});

test('root retry is capped per session', () => {
  assert.equal(canRetryInSession(ROOT_RETRY_LIMIT - 1), true);
  assert.equal(canRetryInSession(ROOT_RETRY_LIMIT), false);
  assert.equal(nextRetryCount(1), 2);
});
