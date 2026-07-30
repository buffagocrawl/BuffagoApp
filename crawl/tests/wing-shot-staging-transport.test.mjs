import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const adapter = fs.readFileSync(new URL('../components/wingShots/mediaAdapter.ts', import.meta.url), 'utf8');
const staging = fs.readFileSync(new URL('../lib/wingShotStaging.ts', import.meta.url), 'utf8');
const shots = fs.readFileSync(new URL('../lib/wingShots.js', import.meta.url), 'utf8');
const validator = fs.readFileSync(new URL('../supabase/functions/wing-media-validate/index.ts', import.meta.url), 'utf8');

test('native Wing Shot media uses binary Storage staging, not multipart bytes', () => {
  assert.match(staging, /createUploadTask/);
  assert.match(staging, /FileSystemUploadType\.BINARY_CONTENT/);
  assert.match(staging, /media\.uri/);
  assert.doesNotMatch(staging, /FormData/);
  assert.doesNotMatch(shots, /new FormData/);
  assert.match(staging, /wing-media-stage-authorize/);
  assert.match(shots, /wing-media-promote/);
  assert.match(validator, /await request\.json\(\)/);
  assert.doesNotMatch(validator, /request\.formData\(\)/);
});

test('native adapter never reads a native URI into JavaScript memory', () => {
  assert.match(adapter, /Platform\.OS !== 'web'/);
  assert.doesNotMatch(adapter, /nativeFile\.arrayBuffer/);
});

test('staging bucket and signed path remain private and user-scoped', () => {
  const migration = fs.readFileSync(new URL('../supabase/migrations/20260730144324_wing_shot_staging_transport.sql', import.meta.url), 'utf8');
  const authorize = fs.readFileSync(new URL('../supabase/functions/wing-media-stage-authorize/index.ts', import.meta.url), 'utf8');
  assert.match(migration, /'wing-shot-staging'.*false.*52428800/s);
  assert.match(authorize, /user\.id/);
  assert.match(authorize, /createSignedUploadUrl/);
});
