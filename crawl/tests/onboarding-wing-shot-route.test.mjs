import test from 'node:test';
import assert from 'node:assert/strict';
import {mobileModule,hookRuntime} from './helpers/mobile-runtime.mjs';
const id='11111111-1111-4111-8111-111111111111';
const nodes=t=>!t?[]:Array.isArray(t)?t.flatMap(nodes):[t,...nodes(t.props?.children)];
const flush=async()=>{for(let i=0;i<70;i++)await Promise.resolve();};
function setup(mode='enabled'){
 const runtime=hookRuntime(),routes=[],events=[];let listener=()=>{},calls=0;
 const Component=mobileModule('app/profile/wing-shots/submit.jsx',{
  react:runtime.react,'react/jsx-runtime':runtime.jsx,'expo-router':{useRouter:()=>({replace:r=>routes.push(r)}),useLocalSearchParams:()=>({source:'onboarding',destinationId:id,restaurantName:'Hint'})},
  'react-native':{View:'view',ActivityIndicator:'spinner'},'react-native-paper':{Button:'button',Text:'text'},
  '@react-native-async-storage/async-storage':{},'../../../components/wingShots/WingShotComposer':{WingShotComposer:'composer'},
  '../../../lib/supabase':{supabase:{auth:{getUser:async()=>({data:{user:{id:'account',is_anonymous:false}}}),onAuthStateChange:fn=>{listener=fn;return {data:{subscription:{unsubscribe(){}}}};}}}},
  '../../../lib/photoWorkflowFlags':{loadPhotoWorkflowFlags:async()=>{calls++;if(mode==='network')throw Error('offline');return {prompt:mode!=='disabled',photo:mode!=='disabled'};}},
  '../../../lib/wingShotAuthIntent':{isWingShotDestinationId:()=>true,clearWingShotIntent:async()=>{},saveWingShotIntent:async()=>{},getWingShotHandoff:async()=>null,completeWingShotHandoff:async()=>{}},
  '../../../lib/analytics':{trackEvent:async e=>events.push(e)},
 }).default;
 const render=()=>runtime.render(Component,{});render();
 return {runtime,render,routes,events,change:()=>listener('SIGNED_OUT',null),setMode:v=>{mode=v;},calls:()=>calls};
}
test('post-auth definitive flags open same destination with existing composer; identity loss closes uploader',async()=>{
 const s=setup();await flush();let composer=nodes(s.render()).find(n=>n.type==='composer');assert.equal(composer.props.destinationId,id);assert.equal(composer.props.source,'onboarding');assert.equal(composer.props.userId,'account');
 s.change();assert.equal(nodes(s.render()).find(n=>n.type==='composer'),undefined);assert.ok(nodes(s.render()).some(n=>n.props?.children==='Explore BuffaGo'));s.runtime.unmount();
});
for(const mode of ['disabled','network'])test(`invite followed by ${mode} flags offers truthful retry and Explore, never uploader`,async()=>{
 const s=setup(mode);await flush();assert.equal(nodes(s.render()).find(n=>n.type==='composer'),undefined);
 const retry=nodes(s.render()).find(n=>n.props?.children==='Retry availability');assert.ok(retry);
 s.setMode('enabled');retry.props.onPress();s.render();await flush();assert.ok(nodes(s.render()).find(n=>n.type==='composer'));assert.equal(s.calls(),2);s.runtime.unmount();
});
test('authoritative flag timeout is bounded; failed and partial responses never grant uploads',async()=>{
 const {loadPhotoWorkflowFlags}=mobileModule('lib/photoWorkflowFlags.js',{});
 await assert.rejects(loadPhotoWorkflowFlags({rpc:()=>new Promise(()=>{})},2),/could not load/);
 await assert.rejects(loadPhotoWorkflowFlags({rpc:async()=>({error:{code:'offline'}})},2),/could not load/);
 await assert.rejects(loadPhotoWorkflowFlags({rpc:async()=>({data:[]})},2),/could not load/);
});
