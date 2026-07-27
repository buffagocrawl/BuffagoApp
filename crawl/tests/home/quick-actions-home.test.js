import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const home = fs.readFileSync(new URL('../../app/(tabs)/home/index.jsx', import.meta.url), 'utf8');

test('Home uses the compact layout without removing content', () => {
  assert.match(home, /scroll: \{ padding: 12, paddingBottom: 16, gap: 8 \}/);
  assert.match(home, /logo: \{ flex: 1, height: 50/);
  assert.match(home, /closestCard:[\s\S]*padding: 12/);
  assert.match(home, /missionEntry: \{ minHeight: 64/);
  assert.match(home, /restaurantIconButton: \{ width: 40, height: 40/);
  assert.match(home, /contentStyle=\{\{ height: 40 \}\}/);
});

test('Home removes Sauce Duel and keeps Wing Facts as one compact secondary action', () => {
  assert.match(home, /testID="quick-action-wing-facts"/);
  assert.doesNotMatch(home, /testID="quick-action-wing-duel"/);
  assert.doesNotMatch(home, /title="Wing Duel"/);
  assert.match(home, /wingFactsAction: \{ minHeight: 52/);
  assert.match(home, /wingFactsLabel: \{ fontSize: 14, lineHeight: 18/);
  assert.doesNotMatch(home, /quick-action-share-wing-spot/);
  assert.doesNotMatch(home, /Share a Wing Spot/);
});

test('Wing Facts retains its existing Home experience', () => {
  assert.match(home, /accessibilityLabel="Wing Facts, open a wing fact"[\s\S]*onPress=\{openWingFacts\}/);
});

test('Send to Friend is inside the restaurant card and never uses the native share sheet', () => {
  assert.doesNotMatch(home, /Your Next Place!/);
  assert.match(home, /testID="send-to-friend-button"/);
  assert.match(home, /testID="directions-button"/);
  assert.match(home, /hitSlop=\{4\}/);
  assert.match(home, /accessibilityLabel=\{`Send \$\{closest\.name \|\| 'this restaurant'\} to a friend`\}/);
  assert.match(home, /onPress=\{openSendToFriend\}/);
  assert.match(home, /sendDestinationId: closest\?\.id \|\| ''/);
  assert.doesNotMatch(home, /Share\.share\(/);
});
