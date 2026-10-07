import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { journeyPhotoStatus } from '../lib/journeyPhoto.js';
const source = readFileSync(new URL('../app/profile/history/index.jsx', import.meta.url), 'utf8');
const predicate = source.match(/\{(isViewingSelf && wingShotFlags\.prompt[^?]+)\? \(/)[1].trim();
const eligible = { id: 'rating-a', destination_id: 'restaurant-a', imageEligibilityKnown: true, imageEligible: true, hasMediaSubmission: false };
const visible = (overrides = {}) => vm.runInNewContext(predicate, { isViewingSelf: true, wingShotFlags: { prompt: true, photo: true }, item: eligible, ...overrides });
test('Journey owner sees Add Photo for complete rating without submission', () => {
  assert.equal(visible(), true); assert.match(source, />\s*Add Photo\s*</);
});
test('another user cannot add a photo to this rating', () => assert.equal(visible({ isViewingSelf: false }), false));
test('Journey hides new attachment when media exists or eligibility lookup failed', () => {
  assert.equal(visible({ item: { ...eligible, hasMediaSubmission: true } }), false);
  assert.equal(visible({ item: { ...eligible, imageEligibilityKnown: false } }), false);
});
test('Journey respects both authoritative flags', () => {
  assert.equal(visible({ wingShotFlags: { prompt: false, photo: true } }), false);
  assert.equal(visible({ wingShotFlags: { prompt: true, photo: false } }), false);
});
test('Journey status language covers moderation, approval, rejection, failed upload and withdrawal', () => {
  assert.equal(journeyPhotoStatus('in_review'), 'In Review'); assert.equal(journeyPhotoStatus('approved'), 'Approved');
  assert.equal(journeyPhotoStatus('rejected'), 'Rejected'); assert.equal(journeyPhotoStatus('failed'), 'Upload Failed');
  assert.equal(journeyPhotoStatus('withdrawn'), 'Withdrawn');
});
test('Journey passes exact rating/destination to shared secure flow and refreshes on completion', () => {
  assert.match(source, /eligibleRatingId=\{imageRating\.id\}/); assert.match(source, /destinationId=\{imageRating\.destination_id\}/);
  assert.match(source, /onSubmitted=\{async \(\) => \{[\s\S]*?await fetchAll\(viewUserId\)/);
  assert.match(source, /void refreshPhotoFlags\(\)/); assert.doesNotMatch(source, /\.from\('destination_ratings'\)\.update/);
});
