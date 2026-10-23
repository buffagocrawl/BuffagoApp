import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { mobileModule, hookRuntime } from './helpers/mobile-runtime.mjs';
const require = createRequire(import.meta.url);
const helpers = require('../lib/onboardingV2.js');
const slider = require('../lib/ratingSlider.js');
const id = '11111111-1111-4111-8111-111111111111';
const nodes = (tree, type) => !tree ? [] : Array.isArray(tree) ? tree.flatMap(n => nodes(n, type)) : [...(tree.type === type ? [tree] : []), ...nodes(tree.props?.children, type)];
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
function setup(saved = null, failSeed = false, photoEnabled = true, account = null) {
  const runtime = hookRuntime(), data = new Map(), events = [], routes = [];
  const storage = { getItem: async k => data.get(k) || null, setItem: async (k,v) => { if (failSeed && k.endsWith('seed_rating')) throw Error('disk'); data.set(k,v); } };
  const previewTools = mobileModule('lib/guestRatingPreview.js', {});
  if (saved) data.set(previewTools.GUEST_RATING_PREVIEW_KEY, JSON.stringify(saved));
  let flagCalls = 0;
  const imports = {
    '../config/features': { ENABLE_ONBOARDING_WING_SHOT_INVITE: photoEnabled },
    '../lib/photoWorkflowFlags': { loadPhotoWorkflowFlags: async () => { flagCalls++; return { prompt: photoEnabled, photo: photoEnabled }; } },
    '../lib/wingShotAuthIntent': { saveWingShotIntent: async () => {}, claimWingShotIntent: async () => account && !account.is_anonymous ? { pathname: '/profile/wing-shots/submit', params: { source: 'onboarding', destinationId: id } } : null, clearWingShotIntent: async () => {} },
    react: runtime.react, 'react/jsx-runtime': runtime.jsx,
    'react-native': { BackHandler: { addEventListener: () => ({ remove() {} }) }, KeyboardAvoidingView: 'keyboard', Platform: { OS: 'android' }, ScrollView: 'scroll', View: 'view' },
    'react-native-safe-area-context': { SafeAreaView: 'safe' },
    'react-native-paper': { ActivityIndicator: 'spinner', Button: 'button', List: { Item: 'item' }, Text: 'text', TextInput: 'input', useTheme: () => ({ colors: {} }) },
    '@react-native-async-storage/async-storage': storage,
    'expo-crypto': { randomUUID: () => 'operation-1' },
    'expo-router': { useRouter: () => ({ replace: r => routes.push(['replace',r]), push: r => routes.push(['push',r]) }) },
    './RatingWizardDialog': 'rating', './WingmanAddDialog': 'wingman',
    '../lib/supabase': { supabase: { from: () => ({ select() { return this; }, ilike() { return this; }, order() { return this; }, limit() { return this; }, abortSignal: async () => ({ data: [{id, name: 'Existing Wings', city: 'Buffalo', state_id: 1}] }) }) } }, '../providers/AuthProvider': { useAuth: () => ({ user: account }) },
    '../lib/analytics': { trackEvent: async e => events.push(e) },
    '../hooks/useOnboardingGate': { markOnboardingSeen: async () => data.set('done','1') },
    '../lib/guestRatingPreview': previewTools, '../lib/quickRating': require('../lib/quickRating.js'), '../lib/onboardingV2': helpers,
  };
  const Component = mobileModule('components/OnboardingV2.jsx', imports).default;
  const render = () => runtime.render(Component, {});
  const press = async label => { render(); await flush(); const button = nodes(render(),'button').find(n => n.props.children === label); assert.ok(button,label); await button.props.onPress(); await flush(); };
  render();
  return { render, press, data, events, routes, runtime, previewTools, flagCalls: () => flagCalls };
}
test('welcome has two paths; explore completes and replaces with home without rating', async () => {
  const s=setup(); await flush();
  assert.deepEqual(nodes(s.render(),'button').map(n=>n.props.children), ['Find / rate wings','Explore BuffaGo']);
  await s.press('Explore BuffaGo');
  assert.equal(s.data.get('done'),'1'); assert.deepEqual(s.routes,[['replace','/(tabs)/home']]);
  assert.equal(s.data.has('buffago:guest_rating_preview:v1'),false);
  assert.equal(s.events.find(e=>e.eventName==='onboarding_completed').metadata.entry_path,'explore');
  s.runtime.unmount();
});
test('Wingman canonical selection uses shared rating; result is local and auth follows completion', async () => {
  const s=setup(); await flush(); await s.press('Find / rate wings'); await s.press("Can't find it? Ask Wingman");
  await nodes(s.render(),'wingman')[0].props.onPickDestination({id,name:'Wings'},{});
  let rating=nodes(s.render(),'rating')[0]; assert.equal(rating.props.visible,true); assert.equal(rating.props.flowVariant,'quick_onboarding');
  await rating.props.onFinalize({scores:{overall:8,sauce:7,crispiness:6,meat:9}});
  const preview=JSON.parse(s.data.get('buffago:guest_rating_preview:v1'));
  assert.equal(preview.status,'local_preview'); assert.equal(preview.payload.overall,8);
  assert.equal(JSON.parse(s.data.get('buffago:onboarding:seed_rating')).local_only,true);
  assert.ok(!s.events.some(e=>e.eventName==='rating_submitted'));
  await s.press('Create Account & Add Photo'); assert.equal(s.data.get('done'),'1');
  assert.deepEqual(s.routes,[['replace','/(tabs)/home'],['push','/auth/login']]);
  assert.ok(s.data.has('buffago:guest_rating_preview:v1')); s.runtime.unmount();
});
test('pending Wingman result cannot open rating; manual review allows explore', async()=>{
  const s=setup(); await flush(); await s.press('Find / rate wings');
  const wingman=nodes(s.render(),'wingman')[0];
  await wingman.props.onPickDestination({id:'new:pending',name:'Pending'},{});
  assert.equal(nodes(s.render(),'rating')[0].props.visible,false);
  await wingman.props.onManualReviewQueued({restaurant_name:'Pending',state_id:1});
  assert.equal(JSON.parse(s.data.get('buffago:onboarding:dest_suggestion')).restaurant_name,'Pending');
  await s.press('Explore BuffaGo');
  assert.equal(s.data.get('done'),'1'); s.runtime.unmount();
});
test('preview survives compatibility write failure and restores result on a later mount',async()=>{
  const s=setup(null,true); await flush(); await s.press('Find / rate wings');
  await nodes(s.render(),'wingman')[0].props.onPickDestination({id,name:'Wings'},{});
  await nodes(s.render(),'rating')[0].props.onFinalize({scores:{overall:10,sauce:1,crispiness:5,meat:8}});
  const saved=JSON.parse(s.data.get('buffago:guest_rating_preview:v1')); assert.equal(saved.payload.overall,10);
  const restored=setup(saved); await flush(); restored.render(); await flush(); assert.ok(nodes(restored.render(),'button').some(n=>n.props.children==='Create Account & Add Photo'));
  s.runtime.unmount();restored.runtime.unmount();
});
test('V2 supersedes experiment and both auth import paths explicitly preserve V2 previews',()=>{
  const route=readFileSync(new URL('../app/onboarding.jsx',import.meta.url),'utf8');
  assert.match(route,/ENABLE_ONBOARDING_V2 \? <OnboardingV2 \/> : <OnboardingExperimentRoute \/>/);
  assert.match(readFileSync(new URL('../config/features.ts',import.meta.url),'utf8'),/EXPO_PUBLIC_ONBOARDING_V2, false/);
  for(const file of ['login.jsx','callback.jsx']) assert.match(readFileSync(new URL('../app/auth/'+file,import.meta.url),'utf8'),/if \(parsed\?\.onboarding_version === 'v2'\) return/);
  assert.equal(helpers.isCanonicalDestination({id:'new:fake'}),false);
  assert.doesNotMatch(readFileSync(new URL('../components/OnboardingV2.jsx',import.meta.url),'utf8'),/crawl-preview|Crawl 101|Learn More About Crawls/);
});
function ratingRuntime() {
  const runtime=hookRuntime(); let rtl=false;
  const imports={react:runtime.react,'react/jsx-runtime':runtime.jsx,
    'react-native':{View:'view',Pressable:'pressable',ScrollView:'scroll',FlatList:'flatlist',StyleSheet:{create:s=>s},I18nManager:{get isRTL(){return rtl;}},PanResponder:{create:handlers=>({panHandlers:handlers})}},
    '@expo/vector-icons':{MaterialCommunityIcons:'icon'},'react-native-paper':{Button:'button',Dialog:Object.assign('dialog',{Content:'content',Actions:'actions'}),Portal:'portal',ProgressBar:'progress',Text:'text',useTheme:()=>({dark:false,colors:{onSurface:'#111',surface:'#fff'}})},
    '@react-native-community/slider':'native-slider','../lib/quickRating':require('../lib/quickRating.js')};
  const module=mobileModule('components/RatingWizardDialog.jsx',imports);
  return {runtime,module,rtl:v=>{rtl=v;}};
}
test('restored pepper slider uses original native integer interaction and appearance',()=>{
  const {runtime,module}=ratingRuntime();let value=1;
  const render=()=>runtime.render(module.SliderRowPretty,{label:'Sauce',value,onChange:v=>{value=v;}});
  const control=()=>nodes(render(),'native-slider')[0];
  assert.equal(control().props.minimumValue,1);assert.equal(control().props.maximumValue,10);assert.equal(control().props.step,1);
  for(const score of [1,6,10,3]){control().props.onValueChange(score);assert.equal(value,score);assert.equal(control().props.value,score);}
  assert.equal(control().props.minimumTrackTintColor,'transparent');
  assert.equal(control().props.thumbTintColor,'rgba(255,255,255,0.001)');
  const views=nodes(render(),'view');assert.ok(views.some(n=>n.props.style?.height===44));assert.ok(views.some(n=>n.props.style?.backgroundColor==='#050505'));runtime.unmount();
});

test('quick and full rating revisits keep selected scores and submit unchanged numbers',async()=>{
  for(const flowVariant of ['quick_onboarding','full_review']) {
    const {runtime,module}=ratingRuntime();const finalized=[];
    const props={visible:true,flowVariant,onFinalize:async p=>finalized.push(p)};
    const render=()=>runtime.render(module.default,props);
    render();
    const press=async label=>{const b=nodes(render(),'button').find(n=>n.props.children===label);assert.ok(b,label);await b.props.onPress();};
    if(flowVariant==='full_review') await press('Next');
    const row=()=>nodes(render(),module.SliderRowPretty)[0];
    row().props.onChange(8);
    for(let i=0;i<3;i++){await press('Next');await press('Back');assert.equal(row().props.value,8);}
    for(let i=0;i<(flowVariant==='quick_onboarding'?3:8);i++)await press('Next');
    await press('Finalize');assert.equal(finalized.length,1);
    assert.equal(finalized[0].scores[flowVariant==='quick_onboarding'?'overall':'sauce'],8);
    runtime.unmount();
  }
});
test('V2 location stays optional; returning users and disabled flag retain permission behavior',async()=>{
  for(const scenario of [
    {flag:true,done:false,participant:false,prompts:0},
    {flag:true,done:true,participant:false,prompts:1},
    {flag:false,done:false,participant:false,prompts:1},
    {flag:false,done:true,participant:true,prompts:0},
  ]) {
    const runtime=hookRuntime();let prompts=0;
    const react={...runtime.react,createContext:()=>({Provider:'provider'}),useContext:()=>({})};
    const Provider=mobileModule('providers/LocationProvider.tsx',{
      react,'react/jsx-runtime':runtime.jsx,'react-native':{Linking:{}},
      'expo-location':{requestForegroundPermissionsAsync:async()=>{prompts++;return {status:'denied'};},getForegroundPermissionsAsync:async()=>({status:'denied'}),getCurrentPositionAsync:async()=>null},
      '@react-native-async-storage/async-storage':{getItem:async()=>scenario.participant?'{}':null},
      '../config/features':{ENABLE_ONBOARDING_V2:scenario.flag},
      '../hooks/useOnboardingGate':{hasCompletedOnboarding:async()=>scenario.done},
    }).default;
    runtime.render(Provider,{children:null});await flush();assert.equal(prompts,scenario.prompts);runtime.unmount();
  }
});
test('existing restaurant search selects the same shared quick rating dialog',async()=>{
  const s=setup();await flush();await s.press('Find / rate wings');
  nodes(s.render(),'input')[0].props.onChangeText('Wings');s.render();
  await new Promise(resolve=>setTimeout(resolve,350));await flush();
  const item=nodes(s.render(),'item')[0];assert.equal(item.props.title,'Existing Wings');await item.props.onPress();await flush();
  assert.equal(nodes(s.render(),'rating')[0].props.visible,true);
  assert.equal(nodes(s.render(),'rating')[0].props.flowVariant,'quick_onboarding');
  assert.equal(s.events.find(e=>e.eventName==='restaurant_selected').metadata.source,'search');s.runtime.unmount();
});

test('disabled photo flags keep preview and Explore without advertising account upload',async()=>{
  const s=setup(null,false,false);await flush();await s.press('Find / rate wings');
  await nodes(s.render(),'wingman')[0].props.onPickDestination({id,name:'Wings'},{});
  await nodes(s.render(),'rating')[0].props.onFinalize({scores:{overall:8,sauce:7,crispiness:6,meat:9}});
  s.render();await flush();const tree=s.render();
  assert.ok(!nodes(tree,'button').some(n=>n.props.children==='Create Account & Add Photo'));
  await s.press('Continue to BuffaGo');assert.deepEqual(s.routes,[['replace','/(tabs)/home']]);
  assert.ok(s.data.has('buffago:guest_rating_preview:v1'));s.runtime.unmount();
});

test('guest invitation uses release contract without calling authenticated flags',async()=>{
 const s=setup();await flush();await s.press('Find / rate wings');
 await nodes(s.render(),'wingman')[0].props.onPickDestination({id,name:'Wings'},{});
 await nodes(s.render(),'rating')[0].props.onFinalize({scores:{overall:9,sauce:7,crispiness:6,meat:9}});
 s.render();await flush();assert.ok(nodes(s.render(),'button').some(n=>n.props.children==='Create Account & Add Photo'));
 assert.equal(s.flagCalls(),0);await s.press('Create Account & Add Photo');assert.equal(s.flagCalls(),0);assert.deepEqual(s.routes,[['replace','/(tabs)/home'],['push','/auth/login']]);s.runtime.unmount();
});

test('authenticated V2 result skips signup and opens same restaurant uploader directly',async()=>{
 const s=setup(null,false,true,{id:'account',is_anonymous:false});await flush();await s.press('Find / rate wings');
 await nodes(s.render(),'wingman')[0].props.onPickDestination({id,name:'Wings'},{});
 await nodes(s.render(),'rating')[0].props.onFinalize({scores:{overall:8,sauce:7,crispiness:6,meat:9}});
 s.render();await flush();await s.press('Add a Wing Shot');
 assert.equal(s.routes.length,2);assert.equal(s.routes[1][1].pathname,'/profile/wing-shots/submit');assert.equal(s.routes[1][1].params.destinationId,id);assert.ok(!s.routes.some(r=>r[1]==='/auth/login'));assert.ok(s.data.has('buffago:guest_rating_preview:v1'));s.runtime.unmount();
});
