import test from 'node:test';
import assert from 'node:assert/strict';
import { mobileModule, hookRuntime, findElement } from './helpers/mobile-runtime.mjs';
import * as boundary from '../lib/accountBoundary.js';
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => {resolve=a;reject=b;}); return {promise,resolve,reject}; };
const flush = async () => { for(let i=0;i<40;i++) await Promise.resolve(); };
function auth(initial) {
 let user=initial, listener;
 return {getUser: async()=>({data:{user}}),onAuthStateChange(fn){listener=fn;return {data:{subscription:{unsubscribe(){listener=null;}}}};}, change(next,event='SIGNED_IN'){user=next;listener?.(event,{user});}};
}
function savedHarness(initial) {
 const runtime=hookRuntime(), a=auth(initial), requests=[];
 const state=(u)=>({status:u?'signed_in':'guest',userId:u?.id||null,ratedIds:new Set(),favoriteIds:new Set(u?[u.id]:[]),wantToTryIds:new Set()});
 const service={clearSavedDestinationState:s=>({...s,...state(null)}),getSavedDestinationState:async()=>state((await a.getUser()).data.user),getSavedDestinations:()=>{const d=deferred();requests.push(d);return d.promise;},mutateSavedDestination:()=>{const d=deferred();requests.push(d);return d.promise;}};
 const {useSavedDestinations}=mobileModule('hooks/useSavedDestinations.js',{'react':runtime.react,'../lib/savedDestinations.js':service,'../lib/accountBoundary.js':boundary});
 const render=()=>runtime.render(useSavedDestinations,{client:{auth:a},enabled:true});
 // Keep the supplied client stable across renders.
 const client={auth:a}; const stableRender=()=>runtime.render(useSavedDestinations,{client,enabled:true});
 return {runtime,a,requests,render:stableRender};
}
for(const next of [{id:'B'},null]) test(`actual saved hook rejects delayed list and save after A -> ${next?.id||'logout'}`,async()=>{
 const h=savedHarness({id:'A'});h.render();await flush();let value=h.render();
 const list=value.loadList('favorites');const save=value.mutate({kind:'favorites',destinationId:'d',saved:true});await flush();
 h.a.change(next);await flush();h.render();
 h.requests[0].resolve({status:'signed_in',rows:[{name:'A private'}]});h.requests[1].resolve({status:'signed_in',userId:'A'});await Promise.all([list,save]);await flush();value=h.render();
 assert.equal(value.listRows.length,0);assert.equal(value.userId,next?.id||null);assert.equal(Object.keys(value.pending).length,0);
});
test('actual saved hook preserves same-account token refresh and rejects unmounted completions',async()=>{
 const h=savedHarness({id:'A'});h.render();await flush();let value=h.render();const list=value.loadList('favorites');await flush();h.a.change({id:'A'},'TOKEN_REFRESHED');h.requests[0].resolve({status:'signed_in',rows:[{name:'own'}]});await list;assert.equal(h.render().listRows[0].name,'own');
 const later=h.render().loadList('favorites');await flush();h.runtime.unmount();const before=JSON.stringify(h.runtime.hooks);h.requests[1].resolve({status:'signed_in',rows:[{name:'late'}]});await later;assert.equal(JSON.stringify(h.runtime.hooks),before);
});
function gameHarness(initial) {
 const runtime=hookRuntime(),a=auth(initial),feeds=[],votes=[],reveals=[];
 const service={createGuestJurySession:()=>({clear(){}}),getWingJuryPhotoBatch:()=>{let d=deferred();feeds.push(d);return d.promise;},recordWingJuryVerdict:()=>{let d=deferred();votes.push(d);return d.promise;},getWingJuryReveal:()=>{let d=deferred();reveals.push(d);return d.promise;}};
 const imports={'react':runtime.react,'react/jsx-runtime':runtime.jsx,'react-native':{StyleSheet:{create:s=>s},View:'view',Image:'image',Pressable:'pressable',ScrollView:'scroll',ActivityIndicator:'spinner',Alert:{alert(){}}},'react-native-paper':{Button:'button',Card:'card',Dialog:'dialog',Divider:'divider',Portal:'portal',Text:'text',useTheme:()=>({colors:{}})},'expo-router':{useRouter:()=>({canGoBack:()=>true,back(){}}),useLocalSearchParams:()=>({})},'@expo/vector-icons':{MaterialCommunityIcons:'icon'},'../providers/LocationProvider':{useLocationCtx:()=>({coords:null})},'../config/features':{ENABLE_WING_JURY:true,ENABLE_SAVED_DESTINATIONS:true},'../lib/supabase.js':{supabase:{auth:a}},'../lib/wingJuryService.js':service,'../hooks/useSavedDestinations':{useSavedDestinations:()=>({})},'../lib/savedDestinations.js':{saveSavedDestinationIntent:async()=>true},'@react-native-async-storage/async-storage':{},'./ui/FeedbackState':'feedback','../lib/accountBoundary.js':boundary,'../assets/wing-user.png':'image'};
 const component=mobileModule('components/WingJuryGame.jsx',imports).default;return {runtime,a,feeds,votes,reveals,render:()=>runtime.render(component)};
}
const batch=(id)=>({photos:[{submission_id:id,signed_url:'https://image'}],hasMore:false});
for(const [initial,next] of [[{id:'A'},{id:'B'}],[{id:'A'},null],[null,{id:'A'}]])test(`actual game rejects delayed feed across ${initial?.id||'guest'} -> ${next?.id||'logout'}`,async()=>{
 const h=gameHarness(initial);h.render();await flush();h.a.change(next);await flush();h.feeds[0].resolve(batch('old'));await flush();assert.ok(findElement(h.render(),'wing-jury-loading'));h.feeds[1].resolve(batch('new'));await flush();assert.ok(findElement(h.render(),'wing-jury-verdict-1'));
});
for(const stage of ['vote','reveal'])test(`actual game discards delayed ${stage} on account switch`,async()=>{
 const h=gameHarness({id:'A'});h.render();await flush();h.feeds[0].resolve(batch('p'));await flush();const pending=findElement(h.render(),'wing-jury-verdict-1').props.onPress();await flush();if(stage==='reveal'){h.votes[0].resolve({status:'authenticated'});await flush();}h.a.change({id:'B'});await flush();if(stage==='vote')h.votes[0].resolve({status:'authenticated'});else h.reveals[0].resolve({restaurant:{name:'A private'}});await pending;assert.equal(findElement(h.render(),'wing-jury-reveal'),null);
});
test('actual game close and unmount invalidate delayed feeds',async()=>{
 for(const mode of ['close','unmount']){const h=gameHarness({id:'A'});let tree=h.render();await flush();if(mode==='unmount')h.runtime.unmount();else tree.props.children.find(node=>node?.type==='button').props.onPress();const before=JSON.stringify(h.runtime.hooks);h.feeds[0].resolve(batch('late'));await flush();assert.equal(JSON.stringify(h.runtime.hooks),before);}
});
import * as juryService from '../lib/wingJuryService.js';
test('guest public invoke explicitly pins empty Authorization across guest -> account dispatch',async()=>{
 let user=null;let captured;
 const client={auth:{getUser:async()=>({data:{user}}),getSession:async()=>({data:{session:null}})},functions:{invoke:async(_name,options)=>{user={id:'B'};captured=options;return {data:{photos:[]}};}}};
 await juryService.getWingJuryPhotoBatch({client,enabled:true});assert.equal(captured.headers.Authorization,'');
});
test('verified account session without access token fails before invoke',async()=>{
 let invoked=false;const user={id:'A'};const client={auth:{getUser:async()=>({data:{user}}),getSession:async()=>({data:{session:{user}}})},functions:{invoke:async()=>{invoked=true;}}};
 await assert.rejects(juryService.getWingJuryPhotoBatch({client,enabled:true}),e=>e.code==='AUTH_LOOKUP_FAILED');assert.equal(invoked,false);
});
test('actual game ignores late initial auth lookup after newer account notification',async()=>{
 const h=gameHarness({id:'A'}),old=deferred();h.a.getUser=()=>old.promise;h.render();h.a.change({id:'B'});await flush();old.resolve({data:{user:{id:'A'}}});await flush();assert.equal(h.feeds.length,1);h.feeds[0].resolve(batch('B'));await flush();assert.ok(findElement(h.render(),'wing-jury-verdict-1'));
});
import { saveSavedDestinationIntent, claimSavedDestinationIntent, SAVED_DESTINATION_INTENT_KEY } from '../lib/savedDestinations.js';
test('delayed persistent intent write is removed before any later account claim',async()=>{
 const pending=deferred(), values=new Map();let current=true;
 const storage={getItem:async k=>values.get(k)||null,setItem:async(k,v)=>{await pending.promise;values.set(k,v);},removeItem:async k=>values.delete(k)};
 const save=saveSavedDestinationIntent({destinationId:'old',kind:'wantToTry'},storage,()=>current);await flush();current=false;
 const claim=claimSavedDestinationIntent({client:{auth:auth({id:'B'})},userId:'B',storage});pending.resolve();assert.equal(await save,false);assert.equal(await claim,null);assert.equal(values.has(SAVED_DESTINATION_INTENT_KEY),false);
});
test('ambiguous permanent vote retry returns server original verdict',async()=>{
 let attempts=0;const client={auth:{getUser:async()=>({data:{user:{id:'A'}}})},functions:{invoke:async()=>++attempts===1?{error:new Error('lost response')}:{data:{ok:true,duplicate:true,vote:-1,submission_id:'p'}}}};
 await assert.rejects(juryService.recordWingJuryVerdict({client,enabled:true,photo:{submission_id:'p'},vote:-1}));const result=await juryService.recordWingJuryVerdict({client,enabled:true,photo:{submission_id:'p'},vote:1});assert.equal(result.vote,-1);assert.equal(result.duplicate,true);
});
function ratingsHarness(initial, options={}) {
 const runtime=hookRuntime(),a=auth(initial),pending=[];
 const noop=()=>{};const imports={react:runtime.react,'react/jsx-runtime':runtime.jsx,'react-native':{View:'view',ScrollView:'scroll',StyleSheet:{create:s=>s},useWindowDimensions:()=>({width:400,height:800,fontScale:1}),Animated:{Value:class {setValue(){} interpolate(){return 0;}},parallel:()=>({start(){}}),timing:()=>({start(){}})},Alert:{alert:noop}},'react-native-paper':{useTheme:()=>({colors:{},dark:true}),Text:'text',Button:'button',Card:Object.assign('card',{Content:'content'}),Dialog:{},Portal:'portal',Searchbar:'search'},'expo-router':{useRouter:()=>({setParams:noop}),useFocusEffect:noop,useLocalSearchParams:()=>options.params||{}},'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:0,bottom:0}),SafeAreaView:'safe'},'@react-native-async-storage/async-storage':{getItem:async()=>null},'../../../providers/LocationProvider':{useLocationCtx:()=>({coords:null,status:'denied'})},'../../../hooks/useLegendaryFeed':{useLegendaryFeed:()=>({byRestaurant:{}})},'../../../hooks/useSavedDestinations':{useSavedDestinations:()=>({loadList:noop,ratedIds:new Set(),favoriteIds:new Set(),wantToTryIds:new Set(),isPending:()=>false,mutate:options.mutate||noop})},'../../../config/features':{ENABLE_SAVED_DESTINATIONS:!!options.params},'../../../src/theme/operationTokens':{operationTokens:{colors:{},radius:{}}},'../../../lib/accountBoundary.js':boundary,'../../../lib/analytics':{trackEvent:async()=>{}},'../../../lib/wingdexGallery':{loadWingdexGallery:async()=>({})}};
 const empty=['@expo/vector-icons','expo-linear-gradient','expo-haptics','expo-crypto','@react-native-community/slider','../../../components/RatingWizardDialog','../../../components/WingmanAddDialog','../../../components/ui/FeedbackState','../../../components/ui/OperationUI','../../../lib/buffacoinRatingTransaction','../../../lib/platformMap','../../../lib/mapSafety','../../../components/WingdexPhotoGallery','../../../lib/savedDestinations.js','../../../lib/destinationNavigation.js','../../../lib/homeDestination.js','../../../components/buffaverse/LegendarySurfaces'];for(const name of empty)imports[name]={};
 const client={auth:a,from(table){let chain={select(){return chain;},eq(){return chain;},maybeSingle:async()=>({data:{balance:5}}),then(resolve,reject){if(table==='destination_ratings'){const d=deferred();pending.push(d);return d.promise.then(resolve,reject);}return Promise.resolve({data:[]}).then(resolve,reject);}};return chain;}};
 imports['../../../lib/supabase.js']={supabase:client};const component=mobileModule('app/(tabs)/ratings/index.jsx',imports).default;return {runtime,a,pending,render:()=>runtime.render(component)};
}
test('actual ratings aggregate drops old account result after account switch',async()=>{
 const h=ratingsHarness({id:'A'});h.render();await flush();assert.ok(h.pending.length);h.a.change({id:'B'});await flush();h.pending[0].resolve({data:[{destination_id:'A-private',user_id:'A',weight_score:90,is_buffacoin:true,destinations:{name:'Private A'}}]});await flush();h.render();assert.equal(h.runtime.hooks.some(v=>Array.isArray(v)&&v.some(row=>row?.destination_id==='A-private')),false);h.runtime.unmount();
});
function elementWhere(tree,predicate){if(!tree)return null;if(Array.isArray(tree))return tree.map(v=>elementWhere(v,predicate)).find(Boolean)||null;if(predicate(tree))return tree;return elementWhere(tree.props?.children,predicate);}
test('actual game prevents broken-photo skipping during deferred vote and reveal',async()=>{
 const h=gameHarness({id:'A'});h.render();await flush();h.feeds[0].resolve({photos:[...batch('p').photos,...batch('next').photos],hasMore:false});await flush();
 let tree=h.render();const imageError=elementWhere(tree,n=>n.type==='image').props.onError;const vote=findElement(tree,'wing-jury-verdict-1').props.onPress();await flush();imageError();
 for(const stage of ['vote','reveal']){tree=h.render();const skip=elementWhere(tree,n=>n.props?.children==='Skip photo');assert.equal(skip.props.disabled,true);skip.props.onPress();assert.equal(h.reveals.length,stage==='vote'?0:1);if(stage==='vote'){h.votes[0].resolve({status:'authenticated'});await flush();}}
 h.reveals[0].resolve({restaurant:{name:'First'}});await vote;tree=h.render();assert.ok(findElement(tree,'wing-jury-reveal'));elementWhere(tree,n=>n.props?.children==='Next Photo').props.onPress();assert.ok(findElement(h.render(),'wing-jury-verdict-1'));assert.equal(findElement(h.render(),'wing-jury-reveal'),null);h.runtime.unmount();
});
test('actual game ignores image failures from previous photo and previous account',async()=>{
 const h=gameHarness({id:'A'});h.render();await flush();h.feeds[0].resolve({photos:[...batch('p').photos,...batch('next').photos],hasMore:false});await flush();let tree=h.render();const oldError=elementWhere(tree,n=>n.type==='image').props.onError;oldError();tree=h.render();elementWhere(tree,n=>n.props?.children==='Skip photo').props.onPress();oldError();assert.equal(findElement(h.render(),'wing-jury-image-error'),null);
 tree=h.render();const accountError=elementWhere(tree,n=>n.type==='image').props.onError;h.a.change({id:'B'});await flush();h.feeds[1].resolve(batch('next'));await flush();accountError();assert.equal(findElement(h.render(),'wing-jury-image-error'),null);h.runtime.unmount();
});
test('actual game reveal retry is single-flight even when its old callback is invoked twice',async()=>{
 const h=gameHarness({id:'A'});h.render();await flush();h.feeds[0].resolve(batch('p'));await flush();const vote=findElement(h.render(),'wing-jury-verdict-1').props.onPress();await flush();h.votes[0].resolve({status:'authenticated'});await flush();h.reveals[0].reject(new Error('temporary'));await vote;
 const retry=elementWhere(h.render(),n=>n.type==='feedback').props.onAction;retry();retry();await flush();assert.equal(h.reveals.length,2);h.reveals[1].resolve({restaurant:{name:'Own'}});await flush();assert.ok(findElement(h.render(),'wing-jury-reveal'));h.runtime.unmount();
});
test('actual game exhausts after last revealed photo and last broken photo',async()=>{
 for(const mode of ['next','skip']){const h=gameHarness({id:'A'});h.render();await flush();h.feeds[0].resolve(batch('p'));await flush();let tree=h.render();if(mode==='next'){const op=findElement(tree,'wing-jury-verdict-1').props.onPress();await flush();h.votes[0].resolve({status:'authenticated'});await flush();h.reveals[0].resolve({restaurant:{name:'Own'}});await op;tree=h.render();elementWhere(tree,n=>n.props?.children==='Next Photo').props.onPress();}else{elementWhere(tree,n=>n.type==='image').props.onError();tree=h.render();elementWhere(tree,n=>n.props?.children==='Skip photo').props.onPress();}assert.ok(findElement(h.render(),'wing-jury-exhausted'));assert.equal(h.feeds.length,1);}
});

test('actual game retains empty feed continuation and continues without claiming exhaustion', async () => {
 const h=gameHarness({id:'A'});h.render();await flush();
 h.feeds[0].resolve({photos:[],hasMore:true,nextCursor:'next'});await flush();
 const tree=h.render();assert.ok(findElement(tree,'wing-jury-continue'));assert.equal(findElement(tree,'wing-jury-exhausted'),null);
 elementWhere(tree,n=>n.type==='feedback').props.onAction();await flush();assert.equal(h.feeds.length,2);
 h.feeds[1].resolve(batch('later'));await flush();assert.ok(findElement(h.render(),'wing-jury-verdict-1'));h.runtime.unmount();
});
test('account scope accepts same identity again after disposal and activation',()=>{
 const scope=boundary.createAccountScope();assert.equal(scope.update({id:'A'}),true);const epoch=scope.capture();scope.dispose();scope.activate();assert.equal(scope.update({id:'A'}),true);assert.equal(scope.current(epoch),false);
});
test('actual ratings aggregate rejects old account completions on logout and unmount',async()=>{
 for(const mode of ['logout','unmount']){const h=ratingsHarness({id:'A'});h.render();await flush();if(mode==='logout')h.a.change(null);else h.runtime.unmount();const before=JSON.stringify(h.runtime.hooks);h.pending[0].resolve({data:[{destination_id:'old',user_id:'A',weight_score:90,destinations:{name:'Old'}}]});await flush();assert.equal(h.runtime.hooks.some(v=>Array.isArray(v)&&v.some(row=>row?.destination_id==='old')),false);if(mode==='unmount')assert.equal(JSON.stringify(h.runtime.hooks),before);h.runtime.unmount();}
});
test('actual ratings route claim cannot replay A intent into B and passes matching account explicitly',async()=>{
 for(const claimed of ['A','B']){const calls=[];const h=ratingsHarness({id:'B'},{params:{savedAction:'wantToTry',savedDestinationId:'d',savedActionUserId:claimed},mutate:async args=>calls.push(args)});h.render();await flush();h.render();await flush();assert.equal(calls.length,claimed==='B'?1:0);if(calls.length)assert.equal(calls[0].expectedUserId,'B');h.runtime.unmount();}
});
function loginHarness(initial, intent=Promise.resolve(null)) {
 const runtime=hookRuntime(),a=auth(initial),routes=[];let signs=0,claims=0;
 const client={auth:a,from(){const q={select(){return q;},eq(){return q;},ilike(){return q;},limit(){return q;},maybeSingle:async()=>({data:null}),upsert:async()=>({data:null}),then(resolve,reject){return Promise.resolve({data:[]}).then(resolve,reject);}};return q;}};
 a.signInWithPassword=async()=>{signs++;a.change({id:'A'});return {data:{user:{id:'A'},session:{user:{id:'A'}}}};};
 a.signUp=async()=>{a.change({id:'A'});return {data:{user:{id:'A'},session:{user:{id:'A'}}}};};
 const imports={react:runtime.react,'react/jsx-runtime':runtime.jsx,'react-native':{StyleSheet:{create:s=>s},View:'view',Pressable:'pressable',ScrollView:'scroll',Platform:{OS:'ios'}},'react-native-paper':{useTheme:()=>({colors:{}}),Text:'text',TextInput:{Icon:'icon'},Button:'button',Card:{Content:'content'},SegmentedButtons:'segments',Snackbar:'snack'},'@expo/vector-icons':{MaterialCommunityIcons:'icon'},'@react-native-async-storage/async-storage':{getItem:async()=>null},'expo-crypto':{randomUUID:()=> 'operation'},'expo-router':{useRouter:()=>({replace:r=>routes.push(r),back(){}})},'../../lib/supabase.js':{supabase:client},'../../lib/passwordSignInFlow':{runPasswordSignInAttempt:async({signIn,onAuthenticated})=>{const {data}=await signIn();onAuthenticated({user:data.user});return {user:data.user};},getPasswordSignInErrorMessage:e=>e.message},'../../lib/debugLog':{dbg(){}},'../../lib/facebookOAuth':{},'../../lib/socialAuthHelpers':{getSocialAuthButtonModels:()=>[]},'../../config/features':{ENABLE_GOOGLE_AUTH:false},'../../lib/analytics':{trackEvent:async()=>{}},'../../lib/savedDestinations.js':{claimSavedDestinationIntent:()=>{claims++;return intent;}},'../../lib/buffacoinRatingTransaction':{}};
 const component=mobileModule('app/auth/login.jsx',imports).default;return {runtime,a,routes,render:()=>runtime.render(component),signs:()=>signs,claims:()=>claims};
}
function fillLogin(h,mode){let tree=h.render();elementWhere(tree,n=>n.type==='segments').props.onValueChange(mode);findElement(tree,'auth.email.input').props.onChangeText('a@example.com');findElement(tree,'auth.password.input').props.onChangeText('password');if(mode==='signup')elementWhere(tree,n=>n.props?.label==='Username').props.onChangeText('tester');return h.render();}
test('actual login INITIAL_SESSION anonymous preserves ordinary password sign-in',async()=>{
 const h=loginHarness({id:'anon',is_anonymous:true});h.render();h.a.change({id:'anon',is_anonymous:true},'INITIAL_SESSION');await flush();const tree=fillLogin(h,'signin');await findElement(tree,'auth.signin.native-action').props.onPress();await flush();assert.equal(h.signs(),1);assert.equal(h.routes.length,1);h.runtime.unmount();
});
test('actual signup and listener have one saved-intent routing owner',async()=>{
 const h=loginHarness(null,Promise.resolve({destinationId:'d',kind:'wantToTry',userId:'A'}));const tree=fillLogin(h,'signup');await findElement(tree,'auth.signin.native-action').props.onPress();await flush();assert.equal(h.claims(),1);assert.equal(h.routes.length,1);assert.equal(h.routes[0].params.savedActionUserId,'A');h.runtime.unmount();
});
test('actual login pending saved-intent claim cannot redirect after unmount',async()=>{
 const pending=deferred(),h=loginHarness(null,pending.promise);h.render();h.a.change({id:'A'});await flush();assert.equal(h.claims(),1);h.runtime.unmount();pending.resolve({destinationId:'private',kind:'favorites',userId:'A'});await flush();assert.equal(h.routes.length,0);
});
import { claimSavedDestinationAuthHandoff } from '../lib/savedDestinations.js';
function intentStorage(readGate){const values=new Map();return {values,getItem:async k=>{if(readGate)await readGate.promise;return values.get(k)||null;},setItem:async(k,v)=>values.set(k,v),removeItem:async k=>values.delete(k)};}
test('OAuth handoff helper claims A intent once and cannot replay it at later B login',async()=>{
 const storage=intentStorage(),client={auth:auth({id:'A'})};await saveSavedDestinationIntent({destinationId:'d',kind:'wantToTry'},storage);const result=await claimSavedDestinationAuthHandoff({client,userId:'A',storage});assert.equal(result.userId,'A');client.auth.change({id:'B'});assert.equal(await claimSavedDestinationAuthHandoff({client,userId:'B',storage}),null);
});
for(const mode of ['account','cancel'])test(`OAuth handoff helper discards pending claim after ${mode} change`,async()=>{
 const gate=deferred(),storage=intentStorage(gate),client={auth:auth({id:'A'})};let alive=true;await saveSavedDestinationIntent({destinationId:'d',kind:'wantToTry'},storage);const claim=claimSavedDestinationAuthHandoff({client,userId:'A',storage,isCurrent:()=>alive});await flush();if(mode==='account')client.auth.change({id:'B'});else alive=false;gate.resolve();await assert.rejects(claim,e=>e.code==='ACCOUNT_CHANGED');assert.equal(storage.values.size,0);client.auth.change({id:'B'});assert.equal(await claimSavedDestinationAuthHandoff({client,userId:'B',storage}),null);
});
test('actual account-bound RPC pins A token through delayed Buffacoin transaction dispatch',async()=>{
 const dispatch=deferred();let actorToken='A-token',sentHeader;const client={auth:{getSession:async()=>({data:{session:{user:{id:'A'},access_token:actorToken}}})},rpc(){let header;return {setHeader(_name,value){header=value;return this;},then(resolve,reject){return dispatch.promise.then(()=>{sentHeader=header||`Bearer ${actorToken}`;return {data:{operation_id:'op',rating_id:'r',crawl_id:'c',new_balance:4}};}).then(resolve,reject);}};}};
 const bound=await boundary.accountBoundRpc(client,'A',()=>true);const {submitBuffacoinRatingTransaction}=await import('../lib/buffacoinRatingTransaction.js');const pending=submitBuffacoinRatingTransaction({supabase:bound,operationId:'op',destinationId:'d',stateCode:'NY',coinCost:1,rating:{}});actorToken='B-token';dispatch.resolve();await pending;assert.equal(sentHeader,'Bearer A-token');
});
