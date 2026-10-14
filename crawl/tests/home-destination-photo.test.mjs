import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mobileModule, hookRuntime, findElement } from './helpers/mobile-runtime.mjs';

function harness() {
  const runtime = hookRuntime();
  const { default: Photo } = mobileModule('components/home/HomeDestinationPhoto.jsx', {
    react: runtime.react, 'react/jsx-runtime': runtime.jsx, 'react-native': { Pressable: 'pressable' },
    '../ui/OperationUI': { WingShotImage: 'image' }, '../WingdexPhotoViewer': { __esModule: true, default: 'viewer' },
  });
  const props = { photo: { submission_id: 'selected', destination_id: 'd1', signed_url: 'https://thumb/selected' }, restaurantName: 'Wings' };
  return { runtime, props, render: () => runtime.render(Photo, props) };
}
const viewer = tree => tree.props.children.find(node => node?.type === 'viewer');
test('Home photo opens existing full-screen viewer at that photo and dismisses', () => {
  const h = harness();
  findElement(h.render(), 'home-destination-photo').props.onPress();
  let modal = viewer(h.render());
  assert.equal(modal.props.selectedId, 'selected');
  assert.equal(modal.props.photos[0], h.props.photo);
  assert.equal(modal.props.restaurantName, 'Wings');
  modal.props.onClose();
  assert.equal(viewer(h.render()), undefined);
  h.runtime.unmount();
});
test('no photo produces no photo opener and changing destination dismisses an old photo', () => {
  const h = harness();
  findElement(h.render(), 'home-destination-photo').props.onPress();
  h.props.photo = { ...h.props.photo, submission_id: 'other', destination_id: 'd2' };
  h.render();
  assert.equal(viewer(h.render()), undefined);
  h.props.photo = null;
  assert.equal(h.render(), null);
  h.runtime.unmount();
});
test('Home retains full photo identity, separate restaurant navigation, and existing no-photo fallback', () => {
  const source = readFileSync(new URL('../app/(tabs)/home/index.jsx', import.meta.url), 'utf8');
  assert.match(source, /photo: gallery.images\[0\] \|\| null/);
  assert.match(source, /<HomeDestinationPhoto key=\{closest.id\} photo=\{featuredPhoto.photo\}/);
  assert.match(source, /accessibilityLabel="View restaurant ratings and details" onPress=\{\(\) => openRestaurantPeek\(closest.id\)\}/);
  assert.match(source, /No Wing Shots yet/);
  assert.match(source, /Be the first to share a Wing Shot/);
});
