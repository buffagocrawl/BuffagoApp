import test from 'node:test';
import assert from 'node:assert/strict';
import { mapRetentionDashboard, shouldUseRetentionFallback } from '../../lib/home/retentionDashboard.js';

test('maps canonical daily and weekly assignments into Home view models', () => {
  const result = mapRetentionDashboard({
    assignments: [
      { id: 'd1', period_kind: 'daily', mission_key: 'rate_one', action_type: 'rating_created', progress: 1, target: 1, reward_xp: 35, completed_at: '2026-07-23T12:00:00Z', claimed_at: null, expires_at: '2026-07-24T04:00:00Z' },
      { id: 'w1', period_kind: 'weekly', mission_key: 'weekly_three_ratings', action_type: 'rating_created', progress: 2, target: 3, reward_xp: 100, completed_at: null, claimed_at: null, expires_at: '2026-07-27T04:00:00Z' },
    ],
  }, new Date('2026-07-23T13:00:00Z'));
  assert.equal(result.daily.ctaLabel, 'Claim XP');
  assert.equal(result.weekly.current, 2);
  assert.equal(result.weekly.reward, '100 XP');
});

test('fallback is restricted to unavailable migration or connectivity failures', () => {
  assert.equal(shouldUseRetentionFallback(new Error('Retention request failed: get_engagement_dashboard')), true);
  assert.equal(shouldUseRetentionFallback(new Error('Network request failed')), true);
  assert.equal(shouldUseRetentionFallback(new Error('assignment_incomplete')), false);
});

