import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const home = fs.readFileSync(new URL('../../app/(tabs)/home/index.jsx', import.meta.url), 'utf8');

test('Home renders exactly two accessible quick actions in one non-overlapping row', () => {
  for (const action of ['quick-action-wing-duel', 'quick-action-wing-facts']) {
    assert.match(home, new RegExp(`testID="${action}"`));
  }
  assert.match(home, /quickActionsTopRow/);
  assert.match(home, /quickActionPress: \{ flex: 1, minWidth: 0, minHeight: 56 \}/);
  assert.doesNotMatch(home, /quick-action-share-wing-spot/);
  assert.doesNotMatch(home, /Share a Wing Spot/);
});

test('Wing Duel and Wing Facts use their existing Home experiences', () => {
  assert.match(home, /title="Wing Duel"[\s\S]*onPress=\{\(\) => setBattleDialogOpen\(true\)\}/);
  assert.match(home, /title="Wing Facts"[\s\S]*onPress=\{openWingFacts\}/);
});

test('Send to Friend is inside Your Next Place and never uses the native share sheet', () => {
  assert.match(home, /testID="send-to-friend-button"/);
  assert.match(home, /accessibilityLabel=\{`Send \$\{closest\.name \|\| 'this restaurant'\} to a friend`\}/);
  assert.match(home, /onPress=\{openSendToFriend\}/);
  assert.match(home, /sendDestinationId: closest\?\.id \|\| ''/);
  assert.doesNotMatch(home, /Share\.share\(/);
});
