import test from 'node:test';
import assert from 'node:assert/strict';
import { currentWingDuelCompletion } from '../../lib/home/monthlyWingDuel.js';

test('active Wing Duel remains visible until every authoritative active option has a vote', () => {
  assert.equal(currentWingDuelCompletion([{ id: 1 }, { id: 2 }], { 1: 1 }), false);
  assert.equal(currentWingDuelCompletion([{ id: 1 }, { id: 2 }], { 1: 1, 2: 2 }), true);
});

test('a new active duel set is incomplete even when the previous set was completed', () => {
  assert.equal(currentWingDuelCompletion([{ id: 3 }], { 1: 1, 2: 2 }), false);
});
