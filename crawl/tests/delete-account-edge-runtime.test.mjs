import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { evaluate } from './helpers/wingJuryEdgeHarness.mjs';

const userId = '11111111-1111-4111-8111-111111111111';
const otherId = '22222222-2222-4222-8222-222222222222';
const source = await readFile(new URL('../supabase/functions/delete-account/index.ts', import.meta.url), 'utf8');
async function fixture(options = {}) {
  const state = { manifests: options.manifests || [], media: options.media || [{ id: 'photo', user_id: userId }], intents: options.intents || [], calls: [], batches: [], deletions: 0 };
  const paths = options.paths || Array.from({ length: 205 }, (_, i) => `processed/photo-${i}/primary`);
  const admin = {
    auth: { getUser: async () => ({ data: { user: options.user === undefined ? { id: userId } : options.user }, error: null }), admin: { deleteUser: async (id) => {
      state.calls.push({ authDelete: id }); state.deletions++;
      return { error: options.authDeleteError ? { message: 'secret FK details' } : null };
    } } },
    from(table) {
      const predicates = []; let limit = Infinity; let single = false; let offset = 0;
      const query = {
        select() { return query; }, eq(key, value) { predicates.push([key, value]); return query; },
        order() { return query; }, limit(value) { limit = value; return query; },
        range(start, end) { offset = start; limit = end - start + 1; return query; },
        maybeSingle() { single = true; return query; },
        then(resolve, reject) {
          const rows = (table === 'wing_account_deletion_manifests' ? state.manifests : table === 'wing_submission_upload_intents' ? state.intents : state.media)
            .filter(row => predicates.every(([key, value]) => row[key] === value)).slice(offset, offset + (table === 'wing_submission_upload_intents' ? Math.min(limit, options.intentPageCap || limit) : limit));
          const data = table === 'wing_submission_upload_intents' && options.badIntentInventory ? {} : single ? rows[0] || null : structuredClone(rows);
          return Promise.resolve({ data, error: options.queryError || (table === 'wing_submission_upload_intents' && options.intentReadError) ? {} : null }).then(resolve, reject);
        },
      };
      return query;
    },
    async rpc(name, args) {
      state.calls.push({ name, args: structuredClone(args) });
      if (name === 'prepare_wing_account_media_cleanup') {
        let manifest = state.manifests.find(row => row.correlation_id === args.p_correlation_id);
        if (!manifest) {
          manifest = { id: `manifest-${state.manifests.length}`, user_id: args.p_user_id, correlation_id: args.p_correlation_id,
            status: 'pending', object_paths: state.media.some(row => row.user_id === args.p_user_id) ? paths : [] };
          state.manifests.push(manifest);
          state.media.filter(row => row.user_id === args.p_user_id).forEach(row => { row.user_id = null; });
        }
        if (options.interruptPrepare) { options.interruptPrepare = false; throw new Error('lost response after prepare'); }
        return { data: { manifest_id: manifest.id, status: manifest.status, object_paths: structuredClone(manifest.object_paths) }, error: null };
      }
      const manifest = state.manifests.find(row => row.id === args.p_manifest_id);
      if (options.completionFalse || manifest.status !== 'pending') return { data: false, error: null };
      manifest.status = args.p_objects_deleted ? 'objects_deleted' : 'failed';
      return { data: true, error: null };
    },
    storage: { from(bucket) { assert.equal(bucket, 'wing-submissions'); return { remove: async batch => {
      state.batches.push(structuredClone(batch));
      if (options.lateUpload) { options.lateUpload = false; state.media.push({ id: 'new-upload', user_id: userId }); }
      if (options.interruptStorage) { options.interruptStorage = false; throw new Error('connection interrupted'); }
      return { error: options.failBatch === state.batches.length ? { message: 'private storage detail' } : null };
    } }; } },
  };
  let handler;
  evaluate(source, () => ({ createClient: () => admin }),
    { serve: fn => { handler = fn; }, env: { get: key => ({ SUPABASE_URL: 'https://project.example', SUPABASE_SERVICE_ROLE_KEY: 'server-secret' })[key] } });
  return { state, options, invoke: (method = 'POST') => handler(new Request('https://edge.example/delete-account', { method, headers: { Authorization: 'Bearer verified' } })) };
}

test('account cleanup succeeds in bounded Storage batches before true completion and Auth deletion', async () => {
  const f = await fixture(); const response = await f.invoke();
  assert.equal(response.status, 200); assert.deepEqual(f.state.batches.map(batch => batch.length), [100, 100, 5]);
  assert.equal(f.state.manifests[0].status, 'objects_deleted'); assert.equal(f.state.deletions, 1);
  assert.equal(f.state.calls.at(-1).authDelete, userId);
});

test('false completion is a failed cleanup and never authorizes Auth deletion', async () => {
  const f = await fixture({ completionFalse: true }); const response = await f.invoke();
  assert.equal(response.status, 500); assert.equal(f.state.deletions, 0);
});

test('a new owned media row arriving during Storage cleanup blocks Auth deletion and requires operator recovery', async () => {
  const f = await fixture({ lateUpload: true });
  assert.equal((await f.invoke()).status, 409); assert.equal(f.state.deletions, 0);
  assert.equal(f.state.manifests[0].status, 'objects_deleted');
  assert.equal(f.state.media.find(row => row.id === 'new-upload').user_id, userId);
  assert.equal((await f.invoke()).status, 409); assert.equal(f.state.deletions, 0);
  assert.equal(f.state.manifests.length, 1);
});

test('unmanifested reserved, cancelled, and expired original paths cannot be bypassed by account cleanup', async () => {
  for (const status of ['reserved', 'cancelled', 'expired']) {
    const f = await fixture({ intents: [{ id: 'intent', user_id: userId, expected_storage_path: 'originals/unfinalized/private', status }] });
    assert.equal((await f.invoke()).status, 409); assert.equal(f.state.deletions, 0);
    assert.equal(f.state.manifests[0].status, 'objects_deleted');
    assert.equal(f.state.batches.flat().includes('originals/unfinalized/private'), false);
  }
});

test('intent read failure and malformed inventories fail closed before Auth deletion', async () => {
  for (const options of [{ intentReadError: true }, { badIntentInventory: true },
    ...[null, '', 1].map(expected_storage_path => ({ intents: [{ user_id: userId, expected_storage_path }] }))]) {
    const f = await fixture(options); assert.equal((await f.invoke()).status, 409); assert.equal(f.state.deletions, 0);
  }
});

test('intent inventory is paginated, scoped to the verified user, and refuses bounded-work exhaustion', async () => {
  const paths = Array.from({ length: 101 }, (_, i) => `originals/${i}/source`);
  const f = await fixture({ paths, intents: [
    ...paths.map((expected_storage_path, id) => ({ id, user_id: userId, expected_storage_path })),
    { user_id: otherId, expected_storage_path: 'private-other' },
  ] });
  assert.equal((await f.invoke()).status, 200); assert.equal(f.state.deletions, 1);
  const capped = await fixture({ paths: ['originals/known'], intents: Array.from({ length: 1000 }, (_, id) => ({ id, user_id: userId, expected_storage_path: 'originals/known' })) });
  assert.equal((await capped.invoke()).status, 409); assert.equal(capped.state.deletions, 0);
});

test('a PostgREST cap below requested page size cannot conceal a later unmanifested original', async () => {
  const paths = Array.from({ length: 50 }, (_, i) => `originals/${i}/source`);
  const intents = paths.map((expected_storage_path, id) => ({ id, user_id: userId, expected_storage_path }));
  const orphan = await fixture({ paths, intentPageCap: 50, intents: [...intents,
    { id: 50, user_id: userId, expected_storage_path: 'originals/unmanifested' }] });
  assert.equal((await orphan.invoke()).status, 409); assert.equal(orphan.state.deletions, 0);
  const complete = await fixture({ paths, intentPageCap: 50, intents });
  assert.equal((await complete.invoke()).status, 200); assert.equal(complete.state.deletions, 1);
});

test('failed batch preserves terminal original manifest and repeated attempts cannot bypass its private paths', async () => {
  const f = await fixture({ failBatch: 2 }); assert.equal((await f.invoke()).status, 500);
  assert.equal(f.state.manifests[0].status, 'failed'); assert.equal(f.state.manifests[0].object_paths.length, 205);
  assert.equal((await f.invoke()).status, 409); assert.equal(f.state.deletions, 0);
  assert.equal(f.state.manifests.length, 1); assert.equal(f.state.batches.length, 2);
});

test('interrupted prepare or Storage cleanup replays the same pending manifest and complete path inventory', async () => {
  for (const mode of ['interruptPrepare', 'interruptStorage']) {
    const f = await fixture({ [mode]: true }); assert.equal((await f.invoke()).status, 500);
    assert.equal((await f.invoke()).status, 200); assert.equal(f.state.manifests.length, 1);
    const prepares = f.state.calls.filter(call => call.name === 'prepare_wing_account_media_cleanup');
    assert.equal(prepares.length, 2); assert.equal(prepares[0].args.p_correlation_id, prepares[1].args.p_correlation_id);
    assert.equal(f.state.deletions, 1); assert.equal(f.state.manifests[0].object_paths.length, 205);
  }
});

test('Auth deletion failure preserves completed manifest and replay does not require terminal completion to return true again', async () => {
  const f = await fixture({ authDeleteError: true }); const response = await f.invoke();
  assert.equal(response.status, 500); assert.doesNotMatch(await response.text(), /secret|FK/);
  f.options.authDeleteError = false; assert.equal((await f.invoke()).status, 200);
  assert.equal(f.state.calls.filter(call => call.name === 'complete_wing_account_media_cleanup').length, 1);
  assert.equal(f.state.manifests.length, 1); assert.equal(f.state.batches.length, 6);
});

test('concurrent first cleanup attempts converge on one user-bound correlation and do not authorize false completion', async () => {
  const f = await fixture(); const responses = await Promise.all([f.invoke(), f.invoke()]);
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 500]);
  assert.equal(f.state.manifests.length, 1); assert.equal(f.state.deletions, 1);
  assert.ok(f.state.calls.filter(call => call.name === 'prepare_wing_account_media_cleanup').every(call => call.args.p_correlation_id === userId));
});

test('global correlation collision cannot delete another account media or authorize Auth deletion', async () => {
  const f = await fixture({ manifests: [{ id: 'other', user_id: otherId, correlation_id: userId, status: 'pending', object_paths: ['private-other'] }] });
  assert.equal((await f.invoke()).status, 409); assert.equal(f.state.deletions, 0); assert.deepEqual(f.state.batches, []);
});

test('multiple legacy manifests, failed manifest, query failure, and new media after completed cleanup require operator recovery', async () => {
  for (const options of [
    { manifests: [{ user_id: userId, status: 'failed' }] },
    { manifests: [{ user_id: userId, status: 'objects_deleted' }, { user_id: userId, status: 'pending' }] },
    { manifests: [{ user_id: userId, status: 'objects_deleted' }] },
    { queryError: true },
  ]) {
    const f = await fixture(options); assert.equal((await f.invoke()).status, 409);
    assert.equal(f.state.deletions, 0); assert.deepEqual(f.state.batches, []);
  }
});

test('unsupported method and unauthenticated account cleanup never change private data', async () => {
  const f = await fixture({ user: null }); assert.equal((await f.invoke('GET')).status, 405);
  assert.equal((await f.invoke()).status, 401); assert.deepEqual(f.state.calls, []);
});
