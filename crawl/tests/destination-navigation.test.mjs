import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDirectionsUrl, normalizeDestination, openDestinationDirections, DestinationNavigationError } from '../lib/destinationNavigationCore.js';
import { persistHomeDestination } from '../lib/homeDestination.js';

test('directions prefer canonical coordinates with correct ordering', () => {
  const url = buildDirectionsUrl({ id: 'd1', lat: 41.7, lng: -72.6 }, 'android');
  assert.match(url, /q=41\.7%2C-72\.6/);
  assert.doesNotMatch(url, /-72\.6%2C41\.7/);
});

test('iOS directions encode an address fallback', () => {
  const url = buildDirectionsUrl({ id: 'd1', name: 'Wings', address: '1 Main St', city: 'Hartford', stateCode: 'CT' }, 'ios');
  assert.equal(url, 'http://maps.apple.com/?daddr=1%20Main%20St%2C%20Hartford%2C%20CT&dirflg=d');
});

test('invalid coordinates fall back to a valid address and missing details fail closed', () => {
  assert.equal(normalizeDestination({ id: 'd1', lat: 999, lng: 2, address: '1 Main St' }).lat, null);
  assert.throws(() => normalizeDestination({ id: 'd1', lat: 999, lng: 2 }), (error) => error instanceof DestinationNavigationError && error.code === 'MISSING_DESTINATION_DETAILS');
});

test('launcher falls back once without duplicate opens', async () => {
  const opened = [];
  const result = await openDestinationDirections({
    destination: { id: 'd1', lat: 41.7, lng: -72.6 },
    platform: 'android',
    canOpenURL: async (url) => url.startsWith('https://'),
    openURL: async (url) => opened.push(url),
  });
  assert.equal(result.fallback, true);
  assert.equal(opened.length, 1);
  assert.match(opened[0], /destination=41\.7%2C-72\.6/);
});

test('Home destination persistence emits the existing synchronization event', async () => {
  const writes = [];
  const events = [];
  const storage = { setItem: async (key, value) => writes.push({ key, value }) };
  const emitter = { emit: (event, value) => events.push({ event, value }) };
  await persistHomeDestination({ id: 'd1', name: 'Wings', address: '1 Main St' }, storage, emitter);
  assert.equal(writes.length, 1);
  assert.match(writes[0].value, /"id":"d1"/);
  assert.equal(events.length, 1);
  assert.equal(events[0].value.id, 'd1');
});
