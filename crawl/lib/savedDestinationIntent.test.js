import test from 'node:test';
import assert from 'node:assert/strict';
import {
  consumeSavedDestinationIntent,
  saveSavedDestinationIntent,
} from './savedDestinations.js';

function storage() {
  const values = new Map();
  return {
    async getItem(key) { return values.get(key) ?? null; },
    async setItem(key, value) { values.set(key, value); },
    async removeItem(key) { values.delete(key); },
  };
}

test('saved destination intent is validated and consumed once', async () => {
  const store = storage();
  assert.equal(await saveSavedDestinationIntent({ destinationId: 'd1', kind: 'favorites' }, store), true);
  assert.deepEqual(await consumeSavedDestinationIntent(store), { destinationId: 'd1', kind: 'favorites', saved: true });
  assert.equal(await consumeSavedDestinationIntent(store), null);
  assert.equal(await saveSavedDestinationIntent({ destinationId: 'd2', kind: 'unknown' }, store), false);
});
