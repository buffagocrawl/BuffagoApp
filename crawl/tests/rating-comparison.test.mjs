import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { averageBeforeSubmission, comparisonFor, comparisonMessage, formatDifference, overallComparisonCopy, personalityFor } from '../lib/ratingComparison.js';

const read = (file) => fs.readFileSync(new URL(file, import.meta.url), 'utf8');

test('comparison uses submitted score and keeps community score separate', () => {
  assert.equal(comparisonFor(9, 8).delta, 1);
  assert.equal(comparisonFor(9, 8).symbol, '▲');
  assert.match(comparisonMessage('overall', 1), /way more than the crowd/);
});

test('first rating and personality rules are deterministic', () => {
  const result = personalityFor({ overall: 9, crispiness: 10, sauce: 8, meat: 9 }, { overall: null, crispiness: null, sauce: null, meat: null });
  assert.equal(result.title, 'CRUNCH COMMANDER');
  assert.equal(personalityFor({ overall: 8, crispiness: 8.2, sauce: 8.1, meat: 8.3 }, {}).title, 'BALANCED WING JUDGE');
  assert.equal(personalityFor({ overall: 9, crispiness: 9, sauce: 9, meat: 9 }, {}).title, 'CERTIFIED WING OPTIMIST');
});

test('comparison copy and deltas handle positive, negative, equal, first-rater, and partial data', () => {
  assert.ok(Math.abs(comparisonFor(9, 8.2).delta - 0.8) < 0.001);
  assert.match(comparisonMessage('overall', 0.8), /wing love|higher|heavyweight/i);
  assert.ok(Math.abs(comparisonFor(8, 8.8).delta + 0.8) < 0.001);
  assert.match(comparisonMessage('overall', -0.8), /crowd|impressed/i);
  assert.equal(comparisonFor(8.1, 8.2).symbol, '=');
  assert.match(comparisonMessage('overall', 0.1), /agree|consensus/i);
  assert.deepEqual(averageBeforeSubmission([]), { overall: null, crispiness: null, sauce: null, meat: null });
  assert.deepEqual(averageBeforeSubmission([{ overall: 8, crispiness: 9 }, { overall: 10 }]), { overall: 9, crispiness: 9, sauce: null, meat: null });
});

test('current rating is excluded while prior restaurant ratings remain in the average', () => {
  const rows = [
    { id: 'prior-1', overall: 8, crispiness: 8, sauce: 8, meat: 8 },
    { id: 'submitted', overall: 10, crispiness: 10, sauce: 10, meat: 10 },
    { id: 'prior-2', overall: 9, crispiness: 9, sauce: 9, meat: 9 },
  ];
  assert.deepEqual(averageBeforeSubmission(rows, 'submitted'), { overall: 8.5, crispiness: 8.5, sauce: 8.5, meat: 8.5 });
});

test('first rating, missing metrics, and difference formatting are honest', () => {
  assert.deepEqual(averageBeforeSubmission([], 'submitted'), { overall: null, crispiness: null, sauce: null, meat: null });
  assert.equal(averageBeforeSubmission([{ id: 'submitted', overall: 10 }], 'submitted').overall, null);
  assert.equal(formatDifference(-0.04), '0.0');
  assert.equal(formatDifference(0), '0.0');
  assert.equal(formatDifference(0.8), '+0.8');
  assert.match(overallComparisonCopy(null, false), /unavailable/i);
});

test('live Home and crawl paths only open comparison after a successful save', () => {
  const home = read('../app/(tabs)/home/index.jsx');
  const crawl = read('../app/crawl/[id].jsx');
  assert.match(home, /submit_validated_restaurant_rating/);
  assert.match(home, /setRatingComparisonVisible\(true\)/);
  assert.match(crawl, /submit_validated_crawl_rating/);
  assert.match(crawl, /setComparisonVisible\(true\)/);
  assert.match(home, /catch \(e\)[\s\S]*setHomeRateSaving\(false\)/);
  assert.match(crawl, /catch \(e\)[\s\S]*setSaving\(false\)/);
});

test('comparison snapshot is not sourced from reset form state and detail remains explicit', () => {
  const home = read('../app/(tabs)/home/index.jsx');
  const crawl = read('../app/crawl/[id].jsx');
  assert.match(home, /userScores: Object\.freeze\(\{ overall, crispiness, sauce, meat \}\)/);
  assert.match(crawl, /userScores: Object\.freeze\(\{ overall, crispiness: crisp, sauce, meat \}\)/);
  assert.match(home, /onViewRestaurant=\{async \(\) =>/);
  assert.match(crawl, /onViewRestaurant=\{\(\) =>/);
});

test('Wing Shot reset and navigation contracts are centralized and idempotent', () => {
  const flow = read('../components/wingShots/WingShotFlow.tsx');
  const crawl = read('../app/crawl/[id].jsx');
  const home = read('../app/(tabs)/home/index.jsx');
  assert.match(flow, /resetWingShotForm/);
  assert.match(flow, /setMedia\(null\)/);
  assert.match(flow, /setCaption\(''\)/);
  assert.match(flow, /setUploadResult\(null\)/);
  assert.match(flow, /phaseRef\.current === 'uploading'/);
  assert.match(crawl, /postRatingAdvancedRef\.current/);
  assert.match(home, /homePostRatingAdvancedRef\.current/);
  assert.match(flow, /onRequestClose=\{disabled \? undefined : closeFlow\}/);
});

test('comparison modal has a bounded scroll region and fixed accessible footer actions', () => {
  const modal = read('../components/RatingComparisonModal.jsx');
  assert.match(modal, /useSafeAreaInsets/);
  assert.match(modal, /maxHeight/);
  assert.match(modal, /ScrollView/);
  assert.match(modal, /View Restaurant/);
  assert.match(modal, />Done<\/Button>/);
  assert.match(modal, /minHeight: 44/);
});
