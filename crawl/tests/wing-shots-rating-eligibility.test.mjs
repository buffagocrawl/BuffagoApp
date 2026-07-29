import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL('../supabase/migrations/20260729155000_wing_upload_rating_eligibility_repair.sql', import.meta.url),
  'utf8',
);

function reason({ rating, currentUser, destination, receipt = null }) {
  if (!rating) return 'rating_not_found';
  if (rating.user_id !== currentUser) return 'rating_not_owned';
  if (rating.destination_id !== destination) return 'destination_mismatch';
  if (rating.is_buffacoin) return 'buffacoin_rating';
  if (![rating.crispiness, rating.sauce, rating.meat, rating.overall].every((score) => score >= 1 && score <= 10)) {
    return 'in_person_not_verified';
  }
  if (!receipt) return 'in_person_not_verified';
  if (receipt.verification_type === 'onboarding_seed' || receipt.eligibility_reason === 'onboarding_seed') {
    return 'onboarding_rating';
  }
  return receipt.wing_shot_eligible && receipt.verification_type === 'in_person_proximity'
    ? 'eligible'
    : 'in_person_not_verified';
}

const base = { id: 'rating-1', user_id: 'user-1', destination_id: 'dest-1', crispiness: 8, sauce: 8, meat: 8, overall: 8, is_buffacoin: false };
const verified = { verification_type: 'in_person_proximity', eligibility_reason: 'verified_in_person', wing_shot_eligible: true };

test('normal owned rating succeeds', () => assert.equal(reason({ rating: base, currentUser: 'user-1', destination: 'dest-1', receipt: verified }), 'eligible'));
test('Buffacoin rating is rejected', () => assert.equal(reason({ rating: { ...base, is_buffacoin: true }, currentUser: 'user-1', destination: 'dest-1', receipt: verified }), 'buffacoin_rating'));
test('onboarding rating is rejected', () => assert.equal(reason({ rating: base, currentUser: 'user-1', destination: 'dest-1', receipt: { verification_type: 'onboarding_seed', eligibility_reason: 'onboarding_seed', wing_shot_eligible: false } }), 'onboarding_rating'));
test("another user's rating is rejected", () => assert.equal(reason({ rating: base, currentUser: 'user-2', destination: 'dest-1', receipt: verified }), 'rating_not_owned'));
test('destination mismatch is rejected', () => assert.equal(reason({ rating: base, currentUser: 'user-1', destination: 'dest-2', receipt: verified }), 'destination_mismatch'));
test('missing rating is rejected', () => assert.equal(reason({ rating: null, currentUser: 'user-1', destination: 'dest-1' }), 'rating_not_found'));
test('verified in-person rating succeeds', () => assert.equal(reason({ rating: base, currentUser: 'user-1', destination: 'dest-1', receipt: verified }), 'eligible'));
test('crawl_id alone does not establish eligibility', () => assert.equal(reason({ rating: { ...base, crawl_id: 'crawl-1' }, currentUser: 'user-1', destination: 'dest-1' }), 'in_person_not_verified'));

test('migration uses actual destination_ratings columns and reasoned RPC errors', () => {
  assert.match(migration, /rating\.id = p_rating_id/);
  assert.match(migration, /rating\.user_id = auth\.uid\(\)/);
  assert.match(migration, /coalesce\(v_rating\.is_buffacoin, false\)/);
  assert.doesNotMatch(migration, /rating\.(is_in_person|proximity_verified|rating_status|submission_source|eligible_for_wing_shot)/);
  for (const code of ['rating_not_found', 'rating_not_owned', 'buffacoin_rating', 'destination_mismatch', 'onboarding_rating', 'in_person_not_verified']) assert.match(migration, new RegExp(code));
  assert.doesNotMatch(migration, /crawl_id\s+is\s+not\s+null/);
});
