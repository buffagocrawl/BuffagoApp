import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const home = fs.readFileSync(new URL('../../app/(tabs)/home/index.jsx', import.meta.url), 'utf8');
const dialog = fs.readFileSync(new URL('../../components/home/WeeklyMissionDialog.jsx', import.meta.url), 'utf8');

test('Home removes the weekly mission entry point without retiring shared mission infrastructure', () => {
  assert.doesNotMatch(home, /weekly-mission-entry/);
  assert.doesNotMatch(home, /WeeklyMissionDialog/);
  assert.doesNotMatch(home, /loadWeeklyMission/);
  assert.doesNotMatch(home, /missionRequestRef|missionSummary|missionDialogOpen/);
  assert.match(home, /recordSavedRatingMission/);
  assert.doesNotMatch(home, /Restaurant tools|Claim or enroll|analytics_agent_restaurant_summary|restaurant_owner_claim/);
  assert.doesNotMatch(home, /missionSummary\.items\.map/);
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

test('Home reclaimed space contains the retained Wing Facts action', () => {
  assert.match(home, /testID="quick-action-wing-facts"/);
  assert.doesNotMatch(home, /missionEntry/);
});

test('Home clears the measured tab bar so Wing Facts remains reachable on compact Android screens', () => {
  assert.doesNotMatch(home, /useBottomTabBarHeight/);
  assert.match(home, /contentContainerStyle=\{\[styles\.scroll, \{ paddingBottom: 16 \}\]\}/);
  assert.match(home, /edges=\{\['top', 'left', 'right'\]\}/);
  assert.match(home, /wingFactsAction: \{ flex: 1, flexBasis: 0, minWidth: 148, minHeight: 80/);
  assert.match(home, /wingJuryAction: \{ flex: 1, flexBasis: 0, minWidth: 148, minHeight: 80/);
  assert.match(home, /scroll: \{ paddingHorizontal: 16, paddingTop: 6, gap: 8 \}/);
});

test('Rewards keeps the existing explanation and adds wrapping-safe prestige context', () => {
  assert.match(dialog, /summary\.reward\.detail/);
  assert.match(dialog, /Build your prestige on the weekly challenge leaderboards\. More rewards are coming\./);
  assert.match(dialog, /prestige: \{ lineHeight: 21, opacity: 0\.8 \}/);
});
