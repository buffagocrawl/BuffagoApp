import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL('../supabase/migrations/20260729123000_wing_shots_feature_flags.sql', import.meta.url),
  'utf8',
);

const REQUIRED_FLAGS = [
  'wing_shot_prompt',
  'wing_shot_photo_upload',
  'wing_shot_video_upload',
  'wing_shot_creator_leaderboard',
  'wing_shot_moderation_queue',
  'wing_shot_generation',
  'wing_shot_instagram_publishing',
  'wing_shot_facebook_publishing',
  'wing_shot_automatic_nightly_selection',
  'wing_shot_featured_notifications',
];

test('every required Wing Shots capability is independently controlled', () => {
  for (const flag of REQUIRED_FLAGS) assert.match(migration, new RegExp(`'${flag}'`));
});

test('operational flags default disabled with zero rollout', () => {
  const values = migration.match(/\('wing_shot_[^']+', false, 0\)/g) ?? [];
  assert.equal(values.length, REQUIRED_FLAGS.length);
});

test('flag decisions are deterministic, authenticated, and read-only', () => {
  assert.match(migration, /auth\.uid\(\)::text \|\| ':' \|\| f\.flag_key/);
  assert.match(migration, /revoke all on function public\.get_wing_shots_feature_flags\(\)[\s\S]*from public, anon/);
  assert.match(migration, /grant execute on function public\.get_wing_shots_feature_flags\(\)[\s\S]*to authenticated, service_role/);
  assert.doesNotMatch(migration, /grant\s+(insert|update|delete)/i);
});
