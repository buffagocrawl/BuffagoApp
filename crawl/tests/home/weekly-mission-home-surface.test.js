import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const home = fs.readFileSync(new URL('../../app/(tabs)/home/index.jsx', import.meta.url), 'utf8');
const dialog = fs.readFileSync(new URL('../../components/home/WeeklyMissionDialog.jsx', import.meta.url), 'utf8');

test('Home keeps missions compact and has no restaurant-owner surface or request', () => {
  assert.match(home, /testID="weekly-mission-entry"/);
  assert.doesNotMatch(home, /Restaurant tools|Claim or enroll|analytics_agent_restaurant_summary|restaurant_owner_claim/);
  assert.doesNotMatch(home, /missionSummary\.items\.map/);
});

test('mission dialog exposes focused tabs and all recoverable display states', () => {
  for (const label of ['Active', 'Rewards', 'How it works', 'Loading your weekly mission', 'Try again', 'No weekly mission is available']) {
    assert.match(dialog, new RegExp(label));
  }
  assert.match(dialog, /ScrollView/);
  assert.match(dialog, /onAction\(next\)/);
});
