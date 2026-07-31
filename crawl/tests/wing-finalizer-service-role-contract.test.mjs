import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(new URL('../supabase/migrations/20260731005535_wing_finalize_service_role_promotion_contract.sql', import.meta.url), 'utf8');
const client = readFileSync(new URL('../lib/wingShots.js', import.meta.url), 'utf8');

test('finalizer accepts service-role-promoted objects only at the owner-bound reservation location', () => {
  assert.match(migration, /auth\.uid\(\)/);
  assert.match(migration, /submission_id = p_submission_id/);
  assert.match(migration, /user_id = v_user_id/);
  assert.match(migration, /bucket_id = 'wing-submissions'/);
  assert.match(migration, /name = v_intent\.expected_storage_path/);
  assert.doesNotMatch(migration, /owner_id/);
  assert.match(migration, /uploaded_object_not_found/);
  assert.match(migration, /expected_size_bytes/);
  assert.match(migration, /expected_mime_type/);
  assert.match(migration, /'in_review'/);
  assert.match(migration, /upload-process:/);
});

test('all client finalization calls resolve to the canonical three-argument overload', () => {
  assert.match(client, /client\.rpc\('finalize_wing_submission_upload',\s*\{[\s\S]*p_submission_id[\s\S]*p_idempotency_key[\s\S]*p_correlation_id/);
  assert.doesNotMatch(client, /p_bucket|p_storage_path/);
});
