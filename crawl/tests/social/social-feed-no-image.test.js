import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const social = fs.readFileSync(new URL('../../app/(tabs)/leaderboards/index.jsx', import.meta.url), 'utf8');

test('Social feed never substitutes a destination gallery image for a rating post', () => {
  assert.doesNotMatch(social, /restaurantShots|loadWingdexRestaurantGallery/);
  assert.doesNotMatch(social, /WingShotImage/);
  assert.doesNotMatch(social, /aspectRatio: 16 \/ 9/);
  assert.match(social, /View Detailed Rating/);
  assert.match(social, /destination_name/);
  assert.match(social, /feedScore/);
});

test('Social feed retains exact rating identity when the existing friends relationship provides it', () => {
  assert.match(social, /getFriendsFeed/);
  assert.match(social, /openRatingDetails/);
  assert.match(social, /destination_id/);
  assert.doesNotMatch(social, /from\('wing_media_submissions'\)/);
});
