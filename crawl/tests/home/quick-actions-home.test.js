import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const home = fs.readFileSync(new URL('../../app/(tabs)/home/index.jsx', import.meta.url), 'utf8');

test('Home uses the compact layout without removing content', () => {
  assert.match(home, /scroll: \{ paddingHorizontal: 16, paddingTop: 6, gap: 8 \}/);
  assert.match(home, /contentContainerStyle=\{\[styles\.scroll, \{ paddingBottom: 16 \}\]\}/);
  assert.match(home, /edges=\{\['top', 'left', 'right'\]\}/);
  assert.doesNotMatch(home, /useBottomTabBarHeight/);
  assert.match(home, /logo: \{\s*position: 'absolute',[\s\S]*?height: 44/);
  assert.match(home, /closestCard:[\s\S]*?paddingHorizontal: 12,\s*paddingVertical: 10/);
  assert.match(home, /missionEntry: \{ minHeight: 80/);
  assert.match(home, /PlayerProgressCard level=\{hudStats.level\}/);
  assert.match(home, /loadWingdexRestaurantGallery\(closest.id, supabase\)/);
  assert.match(home, /WingShotImage approved uri=/);
  assert.match(home, /restaurantIconButton: \{ width: 40, height: 40/);
  assert.match(home, /contentStyle=\{\{ minHeight: 44 \}\}/);
});

test('Home removes Sauce Duel and keeps Wing Facts as one compact secondary action', () => {
  assert.match(home, /testID="quick-action-wing-facts"/);
  assert.doesNotMatch(home, /testID="quick-action-wing-duel"/);
  assert.doesNotMatch(home, /title="Wing Duel"/);
  assert.match(home, /wingFactsAction: \{ flex: 1, minWidth: 148, minHeight: 80/);
  assert.match(home, /wingFactsLabel: \{ fontSize: 14, lineHeight: 18/);
  assert.doesNotMatch(home, /quick-action-share-wing-spot/);
  assert.doesNotMatch(home, /Share a Wing Spot/);
});

test('Wing Facts retains its existing Home experience', () => {
  assert.match(home, /accessibilityLabel="Wing Facts, open a wing fact"[\s\S]*onPress=\{openWingFacts\}/);
});

test('Home keeps discovery in Nearby Spot and removes the extra map shortcuts', () => {
  assert.match(home, /onPress=\{\(\) => \{\s*setSearchOpen\(false\);\s*setDestinationWizardOpen\(true\);\s*\}\}[\s\S]*?Find Wings/);
  assert.doesNotMatch(home, /<View style=\{styles\.discoveryRow\}>/);
  assert.doesNotMatch(home, />\s*Open map\s*</i);
  assert.doesNotMatch(home, /<Button[^>]*>\s*Find wings\s*<\/Button>/i);
});

test('Home distinguishes empty, loading, and unavailable Wing Shot states and routes both CTAs to existing flows', () => {
  assert.match(home, /featuredPhotoLoading/);
  assert.match(home, /No Wing Shots yet/);
  assert.match(home, /Wing Shots are temporarily unavailable/);
  assert.match(home, /alreadyRatedThis \? router\.push\('\/(?:\(tabs\)\/journey)'\) : openHomeRatingWizard\(\)/);
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
