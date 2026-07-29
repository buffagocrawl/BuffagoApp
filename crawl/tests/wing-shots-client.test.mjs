import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createWingShotUploadSession,
  submitWingShot,
  validateWingShotMedia,
  validateWingShotSubmission,
  WingShotClientError,
} from '../lib/wingShots.js';

const ratingId = '10000000-0000-4000-a000-000000000001';
const destinationId = '10000000-0000-4000-a000-000000000009';
const media = {
  uri: 'private-device-uri',
  kind: 'photo',
  mimeType: 'image/jpeg',
  sizeBytes: 1234,
  getUploadBody: async () => new Uint8Array([1, 2, 3]),
};

function clientDouble({ reserveError = null, uploadError = null, finalizeError = null } = {}) {
  const calls = [];
  const client = {
    rpc: async (name, parameters) => {
      calls.push({ kind: 'rpc', name, parameters });
      if (name === 'reserve_wing_submission_upload') {
        return reserveError
          ? { data: null, error: reserveError }
          : {
              data: {
                submission_id: '20000000-0000-4000-a000-000000000002',
                bucket: 'wing-submissions',
                upload_path:
                  'originals/30000000-0000-4000-a000-000000000003/20000000-0000-4000-a000-000000000002/source',
              },
              error: null,
            };
      }
      return finalizeError
        ? { data: null, error: finalizeError }
        : {
            data: {
              submission_id: '20000000-0000-4000-a000-000000000002',
              status: 'uploaded',
            },
            error: null,
          };
    },
    storage: {
      from: (bucket) => ({
        upload: async (path, body, options) => {
          calls.push({ kind: 'upload', bucket, path, body, options });
          return { data: null, error: uploadError };
        },
      }),
    },
  };
  return { client, calls };
}

function validInput(overrides = {}) {
  return {
    ratingId,
    destinationId,
    submissionSource: 'rating',
    media,
    consentAccepted: true,
    attributionPreference: 'anonymous',
    caption: '',
    ...overrides,
  };
}

test('media validation enforces the ten-second video limit', () => {
  assert.throws(
    () =>
      validateWingShotMedia({
        ...media,
        kind: 'video',
        mimeType: 'video/mp4',
        durationSeconds: 10.01,
      }),
    (error) => error instanceof WingShotClientError && error.code === 'video_too_long',
  );
});

test('submission requires affirmative consent and explicit attribution', () => {
  assert.throws(
    () => validateWingShotSubmission(validInput({ consentAccepted: false })),
    /accept the media consent/,
  );
  assert.throws(
    () => validateWingShotSubmission(validInput({ attributionPreference: null })),
    /Choose how/,
  );
});

test('upload uses only the exact reserved bucket and path before finalizing', async () => {
  const { client, calls } = clientDouble();
  const progress = [];

  const result = await submitWingShot({
    client,
    input: validInput(),
    session: createWingShotUploadSession(),
    onProgress: (value) => progress.push(value),
  });

  assert.equal(result.status, 'uploaded');
  assert.deepEqual(
    calls.map((call) => (call.kind === 'rpc' ? call.name : call.kind)),
    ['reserve_wing_submission_upload', 'upload', 'finalize_wing_submission_upload'],
  );
  assert.equal(calls[1].bucket, 'wing-submissions');
  assert.equal(
    calls[1].path,
    'originals/30000000-0000-4000-a000-000000000003/20000000-0000-4000-a000-000000000002/source',
  );
  assert.equal(calls[1].options.upsert, false);
  assert.equal(progress.at(-1), 100);
});

test('retry after finalization failure does not upload twice', async () => {
  const session = createWingShotUploadSession();
  const first = clientDouble({ finalizeError: { message: 'temporary' } });

  await assert.rejects(
    submitWingShot({ client: first.client, input: validInput(), session }),
    (error) => error.code === 'finalization_failed',
  );
  const second = clientDouble();
  await submitWingShot({ client: second.client, input: validInput(), session });

  assert.equal(second.calls.some((call) => call.kind === 'upload'), false);
  assert.deepEqual(
    second.calls.map((call) => call.name),
    ['finalize_wing_submission_upload'],
  );
});

test('storage interruption never calls finalize', async () => {
  const { client, calls } = clientDouble({ uploadError: { statusCode: 503 } });

  await assert.rejects(
    submitWingShot({
      client,
      input: validInput(),
      session: createWingShotUploadSession(),
    }),
    (error) => error.code === 'upload_failed',
  );

  assert.equal(
    calls.some(
      (call) => call.kind === 'rpc' && call.name === 'finalize_wing_submission_upload',
    ),
    false,
  );
});

test('cancel before reserve performs no network mutation', async () => {
  const { client, calls } = clientDouble();
  const controller = new AbortController();
  controller.abort();

  await assert.rejects(
    submitWingShot({
      client,
      input: validInput(),
      session: createWingShotUploadSession(),
      signal: controller.signal,
    }),
    (error) => error.code === 'upload_cancelled',
  );
  assert.equal(calls.length, 0);
});

test('cancel during transport never finalizes the reserved submission', async () => {
  const { client, calls } = clientDouble();
  const controller = new AbortController();

  await assert.rejects(
    submitWingShot({
      client,
      input: validInput(),
      session: createWingShotUploadSession(),
      signal: controller.signal,
      uploadTransport: async () => {
        controller.abort();
        return { error: null };
      },
    }),
    (error) => error.code === 'upload_cancelled',
  );
  assert.equal(
    calls.some(
      (call) => call.kind === 'rpc' && call.name === 'finalize_wing_submission_upload',
    ),
    false,
  );
});

test('existing reserved object is finalized rather than overwritten', async () => {
  const { client, calls } = clientDouble({
    uploadError: { statusCode: 409, message: 'already exists' },
  });

  const result = await submitWingShot({
    client,
    input: validInput(),
    session: createWingShotUploadSession(),
  });

  assert.equal(result.status, 'uploaded');
  assert.equal(calls[1].options.upsert, false);
  assert.equal(calls[2].name, 'finalize_wing_submission_upload');
});

test('a reserved session cannot be reused for different media', async () => {
  const session = createWingShotUploadSession();
  const first = clientDouble({ uploadError: { statusCode: 503 } });
  await assert.rejects(
    submitWingShot({ client: first.client, input: validInput(), session }),
    /Upload interrupted/,
  );
  const second = clientDouble();

  await assert.rejects(
    submitWingShot({
      client: second.client,
      input: validInput({ media: { ...media, sizeBytes: 4321 } }),
      session,
    }),
    (error) => error.code === 'session_input_changed',
  );
  assert.equal(second.calls.length, 0);
});
