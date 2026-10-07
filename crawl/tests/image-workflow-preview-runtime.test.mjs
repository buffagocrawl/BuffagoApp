import test from 'node:test';
import assert from 'node:assert/strict';
import { edgeRuntime } from './helpers/edge-runtime.mjs';
const owner = '10000000-0000-4000-a000-000000000001';
const requestId = '20000000-0000-4000-a000-000000000002';
function fixture({ user = owner, missing = false, expired = false, admin = false, path = 'originals/owner/photo' } = {}) {
  let status = 'pending', claims = 0;
  const access = { id: requestId, submission_id: 'photo', requester_id: owner,
    purpose: admin ? 'admin_review' : 'owner_preview', status, requested_path: path,
    expires_at: new Date(Date.now() + (expired ? -60000 : 60000)).toISOString() };
  const submission = { id: 'photo', user_id: owner, media_type: 'photo', original_storage_path: 'originals/owner/photo' };
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: user } } }) },
    from(table) {
      let update = false; const filters = [];
      return { select() { return this; }, update() { update = true; return this; },
        eq(key, value) { filters.push([key, value]); return this; }, gt() { return this; },
        async maybeSingle() {
          const row = table === 'wing_media_access_requests' ? { ...access, status } : submission;
          if (filters.some(([key, value]) => row[key] !== value)) return { data: null };
          if (update) { status = 'consumed'; claims++; }
          return { data: row };
        } };
    },
    rpc: async () => ({ data: admin && user === owner && !expired ? [{ bucket_id: 'wing-submissions', object_path: path }] : [] }),
    storage: { from: () => ({ download: async () => ({ data: missing ? null : new Blob(['photo']) }),
      createSignedUrl: async () => ({ data: { signedUrl: 'https://safe.example/short-capability' } }) }) },
  };
  return { invoke: edgeRuntime('wing-media-preview', client), claims: () => claims };
}
test('owner original fallback is requester-bound, has no path field, and consumes once', async () => {
  const f = fixture(); const first = await f.invoke({ request_id: requestId });
  assert.equal(first.status, 200); assert.equal(first.body.expires_in_seconds, 60);
  assert.deepEqual(Object.keys(first.body).sort(), ['expires_in_seconds', 'ok', 'signed_url']);
  assert.equal((await f.invoke({ request_id: requestId })).status, 404); assert.equal(f.claims(), 1);
});
for (const [name, options] of [['foreign requester', { user: 'foreign' }], ['expired', { expired: true }], ['noncanonical path', { path: 'another/private/photo' }], ['missing object', { missing: true }]]) {
  test(`preview rejects ${name}`, async () => {
    const f = fixture(options); const result = await f.invoke({ request_id: requestId });
    assert.equal(result.status, 404); assert.equal(result.body.signed_url, undefined);
  });
}
test('admin-review purpose keeps the historical protected claim RPC', async () => {
  const f = fixture({ admin: true }); assert.equal((await f.invoke({ request_id: requestId })).status, 200);
  assert.equal(f.claims(), 0);
});
