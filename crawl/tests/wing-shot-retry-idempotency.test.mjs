import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(new URL('../supabase/migrations/20260729210000_wing_upload_retry_idempotency.sql', import.meta.url), 'utf8');

test('retry migration resumes the existing intent before the eligibility gate', () => {
  assert.match(migration, /rename to reserve_wing_submission_upload_legacy/i);
  assert.match(migration, /status in \('reserved', 'finalized'\)/i);
  assert.match(migration, /existing_record_found.*true/i);
  assert.match(migration, /resumed.*true/i);
  assert.match(migration, /update public\.wing_submission_upload_intents/i);
  assert.match(migration, /never create another rating[\s\S]*another Wing Shot/i);
  assert.match(migration, /wing_submission_already_finalized/i);
});
