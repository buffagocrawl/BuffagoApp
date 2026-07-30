import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => fs.readFileSync(new URL(path, root), 'utf8');

test('repository pins gateway bypass plus handler authentication for all user staging functions', () => {
  const config = read('supabase/config.toml');
  for (const name of ['stage-authorize', 'validate', 'promote', 'staging-cleanup', 'staging-gc']) {
    assert.match(config, new RegExp(`functions\\.wing-media-${name}\\]\\s+verify_jwt = false`));
  }
  for (const name of ['wing-media-stage-authorize', 'wing-media-validate', 'wing-media-promote', 'wing-media-staging-cleanup']) {
    assert.match(read(`supabase/functions/${name}/index.ts`), /auth\.getUser\(/);
  }
});

test('client retries authentication exactly once and preserves HTTP/reason metadata', () => {
  const staging = read('lib/wingShotStaging.ts');
  const shots = read('lib/wingShots.js');
  const auth = read('lib/wingShotFunctionAuth.js');
  for (const source of [shots, auth]) {
    assert.match(source, /refreshSession\(\)/);
    assert.match(source, /refreshAttempted/);
    assert.match(source, /httpStatus/);
    assert.match(source, /x-wing-correlation-id/);
  }
  assert.match(staging, /signedUploadUrl/);
  assert.match(auth, /refresh_response_access_token/);
  assert.match(staging, /requestDispatched: true/);
});

test('staging handlers enforce exact user/correlation/file path shape', () => {
  for (const name of ['wing-media-validate', 'wing-media-promote', 'wing-media-staging-cleanup']) {
    assert.match(read(`supabase/functions/${name}/index.ts`), /staging_object_forbidden/);
    assert.match(read(`supabase/functions/${name}/index.ts`), /correlationId/);
  }
  assert.match(read('supabase/functions/wing-media-stage-authorize/index.ts'), /user\.id/);
  assert.match(read('supabase/migrations/20260730144324_wing_shot_staging_transport.sql'), /public = false/);
});
