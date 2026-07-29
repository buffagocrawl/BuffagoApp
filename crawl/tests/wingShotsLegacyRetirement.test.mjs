import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL('../supabase/migrations/20260729135000_retire_legacy_jalapeno_media.sql', import.meta.url),
  'utf8',
).toLowerCase();

test('legacy jalapeno media buckets are made private without deleting history', () => {
  assert.match(migration, /update storage\.buckets/);
  assert.match(migration, /set public = false/);
  assert.match(migration, /'jalapeno-assets'/);
  assert.match(migration, /'jalapeno-wing-videos'/);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.jalapeno/);
});

test('legacy reusable video inventory and automation settings are disabled', () => {
  assert.match(migration, /jalapeno_video_assets set active = false/);
  assert.match(migration, /update public\.jalapeno_settings/);
  assert.match(migration, /set is_enabled = false/);
});
