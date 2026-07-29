import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL('../supabase/migrations/20260729160000_wing_shot_rating_rule.sql', import.meta.url),
  'utf8',
);

function reason({ rating, currentUser, destination }) {
  if (!rating) return 'rating_not_found';
  if (rating.user_id !== currentUser) return 'rating_not_owned';
  if (rating.destination_id !== destination) return 'destination_mismatch';
  if (![rating.crispiness, rating.sauce, rating.meat, rating.overall]
    .every((score) => score >= 1 && score <= 10)) return 'incomplete_rating';
  if (rating.is_buffacoin) return 'buffacoin_rating';
  return 'eligible';
}

const base = {
  id: 'rating-1', user_id: 'user-1', destination_id: 'dest-1',
  crispiness: 8, sauce: 8, meat: 8, overall: 8, is_buffacoin: false,
};

test('completed Home rating succeeds', () => {
  assert.equal(reason({ rating: base, currentUser: 'user-1', destination: 'dest-1' }), 'eligible');
});

test('completed Crawl rating succeeds', () => {
  assert.equal(reason({ rating: { ...base, crawl_id: 'crawl-1' }, currentUser: 'user-1', destination: 'dest-1' }), 'eligible');
});

test('administrative, missing, and in-person receipts do not affect eligibility', () => {
  assert.equal(reason({ rating: base, currentUser: 'user-1', destination: 'dest-1' }), 'eligible');
  assert.doesNotMatch(migration, /rating_verification_receipts|in_person_proximity|administrative_rating/);
});

test('Buffacoin and incomplete ratings fail', () => {
  assert.equal(reason({ rating: { ...base, is_buffacoin: true }, currentUser: 'user-1', destination: 'dest-1' }), 'buffacoin_rating');
  assert.equal(reason({ rating: { ...base, overall: null }, currentUser: 'user-1', destination: 'dest-1' }), 'incomplete_rating');
});

test('ownership, destination, and not-found failures are safe and specific', () => {
  assert.equal(reason({ rating: base, currentUser: 'user-2', destination: 'dest-1' }), 'rating_not_owned');
  assert.equal(reason({ rating: base, currentUser: 'user-1', destination: 'dest-2' }), 'destination_mismatch');
  assert.equal(reason({ rating: null, currentUser: 'user-1', destination: 'dest-1' }), 'rating_not_found');
});

test('migration installs the exact reason vocabulary and duplicate guards', () => {
  for (const code of [
    'rating_not_found', 'rating_not_owned', 'destination_mismatch',
    'incomplete_rating', 'buffacoin_rating', 'eligible',
  ]) assert.match(migration, new RegExp(code));
  assert.match(migration, /wing_media_submissions/);
  assert.match(migration, /wing_submission_upload_intents/);
  assert.match(migration, /wing_submission_already_finalized/);
  assert.match(migration, /wing_submission_already_reserved/);
});
