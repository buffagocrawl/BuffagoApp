import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const screen = read('app/(tabs)/ratings/index.jsx');
const dialog = read('components/WingmanAddDialog.jsx');

test('Wingman add-place entry is in the persistent header regardless of flags or results', () => {
  const header = screen.slice(screen.indexOf('<Searchbar'), screen.indexOf('<Animated.FlatList'));
  assert.match(header, /<Button mode="contained-tonal" icon="plus" accessibilityLabel="Wingman: Add a place" testID="wingdex-wingman-entry"\s+onPress=\{\(\) => void openWingman\('wingdex', query\)\}/);
  assert.ok(header.indexOf('wingdex-wingman-entry') < header.indexOf('{loading ||'));
  assert.match(header, /contentStyle=\{\{ minHeight: 48 \}\}/);
  const entry = header.slice(header.indexOf('<Button mode="contained-tonal" icon="plus"'), header.indexOf('<View style={styles.discoveryToolbar}>'));
  assert.doesNotMatch(entry, /ENABLE_|filtered|savedView|loading/);
  assert.match(screen, /onPickDestination=\{handleWingmanPickDestination\}/);
  assert.match(screen, /onManualReviewQueued=\{\(\) =>/);
});

test('Wingdex opens Wingman with the exact search and default launches clear it', async () => {
  const callback = screen.match(/const openWingman = useCallback\((async[\s\S]*?)\n  }, \[getWingmanStateContext/);
  assert.ok(callback, 'Wingdex open callback is present');
  const state = {};
  const context = {
    trackEvent() {}, user: null, locationMode: 'all', filteredRef: { current: [] },
    getWingmanStateContext: async () => ({ stateCode: 'NY', stateId: 1 }),
    setWingmanInitialRestaurant: value => { state.name = value; },
    setWingmanStateCtx: value => { state.location = value; },
    setWingmanOpen: value => { state.visible = value; },
  };
  const open = vm.runInNewContext(`(${callback[1]}\n  })`, context);
  const query = "  O'Brien’s Wings & More / café?! 🍗  ";
  await open('wingdex_empty_state', query);
  assert.equal(state.name, query);
  assert.equal(state.visible, true);
  await open();
  assert.equal(state.name, '');
  await open('wingdex', query);
  assert.equal(state.name, query);
  assert.equal(state.visible, true);
  assert.equal(state.location.stateId, 1);
  assert.match(screen, /openWingman\('wingdex_empty_state', query\)/);
  assert.match(screen, /initialRestaurant=\{wingmanInitialRestaurant\}/);
});

test('Wingman resets on opening, preserves edits while visible and never auto-searches', () => {
  const effect = dialog.replaceAll('\r\n','\n').match(/useEffect\(\(\) => \{(\n    const justOpened[\s\S]*?)\n  }, \[visible, initialRestaurant, initialStateId, initialStateCode\]\)/);
  assert.ok(effect, 'Dialog open/reset effect is present');
  const state = { name: '' };
  const context = {
    visible: false, initialRestaurant: '', initialStateId: null, initialStateCode: null,
    wasVisibleRef: { current: false }, searchInFlightRef: {}, insertInFlightRef: {}, verifyInFlightRef: {},
    setRestaurantName: value => { state.name = value; },
    setStateId() {}, setStateCode() {}, setCity() {}, setExtraInfo() {},
    setLoading() {}, selectionInFlightRef: {}, setMessage() {}, setCandidate() {}, setStep: value => { state.step = value; },
  };
  // Wrap so the effect's early return has the same function semantics as React.
  const run = () => vm.runInNewContext(`(() => {${effect[1]}\n})()`, context);
  context.visible = true;
  context.initialRestaurant = "O'Brien’s Wings & More";
  run();
  assert.equal(state.name, context.initialRestaurant);
  assert.equal(state.step, 'state');
  state.name = 'Edited restaurant';
  run();
  assert.equal(state.name, 'Edited restaurant');
  state.name = '';
  run();
  assert.equal(state.name, '');
  context.visible = false;
  run();
  context.initialRestaurant = '';
  context.visible = true;
  run();
  assert.equal(state.name, '');
  assert.match(dialog, /value=\{restaurantName\}\s+onChangeText=\{setRestaurantName\}/);
  assert.doesNotMatch(effect[1], /runWingman|\.run\(|functions\.invoke/);
});
