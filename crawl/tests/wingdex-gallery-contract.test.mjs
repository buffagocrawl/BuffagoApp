import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../app/ratings/index.jsx', import.meta.url), 'utf8');
const helper = fs.readFileSync(new URL('../lib/wingdexGallery.js', import.meta.url), 'utf8');
const fn = fs.readFileSync(new URL('../supabase/functions/wing-public-gallery/index.ts', import.meta.url), 'utf8');

test('Wingdex batches photo counts and provides a gallery affordance', () => {
  assert.match(app, /loadWingdexGallery/);
  assert.match(app, /Pictures/);
  assert.match(app, /loadWingdexRestaurantGallery/);
  assert.match(helper, /picture_count/);
});

test('public gallery filters media at the server boundary', () => {
  assert.match(fn, /eq\('media_type', 'photo'\)/);
  assert.match(fn, /eq\('status', 'approved'\)/);
  assert.match(fn, /thumbnail_storage_path/);
  assert.match(fn, /processed_storage_path/);
  assert.match(fn, /createSignedUrl/);
  assert.doesNotMatch(fn, /original_storage_path/);
});
