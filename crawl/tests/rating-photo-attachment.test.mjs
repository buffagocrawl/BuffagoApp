import test from 'node:test';
import assert from 'node:assert/strict';
import { createRatingPhotoAttachment } from '../lib/ratingPhotoAttachment.js';
import { createWingShotDraftStore } from '../lib/wingShotDraftStore.js';

function harness(submit) {
  const disk = new Map();
  const drafts = createWingShotDraftStore({ getItem: async key => disk.get(key),
    setItem: async (key, value) => disk.set(key, value), removeItem: async key => disk.delete(key) });
  const pending = { ratingId: 'rating-a', destinationId: 'restaurant-a', operationId: 'coin-operation-a',
    draft: { media: { kind: 'photo', mimeType: 'image/jpeg', sizeBytes: 100 },
      consentAccepted: true, attributionPreference: 'anonymous', caption: 'Wings',
      session: { createdAt: Date.now(), correlationId: 'photo-a',
        staging: { bucket: 'wing-shot-staging', objectPath: 'private/photo-a', uploadCompleted: true } } } };
  const attach = createRatingPhotoAttachment({ submit, drafts, client: {}, userId: 'owner', flow: 'wingdex-rating' });
  const load = () => drafts.load({ userId: 'owner', flow: 'wingdex-rating' });
  return { attach, pending, load, drafts };
}

test('photo attaches only to the committed rating and destination and clears after success', async () => {
  let request;
  const h = harness(async input => { request = input; return { submission_id: 'media-a' }; });
  await h.attach(h.pending);
  assert.equal(request.input.ratingId, 'rating-a');
  assert.equal(request.input.destinationId, 'restaurant-a');
  assert.equal(request.input.userId, 'owner');
  assert.equal(request.input.submissionSource, 'buffacoin');
  assert.equal(request.session, h.pending.draft.session);
  assert.equal(await h.load(), null);
});

test('failed upload retains committed receipt and retry reuses exact association without rating RPC', async () => {
  let attempts = 0;
  const requests = [];
  const h = harness(async request => { requests.push(request); if (++attempts === 1) throw new Error('buffacoin_rating'); return { submission_id: 'media-a' }; });
  await assert.rejects(h.attach(h.pending), /buffacoin_rating/);
  const saved = await h.load();
  assert.equal(saved.ratingId, 'rating-a');
  assert.equal(saved.ratingOperationId, 'coin-operation-a');
  assert.equal(saved.destinationId, 'restaurant-a');
  await h.attach({ ...h.pending, draft: saved.draft });
  assert.equal(requests.length, 2);
  assert.equal(requests[0].input.ratingId, requests[1].input.ratingId);
  assert.equal(await h.load(), null);
});

test('concurrent photo retry sends one request and missing receipt never uploads', async () => {
  let release; let calls = 0;
  const h = harness(async () => { calls++; await new Promise(resolve => { release = resolve; }); return { submission_id: 'media-a' }; });
  await assert.rejects(h.attach({ ...h.pending, ratingId: null }), /Committed rating/);
  const first = h.attach(h.pending);
  assert.equal(await h.attach(h.pending), null);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(calls, 1);
  release(); await first;
});

test('replaced/discarded draft cannot be uploaded by a late callback', async () => {
  let calls = 0;
  const h = harness(async () => { calls++; });
  await h.drafts.save({ userId: 'owner', flow: 'wingdex-rating', destinationId: h.pending.destinationId, draft: h.pending.draft });
  await h.drafts.clear(h.pending.draft.session.correlationId);
  await assert.rejects(h.attach(h.pending), /replaced/);
  assert.equal(calls, 0);
});

test('updated upload session is persisted and account change suppresses completion', async () => {
  let current = true;
  const h = harness(async () => ({}));
  const attach = createRatingPhotoAttachment({ submit: async request => {
    await request.onSessionChange({ ...request.session,
      reservation: { submissionId: 'reserved-a', bucket: 'private', uploadPath: 'original-a' } });
    assert.equal((await h.load()).draft.session.reservation.submissionId, 'reserved-a');
    current = false;
    return { submission_id: 'media-a' };
  }, drafts: h.drafts, client: {}, userId: 'owner', flow: 'wingdex-rating', isCurrent: () => current });
  assert.equal(await attach(h.pending), null);
  assert.equal((await h.load()).ratingId, 'rating-a');
});
