import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isReferralCodeValue,
  isWithinReferralRatingTolerance,
  normalizeReferralCodeValue,
  referralBadgeProgress,
} from '../../lib/referralModel.js';

test('referral codes normalize case and separators', () => {
  assert.equal(normalizeReferralCodeValue(' abcd-2345 '), 'ABCD2345');
  assert.equal(isReferralCodeValue('abcd-2345'), true);
  assert.equal(isReferralCodeValue('ABCO2345'), false, 'confusing O is excluded');
  assert.equal(isReferralCodeValue('ABC123'), false);
});

test('rating acceptance keeps public 100-yard guidance and hidden 0.5-mile tolerance distinct', () => {
  const inside100Yards = 80;
  const between100YardsAndHalfMile = 500;
  const outsideHalfMile = 900;
  assert.equal(isWithinReferralRatingTolerance(inside100Yards), true);
  assert.equal(isWithinReferralRatingTolerance(between100YardsAndHalfMile), true);
  assert.equal(isWithinReferralRatingTolerance(outsideHalfMile), false);
});

test('referral milestone progress is based on verified qualified count', () => {
  assert.deepEqual(referralBadgeProgress({ qualified_count: 0, next_badge_threshold: 1 }),
    { qualified: 0, threshold: 1, remaining: 1, progress: 0 });
  assert.equal(referralBadgeProgress({ qualified_count: 5, next_badge_threshold: 10 }).progress, 0.5);
  assert.equal(referralBadgeProgress({ qualified_count: 10, next_badge_threshold: null }).progress, 1);
});
