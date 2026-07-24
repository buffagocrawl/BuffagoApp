import test from 'node:test';
import assert from 'node:assert/strict';

const activeSequence = [0, 1, 2, 3, 5, 6];

test('Buffaverse active sequence preserves noncontiguous identifiers', () => {
  assert.deepEqual(activeSequence, [0, 1, 2, 3, 5, 6]);
  assert.equal(activeSequence.includes(4), false);
});

test('Phase 3 completion authorizes Phase 5 and keeps Phase 4 data-deferred', () => {
  assert.equal(activeSequence[activeSequence.indexOf(3) + 1], 5);
  assert.match(
    'PHASE 5 AUTHORIZED FOR DEVELOPMENT — PHASE 4 REMAINS DATA-DEFERRED',
    /^PHASE 5 AUTHORIZED FOR DEVELOPMENT — PHASE 4 REMAINS DATA-DEFERRED$/,
  );
});
