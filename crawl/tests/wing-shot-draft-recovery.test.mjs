import test from 'node:test';
import assert from 'node:assert/strict';
import { createWingShotDraftStore, WING_DRAFT_KEY, WING_DRAFT_LIFETIME } from '../lib/wingShotDraftStore.js';
import { createWingShotUploadSession, submitWingShot } from '../lib/wingShots.js';

function harness() {
  const disk = new Map(); let clock = Date.now();
  const storage = { getItem: async (key) => disk.get(key) ?? null,
    setItem: async (key, value) => { disk.set(key, value); }, removeItem: async (key) => { disk.delete(key); } };
  const store = () => createWingShotDraftStore(storage, () => clock);
  const session = createWingShotUploadSession(); session.createdAt = clock;
  session.staging = { bucket: 'wing-shot-staging', objectPath: `owner/${session.correlationId}/photo.jpg`, signedUrl: 'SECRET', uploadCompleted: true };
  const input = { userId: 'owner', destinationId: 'restaurant-a', flow: 'home-rating',
    draft: { media: { kind: 'photo', mimeType: 'image/jpeg', sizeBytes: 100, uri: 'PRIVATE-LOCAL', bytes: 'BLOB' },
      session, consentAccepted: true, attributionPreference: 'anonymous', caption: '' } };
  return { disk, store, input, advance: () => { clock += WING_DRAFT_LIFETIME + 1; } };
}
test('process kill after staging restores metadata without tokens, URLs, local paths or bytes', async () => {
  const h = harness(); h.input.draft.session.accessToken = 'TOKEN';
  await h.store().save(h.input);
  assert.doesNotMatch(h.disk.get(WING_DRAFT_KEY), /SECRET|TOKEN|PRIVATE-LOCAL|BLOB|signedUrl|accessToken/);
  const resumed = await h.store().load(h.input);
  assert.equal(resumed.draft.session.correlationId, h.input.draft.session.correlationId);
  assert.equal(resumed.destinationId, 'restaurant-a');
  assert.equal(resumed.draft.session.staging.uploadCompleted, true);
});
test('rating commit before attachment acknowledgement restores exact rating and operation', async () => {
  const h = harness(); await h.store().save({ ...h.input, ratingId: 'rating-a', ratingOperationId: 'operation-a', lifecycle: 'attaching' });
  const saved = await h.store().load(h.input);
  assert.equal(saved.ratingId, 'rating-a'); assert.equal(saved.ratingOperationId, 'operation-a');
});
test('kill after reservation retains the same finalizer key and promoted state', async () => {
  const h = harness(); h.input.draft.session.reservation = { submissionId: 'submission-a', bucket: 'wing-submissions', uploadPath: 'original-a' };
  h.input.draft.session.uploadCompleted = true;
  await h.store().save(h.input);
  const saved = await h.store().load(h.input);
  assert.equal(saved.draft.session.finalizeIdempotencyKey, h.input.draft.session.finalizeIdempotencyKey);
  assert.equal(saved.draft.session.uploadCompleted, true);
});
test('expired draft clears deterministically and a late callback cannot revive it', async () => {
  const h = harness(); const store = h.store(); await store.save(h.input); h.advance();
  assert.equal(await store.load(h.input), null); assert.equal(await store.save(h.input), false);
});
test('different restaurant and flow cannot receive an older draft', async () => {
  const h = harness(); const store = h.store(); await store.save(h.input);
  assert.equal(await store.load({ ...h.input, destinationId: 'restaurant-b' }), null);
  assert.equal(await store.load({ ...h.input, flow: 'crawl-rating:other' }), null);
  assert.ok(await store.load(h.input));
});
test('logout and foreign login discard state and block stale writes', async () => {
  for (const userId of [null, 'foreign']) {
    const h = harness(); const store = h.store(); await store.save(h.input);
    assert.equal(await store.load({ ...h.input, userId }), null);
    assert.equal(await store.save(h.input), false);
  }
});
test('newer draft survives an old save and old acknowledgement', async () => {
  const h = harness(); const store = h.store(); await store.save(h.input);
  const next = { ...h.input, destinationId: 'restaurant-b', draft: { ...h.input.draft,
    session: { ...h.input.draft.session, createdAt: h.input.draft.session.createdAt + 1, correlationId: 'newer' } } };
  await store.save(next); assert.equal(await store.save(h.input), false);
  await store.clear(h.input.draft.session.correlationId);
  assert.equal((await store.load(next)).correlationId, 'newer');
});
test('restart after timeout-after-success returns the owner record without another promotion or reservation', async () => {
  const h = harness(); h.input.draft.session.reservation = { submissionId: 'submission-a', bucket: 'wing-submissions', uploadPath: 'original-a' };
  await h.store().save({ ...h.input, ratingId: 'rating-a' });
  const restored = await h.store().load(h.input); const calls = [];
  const client = { storage: { from() {} }, rpc: async (name) => {
    calls.push(name); return { data: [{ submission_id: 'submission-a', internal_status: 'in_review', display_status: 'In Review' }] };
  } };
  const result = await submitWingShot({ client, session: restored.draft.session, input: {
    ...restored.draft, media: restored.draft.media, userId: 'owner', ratingId: 'rating-a', destinationId: 'restaurant-a', submissionSource: 'rating' } });
  assert.equal(result.submission_id, 'submission-a'); assert.deepEqual(calls, ['get_my_wing_submission_history']);
});
