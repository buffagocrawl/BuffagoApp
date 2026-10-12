import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { getSavedDestinationState, getSavedDestinations, mutateSavedDestination, SavedDestinationError } from '../lib/savedDestinations.js';

test('saved destinations are enabled locally and in every release profile, with an explicit rollback switch', () => {
  const source = fs.readFileSync(new URL('../config/features.ts', import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const enabled = (env) => {
    const exports = {};
    vm.runInNewContext(code, { exports, process: { env } });
    return exports.ENABLE_SAVED_DESTINATIONS;
  };
  assert.equal(enabled({}), true);
  assert.equal(enabled({ EXPO_PUBLIC_ENABLE_SAVED_DESTINATIONS: 'false' }), false);
  const profiles = JSON.parse(fs.readFileSync(new URL('../eas.json', import.meta.url), 'utf8')).build;
  for (const name of ['development', 'internal-testing', 'production']) {
    assert.equal(enabled(profiles[name].env), true, name);
  }
});

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
      if (['user_want_to_try', 'user_destination_favorites'].includes(table) && writes) {
        const rows = table === 'user_want_to_try' ? wantToTry : favorites;
        const result = queryResult(rows, errors[table] || null);
        result.upsert = async (payload, options) => {
          writes.push({ operation: 'upsert', payload, options });
          if (!errors[table] && !rows.some((row) => row.destination_id === payload.destination_id)) rows.push(payload);
          return { data: null, error: errors[table] || null };
        };
        result.delete = () => {
          writes.push({ operation: 'delete' });
          rows.splice(0, rows.length);
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

test('Favorites and Want to Try reload persisted saves and removals in a fresh service read', async () => {
  for (const kind of ['favorites', 'wantToTry']) {
    const rows = [];
    const options = { ratings: kind === 'favorites' ? [{ destination_id: 'd1' }] : [], [kind]: rows };
    const firstSession = client(options);
    await mutateSavedDestination({ client: firstSession, kind, destinationId: 'd1', saved: true });
    await mutateSavedDestination({ client: firstSession, kind, destinationId: 'd1', saved: true });
    assert.equal(rows.length, 1, 'repeated save stays idempotent');
    const reopenedSession = client(options);
    const list = await getSavedDestinations({ client: reopenedSession, kind });
    assert.equal(list.rows.length, 1);
    assert.equal(list.rows[0].destination_id, 'd1');
    await mutateSavedDestination({ client: reopenedSession, kind, destinationId: 'd1', saved: false });
    assert.equal((await getSavedDestinations({ client: client(options), kind })).rows.length, 0);
  }
});

test('guest saved collections return an authentication state without querying tables', async () => {
  const guest = client({ user: null });
  guest.from = () => { throw new Error('guest must not read personal tables'); };
  for (const kind of ['favorites', 'wantToTry']) {
    assert.deepEqual(await getSavedDestinations({ client: guest, kind }), { status: 'guest', userId: null, rows: [] });
  }
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

test('anonymous-auth guests cannot read or write personal saved collections', async () => {
  const guest = client({ user: { id: 'anonymous', is_anonymous: true } });
  guest.from = () => { throw new Error('anonymous guest must not reach personal tables'); };
  assert.equal((await getSavedDestinationState({ client: guest })).status, 'guest');
  assert.equal((await getSavedDestinations({ client: guest, kind: 'favorites' })).status, 'guest');
  assert.equal((await mutateSavedDestination({ client: guest, kind: 'wantToTry', destinationId: 'd1', saved: true })).requiresAuth, true);
});

test('network failures reject the save instead of reporting success', async () => {
  await assert.rejects(
    mutateSavedDestination({ client: client({ errors: { user_want_to_try: { message: 'Failed to fetch' } } }), kind: 'wantToTry', destinationId: 'd1', saved: true }),
    (error) => error.code === 'SAVED_DESTINATION_REQUEST_FAILED'
  );
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
