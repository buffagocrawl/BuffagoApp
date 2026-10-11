import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const game = fs.readFileSync(new URL('../components/WingJuryGame.jsx', import.meta.url), 'utf8');
const home = fs.readFileSync(new URL('../app/(tabs)/home/index.jsx', import.meta.url), 'utf8');
const route = fs.readFileSync(new URL('../app/wing-jury/index.jsx', import.meta.url), 'utf8');

test('Home Wing Jury entry is independently feature-gated and preserves Wing Facts', () => {
  assert.match(home, /ENABLE_WING_JURY/);
  assert.match(home, /testID="home-wing-jury-entry"/);
  assert.match(home, /router\.push\('\/wing-jury'\)/);
  assert.match(home, /testID="quick-action-wing-facts"/);
  assert.doesNotMatch(home, /Weekly Missions/);
  assert.doesNotMatch(home, /States visited/);
});

test('Wing Jury route uses the dedicated game surface', () => {
  assert.match(route, /WingJuryGame/);
  assert.match(route, /SafeAreaView/);
});

test('pre-vote UI contains only blind photo and verdict controls', () => {
  assert.match(game, /accessibilityLabel="Wing photo to judge"/);
  assert.match(game, /wing-jury-verdict-\$\{verdict\.value\}/);
  assert.match(game, /Dislike/);
  assert.match(game, /Average/);
  assert.match(game, /Like/);
  const preVote = game.slice(game.indexOf('{!isRevealed'), game.indexOf("status === 'SUBMITTING'"));
  assert.doesNotMatch(preVote, /restaurant_name|photo_like_count|Wingdex Average|Favorite|Want to Try|restaurant\.name/);
});

test('vote lifecycle prevents duplicate actions and separates reveal retry from vote retry', () => {
  for (const state of ['LOADING', 'READY_TO_VOTE', 'SUBMITTING', 'REVEAL_LOADING', 'REVEALED', 'ERROR', 'FEED_EXHAUSTED']) assert.match(game, new RegExp(state));
  assert.match(game, /status !== 'READY_TO_VOTE'/);
  assert.match(game, /Your verdict is saved/);
  assert.match(game, /Retry Reveal/);
  assert.match(game, /guestVerdictRegistered: result\.status === 'guest'/);
});

test('reveal distinguishes photo likes, Wingdex average, personal rating, and save actions', () => {
  assert.match(game, /Photo Likes/);
  assert.match(game, /Wingdex Average/);
  assert.match(game, /Your Last Rating/);
  assert.match(game, /saveSavedDestinationIntent/);
  assert.match(game, /useSavedDestinations/);
  assert.match(game, /Sign In \/ Create Account/);
  assert.match(game, /Not Now/);
});

test('guest close clears the session and exhausted feed returns Home', () => {
  assert.match(game, /guestSession\.clear\(\)/);
  assert.match(game, /wing-jury-exhausted/);
  assert.match(game, /Return Home/);
  assert.match(game, /router\.replace\('\/\(tabs\)\/home'\)/);
});
