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

test('share artifact clearly identifies the restaurant and its location', () => {
  const artifact = buildShareArtifact({
    restaurantName: 'Anchor Bar',
    address: '1047 Main St',
    city: 'Buffalo',
    stateCode: 'NY',
  });

  assert.match(artifact.title, /Anchor Bar/);
  assert.match(artifact.message, /^Check out Anchor Bar on BuffaGo!/);
  assert.match(artifact.message, /1047 Main St/);
});

test('share artifact includes a deep link when one is available and has a concise fallback without one', () => {
  const linked = buildShareArtifact({ restaurantName: 'Anchor Bar', deepLink: 'buffago://restaurants/anchor-bar' });
  const fallback = buildShareArtifact({ restaurantName: "Mario's Pizzeria & Ristorante" });

  assert.match(linked.message, /buffago:\/\/restaurants\/anchor-bar/);
  assert.equal(fallback.message, "Check out Mario's Pizzeria & Ristorante on BuffaGo!");
});
