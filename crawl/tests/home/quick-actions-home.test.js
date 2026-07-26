import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const home = fs.readFileSync(new URL('../../app/(tabs)/home/index.jsx', import.meta.url), 'utf8');

test('Home renders the three accessible quick actions in non-overlapping rows', () => {
  for (const action of ['quick-action-wing-duel', 'quick-action-wing-facts', 'quick-action-share-wing-spot']) {
    assert.match(home, new RegExp(`testID="${action}"`));
  }
  assert.match(home, /quickActionsTopRow/);
  assert.match(home, /quickActionPress: \{ flex: 1, minWidth: 0, minHeight: 56 \}/);
  assert.doesNotMatch(home, /heroActionFullWidth/);
});

test('Wing Duel and Wing Facts use their existing Home experiences', () => {
  assert.match(home, /title="Wing Duel"[\s\S]*onPress=\{\(\) => setBattleDialogOpen\(true\)\}/);
  assert.match(home, /title="Wing Facts"[\s\S]*onPress=\{openWingFacts\}/);
});

test('Share a Wing Spot uses the current recommendation and handles an empty recommendation', () => {
  assert.match(home, /title="Share a Wing Spot"/);
  assert.match(home, /detail="Send this restaurant to a friend"/);
  assert.match(home, /restaurantName: closest\.name/);
  assert.match(home, /address: closest\.address/);
  assert.match(home, /await Share\.share\(artifact\)/);
  assert.match(home, /No wing spot to share yet/);
});
