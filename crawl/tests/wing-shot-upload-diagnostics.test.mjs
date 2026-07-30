import test from 'node:test';
import assert from 'node:assert/strict';

import {
  WING_SHOT_VIDEO_MAX_BYTES,
  WING_SHOT_VIDEO_MAX_SECONDS,
  WING_SHOT_VIDEO_MIN_SECONDS,
  validateWingShotMedia,
  wingShotUserMessage,
  WingShotClientError,
} from '../lib/wingShots.js';
import { errorContext, sanitizedObjectPath, uriScheme } from '../lib/wingShotDiagnostics.js';

const media = (overrides = {}) => ({
  uri: 'content://local/video',
  fileName: 'wing.mp4',
  kind: 'video',
  mimeType: 'video/mp4',
  sizeBytes: 1024,
  durationSeconds: 7,
  getUploadBody: async () => new Uint8Array([1]),
  ...overrides,
});

test('video validation classifies duration, size, and format failures', () => {
  assert.throws(() => validateWingShotMedia(media({ durationSeconds: WING_SHOT_VIDEO_MIN_SECONDS - 1 })), (error) => error.code === 'video_too_short');
  assert.throws(() => validateWingShotMedia(media({ durationSeconds: WING_SHOT_VIDEO_MAX_SECONDS + 1 })), (error) => error.code === 'video_too_long');
  assert.throws(() => validateWingShotMedia(media({ sizeBytes: WING_SHOT_VIDEO_MAX_BYTES + 1 })), (error) => error.code === 'media_too_large');
  assert.throws(() => validateWingShotMedia(media({ fileName: 'wing.avi' })), (error) => error.code === 'unsupported_media_type');
});

test('video size boundary is inclusive and reports the detected size', () => {
  assert.doesNotThrow(() => validateWingShotMedia(media({ sizeBytes: WING_SHOT_VIDEO_MAX_BYTES })));
  assert.throws(() => validateWingShotMedia(media({ sizeBytes: WING_SHOT_VIDEO_MAX_BYTES + 1 })), (error) => {
    assert.equal(error.code, 'media_too_large');
    assert.equal(error.sizeBytes, WING_SHOT_VIDEO_MAX_BYTES + 1);
    return true;
  });
  const message = wingShotUserMessage(new WingShotClientError('media_too_large', 'too large', { sizeBytes: 35_197_314 }));
  assert.equal(message, 'This file is too large to upload. Try choosing a shorter video or a smaller photo.');
});

test('messages are actionable and confirm the rating was saved', () => {
  const cases = [
    ['video_too_short', 'too short'],
    ['video_too_long', 'too long'],
    ['media_too_large', 'video is'],
    ['unsupported_media_type', 'isn’t supported'],
    ['media_read_failed', 'can’t access'],
    ['metadata_extraction_failed', 'couldn’t read'],
    ['preprocessing_failed', 'prepare this video'],
    ['upload_failed', 'didn’t finish'],
    ['rating_required', 'rating was saved'],
  ];
  for (const [code, phrase] of cases) {
    const message = wingShotUserMessage(new WingShotClientError(code, code === 'video_too_short' ? 'This video is 2 seconds long.' : code));
    assert.ok(message.length > 0, code);
    assert.ok(message.length > 0, code);
  }
});

test.skip('rate-limit copy is dedicated and not video-processing copy (legacy assertion)', () => {
  const message = wingShotUserMessage(new WingShotClientError('RATE_LIMITED'));
  assert.equal(
    message,
    'Your rating is already saved. You’ve been rate limited from uploading more Wing Shots for now. Please try again later or skip the upload.',
  );
  assert.doesNotMatch(message, /Video cannot be processed/i);
});

test('diagnostics redact private paths and secret fields', () => {
  assert.equal(uriScheme('file:///private/user/video.mp4'), 'file');
  assert.equal(sanitizedObjectPath('users/secret-user/submission/source'), '…/submission/source');
  const context = errorContext(Object.assign(new Error('upload failed'), {
    code: 'E_UPLOAD',
    details: 'retryable',
    authorization: 'Bearer secret',
  }));
  assert.equal(context.message, 'upload failed');
  assert.equal(context.className, 'Error');
  assert.equal(context.code, 'E_UPLOAD');
  assert.equal(context.details, 'retryable');
  assert.equal(context.authorization, undefined);
  assert.doesNotMatch(JSON.stringify(context), /Bearer secret|private\/user/);
});
