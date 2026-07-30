import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  WingShotClientError,
  createWingShotUploadSession,
  parseWingShotFunctionError,
  submitWingShot,
} from '../lib/wingShots.js';

const functionSource = readFileSync(new URL('../supabase/functions/wing-media-promote/index.ts', import.meta.url), 'utf8');
const media = {
  uri: 'private-device-uri', kind: 'video', mimeType: 'video/mp4', sizeBytes: 1024,
  durationSeconds: 7, getUploadBody: async () => new Uint8Array([1]),
};
const input = {
  ratingId: '10000000-0000-4000-a000-000000000001',
  destinationId: '10000000-0000-4000-a000-000000000009', submissionSource: 'rating', media,
  consentAccepted: true, attributionPreference: 'anonymous', caption: '',
};

test('promotion uses the reserved intent before finalize and returns structured failures', () => {
  assert.match(functionSource, /wing_submission_upload_intents/);
  assert.doesNotMatch(functionSource, /from\('wing_media_submissions'\)/);
  for (const field of ['ok', 'code', 'message', 'stage', 'retryable', 'retryAfterSeconds', 'correlationId']) assert.match(functionSource, new RegExp(field));
  assert.match(functionSource, /retry-after/);
  assert.match(functionSource, /destination_copy_failed/);
  assert.match(functionSource, /staging_object_missing/);
});

test('FunctionsHttpError JSON preserves status and server metadata', async () => {
  const response = new Response(JSON.stringify({
    ok: false, code: 'destination_copy_failed', message: 'Try again.', stage: 'destination_copy',
    retryable: true, retryAfterSeconds: 12, correlationId: '10000000-0000-4000-a000-000000000010',
  }), { status: 503, headers: { 'content-type': 'application/json', 'retry-after': '12' } });
  const failure = await parseWingShotFunctionError(Object.assign(new Error('FunctionsHttpError'), { context: response }));
  assert.equal(failure.status, 503);
  assert.equal(failure.body.code, 'destination_copy_failed');
  assert.equal(failure.headers.get('retry-after'), '12');
  assert.equal(failure.retryAfterSeconds, 12);
});

test('malformed promotion response becomes a typed retryable client error without throwing while reading it', async () => {
  const session = createWingShotUploadSession(() => '10000000-0000-4000-a000-000000000010');
  session.reservation = { submissionId: '10000000-0000-4000-a000-000000000011', bucket: 'wing-submissions', uploadPath: 'originals/u/s/source' };
  session.staging = { bucket: 'wing-shot-staging', objectPath: 'u/10000000-0000-4000-a000-000000000010/wing.mp4', correlationId: session.correlationId, uploadCompleted: true };
  const client = {
    auth: { getSession: async () => ({ data: { session: { access_token: 'test' } } }) },
    functions: { invoke: async () => ({ error: Object.assign(new Error('FunctionsHttpError'), { context: new Response('gateway unavailable', { status: 503 }) }) }) },
    rpc: async () => ({ data: null, error: new Error('should not finalize') }),
    storage: { from: () => ({}) },
  };
  await assert.rejects(submitWingShot({ client, input, session }), (error) => {
    assert.ok(error instanceof WingShotClientError);
    assert.equal(error.httpStatus, 503);
    assert.equal(error.retryable, true);
    assert.equal(error.stage, 'promote');
    return true;
  });
  assert.equal(session.uploadCompleted, false);
});

test('canonical promotion response is finalized as the exact reserved private object', async () => {
  const session = createWingShotUploadSession(() => '10000000-0000-4000-a000-000000000010');
  const path = 'originals/u/10000000-0000-4000-a000-000000000011/source';
  session.reservation = { submissionId: '10000000-0000-4000-a000-000000000011', bucket: 'wing-submissions', uploadPath: path };
  session.staging = { bucket: 'wing-shot-staging', objectPath: 'u/10000000-0000-4000-a000-000000000010/wing.mp4', correlationId: session.correlationId, uploadCompleted: true };
  const calls = [];
  const client = {
    auth: { getSession: async () => ({ data: { session: { access_token: 'test' } } }) },
    functions: { invoke: async () => ({ data: { ok: true, promoted: true, submissionId: session.reservation.submissionId, bucket: 'wing-submissions', path, fullPath: `wing-submissions/${path}` }, error: null }) },
    rpc: async (name, params) => { calls.push({ name, params }); return { data: { submission_id: session.reservation.submissionId, status: 'uploaded' }, error: null }; },
    storage: { from: () => ({}) },
  };
  const result = await submitWingShot({ client, input, session });
  assert.equal(session.uploadCompleted, true);
  assert.deepEqual(session.uploadedObject, { bucket: 'wing-submissions', path, fullPath: `wing-submissions/${path}` });
  assert.equal(calls[0].name, 'finalize_wing_submission_upload');
  assert.equal(calls[0].params.p_bucket, 'wing-submissions');
  assert.equal(calls[0].params.p_storage_path, path);
  assert.equal(result.status, 'uploaded');
});

test('promotion retry returns the same canonical reference when destination already exists', () => {
  assert.match(functionSource, /const existing = await admin\.storage\.from\(DESTINATION_BUCKET\)\.download\(destinationPath\)/);
  assert.match(functionSource, /let destinationReady = Boolean\(existing\.data\) && !existing\.error/);
  assert.match(functionSource, /if \(!destinationReady\) \{/);
  assert.match(functionSource, /bucket: DESTINATION_BUCKET,[\s\S]*path: destinationPath,[\s\S]*fullPath:/);
  assert.match(functionSource, /upload\(destinationPath, source,[\s\S]*upsert: false/);
});
