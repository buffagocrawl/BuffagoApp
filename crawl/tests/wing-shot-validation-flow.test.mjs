import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { wingShotUserMessage, WingShotClientError } from '../lib/wingShots.js';

const flow = fs.readFileSync(new URL('../components/wingShots/WingShotFlow.tsx', import.meta.url), 'utf8');

test('camera and library selections start one guarded validation pass', () => {
  assert.match(flow, /acceptMedia\(await mediaAdapter\.takePhoto\(\)\)/);
  assert.match(flow, /acceptMedia\(\s*await mediaAdapter\.chooseFromLibrary/);
  assert.match(flow, /void validateSelectedMedia\(selected\)/);
  assert.match(flow, /validationAbortRef\.current\?\.abort\(\)/);
  assert.match(flow, /sequence !== validationSequenceRef\.current/);
  assert.match(flow, /validation_handoff_started/);
  assert.match(flow, /local_validation_started/);
  assert.match(flow, /local_validation_passed/);
  assert.match(flow, /local_validation_failed/);
  assert.match(flow, /validation_final_catch/);
  assert.match(flow, /requestDispatched/);
  assert.match(flow, /wing-media-validate/);
});

test('validation status and submit gating are explicit', () => {
  assert.match(flow, /Validating your Wing Shot…/);
  assert.match(flow, /phase === 'valid' && media/);
  assert.match(flow, /setPhaseSafely\('submitted'\)/);
  assert.doesNotMatch(flow, /testID="wing-shot\.validate/);
  assert.doesNotMatch(flow, /testID="wing-shot\.process/);
});

test('every client reason code has safe actionable copy', () => {
  const cases = {
    media_too_large: 'too large',
    video_too_long: 'Only photos can be uploaded',
    video_too_short: 'Only photos can be uploaded',
    unsupported_media_type: 'JPEG, PNG, WebP, or HEIC',
    media_unreadable: 'couldn’t read',
    invalid_dimensions: 'dimensions aren’t supported',
    validation_network_failure: 'couldn’t validate',
    RATE_LIMITED: 'Wait a few minutes',
    validation_unknown: 'couldn’t validate this Wing Shot',
  };
  for (const [code, phrase] of Object.entries(cases)) {
    assert.match(wingShotUserMessage(new WingShotClientError(code)), new RegExp(phrase, 'i'), code);
  }
  assert.match(wingShotUserMessage(new WingShotClientError('future_code')), /couldn’t validate this Wing Shot/i);
});

test('server endpoint uses stable reason codes and structured lifecycle logs', () => {
  const endpoint = fs.readFileSync(new URL('../supabase/functions/wing-media-validate/index.ts', import.meta.url), 'utf8');
  for (const code of ['file_too_large', 'unsupported_media_type', 'media_corrupt', 'invalid_dimensions', 'server_temporarily_unavailable']) assert.match(endpoint, new RegExp(code));
  for (const event of ['validation_started', 'validation_passed', 'validation_retryable_failure']) assert.match(endpoint, new RegExp(event));
  assert.doesNotMatch(endpoint, /signed_url|signedUrl|file\.text\(\)/i);
});
