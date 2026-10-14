import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const screen = read('app/(tabs)/ratings/index.jsx');
const dialog = read('components/WingmanAddDialog.jsx');

test('Wingman is absent from the header and remains wired to the existing dialog', () => {
  const header = screen.slice(screen.indexOf('<Searchbar'), screen.indexOf('<Animated.FlatList'));
  assert.doesNotMatch(header, /Wingman: Add a place|wingdex-wingman-entry|openWingman\(/);
  assert.match(screen, /data=\{displayedRows\}/);
  assert.match(screen, /onPickDestination=\{handleWingmanPickDestination\}/);
  assert.match(screen, /onManualReviewQueued=\{\(\) =>/);
});

// Evaluate the screen's actual empty-state JSX, including branch selection and callbacks.
function emptyState(overrides = {}) {
  const start = screen.indexOf('ListEmptyComponent={') + 'ListEmptyComponent={'.length;
  const end = screen.indexOf('scrollEventThrottle={16}', start);
  const expression = screen.slice(start, end).trim().replace(/}$/, '');
  const calls = [];
  const context = {
    React: { createElement: (type, props) => ({ type, props }) }, FeedbackState: 'feedback',
    styles: { emptyState: {} }, savedView: 'discover', saved: { listStatus: 'ready' },
    filteredEmpty: false, locationMode: 'all', radiusMiles: 10, nextRadius: 25,
    wingdexRadiusMessage: () => 'Radius empty', query: "  O'Brien Wings  ",
    user: null, stateCodeFilter: null, selectedTagId: null, trackEvent() {},
    clearFilters: () => calls.push('clear'), openWingman: (...args) => calls.push(args),
    router: { push() {} }, ...overrides,
  };
  const code = ts.transpileModule(`const result = (${expression});`, {
    compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 }, fileName: 'empty.jsx',
  }).outputText;
  return { node: vm.runInNewContext(`${code} result`, context), calls, query: context.query };
}

for (const options of [
  {}, { locationMode: 'radius' }, { filteredEmpty: true },
  { savedView: 'favorites', filteredEmpty: true }, { savedView: 'want_to_try', filteredEmpty: true },
  { savedView: 'favorites' }, { savedView: 'want_to_try' },
]) {
  test(`no matches offer Wingman with exact prefill: ${JSON.stringify(options)}`, () => {
    const { node, calls, query } = emptyState(options);
    const primary = node.props.actionLabel === 'Wingman: Add a place';
    assert.equal(primary ? node.props.actionLabel : node.props.secondaryLabel, 'Wingman: Add a place');
    (primary ? node.props.onAction : node.props.onSecondary)();
    assert.deepEqual(calls, [['wingdex_empty_state', query]]);
    if (options.filteredEmpty) {
      node.props.onAction();
      assert.equal(calls.at(-1), 'clear');
    }
  });
}

for (const listStatus of ['guest', 'error']) {
  test(`saved ${listStatus} state keeps its recovery action without Wingman`, () => {
    const { node } = emptyState({ savedView: 'favorites', saved: { listStatus, loadList() {} } });
    assert.doesNotMatch(node.props.actionLabel, /Wingman/);
    assert.equal(node.props.secondaryLabel, undefined);
  });
}

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
