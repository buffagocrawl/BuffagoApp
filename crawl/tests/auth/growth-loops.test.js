import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildRestaurantOwnerSnapshot,
  buildShareArtifact,
  buildWeeklyMissionSummary,
} from '../../lib/growthLoops.js';

test('weekly mission summary reports next mission and completion ratio', () => {
  const summary = buildWeeklyMissionSummary({
    ratingsThisWeek: 1,
    sharesThisWeek: 1,
    invitesThisWeek: 0,
    crawlStopsVisited: 2,
  });

  assert.equal(summary.completedCount, 1);
  assert.equal(summary.totalCount, 4);
  assert.equal(summary.completionRatio, 0.25);
  assert.equal(summary.nextMission?.key, 'ratings');
  assert.equal(summary.items[1].complete, true);
});

test('weekly mission summary caps progress at the mission target', () => {
  const summary = buildWeeklyMissionSummary({
    ratingsThisWeek: 7,
    sharesThisWeek: 2,
    invitesThisWeek: 4,
    crawlStopsVisited: 9,
  });

  assert.equal(summary.completedCount, 4);
  assert.equal(summary.nextMission, null);
  assert.equal(summary.items[0].current, 2);
  assert.equal(summary.items[3].current, 3);
});

test('share artifact includes score, location, and crawl when available', () => {
  const artifact = buildShareArtifact({
    restaurantName: 'Anchor Bar',
    score: 92,
    city: 'Buffalo',
    stateCode: 'NY',
    crawlTitle: 'Downtown Heat Check',
  });

  assert.match(artifact.title, /Anchor Bar/);
  assert.match(artifact.message, /92\/100/);
  assert.match(artifact.message, /Buffalo, NY/);
  assert.match(artifact.message, /Downtown Heat Check/);
});

test('restaurant owner snapshot stays transparent when no metrics exist yet', () => {
  const snapshot = buildRestaurantOwnerSnapshot({
    restaurantName: 'Wing Lab',
    ratingCount: 0,
    averageScore: null,
  });

  assert.match(snapshot.title, /Wing Lab/);
  assert.equal(snapshot.metrics[0].value, '0');
  assert.equal(snapshot.metrics[1].value, 'No score yet');
  assert.equal(snapshot.ctaLabel, 'Claim or enroll');
});
