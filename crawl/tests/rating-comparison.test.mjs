import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { comparisonFor, comparisonMessage, personalityFor } from '../lib/ratingComparison.js';

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
