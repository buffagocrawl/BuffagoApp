import test from 'node:test';
import assert from 'node:assert/strict';

import {
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

test('weekly mission metadata centralizes action, reset, and truthful reward copy', () => {
  const summary = buildWeeklyMissionSummary();
  assert.equal(summary.nextMission.actionLabel, 'Rate a wing spot');
  assert.match(summary.resetCopy, /Monday/);
  assert.equal(summary.reward.kind, 'none');
  assert.match(summary.reward.detail, /does not currently grant XP/i);
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
