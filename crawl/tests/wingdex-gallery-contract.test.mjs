import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../app/ratings/index.jsx', import.meta.url), 'utf8');
const helper = fs.readFileSync(new URL('../lib/wingdexGallery.js', import.meta.url), 'utf8');
const fn = fs.readFileSync(new URL('../supabase/functions/wing-public-gallery/index.ts', import.meta.url), 'utf8');
const sql = fs.readFileSync(new URL('../supabase/migrations/20261007000241_image_workflow_rc_regression.sql', import.meta.url), 'utf8');

test('Wingdex batches photo counts and provides a gallery affordance', () => {
  assert.match(app, /loadWingdexGallery/);
  assert.match(app, /Pictures/);
  assert.match(app, /loadWingdexRestaurantGallery/);
  assert.match(helper, /picture_count/);
});

test('public gallery filters media at the server boundary', () => {
  assert.match(fn, /rpc\('get_wing_public_gallery'/);
  assert.match(sql, /s\.media_type = 'photo'/);
  assert.match(sql, /wing_media_is_public_status\(s\.status\)/);
  for (const status of ['approved', 'generation_pending', 'ready_to_post', 'scheduled', 'posting', 'posted']) {
    assert.match(sql, new RegExp(`'${status}'`));
  }
  for (const status of ['processing', 'pending', 'in_review', 'rejected', 'failed']) {
    assert.doesNotMatch(sql.match(/wing_media_is_public_status[\s\S]*?\$\$/)?.[0] || '', new RegExp(`'${status}'`));
  }
  assert.match(sql, /storage\.objects/);
  assert.match(sql, /thumbnail_storage_path/);
  assert.match(sql, /processed_storage_path/);
  assert.match(fn, /createSignedUrl/);
  assert.doesNotMatch(fn, /original_storage_path/);
});
