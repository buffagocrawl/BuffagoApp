import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(new URL('../supabase/migrations/20260731010940_wing_finalize_processing_job_idempotency_recovery.sql', import.meta.url), 'utf8');
const promote = readFileSync(new URL('../supabase/functions/wing-media-promote/index.ts', import.meta.url), 'utf8');
const client = readFileSync(new URL('../lib/wingShots.js', import.meta.url), 'utf8');

test('processing job creation is conflict-safe and owner-independent', () => {
  assert.match(migration, /ensure_wing_processing_job/);
  assert.match(migration, /on conflict \(submission_id, job_kind, generation\) do nothing/i);
  assert.doesNotMatch(migration, /storage\.objects[\s\S]*owner_id/);
  assert.match(migration, /bucket_id = 'wing-submissions'/);
  assert.match(migration, /name = v_intent\.expected_storage_path/);
  assert.match(migration, /'in_review'/);
  assert.match(migration, /'pending_review'/);
  assert.match(migration, /recovery-finalize:/);
});

test('promotion is not a second processing-job enqueue path', () => {
  assert.doesNotMatch(promote, /wing_processing_jobs/);
});

test('client retries recover by refreshing the authenticated history', () => {
  assert.match(client, /get_my_wing_submission_history/);
  assert.match(client, /pending_review/);
  assert.match(client, /processing.*complete/s);
  assert.match(client, /Your Wing Shot uploaded, but we’re finishing it in the background\./);
});
