import test from 'node:test';
import assert from 'node:assert/strict';
import { mobileModule, hookRuntime, findElement } from './helpers/mobile-runtime.mjs';
import * as wingShots from '../lib/wingShots.js';
import { loadWingdexGallery, normalizeWingdexGalleryResponse } from '../lib/wingdexGallery.js';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createWingShotDraftStore } from '../lib/wingShotDraftStore.js';

const flush = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve=r; }); return { promise, resolve }; };

function flowHarness({ picker, staging = async () => ({ bucket: 'wing-shot-staging', objectPath:'owner/session/photo.jpg' }), validation = async () => {}, draftStore = {save:async()=>true,load:async()=>null,clear:async()=>{}} } = {}) {
  const runtime = hookRuntime();
  let uuid = 0;
  const cleanupCalls=[];
  const progress = { displayProgress:0,stage:'idle',clearTimer(){},stop(){},start(){return 1;},updateRealProgress(){},isCurrent(){return true;},setStage(){},complete(){} };
  const { WingShotFlow } = mobileModule('components/wingShots/WingShotFlow.tsx', {
    react: runtime.react, 'react/jsx-runtime': runtime.jsx,
    '@expo/vector-icons': { Ionicons:'icon' }, 'expo-crypto': { randomUUID:() => `session-${++uuid}` },
    'expo-network': { useNetworkState:() => ({isConnected:true,isInternetReachable:true}) },
    'react-native': { StyleSheet:{create:(styles)=>styles},Platform:{OS:'ios'},
      AccessibilityInfo:{ isReduceMotionEnabled:async()=>false,announceForAccessibility(){} },
      Animated:{Value:class {setValue(){}},timing:()=>({start(){}})} },
    'react-native-safe-area-context':{SafeAreaView:'safe'}, '../../lib/supabase':{supabase:{}},
    '../../lib/wingShotDrafts':{wingShotDrafts:draftStore},
    '../../lib/analytics':{trackEvent:async()=>{}},
    '../../lib/wingShots':{...wingShots,validateWingShotMediaRemotely:validation},
    './WingShotMediaPreview':{WingShotMediaPreview:'preview'},
    './mediaAdapter':{ expoWingShotMediaAdapter:{},WingShotMediaAdapterError:class extends Error{} },
    './useInterpolatedUploadProgress':{useInterpolatedUploadProgress:()=>progress},
    '../../lib/wingShotDiagnostics':{errorContext:()=>({}),mediaLogContext:()=>({}),safeErrorContext:()=>({}),wingShotLog(){}},
    '../../lib/wingShotStaging':{stageWingShotMedia:staging,cleanupWingShotStaging:async(args)=>cleanupCalls.push(args)},
    '../../lib/wingShotValidationProgress':{createWingShotValidationProgress:()=>({start:()=>1,stop(){},complete:async()=>true})},
  });
  const closed=[]; const continued=[];
  const props={visible:true,draftMode:true,destinationId:'restaurant-a',submissionSource:'rating',isOnline:true,
    analyticsContext: { screen: 'home', userId: 'owner' },
    onClose:()=>closed.push(true),onDraftContinue:(draft)=>continued.push(draft),
    mediaAdapter:{takePhoto:picker,chooseFromLibrary:picker},supabaseClient:{},};
  return {...runtime,closed,continued,cleanupCalls,props,render:()=>runtime.render(WingShotFlow,props)};
}
const media={uri:'photo-a',kind:'photo',mimeType:'image/jpeg',sizeBytes:100,width:100,height:100,getUploadBody:async()=>new Uint8Array(100)};

test('real flow ignores a picker finishing after Skip and prevents duplicate picker taps',async()=>{
  const pending=deferred(); let picked=0;
  const harness=flowHarness({picker:()=>{picked++;return pending.promise;}});
  const tree=harness.render(); const choose=findElement(tree,'wing-shot.take-photo').props.onPress;
  const first=choose(); await choose();
  assert.equal(picked,1);
  findElement(harness.render(),'wing-shot.skip-media').props.onPress();
  pending.resolve(media); await first; await flush();
  assert.equal(harness.closed.length,1);
  assert.equal(findElement(harness.render(),'wing-shot.preview'),null);
  harness.unmount();
});

test('real flow reopens a persisted staging handoff after process termination and revalidates before Continue', async () => {
  const disk = new Map();
  const storage = { getItem: async (key) => disk.get(key) ?? null, setItem: async (key, value) => disk.set(key, value), removeItem: async (key) => disk.delete(key) };
  const pendingValidation = deferred();
  const firstStore = createWingShotDraftStore(storage);
  const first = flowHarness({ picker: async () => media, draftStore: firstStore, validation: () => pendingValidation.promise });
  await findElement(first.render(), 'wing-shot.take-photo').props.onPress(); await flush();
  const saved = await firstStore.load({ userId: 'owner', destinationId: 'restaurant-a', flow: 'home-rating' });
  assert.ok(saved); first.unmount();
  let revalidated = 0;
  const reopened = flowHarness({ picker: async () => { throw new Error('Picker must not be used on restore'); },
    draftStore: createWingShotDraftStore(storage), validation: async () => { revalidated++; } });
  reopened.render(); await flush(); reopened.render(); await flush();
  let tree = reopened.render();
  assert.equal(revalidated, 1);
  findElement(tree, 'wing-shot.attribution.anonymous').props.onPress();
  findElement(tree, 'wing-shot.consent').props.onPress(); tree = reopened.render();
  await findElement(tree, 'wing-shot.continue-rating').props.onPress();
  assert.equal(reopened.continued.length, 1);
  assert.equal(reopened.continued[0].session.correlationId, saved.correlationId);
  assert.equal(reopened.continued[0].session.staging.objectPath, saved.draft.session.staging.objectPath);
  reopened.unmount(); pendingValidation.resolve();
});

test('real flow hands off exactly one staged image on repeated Continue taps',async()=>{
  const harness=flowHarness({picker:async()=>media});
  await findElement(harness.render(),'wing-shot.take-photo').props.onPress(); await flush();
  let tree=harness.render();
  findElement(tree,'wing-shot.attribution.anonymous').props.onPress();
  findElement(tree,'wing-shot.consent').props.onPress();
  tree=harness.render();
  // The primary action is shared between post-rating upload and draft continuation.
  const next=findElement(tree,'wing-shot.continue-rating');
  assert.ok(next,'primary action should exist');
  const firstContinue=next.props.onPress(); next.props.onPress(); await firstContinue;
  assert.equal(harness.continued.length,1);
  assert.equal(harness.continued[0].media.uri,'photo-a');
  assert.equal(harness.continued[0].session.staging.objectPath,'owner/session/photo.jpg');
  harness.unmount();
});

test('real flow never installs an abandoned staging result into the next upload session',async()=>{
  const staged=deferred();
  const harness=flowHarness({picker:async()=>media,staging:()=>staged.promise});
  await findElement(harness.render(),'wing-shot.take-photo').props.onPress();
  findElement(harness.render(),'wing-shot.skip-media').props.onPress();
  staged.resolve({objectPath:'abandoned-old-photo'}); await flush();
  const session=harness.hooks.find((hook)=>hook?.current?.correlationId)?.current;
  assert.equal(session.staging,null);
  assert.ok(harness.cleanupCalls.some((call)=>call.staging.objectPath==='abandoned-old-photo'));
  harness.unmount();
});

test('Wingdex batches all destinations beyond the server cap and does not sign images for counts',async()=>{
  const ids=Array.from({length:501},(_,i)=>`restaurant-${i}`);const calls=[];
  const result=await loadWingdexGallery(ids,{functions:{invoke:async(name,{body})=>{
    calls.push(body); return {data:{restaurants:body.destination_ids.map((id)=>({destination_id:id,picture_count:3}))}};
  }}});
  assert.equal(Object.keys(result).length,501);assert.deepEqual(calls.map((call)=>call.destination_ids.length),[250,250,1]);
  assert.ok(calls.every((call)=>call.include_images===false));
});

test('authoritative zero public count does not fall back to stale images',()=>{
  assert.equal(normalizeWingdexGalleryResponse({restaurants:[{destination_id:'a',picture_count:0,images:[{signed_url:'old'}]}]}).a.count,0);
});

test('pre-rating failure copy never claims a rating has already saved',()=>{
  for(const code of ['offline','camera_permission_denied','authentication_required','rate_limited','unknown']) {
    assert.doesNotMatch(wingShots.wingShotUserMessage({code},{ratingSaved:false}),/rating (?:is|was|has)(?: already)? saved/i);
  }
});

test('real media adapter resizes full-resolution HEIC before upload and handles decoder failure',async()=>{
  const calls=[];let fail=false;
  const {expoWingShotMediaAdapter, WingShotMediaAdapterError}=mobileModule('components/wingShots/mediaAdapter.ts',{
    'react-native':{Platform:{OS:'ios'}},
    'expo-file-system':{File:class{size=1234;}},
    'expo-image-picker':{requestCameraPermissionsAsync:async()=>({granted:true}),CameraType:{back:'back'},
      launchCameraAsync:async()=>({canceled:false,assets:[{type:'image',uri:'native-heic',mimeType:'image/heic',width:4032,height:3024}]})},
    'expo-image-manipulator':{SaveFormat:{JPEG:'jpeg'},ImageManipulator:{manipulate:(uri)=>{
      calls.push(uri);return {resize:(size)=>calls.push(size),renderAsync:async()=>{if(fail)throw new Error('corrupt image');return {saveAsync:async(options)=>{calls.push(options);return {uri:'prepared-jpeg',width:2048,height:1536};}};}};
    }}},
  });
  const selected=await expoWingShotMediaAdapter.takePhoto();
  assert.equal(selected.uri,'prepared-jpeg');assert.equal(selected.mimeType,'image/jpeg');assert.equal(selected.width,2048);
  assert.equal(calls[1].width,2048);assert.equal(selected.sizeBytes,1234);
  fail=true;await assert.rejects(expoWingShotMediaAdapter.takePhoto(),(error)=>error instanceof WingShotMediaAdapterError);
});

test('Home attachment completion cannot clear a newer restaurant image draft',async()=>{
  const source=readFileSync(new URL('../app/(tabs)/home/index.jsx',import.meta.url),'utf8');
  const start=source.indexOf('async (draft, ratingId, destinationId) => {',source.indexOf('const attachHomeDraftImage'));
  const end=source.indexOf('}, [session?.user?.id]);',start)+1;
  const uploaded=deferred();
  const oldDraft={media:{uri:'image-a'},session:{correlationId:'a'},consentAccepted:true};
  const oldPending={draft:oldDraft,ratingId:'rating-a',destinationId:'restaurant-a'};
  const ref={current:oldPending};const operations=[];
  const attach=vm.runInNewContext(`(${source.slice(start,end)})`,{
    wingShotDrafts:{save:async()=>true,clear:async()=>{}},homeRatingOperationRef:{current:null},
    homeDraftImageRef:ref,draftAttachmentInFlightRef:{current:false},supabase:{},session:{user:{id:'user-a'}},
    submitWingShot:async(args)=>{operations.push(args);return uploaded.promise;},
  });
  const saving=attach(oldDraft,'rating-a','restaurant-a');
  const nextPending={draft:{media:{uri:'image-b'},session:{correlationId:'b'}},ratingId:null,destinationId:'restaurant-b'};
  ref.current=nextPending;
  uploaded.resolve({submission_id:'submission-a'});await saving;
  assert.equal(ref.current,nextPending);
  assert.equal(operations[0].input.ratingId,'rating-a');
  assert.equal(operations[0].input.destinationId,'restaurant-a');
});

test('Skip at the initial image step cannot prompt for another photo after rating',()=>{
  for(const path of ['../app/(tabs)/home/index.jsx','../app/crawl/[id].jsx']) {
    const source=readFileSync(new URL(path,import.meta.url),'utf8');
    if(path.includes('home')) {
      const expression=source.match(/const canOfferWingShot = (Boolean\([^;]+\));/)[1];
      assert.equal(vm.runInNewContext(expression,{draftImage:null,homeImageStepShownRef:{current:true},uid:'owner',submittedRatingId:'saved-rating',wingShotFlags:{prompt:true,photo:true}}),false);
    } else {
      assert.match(source,/!crawlImageStepShownRef\.current/);
    }
  }
});

test('Crawl draft attaches to its exact committed rating, survives failure and retries the same session',async()=>{
  const source=readFileSync(new URL('../app/crawl/[id].jsx',import.meta.url),'utf8');
  const start=source.indexOf('async (pending) => {',source.indexOf('const attachCrawlDraftImage'));
  const end=source.indexOf('}, [crawl?.crawl_id]);',start)+1;
  const pending={draft:{media:{uri:'crawl-photo'},session:{correlationId:'same-session'},consentAccepted:true},ratingId:'crawl-rating',destinationId:'crawl-stop',userId:'crawl-user'};
  const ref={current:pending};const operations=[];let fail=true;
  const attach=vm.runInNewContext(`(${source.slice(start,end).trim().replace(/;$/,'')})`,{
    wingShotDrafts:{save:async()=>true,clear:async()=>{}},crawl:{crawl_id:"test-crawl"},
    crawlDraftImageRef:ref,crawlImageAttachmentInFlightRef:{current:false},supabase:{},
    submitWingShot:async(args)=>{operations.push(args);if(fail)throw new Error('network');},
  });
  await assert.rejects(attach(pending),/network/);
  assert.equal(ref.current,pending);
  fail=false;await attach(pending);
  assert.equal(ref.current,null);
  assert.equal(operations[0].session,operations[1].session);
  assert.equal(operations[1].input.ratingId,'crawl-rating');
  assert.equal(operations[1].input.destinationId,'crawl-stop');
  assert.equal(operations[1].input.userId,'crawl-user');
});
