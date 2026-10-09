import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadWingdexFullPhoto } from '../lib/wingdexGallery.js';

const app = fs.readFileSync(new URL('../app/ratings/index.jsx', import.meta.url), 'utf8');
const helper = fs.readFileSync(new URL('../lib/wingdexGallery.js', import.meta.url), 'utf8');
const fn = fs.readFileSync(new URL('../supabase/functions/wing-public-gallery/index.ts', import.meta.url), 'utf8');
const sql = fs.readFileSync(new URL('../supabase/migrations/20261007000241_image_workflow_rc_regression.sql', import.meta.url), 'utf8');

test('Wingdex batches photo counts and provides a gallery affordance', () => {
  assert.match(app, /loadWingdexGallery/);
  assert.match(app, /Pictures/);
  assert.match(app, /WingdexPhotoGallery/);
  assert.match(helper, /picture_count/);
});

test('public gallery enforces strict approved processed media at server boundary', () => {
  assert.match(fn, /eq\('media_type', 'photo'\)\.eq\('status', 'approved'\)/);
  assert.match(fn, /hasCanonicalProcessed\(photo\)/);
  assert.match(fn, /filter\(hasCanonicalThumbnail\)/);
  assert.match(fn, /thumbnail_storage_path/);
  assert.match(fn, /processed_storage_path/);
  assert.match(fn, /createSignedUrls/);
  assert.doesNotMatch(fn, /original_storage_path/);
  assert.doesNotMatch(fn, /getPublicUrl/);
  assert.match(fn, /order\('like_count', \{ ascending: false \}\)/);
  assert.match(fn, /order\('dislike_count', \{ ascending: true \}\)/);
  assert.match(fn, /order\('created_at', \{ ascending: true \}\)/);
  assert.match(fn, /order\('id', \{ ascending: true \}\)/);
  assert.match(helper, /include_covers: true/);
});

test('full-photo lookup rejects a different submission returned by an older handler', async () => {
  const photo = { destination_id: 'restaurant-a', submission_id: 'requested-photo' };
  const invoke = async () => ({ data: { restaurants: [{ destination_id: 'restaurant-a', images: [
    { submission_id: 'another-photo', signed_url: 'https://example.test/processed' },
  ] }] }, error: null });
  await assert.rejects(loadWingdexFullPhoto(photo, { functions: { invoke } }), /no longer available/);
});

test('full-photo lookup accepts only the requested submission', async () => {
  const photo = { destination_id: 'restaurant-a', submission_id: 'requested-photo' };
  const image = { submission_id: 'requested-photo', signed_url: 'https://example.test/processed' };
  const invoke = async () => ({ data: { restaurants: [{ destination_id: 'restaurant-a', images: [image] }] }, error: null });
  assert.deepEqual(await loadWingdexFullPhoto(photo, { functions: { invoke } }), image);
});
