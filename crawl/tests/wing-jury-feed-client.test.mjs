import test from 'node:test';
import assert from 'node:assert/strict';
import { createGuestJurySession, getWingJuryPhotoBatch } from '../lib/wingJuryService.js';

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const photo = (n) => ({ submission_id: id(n), signed_url: `https://fixture/${n}`, media_type: 'photo' });
function client(invoke, user = null) {
  return { auth: { getUser: async () => ({ data: { user } }) }, functions: { invoke } };
}

test('long guest sessions exclude every judged photo while requests carry only 500 hints', async () => {
  const guestSession = createGuestJurySession();
  for (let n = 1; n <= 700; n += 1) guestSession.register(id(n), 0);
  const calls = [];
  const result = await getWingJuryPhotoBatch({ enabled: true, guestSession, client: client(async (_name, { body }) => {
    calls.push(body);
    return { data: calls.length === 1
      ? { photos: [photo(1), photo(650)], has_more: true, next_cursor: 'page-2' }
      : { photos: [photo(700), photo(701)], has_more: false } };
  }) });
  assert.deepEqual(result.photos.map((p) => p.submission_id), [id(701)]);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].cursor, 'page-2');
  assert.equal(calls[0].judged_submission_ids.length, 500);
  assert.equal(calls[0].judged_submission_ids[0], id(201));
  assert.equal(guestSession.hasJudged(id(1)), true);
});

test('empty work-budget pages advance with bounded retries and retain continuation', async () => {
  let calls = 0;
  const result = await getWingJuryPhotoBatch({ enabled: true, client: client(async (_name, { body }) => {
    assert.equal(body.cursor, calls ? `cursor-${calls}` : null);
    calls += 1;
    return { data: { photos: [], has_more: true, next_cursor: `cursor-${calls}` } };
  }) });
  assert.equal(calls, 4);
  assert.equal(result.hasMore, true);
  assert.equal(result.nextCursor, 'cursor-4');
});

test('unavailable or denied location is the same deterministic null-coordinate request', async () => {
  for (const location of [null, {}, { latitude: null, longitude: null }]) {
    await getWingJuryPhotoBatch({ enabled: true, location, client: client(async (_name, { body }) => {
      assert.equal(body.latitude, null); assert.equal(body.longitude, null);
      return { data: { photos: [], has_more: false } };
    }) });
  }
});

test('broken cursor progress is a controlled error rather than an unbounded loop', async () => {
  for (const next_cursor of [null, 'same']) {
    let calls = 0;
    await assert.rejects(getWingJuryPhotoBatch({ enabled: true, cursor: 'same', client: client(async () => {
      calls += 1; return { data: { photos: [], has_more: true, next_cursor } };
    }) }), (error) => error.code === 'FEED_UNAVAILABLE');
    assert.equal(calls, 1);
  }
});

test('account change while an empty continuation is pending prevents the next request', async () => {
  let alive = true, calls = 0;
  await assert.rejects(getWingJuryPhotoBatch({ enabled: true, expectedUserId: 'A', isCurrent: () => alive,
    client: client(async () => { calls += 1; alive = false; return { data: { photos: [], has_more: true, next_cursor: 'next' } }; }, { id: 'A' })
  }), (error) => error.code === 'ACCOUNT_CHANGED');
  assert.equal(calls, 1);
});
