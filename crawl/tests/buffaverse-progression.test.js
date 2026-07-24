import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMilestones, calculateLevelProgress, celebrationKey, chooseNextObjective, normalizeProgressSummary } from '../lib/buffaverse/progression.js';

test('level progress clamps malformed and terminal thresholds safely', () => {
  assert.equal(calculateLevelProgress({ level: 3, xp: 999, currentThreshold: 300, nextThreshold: 500 }).percent, 1);
  assert.equal(calculateLevelProgress({ level: 3, xp: 'bad', currentThreshold: 300, nextThreshold: 300 }).percent, 1);
  assert.equal(calculateLevelProgress({ level: 0, xp: -4 }).level, 1);
});

test('summary normalizes partial data without inventing progress', () => {
  const summary = normalizeProgressSummary({ metrics: { restaurants: '4', crawls: null } });
  assert.deepEqual(summary.metrics, { restaurants: 4, crawls: 0, states: 0, badges: 0 });
  assert.equal(summary.title, 'Wing Scout');
});

test('objective excludes first rating after activity and never dead-ends', () => {
  const first = chooseNextObjective({ summary: { metrics: {} } });
  assert.equal(first.id, 'first-rating');
  const returning = chooseNextObjective({ summary: { metrics: { restaurants: 3 } } });
  assert.equal(returning.id, 'next-rating');
  const referralOff = chooseNextObjective({ summary: { metrics: { restaurants: 0 } }, referralEnabled: false });
  assert.notEqual(referralOff.id, 'invite-friend');
});

test('milestone boundaries and celebration keys are deterministic', () => {
  const milestones = buildMilestones({ metrics: { restaurants: 10, crawls: 0, badges: 1 } });
  assert.equal(milestones.find((item) => item.id === 'restaurants-10').complete, true);
  assert.equal(milestones.find((item) => item.id === 'crawl-1').complete, false);
  assert.equal(celebrationKey('restaurants-10', 10), 'buffaverse:restaurants-10:10');
});
