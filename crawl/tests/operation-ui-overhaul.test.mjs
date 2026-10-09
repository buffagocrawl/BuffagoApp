import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mobileModule, hookRuntime } from './helpers/mobile-runtime.mjs';
function uiHarness() {
  const runtime = hookRuntime();
  const ui = mobileModule('components/ui/OperationUI.jsx', { react: runtime.react, 'react/jsx-runtime': runtime.jsx,
    'react-native': { Image:'image', Pressable:'pressable', ScrollView:'scroll', View:'view', StyleSheet:{create:x=>x} },
    'react-native-paper': { Button:'button',Chip:'chip',ProgressBar:'progress',Text:'text',useTheme:()=>({colors:{}}) },
    '@expo/vector-icons':{MaterialCommunityIcons:'icon'}, '../../src/theme/operationTokens':{operationTokens:{radius:{card:16},touchTarget:44,colors:{success:'green',amber:'amber'}}} });
  return {runtime,ui};
}
test('public Wing Shot cards require explicit approval and HTTPS; missing and failed photos fall back',()=>{
  const {runtime,ui}=uiHarness();
  for(const props of [{uri:'https://photo.test/private'},{approved:true,uri:null},{approved:true,uri:'file:///private/photo'},{approved:false,uri:'https://photo.test/rejected'}]) assert.equal(runtime.render(ui.WingShotImage,props).type,'view');
  const props={approved:true,uri:'https://photo.test/approved'};
  const image=runtime.render(ui.WingShotImage,props); assert.equal(image.type,'image'); image.props.onError();
  assert.equal(runtime.render(ui.WingShotImage,props).type,'view');
  assert.equal(runtime.render(ui.WingShotImage,{...props,uri:'https://photo.test/new'}).type,'image');
});
test('shared progression guards malformed and out-of-range progress',()=>{
  const {ui}=uiHarness(); for(const [input,expected] of [[-2,0],[2,1],[NaN,0],[Infinity,0],['0.5',0.5]]) {
    const tree=ui.ProgressBar({progress:input});assert.equal(tree.type,'view');assert.equal(tree.props.style[0].height,6);assert.equal(tree.props.children.props.progress,expected);assert.equal(tree.props.children.props.accessibilityValue.now,expected*100);
  }
});
test('shared action components forward rating and daily reward handlers and disabled state',()=>{
 const {ui}=uiHarness(); let calls=0; const onPress=()=>calls++;
 const button=ui.PrimaryButton({onPress,disabled:true,loading:true}); assert.equal(button.props.disabled,true);assert.equal(button.props.loading,true);button.props.onPress();assert.equal(calls,1);
 const stat=ui.StatCard({label:'State Wingdex',value:'3/20',onPress});assert.equal(stat.type,'pressable');stat.props.onPress();assert.equal(calls,2);
 const title=()=>{}; const action={type:'daily-reward'};const player=ui.PlayerProgressCard({level:4,title:'Wing Scout',xp:55,target:100,progress:0.55,onTitlePress:title,action});assert.equal(player.props.children[0].props.children[1],action);const identity=player.props.children[0].props.children[0];assert.equal(identity.props.onPress,title);assert.equal(identity.props.accessibilityRole,'button');assert.equal(identity.props.style[1].minHeight,44);assert.equal(identity.props.children[1].props.progress,0.55);
});
test('map guards reject bad coordinates and provider exceptions without throwing',()=>{
 const safety=mobileModule('lib/mapSafety.js',{});let calls=0; const map={fitToCoordinates(){calls++;throw Error('provider unavailable')},animateToRegion(){calls++;}};
 assert.equal(safety.mapCoordinate({latitude:91,longitude:0}),null);assert.equal(safety.mapCoordinate({latitude:'',longitude:0}),null);
 assert.equal(safety.fitMap(map,false,[{latitude:40,longitude:-70}]),false);assert.equal(calls,0);
 assert.equal(safety.fitMap(map,true,[{latitude:40,longitude:-70}]),true);assert.equal(calls,1);
 assert.equal(safety.fitMap(map,true,[{latitude:40,longitude:-70},{latitude:41,longitude:-71}]),false);
});
test('native map falls back for missing Android configuration, and boundary catches React render failures',()=>{
 const runtime=hookRuntime();class Component {constructor(props){this.props=props;}}
 const react={...runtime.react,Component,forwardRef:x=>x,useImperativeHandle(){},Children:{toArray:x=>Array.isArray(x)?x:[x]}};
 const safety=mobileModule('lib/mapSafety.js',{}); const config={expoConfig:{extra:{}}};
 const module=mobileModule('lib/platformMap.native.js',{react,'react/jsx-runtime':runtime.jsx,'react-native':{Platform:{OS:'android'},Text:'text',View:'view'},'expo-constants':config,'react-native-maps':{default:'map',Marker:'marker',Polyline:'line'},'./mapSafety':safety});
 const props={children:[{props:{coordinate:{latitude:40,longitude:-70}}}],style:{height:200}};
 const tree=runtime.render(module.default,props);assert.equal(tree.type,'view');assert.match(tree.props.children[0].props.children,/Map unavailable/);
 config.expoConfig.extra.androidMapsConfigured=true;
 const configured=runtime.render(module.default,props);const Boundary=configured.type;const boundary=new Boundary(configured.props);
 assert.equal(boundary.render(),configured.props.children);boundary.state=Boundary.getDerivedStateFromError(Error('map render failed'));
 const fallback=boundary.render();assert.equal(fallback.type,'view');assert.equal(fallback.props.accessibilityLabel,'Map unavailable');
});
test('Home approved images use moderated endpoint and map discovery is consumed by Wingdex',()=>{
 const home=readFileSync(new URL('../app/(tabs)/home/index.jsx',import.meta.url),'utf8');const wingdex=readFileSync(new URL('../app/(tabs)/ratings/index.jsx',import.meta.url),'utf8');
 assert.match(home,/loadWingdexRestaurantGallery\(closest.id, supabase\)/);assert.match(home,/featuredPhoto\?\.destinationId === closest.id/);assert.doesNotMatch(home,/params: \{ map: '1' \}/);assert.match(wingdex,/requestedMap !== '1'/);assert.match(wingdex,/router.setParams\(\{ map: undefined \}\)/);
});
test('Journey mission progress stays owner-only and respects the growth feature gate', async()=>{
 for(const [isPublic,enabled,expected] of [[true,true,0],[false,false,0],[false,true,1]]){
  const runtime=hookRuntime();let missionCalls=0;
  const module=mobileModule('components/WeeklyChallengeStats.jsx',{
   react:runtime.react,'react/jsx-runtime':runtime.jsx,'react-native':{View:'view',StyleSheet:{create:x=>x}},'react-native-paper':{Text:'text'},
   '@react-navigation/native':{useFocusEffect:callback=>runtime.react.useEffect(callback,[callback])},
   '../lib/challengeStats':{loadPublicChallengeStats:async()=>({total:3,thisWeek:1,currentStreak:2,bestStreak:4})},
   '../lib/weeklyMission':{loadWeeklyMission:async()=>{missionCalls++;return {mission:{label:'Rate wings',current:1,target:2},completionRatio:0.5,resetCopy:'Next week'};}},
   '../lib/analytics':{trackEvent(){}},'./ui/OperationUI':{SurfaceCard:'surface',SectionHeader:'section',ProgressBar:'progress'},'../config/features':{ENABLE_GROWTH_MISSIONS:enabled}
  });
  const props={client:{},userId:'player',isPublic};runtime.render(module.default,props);await Promise.resolve();await Promise.resolve();const tree=runtime.render(module.default,props);assert.equal(missionCalls,expected);
  const progress=tree.props.children[1];assert.equal(Boolean(progress),Boolean(expected));if(expected)assert.equal(progress.props.children[2].props.progress,0.5);runtime.unmount();
 }
});
test('Home initial hook render resolves callbacks and restores shared navigation style in its effect and cleanup',()=>{
 const runtime=hookRuntime();const source=readFileSync(new URL('../app/(tabs)/home/index.jsx',import.meta.url),'utf8');
 const inert=new Proxy(function(){return null;},{get(_target,key){if(key==='__esModule')return true;if(key==='default')return inert;return inert;}});
 const imports={};for(const match of source.matchAll(/from\s+['"]([^'"]+)['"]/g))imports[match[1]]=inert;
 const options=[];const theme={colors:{background:'#000',surface:'#111',outline:'#222'}};
 const tokens=mobileModule('src/theme/operationTokens.js',{});imports['../../../src/theme/operationTokens']=tokens;
 let effectNumber=0;const react={...runtime.react,useEffect(callback,deps){if(effectNumber++===0)runtime.react.useEffect(callback,deps);}};
 imports.react={...react,default:react,__esModule:true};imports['react/jsx-runtime']=runtime.jsx;
 imports['react-native']={StyleSheet:{create:x=>x},Image:'image',View:'view',ActivityIndicator:'spinner',ScrollView:'scroll',Alert:{alert(){}},Pressable:'pressable',DeviceEventEmitter:{},Linking:{},useWindowDimensions:()=>({width:320,fontScale:1.3})};
 imports['react-native-paper']={Text:'text',Button:'button',useTheme:()=>theme,Dialog:'dialog',Portal:'portal',Avatar:{},TextInput:'input'};
 imports['react-native-safe-area-context']={SafeAreaView:'safe',useSafeAreaInsets:()=>({bottom:34})};imports['@react-navigation/bottom-tabs']={useBottomTabBarHeight:()=>64};
 imports['expo-router']={useRouter:()=>({}),useFocusEffect(){},useNavigation:()=>({setOptions:option=>options.push(option)})};
 imports['../../../hooks/useOnboardingGate']={useOnboardingGate:()=>({loading:true,shouldShowIntro:false})};
 imports['../../../hooks/useWingShotsFeatureFlags']={useWingShotsFeatureFlags:()=>({flags:{},refresh(){}})};
 imports['../../../providers/LocationProvider']={useLocationCtx:()=>({coords:null,status:'undetermined',refreshPosition(){}})};
 imports['../../../hooks/useLegendaryFeed']={useLegendaryFeed:()=>({events:[]})};
 const {default:Home}=mobileModule('app/(tabs)/home/index.jsx',imports);
 assert.doesNotThrow(()=>runtime.render(Home,{}));assert.equal(options.length,1);assert.deepEqual(options[0].tabBarStyle,tokens.operationTabBarStyle(theme,34));assert.equal(options[0].tabBarStyle.height,98);
 runtime.unmount();assert.equal(options.length,2);assert.deepEqual(options[1].tabBarStyle,options[0].tabBarStyle);
});
import ts from 'typescript';
test('Journey displays missing averages as unavailable while preserving actual zero ratings',()=>{
 const source=readFileSync(new URL('../app/profile/history/index.jsx',import.meta.url),'utf8');const declaration=source.match(/const fmt2 =[^;]+;/)?.[0];assert.ok(declaration);
 const format=Function(declaration+'return fmt2;')();
 for(const value of [null,undefined,'',NaN,Infinity])assert.equal(format(value),'\u2014');
 assert.equal(format(0),'0.00');assert.equal(format('0'),'0.00');assert.equal(format(8.25),'8.25');
});
test('Wingdex absolute header honors Android safe-area insets and filter rails expose horizontal overflow',()=>{
 const source=readFileSync(new URL('../app/(tabs)/ratings/index.jsx',import.meta.url),'utf8');
 assert.match(source,/top: insets\.top/);
 assert.match(source,/filterRailHint/);
 assert.match(source,/pictureCountsStatus === 'error'/);
 assert.match(source,/Share the first Wing Shot for \$\{item\.name\}/);
 assert.match(source,/if \(ratedByMe\) router\.push\('\/\(tabs\)\/journey'\);\s*else void pickAsHomeNextSpot\(item\)/);
});

test('Journey highest rating is the individual score, with missing scores excluded and real zero preserved',()=>{
 const source=readFileSync(new URL('../app/profile/history/index.jsx',import.meta.url),'utf8');
 const start=source.indexOf('const summaryStats = useMemo(');const end=source.indexOf('const activeCrawls',start);assert.ok(start>=0 && end>start);
 const summary=new Function('ratings','useMemo',source.slice(start,end)+'return summaryStats;');
 const data=summary([{destination_id:'a',weight_score:10,wings_eaten:6},{destination_id:'a',weight_score:2,wings_eaten:4},{destination_id:'b',weight_score:7,wings_eaten:3}],fn=>fn());
 assert.equal(data.highest,10);assert.equal(data.average,19/3);assert.equal(data.wings,13);
 assert.equal(summary([{weight_score:0},{weight_score:null},{weight_score:''},{weight_score:'invalid'}],fn=>fn()).average,0);
 assert.equal(summary([],fn=>fn()).highest,null);
});
test('Wingdex responsive map action preserves navigation and 44px targets on compact/scaled phones',()=>{
 const source=readFileSync(new URL('../app/(tabs)/ratings/index.jsx',import.meta.url),'utf8');
 const condition=source.match(/const compactMapAction =[^;]+;/)?.[0];const expression=source.match(/\{compactMapAction \? ([\s\S]*?)<\/Button>\}/)?.[0];assert.ok(condition);assert.ok(expression);
 const code=ts.transpileModule('export function render(viewportWidth,fontScale,Pressable,MaterialCommunityIcons,Button,colors,openRestaurantsMap){'+condition+'return ('+expression.slice(1,-1)+');}',{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const runtime=hookRuntime();const exported={};Function('exports','require',code)(exported,()=>runtime.jsx);
 let opened=0;const onMap=()=>opened++;
 for(const [width,scale,type] of [[320,1,'pressable'],[390,1.3,'pressable'],[390,1,'button']]){
  const tree=exported.render(width,scale,'pressable','icon','button',{surfaceVariant:'#111',onSurface:'#fff'},onMap);assert.equal(tree.type,type);assert.equal(tree.props.onPress,onMap);tree.props.onPress();
  if(type==='pressable'){assert.equal(tree.props.accessibilityLabel,'Open Wingdex map');assert.equal(tree.props.style.width,44);assert.equal(tree.props.style.height,44);}
 }
 assert.equal(opened,3);
});
