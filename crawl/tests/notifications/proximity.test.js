import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateForegroundProximity,
  selectGeofenceRegions,
  PROXIMITY_REGION_RADIUS_METERS,
} from '../../lib/notifications/proximity.js';

const destination = { latitude: 42.8864, longitude: -78.8784 };

test('foreground proximity accepts a precise point near 161 meters and rejects low accuracy', () => {
  const near = evaluateForegroundProximity({
    location: { coords: { latitude: 42.8874, longitude: -78.8784, accuracy: 20 } },
    destination,
  });
  assert.equal(near.eligible, true);
  assert.equal(evaluateForegroundProximity({
    location: { coords: { ...destination, accuracy: 400 } }, destination,
  }).reason, 'location_accuracy_insufficient');
});

test('hysteresis prevents enter/exit boundary bouncing', () => {
  const point = { coords: { latitude: 42.8882, longitude: -78.8784, accuracy: 20 } };
  assert.equal(evaluateForegroundProximity({ location: point, destination, wasInside: false }).eligible, false);
  assert.equal(evaluateForegroundProximity({ location: point, destination, wasInside: true }).eligible, true);
});

test('only the next incomplete crawl stop is registered', () => {
  const regions = selectGeofenceRegions([
    { crawlId: 'c', destinationId: '1', completed: true, ...destination },
    { crawlId: 'c', destinationId: '2', completed: false, ...destination },
    { crawlId: 'c', destinationId: '3', completed: false, ...destination },
  ]);
  assert.equal(regions.length, 1);
  assert.match(regions[0].identifier, /destination:2/);
  assert.equal(regions[0].radius, PROXIMITY_REGION_RADIUS_METERS);
});
