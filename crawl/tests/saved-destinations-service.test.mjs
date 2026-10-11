import test from 'node:test';
import assert from 'node:assert/strict';
import { getSavedDestinationState, mutateSavedDestination, SavedDestinationError } from '../lib/savedDestinations.js';

function queryResult(data, error = null) {
  const chain = {
    select() { return chain; }, eq() { return chain; }, in() { return chain; }, order() { return chain; },
    upsert: async () => ({ data: null, error }), delete() { return chain; },
    then(resolve, reject) { return Promise.resolve({ data, error }).then(resolve, reject); },
  };
  return chain;
}

function client({ user = { id: 'u1' }, ratings = [], favorites = [], wantToTry = [], errors = {}, writes = [] } = {}) {
  return {
    auth: { getUser: async () => ({ data: { user }, error: null }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
    from(table) {
      if (table === 'user_want_to_try' && writes) {
        const result = queryResult(wantToTry);
        result.upsert = async (payload, options) => {
          writes.push({ operation: 'upsert', payload, options });
          return { data: null, error: errors[table] || null };
        };
        result.delete = () => {
          writes.push({ operation: 'delete' });
          return result;
        };
        return result;
      }
      if (errors[table]) return queryResult(null, errors[table]);
      if (table === 'destination_ratings') return queryResult(ratings);
      if (table === 'user_destination_favorites') return queryResult(favorites);
      if (table === 'user_want_to_try') return queryResult(wantToTry);
      if (table === 'destinations') return queryResult([{ id: 'd1', name: 'Wings' }]);
      return queryResult([]);
    },
  };
}

test('state uses the authenticated user rating history, not global unrated data', async () => {
  const state = await getSavedDestinationState({ client: client({ ratings: [{ destination_id: 'd1' }], favorites: [{ destination_id: 'd1' }] }), destinationIds: ['d1', 'd2'] });
  assert.equal(state.ratedIds.has('d1'), true);
  assert.equal(state.ratedIds.has('d2'), false);
  assert.equal(state.favoriteIds.has('d1'), true);
});

test('favorite mutation preflights personal eligibility and maps unavailable tables', async () => {
  await assert.rejects(
    mutateSavedDestination({ client: client(), kind: 'favorites', destinationId: 'd1', saved: true }),
    (error) => error instanceof SavedDestinationError && error.code === 'FAVORITE_REQUIRES_RATING'
  );
  await assert.rejects(
    getSavedDestinationState({ client: client({ errors: { user_destination_favorites: { message: 'relation user_destination_favorites does not exist' } } }) }),
    (error) => error.code === 'SAVED_DESTINATIONS_UNAVAILABLE'
  );
});

test('guest mutation never reaches a saved-list table', async () => {
  let writes = 0;
  const guest = client({ user: null });
  const originalFrom = guest.from;
  guest.from = (...args) => { writes += 1; return originalFrom(...args); };
  const result = await mutateSavedDestination({ client: guest, kind: 'wantToTry', destinationId: 'd1', saved: true });
  assert.deepEqual(result, { status: 'guest', requiresAuth: true, saved: false, destinationId: 'd1' });
  assert.equal(writes, 0);
});

test('Want to Try is personal, idempotent, and rejects a personally rated restaurant', async () => {
  const writes = [];
  const pending = client({ ratings: [], writes });
  const first = await mutateSavedDestination({ client: pending, kind: 'wantToTry', destinationId: 'd1', saved: true });
  const second = await mutateSavedDestination({ client: pending, kind: 'wantToTry', destinationId: 'd1', saved: true });
  assert.equal(first.saved, true);
  assert.equal(second.saved, true);
  assert.equal(writes.filter((entry) => entry.operation === 'upsert').length, 2);
  await mutateSavedDestination({ client: pending, kind: 'wantToTry', destinationId: 'd1', saved: false });
  assert.equal(writes.filter((entry) => entry.operation === 'delete').length, 1);

  await assert.rejects(
    mutateSavedDestination({ client: client({ ratings: [{ destination_id: 'd1' }] }), kind: 'wantToTry', destinationId: 'd1', saved: true }),
    (error) => error instanceof SavedDestinationError && error.code === 'WANT_TO_TRY_REQUIRES_UNRATED'
  );
});
