import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mobileModule, hookRuntime } from './helpers/mobile-runtime.mjs';
import { savedRestaurantLabel } from '../lib/savedRestaurantLabels.js';

function harness(props) {
  const runtime = hookRuntime();
  const { default: Button } = mobileModule('components/SavedRestaurantButton.jsx', {
    react: runtime.react, 'react/jsx-runtime': runtime.jsx,
    'react-native-paper': { Button: 'button' }, '../lib/savedRestaurantLabels': { savedRestaurantLabel },
  });
  return () => runtime.render(Button, props);
}

for (const [rated, selected, label] of [[false, false, 'Add to Want to Try'], [false, true, 'Want to Try'], [true, false, 'Favorite'], [true, true, 'Already favorited']]) {
  test(`one saved control: rated=${rated}, selected=${selected} shows ${label}`, () => {
    const render = harness({ ratedByMe: rated, isFavorite: rated && selected, isWantToTry: !rated && selected, restaurantName: 'Wings' });
    const tree = render();
    assert.equal(tree.type, 'button');
    assert.equal(tree.props.children, label);
    assert.equal(tree.props.accessibilityState.selected, selected);
    assert.notEqual(tree.props.children, 'Saved');
  });
}

test('favorite and Want to Try add/remove use their existing collection and immediately update the label', () => {
  for (const ratedByMe of [true, false]) {
    const writes = [];
    const props = { ratedByMe, isFavorite: false, isWantToTry: false, restaurantName: 'Wings',
      onToggle(kind, selected) { writes.push([kind, selected]); props[kind === 'favorites' ? 'isFavorite' : 'isWantToTry'] = selected; } };
    const render = harness(props);
    let stopped = 0;
    render().props.onPress({ stopPropagation() { stopped++; } });
    assert.equal(render().props.children, ratedByMe ? 'Already favorited' : 'Want to Try');
    render().props.onPress({ stopPropagation() { stopped++; } });
    assert.equal(render().props.children, ratedByMe ? 'Favorite' : 'Add to Want to Try');
    assert.deepEqual(writes, [[ratedByMe ? 'favorites' : 'wantToTry', true], [ratedByMe ? 'favorites' : 'wantToTry', false]]);
    assert.equal(stopped, 2);
  }
});

test('main cards and details render only one saved action, reusing the existing mutation handler', () => {
  const source = readFileSync(new URL('../app/(tabs)/ratings/index.jsx', import.meta.url), 'utf8');
  for (const style of ['savedActionRow', 'detailSavedActionRow']) {
    const section = source.slice(source.indexOf(`<View style={styles.${style}}>`), source.indexOf('</View>', source.indexOf(`<View style={styles.${style}}>`)));
    assert.equal((section.match(/<SavedRestaurantButton/g) || []).length, 1);
    assert.doesNotMatch(section, /<Button|['"]Saved['"]/);
    assert.match(section, /handleSavedAction\((item|active), kind, nextSaved\)/);
    assert.match(section, /pending=\{ratedByMe \? favoritePending : wantToTryPending\}/);
  }
});
