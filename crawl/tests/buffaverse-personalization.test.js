import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseBuffaverseNextAction } from '../lib/buffaverse/personalization.js';

test('personalization uses honest cold-start fallbacks', () => {
  assert.equal(chooseBuffaverseNextAction({ hasLocation: false }).kind, 'location');
  assert.equal(chooseBuffaverseNextAction({ hasLocation: true }).kind, 'explore');
  assert.equal(chooseBuffaverseNextAction({ hasLocation: true, candidates: [{ id: 'x', title: 'A real event' }] }).eventId, 'x');
});
