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
function setup(saved = null, failSeed = false) {
  const runtime = hookRuntime(), data = new Map(), events = [], routes = [];
  const storage = { getItem: async k => data.get(k) || null, setItem: async (k,v) => { if (failSeed && k.endsWith('seed_rating')) throw Error('disk'); data.set(k,v); } };
  const previewTools = mobileModule('lib/guestRatingPreview.js', {});
  if (saved) data.set(previewTools.GUEST_RATING_PREVIEW_KEY, JSON.stringify(saved));
  const imports = {
    react: runtime.react, 'react/jsx-runtime': runtime.jsx,
    'react-native': { BackHandler: { addEventListener: () => ({ remove() {} }) }, KeyboardAvoidingView: 'keyboard', Platform: { OS: 'android' }, ScrollView: 'scroll', View: 'view' },
    'react-native-safe-area-context': { SafeAreaView: 'safe' },
    'react-native-paper': { ActivityIndicator: 'spinner', Button: 'button', List: { Item: 'item' }, Text: 'text', TextInput: 'input', useTheme: () => ({ colors: {} }) },
    '@react-native-async-storage/async-storage': storage,
    'expo-crypto': { randomUUID: () => 'operation-1' },
    'expo-router': { useRouter: () => ({ replace: r => routes.push(['replace',r]), push: r => routes.push(['push',r]) }) },
    './RatingWizardDialog': 'rating', './WingmanAddDialog': 'wingman',
    '../lib/supabase': { supabase: { from: () => ({ select() { return this; }, ilike() { return this; }, order() { return this; }, limit() { return this; }, abortSignal: async () => ({ data: [{id, name: 'Existing Wings', city: 'Buffalo', state_id: 1}] }) }) } }, '../providers/AuthProvider': { useAuth: () => ({ user: null }) },
    '../lib/analytics': { trackEvent: async e => events.push(e) },
    '../hooks/useOnboardingGate': { markOnboardingSeen: async () => data.set('done','1') },
    '../lib/guestRatingPreview': previewTools, '../lib/quickRating': require('../lib/quickRating.js'), '../lib/onboardingV2': helpers,
  };
  const Component = mobileModule('components/OnboardingV2.jsx', imports).default;
  const render = () => runtime.render(Component, {});
  const press = async label => { const button = nodes(render(),'button').find(n => n.props.children === label); assert.ok(button,label); await button.props.onPress(); await flush(); };
  render();
  return { render, press, data, events, routes, runtime, previewTools };
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
  await s.press('Create free account'); assert.equal(s.data.get('done'),'1');
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
  const restored=setup(saved); await flush(); assert.ok(nodes(restored.render(),'button').some(n=>n.props.children==='Create free account'));
  s.runtime.unmount();restored.runtime.unmount();
});
test('slider maps min/max/midpoint, clamped taps, RTL and drag sequences across widths',()=>{
  for(const width of [120,300,600]) {
    assert.equal(slider.ratingScoreAtPosition(14,width),1);assert.equal(slider.ratingScoreAtPosition(width-14,width),10);
    assert.equal(slider.ratingScoreAtPosition(width/2,width),6);
    assert.equal(slider.ratingScoreAtPosition(-100,width),1);assert.equal(slider.ratingScoreAtPosition(width+100,width),10);
    assert.equal(slider.ratingScoreAtPosition(14,width,true),10);assert.equal(slider.ratingScoreAtPosition(width-14,width,true),1);
    const drag=[0,.25,.5,.75,1].map(f=>slider.ratingScoreAtPosition(14+(width-28)*f,width));
    assert.deepEqual(drag,[1,3,6,8,10]);
  }
  assert.equal(slider.ratingScoreAtPosition(0,0),null);
  assert.equal(require('../lib/quickRating.js').QUICK_RATING_STEPS[1].badLabel,'Forgettable');
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
    '../lib/ratingSlider':slider,'../lib/quickRating':require('../lib/quickRating.js')};
  const module=mobileModule('components/RatingWizardDialog.jsx',imports);
  return {runtime,module,rtl:v=>{rtl=v;}};
}
test('shared slider dispatches tap, drag, RTL, and accessibility adjustments',()=>{
  const {runtime,module,rtl}=ratingRuntime();let value=1;
  const render=()=>runtime.render(module.SliderRowPretty,{label:'Sauce',value,onChange:v=>{value=v;}});
  const control=()=>nodes(render(),'view').find(n=>n.props.accessibilityRole==='adjustable');
  let row=control();row.props.onLayout({nativeEvent:{layout:{width:300}}});
  row.props.onPanResponderGrant({nativeEvent:{locationX:150}});assert.equal(value,6);
  row.props.onPanResponderMove({nativeEvent:{locationX:286}});assert.equal(value,10);
  row.props.onPanResponderRelease({nativeEvent:{locationX:14}});assert.equal(value,1);
  control().props.onAccessibilityAction({nativeEvent:{actionName:'increment'}});assert.equal(value,2);
  rtl(true);control().props.onPanResponderGrant({nativeEvent:{locationX:14}});assert.equal(value,10);
  control().props.onAccessibilityAction({nativeEvent:{actionName:'increment'}});assert.equal(value,10);
  runtime.unmount();
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
