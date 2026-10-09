import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mobileModule, hookRuntime, findElement } from './helpers/mobile-runtime.mjs';
import { createVoteController } from '../lib/wingdexPhotos.js';
const flush = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };
const elements = (tree, type) => {
  if (!tree) return [];
  if (Array.isArray(tree)) return tree.flatMap((node) => elements(node, type));
  const cells = tree.type === 'flatlist' ? tree.props.data.map((item, index) =>
    tree.props.renderItem({ item, index })) : [];
  return [...(tree.type === type ? [tree] : []), ...elements(tree.props?.children, type), ...elements(cells, type)];
};
function harness(loader, { mutation, user = { id: 'viewer' }, ownVotes, fullPhoto } = {}) {
  const runtime = hookRuntime(); const requests = []; const votes = []; const auth = { user }; let onAppState;
  const client = { auth: { getUser: async () => ({ data: auth, error: null }) }, from: () => ({
    upsert: async (row) => { votes.push(row); return mutation ? mutation(row) : { error: null }; },
    delete() { const row = { vote: null }; return { eq(k,v) { row[k] = v; return this; }, then(resolve,reject) {
      votes.push(row); return Promise.resolve(mutation ? mutation(row) : { error: null }).then(resolve,reject);
    } }; },
  }) };
  const { default: Gallery } = mobileModule('components/WingdexPhotoGallery.jsx', { react: runtime.react, 'react/jsx-runtime': runtime.jsx,
    'react-native': { AppState: { addEventListener: (_event, callback) => { onAppState = callback; return { remove() {} }; } }, Pressable: 'pressable', FlatList: 'flatlist', View: 'view' }, 'expo-image': { Image: 'image' },
    'react-native-paper': { ActivityIndicator: 'spinner', Button: 'button', Dialog: Object.assign(function Dialog() {}, { Title: 'title', Content: 'content', Actions: 'actions' }), Portal: 'portal', Text: 'text' },
    '../lib/wingdexGallery': { loadWingdexRestaurantGallery: (id, _client, options) => { requests.push({ id, ...options }); return loader(id, options); },
      loadWingdexFullPhoto: async (photo) => fullPhoto ? fullPhoto(photo) : photo },
    './WingdexPhotoViewer': { __esModule: true, default: 'viewer' }, '../lib/wingdexPhotos': { createVoteController,
      loadOwnPhotoVotes: async (photos) => ownVotes ? ownVotes(photos) : photos.map((photo) => ({ ...photo, current_vote: null })) },
    '../providers/AuthProvider': { useAuth: () => auth }, '../lib/supabase': { supabase: client } });
  const props = { restaurant: { destination_id: 'a', name: 'Restaurant A' }, onClose() {} };
  return { runtime, requests, props, auth, votes, resume: () => onAppState?.('active'), render: () => runtime.render(Gallery, props) };
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
test('gallery previews use a bounded virtualized window', async () => {
  const photos=Array.from({length:500},(_,n)=>({submission_id:`photo-${n}`,signed_url:`https://image.test/${n}`}));
  const h=harness(async()=>({count:500,images:photos}));
  h.render(); await flush(); const tree=h.render();
  const list=elements(tree,'flatlist')[0];
  assert.equal(list.props.data.length,500);
  assert.ok(list.props.initialNumToRender<=5);
  assert.ok(list.props.maxToRenderPerBatch<=10);
  assert.ok(list.props.windowSize<=5);
  assert.equal(list.props.getItemLayout(null,499).offset,248*499);
  h.runtime.unmount();
});

test('thumbnail opens its own submission and closing viewer preserves the gallery', async () => {
  const h=harness(async()=>({count:2,images:[{submission_id:'a',signed_url:'https://a.test'},
    {submission_id:'b',signed_url:'https://b.test'}]}));
  h.render(); await flush(); let tree=h.render();
  elements(tree,'pressable')[1].props.onPress(); tree=h.render();
  const viewer=elements(tree,'viewer')[0];
  assert.equal(viewer.props.selectedId,'b'); assert.equal(viewer.props.restaurantName,'Restaurant A');
  viewer.props.onClose(); tree=h.render();
  assert.equal(elements(tree,'viewer').length,0); assert.equal(elements(tree,'image').length,2);
  h.runtime.unmount();
});
test('empty destination shows useful empty state and never retains prior images', async () => {
  const h = harness(async (id) => ({ count: id === 'a' ? 1 : 0, images: id === 'a' ? [{ submission_id: 'photo-a', signed_url: 'https://image.test/a' }] : [] }));
  h.render(); await flush(); h.render(); h.props.restaurant = { destination_id: 'b', name: 'Restaurant B' };
  h.render(); await flush(); const tree = h.render();
  assert.equal(elements(tree, 'image').length, 0);
  assert.ok(elements(tree, 'text').some((node) => node.props.children === 'Be the first to add a photo')); h.runtime.unmount();
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
test('one broken thumbnail leaves the other photo usable; gallery request failure has retry', async () => {
  let fail = false; const h = harness(async () => { if (fail) throw Error('raw provider error'); return { count: 2, images: [
    { submission_id: 'a', signed_url: 'https://a.test' }, { submission_id: 'b', signed_url: 'https://b.test' }] }; });
  h.render(); await flush(); elements(h.render(), 'image')[0].props.onError();
  assert.ok(elements(h.render(), 'text').some((node) => node.props.children === 'Photo unavailable'));
  assert.equal(elements(h.render(), 'image').length, 1);
  fail = true; elements(h.render(), 'button').find((node) => node.props.children === 'Retry photo').props.onPress(); await flush();
  assert.ok(elements(h.render(), 'text').some((node) => node.props.children === 'Pictures are temporarily unavailable.')); h.runtime.unmount();
});
test('preview votes show both counts and selection, toggle and switch without opening viewer', async () => {
  const h = harness(async () => ({ count: 1, images: [{ submission_id: 'a', destination_id: 'a', signed_url: 'https://a.test', like_count: 2, dislike_count: 1 }] }),
    { fullPhoto: (photo) => ({ ...photo, like_count: photo.current_vote === 1 ? 3 : 2, dislike_count: photo.current_vote === -1 ? 2 : 1 }) });
  h.render(); await flush(); let tree = h.render();
  assert.equal(findElement(tree, 'photo-preview-like-a').props.accessibilityLabel, 'Like, 2');
  assert.equal(findElement(tree, 'photo-preview-dislike-a').props.accessibilityLabel, 'Dislike, 1');
  findElement(tree, 'photo-preview-like-a').props.onPress(); await flush(); tree = h.render();
  assert.equal(findElement(tree, 'photo-preview-like-a').props.accessibilityState.selected, true);
  assert.equal(elements(tree, 'viewer').length, 0);
  elements(tree, 'pressable')[0].props.onPress(); tree = h.render();
  assert.equal(elements(tree, 'viewer')[0].props.photos[0].current_vote, 1);
  elements(tree, 'viewer')[0].props.onClose(); tree = h.render();
  findElement(tree, 'photo-preview-dislike-a').props.onPress(); await flush(); tree = h.render();
  assert.equal(findElement(tree, 'photo-preview-dislike-a').props.accessibilityState.selected, true);
  findElement(tree, 'photo-preview-dislike-a').props.onPress(); await flush(); tree = h.render();
  assert.equal(findElement(tree, 'photo-preview-dislike-a').props.accessibilityState.selected, false);
  assert.deepEqual(h.votes.map((vote) => vote.vote), [1, -1, null]); h.runtime.unmount();
});
test('preview locks repeated taps and rolls back a failed vote', async () => {
  const pending = deferred();
  const h = harness(async () => ({ count: 1, images: [{ submission_id: 'a', signed_url: 'https://a.test', like_count: 2, dislike_count: 0 }] }),
    { mutation: () => pending.promise });
  h.render(); await flush(); let tree = h.render();
  findElement(tree, 'photo-preview-like-a').props.onPress();
  findElement(tree, 'photo-preview-like-a').props.onPress(); await flush(); tree = h.render();
  assert.equal(h.votes.length, 1);
  assert.equal(findElement(tree, 'photo-preview-like-a').props.disabled, true);
  pending.resolve({ error: { message: 'offline' } }); await flush(); tree = h.render();
  assert.equal(findElement(tree, 'photo-preview-like-a').props.accessibilityState.selected, false);
  assert.equal(findElement(tree, 'photo-preview-like-a').props.accessibilityLabel, 'Like, 2');
  assert.ok(elements(tree, 'text').some((node) => /Could not save/.test(node.props.children))); h.runtime.unmount();
});
test('guest preview votes request sign-in and account changes clear own selection', async () => {
  const h = harness(async () => ({ count: 1, images: [{ submission_id: 'a', signed_url: 'https://a.test', like_count: 2, dislike_count: 0 }] }),
    { user: null, ownVotes: async (photos) => photos.map((photo) => ({ ...photo, current_vote: null })) });
  h.render(); await flush(); let tree = h.render();
  findElement(tree, 'photo-preview-like-a').props.onPress(); tree = h.render();
  assert.ok(elements(tree, 'text').some((node) => node.props.children === 'Sign in to vote on photos.'));
  assert.equal(h.votes.length, 0); h.runtime.unmount();
});
test('viewer vote updates reach previews and an account switch reloads the new own vote', async () => {
  const h = harness(async () => ({ count: 1, images: [{ submission_id: 'a', signed_url: 'https://a.test', like_count: 2, dislike_count: 0 }] }),
    { ownVotes: async (photos) => photos.map((photo) => ({ ...photo, current_vote: h.auth.user?.id === 'other' ? -1 : null })) });
  h.render(); await flush(); let tree = h.render();
  elements(tree, 'pressable')[0].props.onPress(); tree = h.render();
  elements(tree, 'viewer')[0].props.onPhotoChange({ submission_id: 'a', current_vote: 1, like_count: 3, dislike_count: 0 });
  elements(h.render(), 'viewer')[0].props.onClose(); tree = h.render();
  assert.equal(findElement(tree, 'photo-preview-like-a').props.accessibilityState.selected, true);
  h.auth.user = { id: 'other' }; h.render(); await flush(); tree = h.render();
  assert.equal(findElement(tree, 'photo-preview-dislike-a').props.accessibilityState.selected, true);
  assert.equal(findElement(tree, 'photo-preview-like-a').props.accessibilityState.selected, false);
  h.runtime.unmount();
});
test('app resume refreshes signed thumbnails without a viewer open', async () => {
  const h = harness(async () => ({ count: 1, images: [{ submission_id: 'a', signed_url: `https://a.test/${h.requests.length}` }] }));
  h.render(); await flush(); assert.equal(elements(h.render(), 'image')[0].props.source.uri, 'https://a.test/1');
  h.resume(); await flush(); assert.equal(elements(h.render(), 'image')[0].props.source.uri, 'https://a.test/2');
  h.runtime.unmount();
});

test('an old thumbnail failure cannot hide its refreshed signed image', async () => {
  const h = harness(async () => ({ count: 1, images: [{ submission_id: 'a', signed_url: `https://a.test/${h.requests.length}` }] }));
  h.render(); await flush(); const oldImage = elements(h.render(), 'image')[0];
  h.resume(); await flush(); h.render();
  oldImage.props.onError(); const tree = h.render();
  assert.equal(elements(tree, 'image')[0].props.source.uri, 'https://a.test/2');
  assert.ok(!elements(tree, 'text').some((node) => node.props.children === 'Photo unavailable'));
  h.runtime.unmount();
});

test('a refresh started before a completed preview vote preserves its new counts', async () => {
  const pending = deferred(); let reads = 0;
  const photo = { submission_id: 'a', destination_id: 'a', signed_url: 'https://a.test', like_count: 2, dislike_count: 0 };
  const h = harness(() => ++reads === 1 ? Promise.resolve({ count: 1, images: [photo] }) : pending.promise,
    { fullPhoto: (p) => ({ ...p, like_count: 3 }) });
  h.render(); await flush(); h.render(); await flush(); h.render();
  h.resume();
  findElement(h.render(), 'photo-preview-like-a').props.onPress(); await flush(); h.render();
  pending.resolve({ count: 1, images: [{ ...photo, signed_url: 'https://a.test/refreshed' }] });
  await flush(); const tree = h.render();
  assert.equal(findElement(tree, 'photo-preview-like-a').props.accessibilityLabel, 'Like, 3');
  assert.equal(findElement(tree, 'photo-preview-like-a').props.accessibilityState.selected, true);
  assert.equal(elements(tree, 'image')[0].props.source.uri, 'https://a.test/refreshed');
  h.runtime.unmount();
});

test('a refresh started before a viewer vote preserves shared completion counts', async () => {
  const pending = deferred(); let reads = 0;
  const photo = { submission_id: 'a', signed_url: 'https://a.test', like_count: 2, dislike_count: 0 };
  const h = harness(() => ++reads === 1 ? Promise.resolve({ count: 1, images: [photo] }) : pending.promise);
  h.render(); await flush(); h.render(); await flush(); h.render(); h.resume();
  elements(h.render(), 'pressable')[0].props.onPress();
  const viewer = elements(h.render(), 'viewer')[0];
  viewer.props.onPhotoChange({ ...photo, current_vote: 1, like_count: 3 }, true);
  viewer.props.onPhotoChange({ ...photo, current_vote: 1, like_count: 3 }, false);
  pending.resolve({ count: 1, images: [{ ...photo, signed_url: 'https://a.test/refreshed' }] });
  await flush(); const tree = h.render();
  assert.equal(findElement(tree, 'photo-preview-like-a').props.accessibilityLabel, 'Like, 3');
  assert.equal(elements(tree, 'viewer')[0].props.photos[0].current_vote, 1);
  h.runtime.unmount();
});
test('signed thumbnail refresh removes a photo excluded by the server', async () => {
  let approved = true;
  const h = harness(async () => approved ? { count: 1, images: [{ submission_id: 'a', signed_url: 'https://a.test/1' }] }
    : { count: 0, images: [] });
  h.render(); await flush(); assert.equal(elements(h.render(), 'image').length, 1);
  approved = false; h.resume(); await flush();
  assert.equal(elements(h.render(), 'image').length, 0); h.runtime.unmount();
});

test('opening the viewer during a pending preview vote shares the mutation lock', async () => {
  const pending = deferred();
  let saved = false;
  const h = harness(async () => ({ count: 1, images: [{ submission_id: 'a', destination_id: 'a', signed_url: 'https://a.test', like_count: 2, dislike_count: 1 }] }),
    { mutation: () => pending.promise, fullPhoto: (photo) => ({ ...photo, like_count: saved ? 3 : photo.like_count }) });
  h.render(); await flush(); let tree = h.render();
  findElement(tree, 'photo-preview-like-a').props.onPress(); await flush(); tree = h.render();
  assert.equal(findElement(tree, 'photo-preview-like-a').props.accessibilityState.selected, true);
  elements(tree, 'pressable')[0].props.onPress(); tree = h.render();
  const viewer = elements(tree, 'viewer')[0];
  assert.equal(viewer.props.isVotePending('a'), true);
  assert.equal(viewer.props.photos[0].current_vote, 1);
  await viewer.props.voteController(viewer.props.photos[0], -1, () => assert.fail('duplicate vote published'), 'viewer');
  assert.equal(h.votes.length, 1);
  saved = true; pending.resolve({ error: null }); await flush(); tree = h.render();
  assert.equal(elements(tree, 'viewer')[0].props.isVotePending('a'), false);
  assert.equal(elements(tree, 'viewer')[0].props.photos[0].current_vote, 1);
  elements(tree, 'viewer')[0].props.onClose(); tree = h.render();
  assert.equal(findElement(tree, 'photo-preview-like-a').props.accessibilityState.selected, true);
  assert.equal(findElement(tree, 'photo-preview-like-a').props.accessibilityLabel, 'Like, 3');
  h.runtime.unmount();
});

test('a viewer vote completion after close still updates the visible preview', async () => {
  const pending = deferred();
  const h = harness(async () => ({ count: 1, images: [{ submission_id: 'a', destination_id: 'a', signed_url: 'https://a.test', like_count: 2, dislike_count: 1 }] }),
    { mutation: () => pending.promise });
  h.render(); await flush(); let tree = h.render();
  elements(tree, 'pressable')[0].props.onPress(); tree = h.render();
  const viewer = elements(tree, 'viewer')[0];
  const cast = viewer.props.voteController(viewer.props.photos[0], -1, viewer.props.onPhotoChange, 'viewer');
  await flush();
  assert.equal(h.votes.length, 1);
  viewer.props.onClose();
  pending.resolve({ error: null }); await cast;
  tree = h.render();
  assert.equal(elements(tree, 'viewer').length, 0);
  assert.equal(findElement(tree, 'photo-preview-dislike-a').props.accessibilityState.selected, true);
  assert.equal(findElement(tree, 'photo-preview-dislike-a').props.accessibilityLabel, 'Dislike, 2');
  h.runtime.unmount();
});

test('account switch during pending preview vote discards the prior selection', async () => {
  const pending = deferred();
  let saved = false;
  const h = harness(async () => ({ count: 1, images: [{ submission_id: 'a', signed_url: 'https://a.test', like_count: saved ? 3 : 2, dislike_count: 0 }] }),
    { mutation: () => pending.promise, ownVotes: async (photos) => photos.map((photo) => ({ ...photo, current_vote: null })) });
  h.render(); await flush(); let tree = h.render();
  findElement(tree, 'photo-preview-like-a').props.onPress(); await flush();
  h.auth.user = { id: 'second-user' }; h.render(); await flush();
  saved = true; pending.resolve({ error: null }); await flush(); tree = h.render();
  assert.equal(findElement(tree, 'photo-preview-like-a').props.accessibilityState.selected, false);
  assert.equal(findElement(tree, 'photo-preview-like-a').props.accessibilityLabel, 'Like, 3');
  h.runtime.unmount();
});
