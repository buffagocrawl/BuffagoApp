import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { wingShotLog } from '../lib/wingShotDiagnostics.js';

const migration = readFileSync(new URL('../supabase/migrations/20260730120000_wing_shot_uploaded_object_validation.sql', import.meta.url), 'utf8');
const promote = readFileSync(new URL('../supabase/functions/wing-media-promote/index.ts', import.meta.url), 'utf8');

test('validator uses the authenticated reservation path instead of service-role object ownership', () => {
  assert.match(migration, /security definer/);
  assert.match(migration, /set search_path = pg_catalog, public, storage/);
  assert.match(migration, /auth\.uid\(\).*p_user_id/s);
  assert.match(migration, /object\.bucket_id = p_bucket/);
  assert.doesNotMatch(migration, /object\.owner_id/);
  assert.match(migration, /p_storage_path <> v_intent\.expected_storage_path/);
  assert.match(migration, /raise exception 'uploaded_object_not_found'/);
});

test('promotion returns the canonical destination reference', () => {
  assert.match(promote, /bucket: DESTINATION_BUCKET/);
  assert.match(promote, /path: destinationPath/);
  assert.match(promote, /fullPath: `\$\{DESTINATION_BUCKET\}\/\$\{destinationPath\}`/);
});

test('handled diagnostics never call console.error', () => {
  const original = console.error;
  let errors = 0;
  console.error = () => { errors += 1; };
  try { wingShotLog('test', 'handled database failure', { code: 'P0001' }, 'error'); } finally { console.error = original; }
  assert.equal(errors, 0);
});
