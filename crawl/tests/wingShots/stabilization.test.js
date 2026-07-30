import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WingShotClientError,
  createWingShotUploadSession,
  parseWingShotFunctionError,
  wingShotUserMessage,
} from '../../lib/wingShots.js';
import {
  canTransitionWingShotUpload,
  failureStateForWingShotError,
  transitionWingShotUpload,
} from '../../lib/wingShotUploadState.js';

test('upload state machine allows the happy path and rejects unsafe transitions', () => {
  assert.equal(transitionWingShotUpload('idle', 'ready'), 'ready');
  assert.equal(transitionWingShotUpload('ready', 'authorizing'), 'authorizing');
  assert.equal(transitionWingShotUpload('authorizing', 'uploading'), 'uploading');
  assert.equal(transitionWingShotUpload('uploading', 'server_validating'), 'server_validating');
  assert.equal(transitionWingShotUpload('server_validating', 'finalizing'), 'finalizing');
  assert.equal(transitionWingShotUpload('finalizing', 'succeeded'), 'succeeded');
  assert.equal(canTransitionWingShotUpload('succeeded', 'uploading'), false);
});

test('session identifiers survive retry and failure classification is stable', () => {
  const session = createWingShotUploadSession(() => 'fixed-id');
  assert.equal(session.correlationId, 'fixed-id');
  assert.equal(session.reserveIdempotencyKey, 'wing-reserve-fixed-id');
  assert.equal(failureStateForWingShotError({ httpStatus: 429 }), 'failed_retryable');
  assert.equal(failureStateForWingShotError({ code: 'authentication_required', httpStatus: 401 }), 'failed_auth');
  assert.equal(failureStateForWingShotError({ code: 'video_too_short' }), 'failed_media');
});

test('structured 429 response preserves retry metadata and has specific UI copy', async () => {
  const response = new Response(JSON.stringify({
    ok: false,
    code: 'rate_limited',
    message: 'Too many uploads.',
    stage: 'reservation',
    retryable: true,
    retryAfterSeconds: 60,
    correlationId: 'corr',
  }), { status: 429, headers: { 'content-type': 'application/json', 'retry-after': '60' } });
  const parsed = await parseWingShotFunctionError({ context: response, status: 429 });
  assert.equal(parsed.status, 429);
  assert.equal(parsed.body.code, 'rate_limited');
  assert.equal(parsed.retryAfterSeconds, 60);
  assert.match(wingShotUserMessage(new WingShotClientError('rate_limited', 'Too many uploads.', { retryAfterSeconds: 60 })), /already saved/);
});

test('malformed and empty function responses remain parseable failures', async () => {
  for (const body of ['', 'not json']) {
    const response = new Response(body, { status: 503 });
    const parsed = await parseWingShotFunctionError({ context: response, status: 503 });
    assert.equal(parsed.status, 503);
    assert.equal(parsed.body, null);
    assert.equal(typeof parsed.text, 'string');
  }
});
