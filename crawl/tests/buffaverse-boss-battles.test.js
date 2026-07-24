import test from 'node:test';
import assert from 'node:assert/strict';
import { BOSS_BATTLE_SHOWCASE_FIXTURES, projectBossBattle } from '../lib/buffaverse/bossBattles.js';

test('Boss Battle fixtures cover live, cold-start, completed, and expired states', () => {
  assert.deepEqual(BOSS_BATTLE_SHOWCASE_FIXTURES.map((fixture) => fixture.state), ['live', 'cold_start', 'completed', 'expired']);
});

test('Boss Battle projection clamps progress and preserves honest counts', () => {
  const projection = projectBossBattle(BOSS_BATTLE_SHOWCASE_FIXTURES[0], { progress: 99 });
  assert.equal(projection.progress, 10);
  assert.equal(projection.percent, 100);
  assert.equal(projectBossBattle(null), null);
});
