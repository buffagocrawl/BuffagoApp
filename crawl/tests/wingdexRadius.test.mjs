import test from 'node:test';
import assert from 'node:assert/strict';
import { WINGDEX_RADIUS_OPTIONS, nextWingdexRadius, wingdexRadiusMessage } from '../lib/wingdexRadius.js';

test('radius expansion visits every supported step and stops at the maximum', () => {
  let radius = WINGDEX_RADIUS_OPTIONS[0];
  const visited = [radius];
  while (nextWingdexRadius(radius) !== null) {
    radius = nextWingdexRadius(radius);
    visited.push(radius);
  }
  assert.deepEqual(visited, [5, 10, 25, 50, 100, 250]);
  assert.equal(nextWingdexRadius(250), null);
  assert.equal(nextWingdexRadius(300), null);
});

test('restored numeric string and intermediate radius advance without shrinking', () => {
  assert.equal(nextWingdexRadius('5'), 10);
  assert.equal(nextWingdexRadius(12), 25);
});

test('no-results message states current radius and the maximum boundary', () => {
  assert.match(wingdexRadiusMessage(5), /Currently searching within 5 miles/);
  assert.doesNotMatch(wingdexRadiusMessage(5), /Maximum/);
  assert.match(wingdexRadiusMessage(250), /Currently searching within 250 miles.*Maximum search radius reached/);
});
