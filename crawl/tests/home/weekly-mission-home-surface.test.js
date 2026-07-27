import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const home = fs.readFileSync(new URL('../../app/(tabs)/home/index.jsx', import.meta.url), 'utf8');
const dialog = fs.readFileSync(new URL('../../components/home/WeeklyMissionDialog.jsx', import.meta.url), 'utf8');

test('Home keeps missions compact and has no restaurant-owner surface or request', () => {
  assert.match(home, /testID="weekly-mission-entry"/);
  assert.doesNotMatch(home, /Restaurant tools|Claim or enroll|analytics_agent_restaurant_summary|restaurant_owner_claim/);
  assert.doesNotMatch(home, /missionSummary\.items\.map/);
  assert.match(home, /loadWeeklyMission/);
  assert.match(home, /missionRequestRef/);
});

test('mission dialog exposes focused tabs and all recoverable display states', () => {
  for (const label of ['Active', 'Rewards', 'How it works', 'Loading your weekly mission', 'Try again', 'No weekly mission is available']) {
    assert.match(dialog, new RegExp(label));
  }
  assert.match(dialog, /ScrollView/);
  assert.match(dialog, /onAction\(next\)/);
  assert.match(dialog, /flexWrap: 'wrap'/);
  assert.match(dialog, /scroll: \{ paddingBottom: 16 \}/);
});

test('Active mission makes the assigned title, description, progress, and friendly reset copy the focus', () => {
  assert.match(dialog, /item\.label/);
  assert.match(dialog, /item\.detail/);
  assert.match(dialog, /Progress: \{item\.current\} \/ \{item\.target\}/);
  assert.match(dialog, /Reward: \{summary\.reward\.title\}/);
  assert.doesNotMatch(dialog, /goals complete/);
});

test('collapsed mission card identifies the assigned mission and its exact progress', () => {
  assert.match(home, /missionSummary\.mission\.label/);
  assert.match(home, /missionSummary\.mission\.current\} of \{missionSummary\.mission\.target\} complete/);
  assert.match(home, /missionEntryMission/);
});
