import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDailyMission, selectNextBestAction } from '../../lib/home/nextBestAction.js';

test('active crawl deterministically outranks mission and restaurant', () => {
  const action = selectNextBestAction({
    activeCrawl: { crawlId: 'crawl-1', visitedCount: 2, totalStops: 4 },
    mission: { type: 'wing_battle', current: 0, target: 3, title: 'Vote', ctaLabel: 'Vote now' },
    restaurant: { id: 'spot-1', name: 'Hot Wings' },
  });
  assert.equal(action.type, 'resume_crawl');
  assert.equal(action.ctaLabel, 'Resume crawl');
});

test('location denial creates a usable primary action', () => {
  const action = selectNextBestAction({ locationStatus: 'denied' });
  assert.equal(action.type, 'enable_location');
  assert.equal(action.ctaLabel, 'Enable location');
});

test('battle mission uses only available battle actions', () => {
  const mission = buildDailyMission({ battleTotal: 3, battleAnswered: 1, now: new Date('2026-07-23T12:00:00') });
  assert.equal(mission.type, 'wing_battle');
  assert.deepEqual([mission.current, mission.target], [1, 3]);
});

test('crawl mission progress survives hydrated crawl state', () => {
  const mission = buildDailyMission({ activeCrawl: { crawlId: 'c1', visitedCount: 2, totalStops: 5 } });
  assert.equal(mission.type, 'continue_crawl');
  assert.deepEqual([mission.current, mission.target], [2, 5]);
});

test('completed canonical mission exposes one safe claim action', () => {
  const action = selectNextBestAction({
    mission: { complete: true, claimed: false, reward: '35 XP' },
    restaurant: { id: 'spot-1', name: 'Hot Wings' },
  });
  assert.equal(action.type, 'claim_reward');
  assert.equal(action.ctaLabel, 'Claim XP');
});
