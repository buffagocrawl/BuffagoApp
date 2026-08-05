import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  WING_SHOT_PHOTO_MAX_BYTES,
  WING_SHOT_VIDEO_MAX_BYTES,
  validateWingShotMedia,
} from '../lib/wingShots.js';

const root = (name) => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const migration = root('supabase/migrations/20260729150000_reconcile_wing_upload_rpc.sql');
const client = root('lib/wingShots.js');

const signature = 'uuid, text, text, bigint, text, text, text, text, uuid, uuid, text';

test('the migration installs exactly the client-authoritative RPC identity', () => {
  assert.match(migration, /drop function if exists public\.reserve_wing_submission_upload\(\s*uuid,\s*text,\s*text,\s*bigint,\s*text,\s*text,\s*text,\s*text,\s*uuid\s*\);/i);
  assert.match(migration, new RegExp(`create function public\\.reserve_wing_submission_upload\\([\\s\\S]*?p_correlation_id uuid,[\\s\\S]*?p_destination_id uuid,[\\s\\S]*?p_submission_source text`, 'i'));
  assert.match(migration, new RegExp(`revoke all on function public\\.reserve_wing_submission_upload\\(\\s*${signature.replaceAll(', ', '\\s*,\\s*')}\\s*\\)`, 'i'));
  assert.match(migration, new RegExp(`grant execute on function public\\.reserve_wing_submission_upload\\(\\s*${signature.replaceAll(', ', '\\s*,\\s*')}\\s*\\)`, 'i'));
  assert.match(migration, /exactly one public signature/i);
});

test('the client sends all eleven named parameters and has no legacy fallback', () => {
  for (const parameter of [
    'p_rating_id',
    'p_media_type',
    'p_expected_mime_type',
    'p_expected_size_bytes',
    'p_consent_version',
    'p_attribution_preference',
    'p_user_caption',
    'p_idempotency_key',
    'p_correlation_id',
    'p_destination_id',
    'p_submission_source',
  ]) assert.match(client, new RegExp(`${parameter}:`));
  assert.doesNotMatch(client, /reserve_wing_submission_upload[\s\S]{0,1200}legacy/i);
});

test('image and video limits match the private bucket contract', () => {
  assert.equal(WING_SHOT_PHOTO_MAX_BYTES, 20 * 1024 * 1024);
  assert.equal(WING_SHOT_VIDEO_MAX_BYTES, 50 * 1024 * 1024);
  assert.match(migration, /then 20971520/);
  assert.match(migration, /else 52428800/);
  assert.match(root('supabase/migrations/20260729120000_wing_shots_core.sql'), /file_size_limit[\s\S]*52428800/);
  assert.match(root('supabase/config.toml'), /file_size_limit = "50MiB"/);
});

test('legacy video media is rejected by the new user upload validator', () => {
  const media = {
    kind: 'video',
    mimeType: 'video/mp4',
    sizeBytes: 35_197_314,
    durationSeconds: 7,
    getUploadBody: async () => new Uint8Array([1]),
  };
  assert.throws(() => validateWingShotMedia(media), /supported photo/i);
});
