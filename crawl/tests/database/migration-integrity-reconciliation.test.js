import test from 'node:test';
import assert from 'node:assert/strict';
import { inspect } from '../../scripts/check-migration-integrity.mjs';

test('recovered Phase 2 migration has an exact canonical root and manifest hash', () => {
  const report = inspect();
  const phase2 = report.rootFiles.filter((item) => item.name === '20260724050000_buffaverse_phase2_legendary_restaurants.sql');
  assert.equal(phase2.length, 1);
  assert.equal(phase2[0].hash, '56bbd4577a4b9a09cc180d27259d79c7f75a85487c1d35670c56e0898dca205e');
  assert.equal(report.manifestedMissingRoot.includes('20260724050000_buffaverse_phase2_legendary_restaurants.sql'), false);
  assert.equal(report.checksumMismatches.some((item) => item.name === '20260724050000_buffaverse_phase2_legendary_restaurants.sql'), false);
});

test('known current-schema migration is explicitly registered and checksum-stable', () => {
  const report = inspect();
  assert.ok(report.rootFiles.some((item) => item.name === '20260724120000_current_schema_reconciliation.sql'));
  assert.equal(report.checksumMismatches.length, 0);
});

test('recovered Phase 1 migrations are present as unique root files', () => {
  const report = inspect();
  for (const name of [
    '20260724020000_buffaverse_phase1_foundation.sql',
    '20260724040000_reconcile_buffaverse_phase1_foundation.sql',
  ]) {
    assert.equal(report.rootFiles.filter((item) => item.name === name).length, 1);
  }
  assert.equal(report.duplicates.length, 0);
});
