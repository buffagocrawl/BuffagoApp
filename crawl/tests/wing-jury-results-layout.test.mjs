import test from 'node:test';
import assert from 'node:assert/strict';
import { mobileModule, hookRuntime, findElement } from './helpers/mobile-runtime.mjs';
import { photoControlsRuntime } from './helpers/photo-controls-runtime.mjs';
import * as boundary from '../lib/accountBoundary.js';
import { publishPhotoVote, subscribePhotoVotes } from '../lib/photoVoteEvents.js';
import { savedRestaurantLabel } from '../lib/savedRestaurantLabels.js';

const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const elements = (tree, type) => !tree ? [] : Array.isArray(tree) ? tree.flatMap(node => elements(node, type))
  : typeof tree.type === 'function' ? elements(tree.type(tree.props), type)
    : [...(tree.type === type ? [tree] : []), ...elements(tree.props?.children, type)];

function harness({ ownVote = null, voteRequest, revealRequest, editRequest, photos } = {}) {
  const runtime = hookRuntime(); const votes = []; const reveals = []; const edits = [];
  const photo = { submission_id: 'p', destination_id: 'd', signed_url: 'https://photo/p' };
  const result = { restaurant: { id: 'd', name: 'Wings' }, photo_like_count: 8, photo_dislike_count: 2,
    photo_neutral_count: 1, restaurant_rating: { average_weight_score: 91.4 }, personal_rating: null, save_action: 'wantToTry' };
  const user = { id: 'u' };
  const client = { auth: { getUser: async () => ({ data: { user } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } };
  const { default: Game } = mobileModule('components/WingJuryGame.jsx', {
    react: runtime.react, 'react/jsx-runtime': runtime.jsx,
    'react-native': { View: 'view', Image: 'image', Pressable: 'pressable', ScrollView: 'scroll', ActivityIndicator: 'spinner', Alert: { alert() {} }, StyleSheet: { create: s => s }, useWindowDimensions: () => ({ height: 844 }) },
    'react-native-paper': { Button: 'button', Card: 'card', Text: 'text', Divider: 'divider', Portal: 'portal', Dialog: Object.assign(function Dialog() {}, { Title: 'title', Content: 'content', Actions: 'actions' }), useTheme: () => ({ colors: {} }) },
    'expo-router': { useRouter: () => ({ canGoBack: () => true, back() {} }), useLocalSearchParams: () => ({}) },
    '@expo/vector-icons': { MaterialCommunityIcons: 'icon' }, '../providers/LocationProvider': { useLocationCtx: () => ({ coords: null }) },
    '../config/features': { ENABLE_WING_JURY: true, ENABLE_SAVED_DESTINATIONS: true }, '../lib/supabase.js': { supabase: client },
    '../lib/wingJuryService.js': { createGuestJurySession: () => ({ clear() {} }),
      getWingJuryPhotoBatch: async () => ({ photos: photos || [photo], hasMore: false }),
      recordWingJuryVerdict: async ({ vote, photo: selected }) => { votes.push(vote); return voteRequest ? voteRequest(vote) : { status: 'authenticated', submission_id: selected.submission_id, vote, like_count: 8 }; },
      getWingJuryReveal: async () => { reveals.push('p'); return revealRequest ? revealRequest() : result; } },
    '../hooks/useSavedDestinations': { useSavedDestinations: () => ({ isPending: () => false }) },
    '../lib/savedDestinations.js': { saveSavedDestinationIntent: async () => true }, '../lib/savedRestaurantLabels': { savedRestaurantLabel },
    '@react-native-async-storage/async-storage': {}, 'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    './ui/FeedbackState': 'feedback', './PhotoVoteControls': photoControlsRuntime(runtime),
    '../lib/wingdexPhotos': { loadOwnPhotoVotes: async list => list.map(p => ({ ...p, current_vote: ownVote })),
      createVoteController: () => async (p, choice, update) => {
        edits.push(choice);
        const updated = { ...p, current_vote: p.current_vote === choice ? null : choice, like_count: 9 };
        if (editRequest) await editRequest();
        update(updated, false); publishPhotoVote('u', updated); return updated;
      } },
    '../lib/photoVoteEvents': { subscribePhotoVotes }, '../lib/accountBoundary.js': boundary, '../assets/wing-user.png': 'fixture',
  });
  const render = () => runtime.render(Game);
  const ready = async () => { render(); await flush(); render(); await flush(); return render(); };
  return { runtime, render, ready, votes, reveals, edits, result };
}

test('successful verdict keeps controls while pending, then replaces them with authoritative results', async (t) => {
  const pending = deferred(); const h = harness({ voteRequest: () => pending.promise }); t.after(() => h.runtime.unmount());
  let tree = await h.ready();
  const request = findElement(tree, 'wing-jury-verdict-1').props.onPress();
  tree = h.render(); assert.ok(findElement(tree, 'wing-jury-verdict-1'));
  assert.equal(findElement(tree, 'wing-jury-verdict-1').props.disabled, true);
  pending.resolve({ status: 'authenticated', submission_id: 'p', vote: 1 }); await request; await flush(); tree = h.render();
  assert.equal(findElement(tree, 'wing-jury-verdict-1'), null);
  assert.equal(findElement(tree, 'wing-jury-photo-vote-1'), null);
  assert.ok(findElement(tree, 'wing-jury-change-verdict'));
  const texts = elements(tree, 'text').map(node => node.props.children);
  assert.ok(texts.includes('8 Likes')); assert.ok(texts.includes('91.40'));
});
test('failed verdict retains enabled Like/Dislike/Average controls and allows retry', async (t) => {
  let fail = true; const h = harness({ voteRequest: () => { if (fail) throw Error('Offline'); return { status: 'authenticated', submission_id: 'p', vote: 1 }; } }); t.after(() => h.runtime.unmount());
  let tree = await h.ready(); await findElement(tree, 'wing-jury-verdict-1').props.onPress(); await flush(); tree = h.render();
  for (const choice of [1, -1, 0]) assert.notEqual(findElement(tree, `wing-jury-verdict-${choice}`).props.disabled, true);
  assert.equal(findElement(tree, 'wing-jury-change-verdict'), null);
  fail = false; await findElement(tree, 'wing-jury-verdict-1').props.onPress(); await flush();
  assert.ok(findElement(h.render(), 'wing-jury-change-verdict')); assert.equal(h.votes.length, 2);
});
test('previously voted photo restores results without voting again', async (t) => {
  const h = harness({ ownVote: 0 }); t.after(() => h.runtime.unmount());
  const tree = await h.ready();
  assert.ok(findElement(tree, 'wing-jury-reveal'));
  assert.equal(findElement(tree, 'wing-jury-verdict-1'), null);
  assert.equal(h.votes.length, 0); assert.equal(h.reveals.length, 1);
});
test('revisiting a confirmed photo within the session keeps results instead of voting again', async (t) => {
  const make = id => ({ submission_id: id, destination_id: 'd', signed_url: `https://photo/${id}` });
  const h = harness({ photos: [make('p'), make('q'), make('p')] }); t.after(() => h.runtime.unmount());
  let tree = await h.ready();
  for (let i = 0; i < 2; i++) {
    findElement(tree, 'wing-jury-verdict-1').props.onPress(); await flush(); tree = h.render();
    elements(tree, 'button').find(node => node.props.children === 'Next Photo').props.onPress();
    tree = h.render(); await flush(); tree = h.render();
  }
  await flush(); tree = h.render();
  assert.equal(findElement(tree, 'wing-jury-verdict-1'), null);
  assert.ok(findElement(tree, 'wing-jury-reveal')); assert.equal(h.votes.length, 2);
});
test('secondary vote-change failure keeps its editor available for retry', async (t) => {
  let fail = true;
  const h = harness({ ownVote: 1, editRequest: async () => { if (fail) throw Error('Offline'); } }); t.after(() => h.runtime.unmount());
  let tree = await h.ready(); findElement(tree, 'wing-jury-change-verdict').props.onPress(); tree = h.render();
  findElement(tree, 'wing-jury-photo-vote--1').props.onPress(); await flush(); tree = h.render();
  assert.equal(findElement(tree, 'wing-jury-vote-editor').props.visible, true);
  assert.notEqual(findElement(tree, 'wing-jury-photo-vote--1').props.disabled, true);
  fail = false; findElement(tree, 'wing-jury-photo-vote--1').props.onPress(); await flush(); tree = h.render();
  assert.equal(findElement(tree, 'wing-jury-vote-editor').props.visible, false);
  assert.ok(findElement(tree, 'wing-jury-reveal'));
});
test('shared vote results remain synchronized even when a stale reveal completes', async (t) => {
  const pending = deferred(); const h = harness({ revealRequest: () => pending.promise }); t.after(() => h.runtime.unmount());
  const tree = await h.ready(); const request = findElement(tree, 'wing-jury-verdict-1').props.onPress(); await flush(); h.render();
  publishPhotoVote('u', { submission_id: 'p', current_vote: -1, like_count: 12, dislike_count: 3, neutral_count: 2 });
  pending.resolve(h.result); await request; await flush(); let next = h.render();
  assert.ok(elements(next, 'text').some(node => node.props.children === '12 Likes'));
  publishPhotoVote('other', { submission_id: 'p', current_vote: 1, like_count: 999 });
  next = h.render(); assert.ok(elements(next, 'text').some(node => node.props.children === '12 Likes'));
  findElement(next, 'wing-jury-change-verdict').props.onPress(); next = h.render();
  assert.equal(findElement(next, 'wing-jury-photo-vote--1').props.accessibilityState.selected, true);
  await findElement(next, 'wing-jury-photo-vote--1').props.onPress(); await flush(); next = h.render();
  assert.equal(findElement(next, 'wing-jury-photo-vote--1'), null);
  assert.ok(elements(next, 'text').some(node => node.props.children === '9 Likes'));
});
