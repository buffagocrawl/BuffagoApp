import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { WingShotClientError, wingShotProcessingCopy, wingShotUserMessage } from '../lib/wingShots.js';

const root = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const migration = root('supabase/migrations/20260730150000_wing_shot_completed_upload_rate_limit.sql');
const flow = root('components/wingShots/WingShotFlow.tsx');

test('completed-upload quota is centralized at five per rolling fifteen minutes', () => {
  assert.match(migration, /rolling_upload_limit integer not null default 5/);
  assert.match(migration, /rolling_upload_window_seconds integer not null default 900/);
  assert.match(migration, /status not in \('failed', 'withdrawn'\)/);
  assert.match(migration, /WING_SHOT_RATE_LIMITED/);
  assert.match(migration, /retry_after_seconds/);
  assert.match(migration, /drop trigger if exists wing_upload_intent_rate_limit/);
});

test('rate-limit response is handled inline and preserves the draft', () => {
  const error = new WingShotClientError('RATE_LIMITED', '', { retryAfterSeconds: 105 });
  assert.equal(wingShotProcessingCopy(error).title, 'Too many Wing Shots');
  assert.match(wingShotUserMessage(error), /Try again in 2 minutes/);
  assert.match(wingShotUserMessage(error), /rating is already saved/i);
  assert.match(flow, /setRateLimitRemainingSeconds/);
  assert.match(flow, /setPhaseSafely\(controller\.signal\.aborted \? 'cancelled' : 'valid'\)/);
  assert.match(flow, /wingShotLog\(sessionRef\.current\.correlationId, 'Final success or failure'[\s\S]*\}, 'warn'\)/);
  assert.match(flow, /phaseRef\.current !== 'valid' \|\| rateLimitRemainingSeconds > 0/);
});
