import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldShowMissionHost } from '../../lib/engagement/mascotMoments.js';

test('mission host appears for an actionable mission', () => {
  assert.equal(
    shouldShowMissionHost({
      mission: { id: 'daily-1', current: 0, target: 1 },
      activeCrawl: null,
      actionType: 'rate_restaurant',
    }),
    true
  );
});

test('mission host never appears during active crawl navigation', () => {
  assert.equal(
    shouldShowMissionHost({
      mission: { id: 'daily-1' },
      activeCrawl: { id: 'crawl-1' },
      actionType: 'resume_crawl',
    }),
    false
  );
});

test('mission host stays out of loading and non-mission states', () => {
  assert.equal(
    shouldShowMissionHost({ mission: { id: 'daily-1' }, activeCrawl: null, actionType: 'loading' }),
    false
  );
  assert.equal(
    shouldShowMissionHost({ mission: null, activeCrawl: null, actionType: 'find_restaurant' }),
    false
  );
});
