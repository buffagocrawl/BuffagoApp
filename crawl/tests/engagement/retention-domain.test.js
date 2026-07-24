import test from 'node:test';
import assert from 'node:assert/strict';
import {
  eventStatus,
  getStreakTransition,
  localDateKey,
  missionViewModel,
  normalizeTimeZone,
  selectDailyMission,
} from '../../lib/engagement/retentionDomain.js';

test('daily assignment is deterministic and constrained to eligible actions', () => {
  const input = { userId: 'user-1', assignmentDate: '2026-07-23', eligibleActions: ['rating_created'] };
  assert.deepEqual(selectDailyMission(input), selectDailyMission(input));
  assert.equal(selectDailyMission(input).key, 'rate_one');
  assert.equal(selectDailyMission({ ...input, eligibleActions: ['missing'] }), null);
});

test('timezone date keys use the user local day and reject invalid zones', () => {
  const instant = new Date('2026-07-23T02:00:00Z');
  assert.equal(localDateKey(instant, 'America/New_York'), '2026-07-22');
  assert.equal(normalizeTimeZone('not/a-zone'), 'UTC');
});

test('streak extends once, restarts after a missed day, and tracks longest', () => {
  assert.deepEqual(getStreakTransition({
    currentStreak: 4, longestStreak: 6, lastQualifiedDate: '2026-07-22', qualifiedDate: '2026-07-23',
  }), { currentStreak: 5, longestStreak: 6, changed: true, status: 'extended' });
  assert.equal(getStreakTransition({
    currentStreak: 5, longestStreak: 6, lastQualifiedDate: '2026-07-23', qualifiedDate: '2026-07-23',
  }).changed, false);
  assert.equal(getStreakTransition({
    currentStreak: 5, longestStreak: 6, lastQualifiedDate: '2026-07-20', qualifiedDate: '2026-07-23',
  }).currentStreak, 1);
});

test('event and mission presentation states are explicit', () => {
  const event = { enabled: true, startsAt: '2026-07-25T00:00:00Z', endsAt: '2026-07-27T00:00:00Z' };
  assert.equal(eventStatus(event, new Date('2026-07-24T00:00:00Z')), 'upcoming');
  assert.equal(eventStatus(event, new Date('2026-07-26T00:00:00Z')), 'active');
  assert.equal(missionViewModel({
    progress: 4, target: 3, completed_at: null, claimed_at: null, expires_at: '2099-01-01T00:00:00Z',
  }).progress, 3);
});
