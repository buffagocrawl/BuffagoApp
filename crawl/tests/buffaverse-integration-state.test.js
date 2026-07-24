import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveBuffaverseSurface } from '../lib/buffaverse/integrationState.js';

test('integration state resolves collisions deterministically', () => {
  assert.equal(resolveBuffaverseSurface({ legendary: { id: 'l' }, bossBattle: { id: 'b' } }).kind, 'boss_battle');
  assert.equal(resolveBuffaverseSurface({ offline: true }).kind, 'offline');
  assert.equal(resolveBuffaverseSurface({}).kind, 'empty');
});
