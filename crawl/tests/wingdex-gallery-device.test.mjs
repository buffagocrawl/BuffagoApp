import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mobileModule, hookRuntime } from './helpers/mobile-runtime.mjs';
const flush = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };
const elements = (tree, type) => {
  if (!tree) return [];
  if (Array.isArray(tree)) return tree.flatMap((node) => elements(node, type));
  return [...(tree.type === type ? [tree] : []), ...elements(tree.props?.children, type)];
};
function harness(loader) {
  const runtime = hookRuntime(); const requests = [];
  const { default: Gallery } = mobileModule('components/WingdexPhotoGallery.jsx', { react: runtime.react, 'react/jsx-runtime': runtime.jsx,
    'react-native': { ScrollView: 'scroll', View: 'view' }, 'expo-image': { Image: 'image' },
    'react-native-paper': { ActivityIndicator: 'spinner', Button: 'button', Dialog: Object.assign(function Dialog() {}, { Title: 'title', Content: 'content', Actions: 'actions' }), Portal: 'portal', Text: 'text' },
    '../lib/wingdexGallery': { loadWingdexRestaurantGallery: (id, client, options) => { requests.push({ id, ...options }); return loader(id, options); } }, '../lib/supabase': { supabase: {} } });
  const props = { restaurant: { destination_id: 'a', name: 'Restaurant A' }, onClose() {} };
  return { runtime, requests, props, render: () => runtime.render(Gallery, props) };
}
test('active Wingdex tab has list and restaurant-detail picture affordances', () => {
  const source = readFileSync(new URL('../app/(tabs)/ratings/index.jsx', import.meta.url), 'utf8');
  assert.match(source, /loadWingdexGallery/); assert.match(source, /setGalleryRestaurant\(item\)/);
  assert.match(source, /setGalleryRestaurant\(active\)/); assert.match(source, /key=\{galleryRestaurant\.destination_id\}/);
});
test('approved image loads with correct restaurant identity', async () => {
  const h = harness(async () => ({ count: 1, images: [{ submission_id: 'photo-a', signed_url: 'https://image.test/a' }] }));
  h.render(); await flush(); const tree = h.render();
  assert.equal(elements(tree, 'title')[0].props.children, 'Restaurant A');
  assert.equal(elements(tree, 'image')[0].props.source.uri, 'https://image.test/a'); h.runtime.unmount();
});
test('empty destination shows useful empty state and never retains prior images', async () => {
  const h = harness(async (id) => ({ count: id === 'a' ? 1 : 0, images: id === 'a' ? [{ submission_id: 'photo-a', signed_url: 'https://image.test/a' }] : [] }));
  h.render(); await flush(); h.render(); h.props.restaurant = { destination_id: 'b', name: 'Restaurant B' };
  h.render(); await flush(); const tree = h.render();
  assert.equal(elements(tree, 'image').length, 0);
  assert.ok(elements(tree, 'text').some((node) => node.props.children === 'No approved pictures yet.')); h.runtime.unmount();
});
test('stale gallery response cannot replace another restaurant or update after close', async () => {
  const pending = deferred(); const h = harness((id) => id === 'a' ? pending.promise : Promise.resolve({ count: 0, images: [] }));
  h.render(); h.props.restaurant = { destination_id: 'b', name: 'Restaurant B' }; h.render(); await flush();
  pending.resolve({ count: 1, images: [{ submission_id: 'old', signed_url: 'https://old.test' }] }); await flush();
  assert.equal(elements(h.render(), 'image').length, 0); h.runtime.unmount();
});
test('gallery pagination deduplicates double taps and overlapping pages', async () => {
  const pending = deferred(); const h = harness((_id, { offset }) => offset ? pending.promise : Promise.resolve({ count: 62, images: [{ submission_id: 'a', signed_url: 'https://a.test' }] }));
  h.render(); await flush();
  const more = elements(h.render(), 'button').find((node) => node.props.children === 'More pictures');
  more.props.onPress(); more.props.onPress(); assert.equal(h.requests.length, 2); assert.equal(h.requests[1].offset, 60);
  pending.resolve({ count: 62, images: [{ submission_id: 'a', signed_url: 'https://a.test' }, { submission_id: 'b', signed_url: 'https://b.test' }] });
  await flush(); assert.equal(elements(h.render(), 'image').length, 2); h.runtime.unmount();
});
test('image error and gallery request failure expose controlled retry', async () => {
  let fail = false; const h = harness(async () => { if (fail) throw Error('raw provider error'); return { count: 1, images: [{ submission_id: 'a', signed_url: 'https://a.test' }] }; });
  h.render(); await flush(); elements(h.render(), 'image')[0].props.onError();
  assert.ok(elements(h.render(), 'text').some((node) => /picture could not load/.test(node.props.children)));
  fail = true; elements(h.render(), 'button').find((node) => node.props.children === 'Retry pictures').props.onPress(); await flush();
  assert.ok(elements(h.render(), 'text').some((node) => node.props.children === 'Pictures are temporarily unavailable.')); h.runtime.unmount();
});
