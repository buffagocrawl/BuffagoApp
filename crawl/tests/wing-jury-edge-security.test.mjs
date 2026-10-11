import { boundaryFixture, request } from './helpers/wingJuryEdgeHarness.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import ts from 'typescript';
import {
  createGuestJurySession, getWingJuryPhotoBatch, recordWingJuryVerdict,
} from '../lib/wingJuryService.js';

// Execute the checked-in handlers with HTTP Request/Response and mocked network
// clients. This does not exercise the Supabase gateway, storage service, or RLS.
const sourceRoot = new URL('../supabase/functions/', import.meta.url);
const userId = '11111111-1111-4111-8111-111111111111';
const otherId = '22222222-2222-4222-8222-222222222222';
const photoId = '33333333-3333-4333-8333-333333333333';
const destinationId = '44444444-4444-4444-8444-444444444444';
const photo = {
  id: photoId, destination_id: destinationId, user_id: otherId,
  media_type: 'photo', status: 'approved', owner_deleted_at: null,
  withdrawn_at: null, processed_storage_path: `processed/${photoId}/primary`,
  consent_version: 'v1', consented_at: '2020-01-01T00:00:00Z',
  attribution_preference: 'anonymous', created_at: '2020-01-01T00:00:00Z',
};

test('all handlers reject oversized declared and streamed bodies before credentials or data access', async () => {
  for (const name of ['wing-jury-feed', 'wing-jury-vote', 'wing-jury-reveal']) {
    const f = await boundaryFixture(); const handler = await f.handler(name);
    for (const headers of [{ 'content-length': '32769' }, {}]) {
      const response = await handler(new Request('https://edge.example', { method: 'POST', headers, body: JSON.stringify({ padding: 'x'.repeat(32769) }) }));
      assert.equal(response.status, 400);
    }
    assert.deepEqual(f.clientOptions, []);
  }
});

test('unsafe or noncanonical signed URLs cannot be released by feed or used to authorize vote/reveal', async () => {
  for (const signedUrl of [
    `http://project.example/storage/v1/object/sign/wing-submissions/processed/${photoId}/primary?token=x`,
    `https://evil.example/storage/v1/object/sign/wing-submissions/processed/${photoId}/primary?token=x`,
    `https://user:password@project.example/storage/v1/object/sign/wing-submissions/processed/${photoId}/primary?token=x`,
    `https://project.example/storage/v1/object/sign/wing-submissions/originals/private?token=x`,
    `https://project.example/storage/v1/object/sign/wing-submissions/processed/${photoId}/primary`,
    `https://project.example/storage/v1/object/sign/wing-submissions/processed/${photoId}/primary?token=x#leak`,
    'javascript:alert(1)',
  ]) {
    const f = await boundaryFixture({ user: { id: userId }, adminOverrides: { signedUrl } });
    const feed = await (await (await f.handler('wing-jury-feed'))(request({}))).json();
    assert.equal(feed.photos.length, 0, signedUrl);
    assert.equal((await (await f.handler('wing-jury-vote'))(request({ submission_id: photoId, vote: 1 }))).status, 403);
    assert.equal((await (await f.handler('wing-jury-reveal'))(request({ submission_id: photoId }))).status, 404);
    assert.deepEqual(f.auth.writes, []);
  }
});

test('boundary validates the bearer token with getUser and scopes the write client', async () => {
  const f = await boundaryFixture({ user: { id: userId }, adminOverrides: { authError: { message: 'invalid token' } } });
  const result = await f.shared.createBoundary(request({ user_id: otherId }));
  assert.equal(result.user, null);
  assert.equal(f.admin.calls[0].authToken, 'verified-user-token');
  assert.equal(f.clientOptions[1].key, 'public-key');
  assert.equal(f.clientOptions[1].options.global.headers.Authorization, 'Bearer verified-user-token');
});

test('guest, invalid-token, and anonymous-auth callers cannot create a vote', async () => {
  for (const user of [null, { id: userId, is_anonymous: true }]) {
    const f = await boundaryFixture({ user });
    const handler = await f.handler('wing-jury-vote');
    for (const token of [null, 'invalid-token']) {
      const response = await handler(request({ submission_id: photoId, vote: 0, user_id: otherId }, token));
      assert.equal(response.status, 401);
      assert.deepEqual(f.auth.writes, []);
      assert.deepEqual(f.admin.writes, []);
    }
  }
});

test('authenticated neutral vote derives ownership from verified identity and never writes via admin', async () => {
  const f = await boundaryFixture({ user: { id: userId } });
  const response = await (await f.handler('wing-jury-vote'))(request({ submission_id: photoId, vote: 0, user_id: otherId }));
  assert.equal(response.status, 200);
  assert.deepEqual(f.auth.writes, [{ table: 'wing_jury_votes', value: { submission_id: photoId, user_id: userId, vote: 0 } }]);
  assert.deepEqual(f.admin.writes, []);
  assert.equal((await response.json()).vote, 0);
});

test('duplicate conflicting verdict returns the original permanent verdict', async () => {
  const f = await boundaryFixture({
    user: { id: userId }, authOverrides: { insertError: { code: '23505' } },
    tables: { wing_jury_votes: [{ submission_id: photoId, user_id: userId, vote: -1, created_at: '2020-01-01' }] },
  });
  const result = await (await (await f.handler('wing-jury-vote'))(request({ submission_id: photoId, vote: 1 }))).json();
  assert.equal(result.existing_vote, true);
  assert.equal(result.vote, -1);
  const lookup = f.auth.calls.find((call) => call.table === 'wing_jury_votes' && call.predicates.length);
  assert.ok(lookup.predicates.some(([, key, value]) => key === 'user_id' && value === userId));
  assert.equal(f.auth.writes.length, 1);
});

test('non-duplicate persistence errors remain failures and do not expose database text', async () => {
  const f = await boundaryFixture({ user: { id: userId }, authOverrides: { insertError: { code: '42501', message: 'secret policy detail' } } });
  const response = await (await f.handler('wing-jury-vote'))(request({ submission_id: photoId, vote: 1 }));
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { ok: false, error: 'vote_not_saved' });
});

test('trusted photo boundary rejects unapproved, withdrawn, owner-deleted, noncanonical, and unconsented photos', async () => {
  for (const change of [
    { status: 'processing' }, { media_type: 'video' }, { withdrawn_at: '2020-01-01' },
    { owner_deleted_at: '2020-01-01' }, { user_id: null }, { consent_version: ' ' },
    { consented_at: null }, { consented_at: '2099-01-01' },
    { attribution_preference: 'private' }, { processed_storage_path: 'originals/private-image' },
  ]) {
    const f = await boundaryFixture({ user: { id: userId }, tables: { wing_media_submissions: [{ ...photo, ...change }] } });
    const response = await (await f.handler('wing-jury-vote'))(request({ submission_id: photoId, vote: 1 }));
    assert.equal(response.status, 403, JSON.stringify(change));
    assert.deepEqual(f.auth.writes, []);
    assert.deepEqual(f.admin.signedPaths, []);
  }
});

test('storage signing failure prevents voting and returns a controlled failure', async () => {
  const f = await boundaryFixture({ user: { id: userId }, adminOverrides: { storageError: true } });
  const response = await (await f.handler('wing-jury-vote'))(request({ submission_id: photoId, vote: 1 }));
  assert.equal(response.status, 403);
  assert.deepEqual(f.auth.writes, []);
});

test('reveal requires the current authenticated user vote, even with a forged guest flag', async () => {
  const f = await boundaryFixture({ user: { id: userId }, tables: { wing_jury_votes: [{ user_id: otherId, submission_id: photoId }] } });
  const response = await (await f.handler('wing-jury-reveal'))(request({ submission_id: photoId, guest_verdict_registered: true, user_id: otherId }));
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error, 'vote_required');
  assert.equal(f.admin.calls.some((call) => call.table === 'destination_ratings'), false);
});

test('guest reveal requires a local verdict signal and never loads account collections or personal history', async () => {
  const f = await boundaryFixture({ tables: {
    destinations: [{ id: destinationId, name: 'Public Wings', address: 'Public Street', city: 'Buffalo', lat: 42, lng: -78 }],
    destination_ratings: [{ destination_id: destinationId, weight_score: 90, created_at: '2020-01-01', user_id: otherId }],
  } });
  const handler = await f.handler('wing-jury-reveal');
  assert.equal((await handler(request({ submission_id: photoId }, null))).status, 403);
  const response = await handler(request({ submission_id: photoId, guest_verdict_registered: true }, null));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.personal_rating, null);
  assert.equal(body.favorite, false);
  assert.equal(body.want_to_try, false);
  assert.equal(body.save_action, 'sign_in_to_save');
  assert.equal(f.admin.calls.some((call) => ['user_destination_favorites', 'user_want_to_try'].includes(call.table)), false);
  assert.equal(JSON.stringify(body).includes(otherId), false);
  assert.deepEqual(f.admin.writes, []);
  assert.deepEqual(f.auth.writes, []);
});

test('authenticated reveal scopes latest personal rating and private saved state to the verified account', async () => {
  const f = await boundaryFixture({ user: { id: userId }, tables: {
    wing_jury_votes: [{ user_id: userId, submission_id: photoId }],
    destinations: [{ id: destinationId, name: 'Public Wings' }],
    destination_ratings: [
      { destination_id: destinationId, user_id: otherId, weight_score: 99, created_at: '2020-01-01' },
      { destination_id: destinationId, user_id: userId, weight_score: 80, created_at: '2020-01-01' },
    ],
    user_destination_favorites: [{ user_id: otherId, destination_id: destinationId }],
    user_want_to_try: [{ user_id: otherId, destination_id: destinationId }],
  } });
  const response = await (await f.handler('wing-jury-reveal'))(request({ submission_id: photoId }));
  const body = await response.json();
  assert.equal(body.personal_rating.weight_score, 80);
  assert.equal(body.favorite, false);
  assert.equal(body.want_to_try, false);
  assert.equal(body.save_action, 'favorite');
  for (const table of ['user_destination_favorites', 'user_want_to_try']) {
    assert.ok(f.admin.calls.find((call) => call.table === table).predicates.some(([, key, value]) => key === 'user_id' && value === userId));
  }
  assert.equal(JSON.stringify(body).includes(otherId), false);
});

test('blind feed returns only safe fields and excludes judged photos for the verified account', async () => {
  const tables = {
    destinations: [{ id: destinationId, lat: 42, lng: -78 }],
    wing_jury_votes: [{ user_id: otherId, submission_id: photoId }],
  };
  const f = await boundaryFixture({ user: { id: userId }, tables });
  const handler = await f.handler('wing-jury-feed');
  const response = await handler(request({ judged_submission_ids: [photoId], user_id: otherId }));
  const body = await response.json();
  assert.equal(body.photos.length, 1, 'another account verdict and forged guest exclusion must not hide the photo');
  assert.deepEqual(Object.keys(body.photos[0]).sort(), ['expires_at', 'media_type', 'signed_url', 'submission_id']);
  assert.equal(JSON.stringify(body).includes(otherId), false);
  assert.equal(JSON.stringify(body).includes(destinationId), false);
  tables.wing_jury_votes.push({ user_id: userId, submission_id: photoId });
  assert.equal((await (await handler(request({}))).json()).photos.length, 0);
  assert.deepEqual(f.admin.writes, []);
});

test('all Edge handlers reject unsupported methods and answer preflight without touching credentials', async () => {
  for (const name of ['wing-jury-feed', 'wing-jury-vote', 'wing-jury-reveal']) {
    const f = await boundaryFixture();
    const handler = await f.handler(name);
    const preflight = await handler(request(null, null, 'OPTIONS'));
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), '*');
    assert.match(preflight.headers.get('access-control-allow-headers'), /authorization/);
    assert.equal((await handler(request(null, null, 'GET'))).status, 405);
    assert.deepEqual(f.clientOptions, []);
  }
});

test('Phase 5 sources transpile without syntax diagnostics', async () => {
  for (const file of ['_shared/wingJury.ts', 'wing-jury-feed/index.ts', 'wing-jury-vote/index.ts', 'wing-jury-reveal/index.ts']) {
    const result = ts.transpileModule(await readFile(new URL(file, sourceRoot), 'utf8'), { reportDiagnostics: true });
    assert.deepEqual(result.diagnostics, [], file);
  }
});

test('reviewed public Jury and saved-list entry files contain no service-role or secret-key references', async () => {
  for (const file of [
    'lib/wingJuryService.js', 'components/WingJuryGame.jsx', 'lib/savedDestinations.js',
    'hooks/useSavedDestinations.js', 'app/wing-jury/index.jsx', 'config/features.ts',
  ]) {
    const source = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE|service_role|sb_secret_/i, file);
  }
});

test('malformed verdict payloads cannot silently create an immutable neutral vote', async () => {
  for (const vote of [null, false, '', []]) {
    const f = await boundaryFixture({ user: { id: userId } });
    const response = await (await f.handler('wing-jury-vote'))(request({ submission_id: photoId, vote }));
    assert.equal(response.status, 400, JSON.stringify(vote));
    assert.deepEqual(f.auth.writes, []);
  }
});

test('blind feed cursor does not disclose the hidden destination identity', async () => {
  const f = await boundaryFixture({ tables: {
    destinations: [{ id: destinationId, lat: 42, lng: -78 }],
    wing_media_submissions: [photo, { ...photo, id: otherId, processed_storage_path: `processed/${otherId}/primary` }],
  } });
  const response = await (await f.handler('wing-jury-feed'))(request({ limit: 1 }, null));
  const body = await response.json();
  assert.equal(body.has_more, true);
  assert.equal(atob(body.next_cursor).includes(destinationId), false);
});

test('real signed-out Supabase session can fetch the guest feed', async () => {
  const client = {
    auth: { getUser: async () => ({ data: { user: null }, error: { name: 'AuthSessionMissingError', message: 'Auth session missing!' } }) },
    functions: { invoke: async () => ({ data: { ok: true, photos: [] }, error: null }) },
  };
  await getWingJuryPhotoBatch({ client, enabled: true });
});

test('real signed-out Supabase session can record an in-memory neutral verdict', async () => {
  const session = createGuestJurySession();
  const client = {
    auth: { getUser: async () => ({ data: { user: null }, error: { name: 'AuthSessionMissingError', message: 'Auth session missing!' } }) },
    functions: { invoke: async () => assert.fail('guest verdict must not invoke a function') },
  };
  await recordWingJuryVerdict({ client, photo: { submission_id: photoId }, vote: 0, guestSession: session, enabled: true });
  assert.equal(session.hasJudged(photoId), true);
});

test('absent location selects the documented nonlocation fallback', async () => {
  const f = await boundaryFixture();
  assert.equal(f.shared.isValidCoordinate(null, null), false);
  assert.equal(f.shared.isValidCoordinate('', ''), false);
  assert.equal(f.shared.isValidCoordinate(0, 0), true);
});

test('anonymous-auth gameplay sends its in-memory judged IDs to the guest feed', async () => {
  const session = createGuestJurySession(); session.register(photoId, 0);
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: userId, is_anonymous: true } }, error: null }) },
    functions: { invoke: async (_name, options) => {
      assert.deepEqual(options.body.judged_submission_ids, [photoId]);
      return { data: { ok: true, photos: [] }, error: null };
    } },
  };
  await getWingJuryPhotoBatch({ client, guestSession: session, enabled: true });
});

test('numeric verdict contract rejects strings, objects, missing values, and out of range values without signing or writing', async () => {
  for (const vote of ['0', '1', '-1', true, {}, [1], 2, -2, undefined]) {
    const f = await boundaryFixture({ user: { id: userId } });
    const response = await (await f.handler('wing-jury-vote'))(request({ submission_id: photoId, vote }));
    assert.equal(response.status, 400);
    assert.deepEqual(f.auth.writes, []);
    assert.deepEqual(f.admin.signedPaths, []);
  }
});

test('invalid consent timestamps fail closed in feed, vote, and reveal', async () => {
  for (const name of ['wing-jury-feed', 'wing-jury-vote', 'wing-jury-reveal']) {
    const f = await boundaryFixture({ user: { id: userId }, tables: {
      wing_media_submissions: [{ ...photo, consented_at: 'not-a-date' }],
      destinations: [{ id: destinationId, lat: 42, lng: -78 }],
    } });
    const response = await (await f.handler(name))(request({ submission_id: photoId, vote: 1 }));
    assert.equal(response.status, name === 'wing-jury-feed' ? 200 : name === 'wing-jury-vote' ? 403 : 404);
    if (name === 'wing-jury-feed') assert.deepEqual((await response.json()).photos, []);
    assert.deepEqual(f.auth.writes, []);
    assert.deepEqual(f.admin.signedPaths, []);
  }
});

test('database live-object predicate denies unavailable media before signing for every handler', async () => {
  for (const name of ['wing-jury-feed', 'wing-jury-vote', 'wing-jury-reveal']) {
    const f = await boundaryFixture({ user: { id: userId }, adminOverrides: { publicEligibility: false }, tables: {
      destinations: [{ id: destinationId, lat: 42, lng: -78 }],
    } });
    const response = await (await f.handler(name))(request({ submission_id: photoId, vote: 1 }));
    assert.equal(response.status, name === 'wing-jury-feed' ? 200 : name === 'wing-jury-vote' ? 403 : 404);
    if (name === 'wing-jury-feed') assert.deepEqual((await response.json()).photos, []);
    assert.deepEqual(f.admin.signedPaths, []);
    assert.deepEqual(f.auth.writes, []);
    assert.ok(f.admin.calls.some((call) => call.rpc === 'is_public_wing_jury_photo' && call.args.p_submission_id === photoId));
  }
});

test('withdrawal during signing is rechecked before a feed photo, vote, or reveal is released', async () => {
  for (const name of ['wing-jury-feed', 'wing-jury-vote', 'wing-jury-reveal']) {
    let checks = 0;
    const f = await boundaryFixture({ user: { id: userId }, adminOverrides: { publicEligibility: () => ++checks === 1 }, tables: {
      destinations: [{ id: destinationId, lat: 42, lng: -78 }],
    } });
    const response = await (await f.handler(name))(request({ submission_id: photoId, vote: 1 }));
    assert.equal(response.status, name === 'wing-jury-feed' ? 200 : name === 'wing-jury-vote' ? 403 : 404);
    if (name === 'wing-jury-feed') assert.deepEqual((await response.json()).photos, []);
    assert.equal(checks, 2);
    assert.deepEqual(f.auth.writes, []);
  }
});

test('eligibility infrastructure errors produce controlled failures and no vote writes', async () => {
  const f = await boundaryFixture({ user: { id: userId }, adminOverrides: { eligibilityError: true } });
  const response = await (await f.handler('wing-jury-vote'))(request({ submission_id: photoId, vote: 1 }));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { ok: false, error: 'vote_unavailable' });
  assert.deepEqual(f.auth.writes, []);
});

test('feed checks strict complete numeric location pairs while preserving legitimate zero coordinates', async () => {
  const f = await boundaryFixture({ tables: { destinations: [{ id: destinationId, lat: 0, lng: 0 }] } });
  const handler = await f.handler('wing-jury-feed');
  for (const body of [{ latitude: null, longitude: null }, {}]) {
    const response = await handler(request(body, null));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).location_fallback, true);
  }
  for (const body of [
    { latitude: '', longitude: '' }, { latitude: '0', longitude: '0' },
    { latitude: 0 }, { longitude: 0 }, { latitude: 91, longitude: 0 },
    { latitude: 0, longitude: -181 }, { latitude: false, longitude: [] },
  ]) assert.equal((await handler(request(body, null))).status, 400);
  const response = await handler(request({ latitude: 0, longitude: 0 }, null));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).location_fallback, false);
});

test('encrypted cursors preserve pagination with guest exclusions and reject malformed, tampered, expired, cross-account, or changed-location cursors', async () => {
  const f = await boundaryFixture({ user: { id: userId }, tables: {
    destinations: [{ id: destinationId, lat: 42, lng: -78 }],
    wing_media_submissions: [photo, { ...photo, id: otherId, processed_storage_path: `processed/${otherId}/primary` }],
  } });
  const handler = await f.handler('wing-jury-feed');
  const first = await (await handler(request({ limit: 1 }, null))).json();
  const second = await (await handler(request({ cursor: first.next_cursor, judged_submission_ids: [first.photos[0].submission_id] }, null))).json();
  assert.equal(second.photos.length, 1);
  assert.notEqual(second.photos[0].submission_id, first.photos[0].submission_id);
  assert.equal(second.has_more, false);
  const tampered = `${first.next_cursor[0] === 'A' ? 'B' : 'A'}${first.next_cursor.slice(1)}`;
  for (const cursor of ['', 'bad cursor', btoa('{}'), tampered, 'A'.repeat(4097)]) {
    const response = await handler(request({ cursor }, null));
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, 'invalid_cursor');
  }
  assert.equal((await handler(request({ cursor: first.next_cursor }))).status, 400, 'guest cursor must not transfer to a signed-in principal');
  assert.equal((await handler(request({ cursor: first.next_cursor, latitude: 42, longitude: -78 }, null))).status, 400);
  const signed = await (await handler(request({ limit: 1 }))).json();
  await assert.rejects(f.shared.decodeJuryCursor(signed.next_cursor, { id: otherId }, null, null), /invalid_cursor/);
  const expired = await f.shared.encodeJuryCursor({ destination_id: destinationId, submission_id: photoId, created_at: photo.created_at, distance: null }, null, null, null);
  // Re-encrypt a deliberately expired envelope with the fixture server key.
  // This tests expiry independently of authentication/tamper validation.
    const raw = Uint8Array.from(atob(expired), (char) => char.charCodeAt(0));
    const digest = await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode('wing-jury-cursor-v1:server-secret'));
    const key = await webcrypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt']);
    const additionalData = new TextEncoder().encode(JSON.stringify({ version: 1, principal: 'guest', latitude: null, longitude: null }));
    const encrypted = new Uint8Array(await webcrypto.subtle.encrypt({ name: 'AES-GCM', iv: raw.slice(0, 12), additionalData }, key, new TextEncoder().encode(JSON.stringify({ destination_id: destinationId, submission_id: photoId, created_at: photo.created_at, distance: null, expires_at: 1 }))));
    const bytes = new Uint8Array(12 + encrypted.length); bytes.set(raw.slice(0, 12)); bytes.set(encrypted, 12);
    assert.equal((await handler(request({ cursor: btoa(String.fromCharCode(...bytes)) }, null))).status, 400);
});

test('count lookup failure after committed vote can retry as duplicate and retains the original verdict', async () => {
  const f = await boundaryFixture({ user: { id: userId }, authOverrides: { errors: { wing_jury_photo_vote_counts: true } } });
  const response = await (await f.handler('wing-jury-vote'))(request({ submission_id: photoId, vote: 1 }));
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, 'vote_count_unavailable');
  assert.equal(f.auth.writes.length, 1);
  const retry = await boundaryFixture({ user: { id: userId }, authOverrides: { insertError: { code: '23505' } }, tables: {
    wing_jury_votes: [{ submission_id: photoId, user_id: userId, vote: 1, created_at: '2020-01-01' }],
    wing_jury_photo_vote_counts: [{ submission_id: photoId, like_count: 1 }],
  } });
  const body = await (await (await retry.handler('wing-jury-vote'))(request({ submission_id: photoId, vote: -1 }))).json();
  assert.equal(body.existing_vote, true);
  assert.equal(body.vote, 1);
  assert.equal(body.like_count, 1);
});

test('public reveal excludes missing scores from the complete aggregate and responses do not cache account data', async () => {
  const f = await boundaryFixture({ tables: {
    destinations: [{ id: destinationId, name: 'Public Wings' }],
    destination_ratings: [{ destination_id: destinationId, weight_score: null }, { destination_id: destinationId, weight_score: 80 }],
  } });
  const response = await (await f.handler('wing-jury-reveal'))(request({ submission_id: photoId, guest_verdict_registered: true }, null));
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('access-control-allow-methods'), 'POST, OPTIONS');
  assert.deepEqual((await response.json()).restaurant_rating, { average_weight_score: 80, rating_count: 1 });
});

test('public reveal uses the complete server aggregate beyond 1000 rows without loading individual public ratings', async () => {
  const f = await boundaryFixture({ tables: {
    destinations: [{ id: destinationId, name: 'Public Wings' }],
    destination_ratings: [...Array.from({ length: 1000 }, () => ({ destination_id: destinationId, weight_score: 80 })), { destination_id: destinationId, weight_score: 20 }],
  } });
  const response = await (await f.handler('wing-jury-reveal'))(request({ submission_id: photoId, guest_verdict_registered: true }, null));
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).restaurant_rating, { average_weight_score: 80020 / 1001, rating_count: 1001 });
  assert.ok(f.admin.calls.some((call) => call.rpc === 'wing_jury_restaurant_rating_summary' && call.args.p_destination_id === destinationId));
  assert.equal(f.admin.calls.some((call) => call.table === 'destination_ratings'), false);
});

test('server rating aggregate errors return a controlled unavailable reveal', async () => {
  const f = await boundaryFixture({ adminOverrides: { summaryError: true }, tables: { destinations: [{ id: destinationId, name: 'Public Wings' }] } });
  const response = await (await f.handler('wing-jury-reveal'))(request({ submission_id: photoId, guest_verdict_registered: true }, null));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { ok: false, error: 'reveal_unavailable' });
});

test('all handlers reject null, array, primitive, and malformed JSON bodies before credentials or data access', async () => {
  for (const name of ['wing-jury-feed', 'wing-jury-vote', 'wing-jury-reveal']) {
    const f = await boundaryFixture({ user: { id: userId } });
    const handler = await f.handler(name);
    for (const body of [null, [], 'text', 1, true]) {
      const response = await handler(request(body));
      assert.equal(response.status, 400);
      assert.equal((await response.json()).error, 'invalid_request');
    }
    assert.equal((await handler(new Request('https://edge.example', { method: 'POST', body: '{' }))).status, 400);
    assert.deepEqual(f.clientOptions, []);
  }
});

test('feed limits and guest exclusions have bounded strict input contracts', async () => {
  const f = await boundaryFixture();
  const handler = await f.handler('wing-jury-feed');
  for (const limit of [0, 25, 1.5, '12', false, [], {}]) {
    const response = await handler(request({ limit }, null));
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, 'invalid_limit');
  }
  for (const judged_submission_ids of [[photoId, null], ['not-a-uuid'], 'text', Array(501).fill(photoId)]) {
    const response = await handler(request({ judged_submission_ids }, null));
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, 'invalid_judged_ids');
  }
  assert.deepEqual(f.clientOptions, []);
  for (const limit of [null, undefined, 1, 24]) assert.equal((await handler(request({ limit }, null))).status, 200);
  assert.equal((await handler(request({ judged_submission_ids: Array(500).fill(photoId) }, null))).status, 200);
});

test('feed fills pages past per-object signing failures and withdrawals during signing', async () => {
  const candidates = Array.from({ length: 14 }, (_, index) => {
    const id = `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
    return { ...photo, id, processed_storage_path: `processed/${id}/primary` };
  });
  for (const failMode of ['signing', 'withdrawal']) {
    const checks = new Map();
    const f = await boundaryFixture({ tables: {
      destinations: [{ id: destinationId, lat: 42, lng: -78 }], wing_media_submissions: candidates,
    }, adminOverrides: failMode === 'signing'
      ? { missingSignedPaths: candidates.slice(0, 12).map((row) => row.processed_storage_path) }
      : { publicEligibility: (id) => {
        const count = (checks.get(id) || 0) + 1; checks.set(id, count);
        return count === 1 || candidates.slice(12).some((row) => row.id === id);
      } } });
    const response = await (await f.handler('wing-jury-feed'))(request({ limit: 1 }, null));
    const result = await response.json();
    assert.equal(response.status, 200);
    assert.equal(result.photos.length, 1);
    assert.equal(result.photos[0].submission_id, candidates[12].id);
    assert.equal(result.has_more, true);
    assert.ok(result.next_cursor);
    assert.equal(f.admin.signedPaths.length, 2, 'later batch must be considered after the first batch disappears');
  }
});

test('feed retries mint fresh URLs without changing safe photo identity or persisting a guest verdict', async () => {
  const f = await boundaryFixture({ tables: { destinations: [{ id: destinationId, lat: 42, lng: -78 }] } });
  const handler = await f.handler('wing-jury-feed');
  const first = await (await handler(request({}, null))).json();
  const refreshed = await (await handler(request({}, null))).json();
  assert.equal(refreshed.photos[0].submission_id, first.photos[0].submission_id);
  assert.notEqual(refreshed.photos[0].signed_url, first.photos[0].signed_url);
  assert.deepEqual(f.admin.writes, []);
  assert.deepEqual(f.auth.writes, []);
});

test('latest personal reveal rating has a stable identity tiebreaker', async () => {
  const f = await boundaryFixture({ user: { id: userId }, tables: {
    wing_jury_votes: [{ user_id: userId, submission_id: photoId }],
    destinations: [{ id: destinationId, name: 'Public Wings' }],
    destination_ratings: [
      { id: photoId, destination_id: destinationId, user_id: userId, created_at: '2026-10-09T00:00:00Z', weight_score: 20 },
      { id: destinationId, destination_id: destinationId, user_id: userId, created_at: '2026-10-09T00:00:00Z', weight_score: 80 },
    ],
  } });
  const response = await (await f.handler('wing-jury-reveal'))(request({ submission_id: photoId }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).personal_rating.weight_score, 80);
});
