import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { validateWingShotMedia } from '../lib/wingShots.js';

const root = (name) => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const migration = root('supabase/migrations/20260729160000_wing_shot_rating_rule.sql');
const client = root('lib/wingShots.js');

test('new eligibility rule uses ownership, destination, scores, Buffacoin, and duplicate guards', () => {
  assert.match(migration, /create or replace function public\.wing_shot_rating_is_eligible/);
  assert.match(migration, /rating\.user_id = p_user_id/);
  assert.match(migration, /not coalesce\(rating\.is_buffacoin, false\)/);
  for (const score of ['crispiness', 'sauce', 'meat', 'overall']) {
    assert.match(migration, new RegExp(`rating\\.${score} between 1 and 10`));
  }
  assert.match(migration, /not exists \([\s\S]*wing_media_submissions/);
  assert.match(migration, /status in \('reserved', 'finalized'\)/);
  assert.doesNotMatch(migration, /rating_verification_receipts/);
  assert.doesNotMatch(migration, /in_person_proximity|crawl_proximity|location permission|distance bucket/i);
});

test('eligibility reason distinguishes safe ownership and product reasons', () => {
  for (const reason of [
    'rating_not_found', 'rating_not_owned', 'destination_mismatch',
    'incomplete_rating', 'buffacoin_rating', 'eligible',
  ]) assert.match(migration, new RegExp(`return '${reason}'`));
});

test('reservation retains media, consent, idempotency, feature, private-path, and duplicate protections', () => {
  for (const token of [
    'authentication_required', 'destination_mismatch', 'unsupported_media_type',
    'unsupported_mime_type', 'media_mime_mismatch', 'invalid_media_size',
    'affirmative_consent_required', 'invalid_attribution_preference',
    'caption_too_long', 'invalid_idempotency_key', 'wing_shot_prompt_disabled',
    'wing_shot_photo_upload_disabled', 'wing_shot_video_upload_disabled',
    'wing_submission_already_finalized', 'wing_submission_already_reserved',
    "'wing-submissions'", "'originals/'",
  ]) assert.match(migration, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('client maps the revised product errors without in-person messaging', () => {
  assert.match(client, /Finish all rating scores before adding a Wing Shot\./);
  assert.match(client, /Wing Shots are available after restaurant ratings\./);
  assert.doesNotMatch(client, /in_person_not_verified|verified as an in-person visit|onboarding_rating/);
});

test('photo and video media remain supported and publication stays approval-gated', () => {
  const media = (kind, mimeType) => ({
    kind,
    mimeType,
    sizeBytes: 1024,
    ...(kind === 'video' ? { durationSeconds: 7 } : {}),
    getUploadBody: async () => new Uint8Array([1]),
  });
  assert.equal(validateWingShotMedia(media('photo', 'image/jpeg')).kind, 'photo');
  assert.equal(validateWingShotMedia(media('video', 'video/mp4')).kind, 'video');
  assert.match(root('supabase/migrations/20260729120000_wing_shots_core.sql'), /status text not null default 'uploaded'/);
  assert.match(root('supabase/migrations/20260729122000_wing_shots_creator_rewards.sql'), /approved/);
});
