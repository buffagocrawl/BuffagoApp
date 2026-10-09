import test from 'node:test';
import assert from 'node:assert/strict';
import { mobileModule, hookRuntime, findElement } from './helpers/mobile-runtime.mjs';
import { createVoteController } from '../lib/wingdexPhotos.js';
const flush = async () => { for (let i=0;i<30;i++) await Promise.resolve(); };
const all = (tree, type) => !tree ? [] : Array.isArray(tree) ? tree.flatMap((n) => all(n,type))
  : [...(tree.type === type ? [tree] : []), ...all(tree.props?.children, type)];
function harness({ fullPhoto, mutation, ownVotes, insets = { top: 0, bottom: 0 }, sharedController = false } = {}) {
  const runtime = hookRuntime(); const auth = { user: { id: 'user' } }; const signed = []; const votes = []; const changed = []; let closed = 0; let onAppState;
  const photos = ['a','b','c'].map((id) => ({ submission_id: id, destination_id: 'restaurant', like_count: 3, dislike_count: 0, signed_url: 'https://thumb/'+id }));
  const client = { auth: { getUser: async () => ({ data: auth, error: null }) }, from: () => ({ upsert: async (row) => {
    votes.push(row); return mutation ? mutation(row) : { error: null };
  }, delete() {
    const row = { vote: null };
    return { eq(k,v) { row[k]=v; return this; }, then(resolve,reject) {
      votes.push(row); return Promise.resolve(mutation ? mutation(row) : { error: null }).then(resolve,reject);
    } };
  } }) };
  const { default: Viewer } = mobileModule('components/WingdexPhotoViewer.jsx', {
    react: runtime.react, 'react/jsx-runtime': runtime.jsx,
    'react-native': { AppState: { addEventListener: (_event, callback) => { onAppState = callback; return { remove() {} }; } }, Modal: 'modal', View: 'view', StyleSheet: { create: (s) => s } },
    'expo-image': { Image: 'image' }, 'react-native-paper': { ActivityIndicator: 'spinner', Button: 'button', IconButton: 'icon', Text: 'text' },
    'react-native-gesture-handler': { GestureHandlerRootView: 'root' }, 'react-native-zoom-toolkit': { ResumableZoom: 'zoom' },
    'react-native-safe-area-context': { useSafeAreaInsets: () => insets }, '../providers/AuthProvider': { useAuth: () => auth },
    '../lib/wingdexPhotos': { createVoteController, loadOwnPhotoVotes: ownVotes || (async (p) => p.map((v) => ({ ...v, current_vote: v.submission_id === 'c' ? -1 : null }))) },
    '../lib/wingdexGallery': { loadWingdexFullPhoto: async (p) => { signed.push(p.submission_id); return fullPhoto ? fullPhoto(p) : { ...p, signed_url: 'https://full/'+p.submission_id }; } },
    '../lib/supabase': { supabase: client },
  });
  const props = { photos, selectedId: 'b', restaurantName: 'Wings', onClose: () => closed++, onPhotoChange: (p) => changed.push(p),
    ...(sharedController ? { voteController: createVoteController(client), parentVotesReady: true } : {}) };
  const render = () => runtime.render(Viewer, props);
  return { runtime, props, auth, render, signed, votes, changed, closed: () => closed, resume: () => onAppState?.('active') };
}
test('shared gallery controller reuses parent vote state without another vote read', async () => {
  const h=harness({sharedController:true, ownVotes:()=>assert.fail('viewer must reuse gallery votes')});
  h.props.photos[1].current_vote=1;
  h.render(); await flush(); const tree=h.render();
  assert.equal(findElement(tree,'photo-vote-like').props.accessibilityState.selected,true);
  assert.notEqual(findElement(tree,'photo-vote-like').props.disabled,true);
  h.runtime.unmount();
});

test('shared viewer refreshes server totals without changing the parent vote selection', async (t) => {
  let count = 7;
  const h = harness({ sharedController: true, fullPhoto: (photo) => ({ ...photo, like_count: count }) });
  t.after(() => h.runtime.unmount());
  h.props.photos[1].current_vote = 1;
  h.props.getVoteVersion = () => 0;
  h.render(); await flush(); h.render();
  assert.deepEqual({ ...h.changed.at(-1) }, { submission_id: 'b', like_count: 7, dislike_count: 0 });
  assert.equal(Object.hasOwn(h.changed.at(-1), 'current_vote'), false);
  count = 9; h.resume(); h.render(); await flush(); h.render();
  assert.equal(h.changed.at(-1).like_count, 9);
  h.runtime.unmount();
});

test('shared viewer rejects totals fetched before a parent vote finished', async (t) => {
  let resolve; let version = 0;
  const h = harness({ sharedController: true,
    fullPhoto: (photo) => new Promise((done) => { resolve = () => done({ ...photo, like_count: 3 }); }) });
  t.after(() => h.runtime.unmount());
  h.props.getVoteVersion = () => version;
  h.render(); await flush();
  version = 1;
  h.props.photos = h.props.photos.map((photo) => photo.submission_id === 'b'
    ? { ...photo, like_count: 4, current_vote: 1 } : photo);
  h.render(); resolve(); await flush(); const tree = h.render();
  assert.equal(h.changed.length, 0);
  assert.equal(findElement(tree, 'photo-vote-like').props.accessibilityState.selected, true);
  assert.equal(findElement(tree, 'photo-vote-like').props.accessibilityLabel, 'Like, 4');
  h.runtime.unmount();
});
test('opens selected photo, close and Android back invoke close', async () => {
  const h=harness(); h.render(); await flush(); const tree=h.render();
  assert.equal(findElement(tree,'photo-viewer-image').props.source.uri,'https://full/b');
  assert.deepEqual(h.signed,['b']); findElement(tree,'photo-viewer-close').props.onPress();
  all(tree,'modal')[0].props.onRequestClose(); assert.equal(h.closed(),2); h.runtime.unmount();
});

test('full resolution load has progress feedback and an empty viewer closes safely', async () => {
  const h=harness(); h.render(); await flush(); let tree=h.render();
  assert.ok(all(tree,'spinner').some((node) => node.props.accessibilityLabel === 'Loading photo'));
  findElement(tree,'photo-viewer-image').props.onLoad({source:{width:1600,height:900}});
  tree=h.render();
  assert.equal(all(tree,'spinner').filter((node) => node.props.accessibilityLabel === 'Loading photo').length,0);
  h.runtime.unmount();

  const empty=harness(); empty.props.photos=[]; empty.render(); await flush(); tree=empty.render();
  assert.ok(all(tree,'text').some((node) => node.props.children === 'No photos available.'));
  assert.equal(findElement(tree,'photo-vote-like').props.disabled,true);
  findElement(tree,'photo-viewer-close').props.onPress(); assert.equal(empty.closed(),1);
  empty.runtime.unmount();
});

test('navigation across a page boundary opens the newly loaded photo and reports total count', async () => {
  const h=harness(); let loads=0; h.props.selectedId='c'; h.props.totalCount=4;
  h.props.hasMore=true; h.props.onMore=()=>loads++;
  h.render(); await flush(); let tree=h.render();
  assert.ok(all(tree,'text').some((t)=>t.props.children.join?.('')==='3 of 4'));
  findElement(tree,'photo-next').props.onPress(); assert.equal(loads,1);
  h.props.photos=[...h.props.photos,{...h.props.photos[0],submission_id:'d'}];
  h.props.hasMore=false;
  h.render(); h.render(); h.render(); await flush(); tree=h.render();
  assert.equal(findElement(tree,'photo-viewer-image').props.source.uri,'https://full/d');
  h.runtime.unmount();
});

test('pagination network failure stays in viewer with a targeted retry', async () => {
  const h=harness(); let loads=0; h.props.selectedId='c';
  h.props.hasMore=true; h.props.onMore=()=>loads++;
  h.render(); await flush(); let tree=h.render();
  findElement(tree,'photo-next').props.onPress();
  h.props.pageError='Pictures are temporarily unavailable.'; tree=h.render();
  assert.ok(all(tree,'text').some((t)=>t.props.children===h.props.pageError));
  all(tree,'button').find((b)=>b.props.children==='Retry').props.onPress();
  assert.equal(loads,2); assert.equal(h.closed(),0);
  h.props.pageLoading=true; tree=h.render();
  assert.equal(findElement(tree,'photo-next').props.disabled,true); h.runtime.unmount();
});

test('a delayed old image error cannot blank the newly selected photo', async () => {
  const h=harness(); h.render(); await flush(); let tree=h.render();
  const oldImage=findElement(tree,'photo-viewer-image');
  findElement(tree,'photo-next').props.onPress(); h.render(); await flush(); tree=h.render();
  oldImage.props.onError(); oldImage.props.onLoad({source:{width:9999,height:1}});
  tree=h.render();
  assert.equal(findElement(tree,'photo-viewer-image').props.source.uri,'https://full/c');
  assert.ok(!all(tree,'text').some((t)=>/could not load/.test(t.props.children)));
  h.runtime.unmount();
});

test('old callbacks for the same photo cannot blank its refreshed signed asset', async () => {
  let version = 0;
  const h = harness({ fullPhoto: (p) => ({ ...p, signed_url: `https://full/${p.submission_id}/${++version}` }) });
  h.render(); await flush(); let tree = h.render();
  const oldImage = findElement(tree, 'photo-viewer-image');
  h.resume(); h.render(); await flush(); tree = h.render();
  assert.equal(findElement(tree, 'photo-viewer-image').props.source.uri, 'https://full/b/2');
  oldImage.props.onError(); oldImage.props.onLoad({ source: { width: 9999, height: 1 } });
  tree = h.render();
  assert.equal(findElement(tree, 'photo-viewer-image').props.source.uri, 'https://full/b/2');
  assert.ok(all(tree, 'spinner').some((node) => node.props.accessibilityLabel === 'Loading photo'));
  assert.ok(!all(tree, 'text').some((node) => /could not load/.test(node.props.children)));
  h.runtime.unmount();
});

test('delayed full asset lookup cannot replace shared gallery vote counts', async () => {
  let resolve;
  const pending = new Promise((r) => { resolve = r; });
  const h = harness({ sharedController: true, fullPhoto: () => pending });
  h.render();
  h.props.photos = h.props.photos.map((p) => p.submission_id === 'b' ? { ...p, current_vote: 1, like_count: 4 } : p);
  h.render(); h.render();
  resolve({ ...h.props.photos[1], like_count: 3, signed_url: 'https://full/b' });
  await flush(); const tree = h.render();
  assert.equal(findElement(tree, 'photo-vote-like').props.accessibilityLabel, 'Like, 4');
  assert.equal(findElement(tree, 'photo-vote-like').props.accessibilityState.selected, true);
  h.runtime.unmount();
});

test('stale counter reconciliation cannot overwrite a newer unlike', async () => {
  let resolveOld; const old=new Promise((r)=>{resolveOld=r;}); let reads=0;
  const h=harness({ fullPhoto: (p)=> {
    reads++; if(reads===2)return old;
    return {...p,like_count:3,dislike_count:0,signed_url:'https://full/'+p.submission_id};
  } });
  h.render(); await flush(); let tree=h.render();
  findElement(tree,'photo-vote-like').props.onPress(); await flush(); tree=h.render();
  assert.equal(findElement(tree,'photo-vote-like').props.accessibilityState.selected,true);
  findElement(tree,'photo-vote-like').props.onPress(); await flush(); tree=h.render();
  assert.equal(findElement(tree,'photo-vote-like').props.accessibilityState.selected,false);
  resolveOld({...h.props.photos[1],like_count:4,signed_url:'https://full/b'}); await flush(); tree=h.render();
  assert.equal(findElement(tree,'photo-vote-like').props.accessibilityLabel,'Like, 3');
  assert.deepEqual(h.votes.map((v)=>v.vote),[1,null]); h.runtime.unmount();
});

test('account switch during a vote cannot publish the previous account selection', async () => {
  let resolve; const pending=new Promise((r)=>{resolve=r;});
  const h=harness({mutation:()=>pending}); h.render(); await flush(); let tree=h.render();
  findElement(tree,'photo-vote-like').props.onPress(); await flush(); h.render();
  h.auth.user={id:'new-user'}; h.render(); await flush(); h.render();
  resolve({error:null}); await flush(); tree=h.render();
  assert.equal(findElement(tree,'photo-vote-like').props.accessibilityState.selected,false);
  assert.equal(h.changed.length,0); h.runtime.unmount();
});
test('next/previous reset zoom and votes stay tied to submission after navigating', async () => {
  const h=harness(); h.render(); await flush(); let tree=h.render(); let resets=0;
  all(tree,'zoom')[0].props.ref.current={ reset: () => resets++, getState: () => ({ scale: 3 }) };
  findElement(tree,'photo-next').props.onPress(); h.render(); await flush(); tree=h.render();
  assert.equal(findElement(tree,'photo-viewer-image').props.source.uri,'https://full/c'); assert.ok(resets>=1);
  assert.equal(findElement(tree,'photo-vote-dislike').props.accessibilityState.selected,true);
  await findElement(tree,'photo-vote-like').props.onPress(); await flush(); tree=h.render();
  assert.equal(h.votes[0].submission_id,'c'); assert.equal(h.votes[0].vote,1);
  assert.equal(findElement(tree,'photo-vote-like').props.accessibilityState.selected,true);
  findElement(tree,'photo-previous').props.onPress(); h.render(); await flush(); tree=h.render();
  assert.equal(findElement(tree,'photo-viewer-image').props.source.uri,'https://full/b');
  assert.equal(findElement(tree,'photo-vote-like').props.accessibilityState.selected,false); h.runtime.unmount();
});
test('zoomed panning cannot navigate, 1x swipe navigates', async () => {
  const h=harness(); h.render(); await flush(); let tree=h.render(); let scale=3;
  const z=all(tree,'zoom')[0]; z.props.ref.current={ reset() { scale=1; }, getState: () => ({ scale }) };
  z.props.onPanStart(); z.props.onPanEnd({ translationX: -100, translationY: 0 });
  assert.equal(findElement(h.render(),'photo-viewer-image').props.source.uri,'https://full/b');
  scale=1; z.props.onPanStart(); z.props.onPanEnd({ translationX: -100, translationY: 0 });
  h.render(); await flush(); tree=h.render();
  assert.equal(findElement(tree,'photo-viewer-image').props.source.uri,'https://full/c');
  assert.equal(all(tree,'zoom')[0].props.maxScale,4); h.runtime.unmount();
});
test('vote failure rolls back without closing; unavailable asset disables voting and offers retry', async () => {
  const h=harness({ mutation: () => ({ error: { message: 'network' } }) }); h.render(); await flush(); let tree=h.render();
  findElement(tree,'photo-vote-like').props.onPress(); await flush(); tree=h.render();
  assert.equal(findElement(tree,'photo-vote-like').props.accessibilityState.selected,false);
  assert.equal(h.closed(),0); assert.ok(all(tree,'text').some((t) => /Could not save/.test(t.props.children))); h.runtime.unmount();
  const gone=harness({ fullPhoto: () => { throw Error('This photo is no longer available.'); } });
  gone.render(); await flush(); tree=gone.render(); assert.equal(findElement(tree,'photo-vote-like').props.disabled,true);
  assert.ok(all(tree,'button').some((t) => t.props.children==='Retry')); gone.runtime.unmount();
});

test('viewer reserves both safe areas and keeps the image aspect ratio', async () => {
  const h = harness({ insets: { top: 47, bottom: 34 } });
  h.render(); await flush(); let tree = h.render();
  const root = all(tree, 'root')[0];
  assert.equal(root.props.style[1].paddingTop, 47);
  assert.equal(root.props.style[1].paddingBottom, 34);
  all(tree, 'view').find((view) => typeof view.props.onLayout === 'function')
    .props.onLayout({ nativeEvent: { layout: { width: 320, height: 400 } } });
  tree = h.render();
  findElement(tree, 'photo-viewer-image').props.onLoad({ source: { width: 1600, height: 900 } });
  tree = h.render();
  assert.equal(findElement(tree, 'photo-viewer-image').props.style.width, 320);
  assert.equal(findElement(tree, 'photo-viewer-image').props.style.height, 180);
  assert.equal(findElement(tree, 'photo-viewer-image').props.contentFit, 'contain');
  h.runtime.unmount();
});

test('gesture bounds allow zoom while vertical and zoomed pans cannot change photos', async () => {
  const h = harness(); h.render(); await flush(); let tree = h.render();
  let scale = 1;
  const zoom = all(tree, 'zoom')[0];
  zoom.props.ref.current = { reset() { scale = 1; }, getState: () => ({ scale }) };
  assert.equal(zoom.props.minScale, 1);
  assert.equal(zoom.props.maxScale, 4);
  assert.equal(zoom.props.scaleMode, 'clamp');
  assert.equal(zoom.props.panMode, 'clamp');
  assert.equal(zoom.props.extendGestures, true);
  zoom.props.onPanStart(); zoom.props.onPanEnd({ translationX: -100, translationY: 100 });
  assert.equal(findElement(h.render(), 'photo-viewer-image').props.source.uri, 'https://full/b');
  scale = 2; zoom.props.onPanStart(); scale = 1;
  zoom.props.onPanEnd({ translationX: -120, translationY: 0 });
  assert.equal(findElement(h.render(), 'photo-viewer-image').props.source.uri, 'https://full/b');
  zoom.props.onPanStart(); zoom.props.onPanEnd({ translationX: -70, translationY: 0 });
  h.render(); await flush(); tree = h.render();
  assert.equal(findElement(tree, 'photo-viewer-image').props.source.uri, 'https://full/c');
  h.runtime.unmount();
});

test('a broken displayed image presents retry without closing or exposing a stale asset', async () => {
  const h = harness(); h.render(); await flush(); let tree = h.render();
  findElement(tree, 'photo-viewer-image').props.onError(); tree = h.render();
  assert.equal(findElement(tree, 'photo-viewer-image'), null);
  assert.equal(findElement(tree, 'photo-vote-like').props.disabled, true);
  assert.ok(all(tree, 'text').some((node) => /Photo could not load/.test(node.props.children)));
  assert.equal(h.closed(), 0);
  all(tree, 'button').find((node) => node.props.children === 'Retry').props.onPress();
  h.render(); await flush(); tree = h.render();
  assert.equal(findElement(tree, 'photo-viewer-image').props.source.uri, 'https://full/b');
  h.runtime.unmount();
});
