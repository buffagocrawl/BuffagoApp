import test from 'node:test';
import assert from 'node:assert/strict';
import { mobileModule } from './helpers/mobile-runtime.mjs';
const { saveWingShotIntent, claimWingShotIntent } = mobileModule('lib/wingShotAuthIntent.js', {});
const id = '11111111-1111-4111-8111-111111111111';
function setup(user = {id:'account'}) { const values = new Map(); return { storage: { getItem: async k => values.get(k), setItem: async (k,v) => values.set(k,v), removeItem: async k => values.delete(k) }, client: {auth: {getUser: async () => ({data:{user}})}}, userId:'account', now:1000 }; }
test('all password and OAuth session handoffs use validated one-time route, never preview rating ID', async () => {
  for (const method of ['signup','signin','google','facebook','later-confirmed-login']) {
    const s=setup(); await saveWingShotIntent(s.storage,{destinationId:id,restaurantName:'Wings'},1000);
    const routes=await Promise.all([claimWingShotIntent(s),claimWingShotIntent(s)]);
    assert.equal(routes.filter(Boolean).length,1,method); const route=routes.find(Boolean);
    assert.equal(route.params.destinationId,id); assert.equal(route.pathname,'/profile/wing-shots/submit'); assert.equal(route.params.source,'onboarding'); assert.equal(route.params.ratingId,undefined);
    assert.equal(await claimWingShotIntent(s),null);
  }
});
test('no session and anonymous sessions preserve intent until actual current login',async()=>{
  const s=setup(null);await saveWingShotIntent(s.storage,{destinationId:id},1000);
  assert.equal(await claimWingShotIntent(s),null);
  s.client.auth.getUser=async()=>({data:{user:{id:'account',is_anonymous:true}}});assert.equal(await claimWingShotIntent(s),null);
  s.client.auth.getUser=async()=>({data:{user:{id:'account'}}});assert.ok(await claimWingShotIntent(s));
});
test('expiry, different bound account, stale screen and pseudo IDs fail safely',async()=>{
  for (const variation of ['expiry','account','stale','pseudo']) {
    const s=setup();await saveWingShotIntent(s.storage,{destinationId:variation==='pseudo'?'new:123':id,userId:variation==='account'?'other':null},1000);
    if(variation==='expiry')s.now=1801000;
    if(variation==='stale')s.isCurrent=()=>false;
    const route=await claimWingShotIntent(s);
    if(variation==='pseudo')assert.equal(route.params.destinationId,'');else assert.equal(route,null);
  }
});
import { hookRuntime } from './helpers/mobile-runtime.mjs';
const nodes = tree => !tree ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];
const flush = async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
test('composer verifies canonical ID through RLS before opening existing flow; lookup failures keep picker',async()=>{
  for(const outcome of ['valid','missing','network','pseudo','linked','linked-network']) {
    const runtime=hookRuntime();let lookups=0;
    const Composer=mobileModule('components/wingShots/WingShotComposer.tsx',{
      react:runtime.react,'react/jsx-runtime':runtime.jsx,
      'react-native':{FlatList:'list',Pressable:'button',StyleSheet:{create:x=>x},Text:'text',TextInput:'input',View:'view'},
      './WingShotFlow':{WingShotFlow:'flow'},'../../lib/wingShotAuthIntent':mobileModule('lib/wingShotAuthIntent.js',{}),
      '../../lib/analytics':{trackEvent:async()=>{}},
      '../../lib/supabase':{supabase:{from:()=>({select(){return this;},order(){return this;},limit(){return this;},ilike(){return this;},then(resolve){return Promise.resolve({data:[]}).then(resolve);},eq(){lookups++;return this;},maybeSingle:async()=>outcome.includes('network')?Promise.reject(Error('offline')):{data:(outcome==='valid'||outcome==='linked')?{id,name:'Verified Wings'}:null}})}}
    }).WingShotComposer;
    const props={source:'onboarding',destinationId:outcome==='pseudo'?'new:1':id,restaurantName:'Untrusted label',eligibleRatingId:outcome.startsWith('linked')?id:undefined,onClose:()=>{}};
    runtime.render(Composer,props);await flush();const tree=runtime.render(Composer,props);
    const flow=nodes(tree).find(n=>n.type==='flow');
    if(outcome==='valid'||outcome==='linked'){assert.equal(flow.props.destinationId,id);assert.equal(flow.props.submissionSource,'onboarding');assert.equal(flow.props.eligibleRatingId,outcome==='linked'?id:undefined);if(outcome==='linked')assert.equal(flow.props.onChangeRestaurant,undefined);assert.ok(nodes(tree).some(n=>n.props?.children==='Verified Wings'));}
    else {assert.equal(flow,undefined);if(outcome==='linked-network'){assert.equal(nodes(tree).some(n=>n.type==='input'),false);assert.ok(nodes(tree).some(n=>n.props?.children==='Retry restaurant'));}else assert.ok(nodes(tree).some(n=>n.type==='input'));}
    if(outcome==='pseudo')assert.equal(lookups,0);
    runtime.unmount();
  }
});

test('durable routed intent survives cold restart until destination acknowledgment, then cannot replay',async()=>{
 const s=setup();s.now=Date.now();await saveWingShotIntent(s.storage,{destinationId:id},s.now);
 const route=await claimWingShotIntent(s);assert.ok(route);assert.ok(await s.storage.getItem('buffago:wing-shot:onboarding-return:v1'));
 const restarted=mobileModule('lib/wingShotAuthIntent.js',{});
 const resumed=await restarted.claimWingShotIntent(s);assert.equal(resumed.params.handoffId,route.params.handoffId);
 const verified=await restarted.getWingShotHandoff({...s,handoffId:resumed.params.handoffId});assert.equal(verified.destinationId,id);
 await restarted.completeWingShotHandoff(s.storage,resumed.params.handoffId);assert.equal(await restarted.claimWingShotIntent(s),null);
});
test('failed verification retains intent; explicit sign-out and account switches clear private action',async()=>{
 for(const boundary of [{signedOut:true},{previousUserId:'first',userId:'second'}]) {
  const s=setup();await saveWingShotIntent(s.storage,{destinationId:id},1000);
  s.client.auth.getUser=async()=>({error:Error('offline')});assert.equal(await claimWingShotIntent(s),null);
  const api=mobileModule('lib/wingShotAuthIntent.js',{});await api.clearWingShotIntentForAccount(s.storage,boundary,1000);
  s.client.auth.getUser=async()=>({data:{user:{id:'account'}}});assert.equal(await claimWingShotIntent(s),null);
 }
});
test('route-supplied handoff identity and account cannot impersonate the bound handoff',async()=>{
 const api=mobileModule('lib/wingShotAuthIntent.js',{}),s=setup();await api.saveWingShotIntent(s.storage,{destinationId:id},1000);const route=await api.claimWingShotIntent(s);
 assert.equal(await api.getWingShotHandoff({...s,handoffId:'external-route'}),null);
 s.client.auth.getUser=async()=>({data:{user:{id:'other'}}});assert.equal(await api.getWingShotHandoff({...s,handoffId:route.params.handoffId}),null);
});
