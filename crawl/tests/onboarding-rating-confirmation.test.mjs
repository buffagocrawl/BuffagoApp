import test from 'node:test';
import assert from 'node:assert/strict';
import {mobileModule,hookRuntime} from './helpers/mobile-runtime.mjs';
const id='11111111-1111-4111-8111-111111111111',op='22222222-2222-4222-8222-222222222222',rating='33333333-3333-4333-8333-333333333333';
const nodes=t=>!t?[]:Array.isArray(t)?t.flatMap(nodes):[t,...nodes(t.props?.children)];
const flush=async()=>{for(let i=0;i<70;i++)await Promise.resolve();};
function setup(){
 const values=new Map(),storage={getItem:async k=>values.get(k),setItem:async(k,v)=>values.set(k,v),removeItem:async k=>values.delete(k)};
 const api=mobileModule('lib/wingShotAuthIntent.js',{}),preview=mobileModule('lib/guestRatingPreview.js',{}),calls=[];
 let user={id:'account'},response={data:{accepted:true,rating_id:rating,wing_shot_eligible:true}};
 const client={auth:{getUser:async()=>({data:{user}})},rpc:async(name,args)=>{calls.push({name,args});return response;}};
 const helper=mobileModule('lib/confirmOnboardingRating.js',{'./guestRatingPreview':preview,'./wingShotAuthIntent':api,'./ratingRpcRetry':mobileModule('lib/ratingRpcRetry.js',{})});
 const init=async()=>{await preview.saveGuestRatingPreview(storage,preview.createGuestRatingPreview({destination_id:id,crispiness:6,sauce:7,meat:8,overall:9},op));await api.saveWingShotIntent(storage,{destinationId:id,previewId:op});return (await api.claimWingShotIntent({storage,client,userId:user.id})).params.handoffId;};
 return {storage,client,calls,api,helper,init,setUser:x=>{user=x;},respond:x=>{response=x;}};
}
test('explicit confirmation reuses preview operation and trusts only canonical accepted receipt',async()=>{
 const s=setup(),handoffId=await s.init();assert.equal(s.calls.length,0);
 const input={storage:s.storage,client:s.client,handoffId,userId:'account',locate:async()=>({coords:{latitude:42,longitude:-78,accuracy:12}})};
 const saved=await s.helper.confirmOnboardingRating(input);assert.equal(saved.rating_id,rating);assert.notEqual(saved.rating_id,op);
 await s.helper.confirmOnboardingRating(input);assert.equal(s.calls.length,2);for(const call of s.calls){assert.equal(call.name,'submit_validated_restaurant_rating');assert.equal(call.args.p_operation_id,op);assert.equal(call.args.p_overall,9);assert.equal(call.args.p_destination_id,id);}
 s.respond({data:{accepted:true,rating_id:op+'fake'}});await assert.rejects(s.helper.confirmOnboardingRating(input),/rating_receipt_missing/);
});
test('missing preview, account switch, location denial and server rejection fail closed',async()=>{
 for(const mode of ['preview','account','location','server']){
  const s=setup(),handoffId=await s.init();
  if(mode==='preview')await s.storage.removeItem('buffago:guest_rating_preview:v1');
  if(mode==='account')s.setUser({id:'other'});
  if(mode==='server')s.respond({error:new Error('rating_proximity_failed')});
  await assert.rejects(s.helper.confirmOnboardingRating({storage:s.storage,client:s.client,handoffId,userId:'account',locate:async()=>{if(mode==='location')throw Error('location_permission_required');return null;}}));
  assert.equal(s.calls.length,mode==='server'?1:0);
 }
});
test('account changes while locating never submit; ineligible receipt stays accurately saved',async()=>{
 const s=setup(),handoffId=await s.init();let input={storage:s.storage,client:s.client,handoffId,userId:'account',locate:async()=>{s.setUser({id:'other'});return null;}};
 await assert.rejects(s.helper.confirmOnboardingRating(input),/account_changed/);assert.equal(s.calls.length,0);
 s.setUser({id:'account'});s.respond({data:{accepted:true,rating_id:rating,wing_shot_eligible:false,wing_shot_eligibility_reason:'administrative_rating'}});
 input.locate=async()=>null;assert.equal((await s.helper.confirmOnboardingRating(input)).wing_shot_eligible,false);
});
test('confirmation requires tap, ignores double taps, links uploader only to eligible receipt, and cancels Home',async()=>{
 for(const eligible of [true,false]){
  const runtime=hookRuntime();let calls=0,close=0,resolve;
  const Component=mobileModule('components/OnboardingRatingConfirmation.jsx',{
   react:runtime.react,'react/jsx-runtime':runtime.jsx,'react-native':{View:'view'},'react-native-paper':{Button:'button',Text:'text'},'expo-location':{},'@react-native-async-storage/async-storage':{},'../lib/supabase':{supabase:{}},'../lib/guestRatingPreview':{loadGuestRatingPreview:async()=>null},'../lib/confirmOnboardingRating':{confirmOnboardingRating:()=>{calls++;return new Promise(r=>{resolve=r;});},onboardingRatingError:()=> 'Retry safely'},'./wingShots/WingShotComposer':{WingShotComposer:'composer'},
  }).default;
  const props={context:{destinationId:id,restaurantName:'Wings',previewId:op},userId:'account',handoffId:'handoff',onClose:()=>{close++;}};
  const render=()=>runtime.render(Component,props);render();await flush();assert.equal(calls,0);
  const button=nodes(render()).find(n=>n.props?.children==='Confirm & Save Rating');const pending=button.props.onPress();await button.props.onPress();assert.equal(calls,1);
  resolve({accepted:true,rating_id:rating,wing_shot_eligible:eligible});await pending;
  const composer=nodes(render()).find(n=>n.type==='composer');if(eligible){assert.equal(composer.props.eligibleRatingId,rating);assert.equal(composer.props.destinationId,id);composer.props.onClose();}else{assert.equal(composer,undefined);nodes(render()).find(n=>n.props?.children==='Continue to BuffaGo').props.onPress();}assert.equal(close,1);runtime.unmount();
 }
});
