import test from 'node:test';
import assert from 'node:assert/strict';
import { mobileModule, hookRuntime } from './helpers/mobile-runtime.mjs';
const id='11111111-1111-4111-8111-111111111111';
const nodes=t=>!t?[]:Array.isArray(t)?t.flatMap(nodes):[t,...nodes(t.props?.children)];
const flush=async()=>{for(let i=0;i<150;i++)await Promise.resolve();};
function harness({confirmation=false,saved=null,callback=false,provider='google',returnPath='/(tabs)/home',oauthOutcome='callback'}={}) {
 const runtime=hookRuntime(), values=new Map(), routes=[], events=[];
 const storage={getItem:async k=>values.get(k)||null,setItem:async(k,v)=>values.set(k,v),removeItem:async k=>values.delete(k),multiRemove:async keys=>keys.forEach(k=>values.delete(k))};
 const intent=mobileModule('lib/wingShotAuthIntent.js',{});
 let current=null,listener=()=>{},badPassword=false,oauthActive=callback,signupCalls=0,seedWrites=0;
 const account={id:'synthetic-account',is_anonymous:false,user_metadata:{username:'tester'}};
 const session=()=>({user:current});
 const authenticate=()=>{current=account;listener('SIGNED_IN',session());return {data:{session:session(),user:current}};};
 const client={auth:{
   getUser:async()=>({data:{user:current}}),getSession:async()=>({data:{session:current?session():null}}),
   onAuthStateChange:fn=>{listener=fn;return {data:{subscription:{unsubscribe(){}}}};},
   signInWithPassword:async()=>badPassword?{error:Error('invalid credentials')} : confirmation&&!current?{error:Error('Email not confirmed')}:authenticate(),
   signUp:async()=>{signupCalls++;return confirmation?{data:{user:account,session:null}}:authenticate();},
   exchangeCodeForSession:async()=>authenticate(),setSession:async()=>authenticate(),signOut:async()=>{current=null;},resetPasswordForEmail:async()=>({}),
 },from:()=>({select(){return this;},eq(){return this;},ilike(){return this;},limit:async()=>({data:[]}),maybeSingle:async()=>({data:{username:'tester'}}),upsert:async()=>({})})};
 const oauth={clearOAuthFlowState:async()=>{oauthActive=false;},isOAuthFlowInProgress:async()=>oauthActive,
 facebookConfigChecklist:()=>({}),getFacebookRedirectUrl:()=>'',sanitizeAuthError:()=>({}),describeUrl:()=>({}),
 clearStoredLinkSessionSnapshot:async()=>{},getStoredLinkSessionSnapshot:async()=>null,
 runSocialOAuth:async()=>{oauthActive=true;if(oauthOutcome==='error'){oauthActive=false;throw Error('synthetic provider failure');}if(oauthOutcome==='cancelled'){oauthActive=false;return {outcome:'cancelled'};}authenticate();await flush();return {outcome:'callback'};},
 };
 for(const name of ['OAUTH_FLOW_ID_KEY','OAUTH_FLOW_MODE_KEY','OAUTH_PROVIDER_KEY','OAUTH_FLOW_STARTED_AT_KEY','OAUTH_LINK_USER_ID_KEY','OAUTH_RETURN_PATH_KEY','OAUTH_RETURN_URL_KEY'])oauth[name]=name;
 if(callback){values.set(oauth.OAUTH_PROVIDER_KEY,provider);values.set(oauth.OAUTH_FLOW_MODE_KEY,'sign_in');values.set(oauth.OAUTH_RETURN_PATH_KEY,returnPath);}
 const paper={useTheme:()=>({colors:{}})};
 for(const name of ['Text','TextInput','Button','Card','HelperText','ActivityIndicator','SegmentedButtons','Snackbar'])paper[name]=name;
 paper.TextInput=Object.assign(()=>{}, {Icon:'icon'});paper.Card=Object.assign(()=>{},{Content:'card-content'});
 const imports={react:runtime.react,'react/jsx-runtime':runtime.jsx,'react-native':{View:'view',Pressable:'press',ScrollView:'scroll',KeyboardAvoidingView:'keyboard',Platform:{OS:'android'},StyleSheet:{create:x=>x},ActivityIndicator:'spinner',Text:'text'},
 '@expo/vector-icons':{MaterialCommunityIcons:'icon'},'@react-native-async-storage/async-storage':storage,'expo-crypto':{randomUUID:()=>id},
 'expo-router':{useRouter:()=>({replace:r=>routes.push(r),back:()=>routes.push('back'),canGoBack:()=>false}),useLocalSearchParams:()=>({code:'synthetic-code'})},
 'expo-linking':{useURL:()=>callback?'buffago://auth/callback?code=synthetic-code':null,getInitialURL:async()=>null},
 'react-native-paper':paper,'../../lib/supabase.js':{supabase:client},'../../lib/supabase':{supabase:client},
 '../../lib/wingShotAuthIntent':intent,'../../lib/passwordSignInFlow':mobileModule('lib/passwordSignInFlow.js',{'./passwordAuthTimeout.js':mobileModule('lib/passwordAuthTimeout.js',{})}),
 '../../lib/debugLog':{dbg:async()=>{}},'../../lib/facebookOAuth':oauth,'../../lib/socialAuthHelpers':mobileModule('lib/socialAuthHelpers.js',{}),
 '../../config/features':{ENABLE_GOOGLE_AUTH:true},'../../lib/analytics':{trackEvent:async e=>events.push(e)},
 '../../lib/savedDestinations.js':{claimSavedDestinationIntent:async()=>saved,claimSavedDestinationAuthHandoff:async()=>saved},
 '../../lib/buffacoinRatingTransaction':{submitBuffacoinRatingTransaction:async()=>{seedWrites++;}},
 '../../lib/authCallbackHelpers':mobileModule('lib/authCallbackHelpers.js',{}),
 '../../lib/accountBoundary.js':{accountKey:u=>u?.id||'guest'},
 '../../lib/socialAccounts':{refreshLinkedProviders:async()=>({facebook:provider==='facebook',providers:[provider],identities:[]}),persistFacebookConnection:async()=>({connected:true,newlyConnected:false}),grantFacebookLinkRewardOnce:async()=>{}},
 };
 const Component=mobileModule(callback?'app/auth/callback.jsx':'app/auth/login.jsx',imports).default;
 const render=()=>runtime.render(Component,{});
 const button=(label)=>nodes(render()).find(n=>n.type==='Button'&&(n.props.children===label||n.props.testID===label));
 const fill=()=>{let tree=render();for(const [label,value] of [['Username','tester'],['Email','synthetic@example.invalid'],['Password','synthetic-password']])nodes(tree).find(n=>n.props?.label===label)?.props.onChangeText(value);render();};
 return {runtime,render,button,fill,routes,events,storage,values,intent,client,account,authenticate,signupCalls:()=>signupCalls,seedWrites:()=>seedWrites,setBad:v=>{badPassword=v;},setCurrent:v=>{current=v;}};
}
for(const method of ['signup','signin','confirmation'])test(`actual login component ${method} preserves local preview and reaches fixed uploader`,async()=>{
 const h=harness({confirmation:method==='confirmation'});await h.intent.saveWingShotIntent(h.storage,{destinationId:id,restaurantName:'Wings'});
 h.values.set('buffago:onboarding:seed_rating',JSON.stringify({onboarding_version:'v2',destination_id:id}));h.values.set('buffago:guest_rating_preview:v1','preview');
 h.render();h.fill();
 if(method==='signin')nodes(h.render()).find(n=>n.type==='SegmentedButtons').props.onValueChange('signin');
 await h.button('auth.signin.native-action').props.onPress();await flush();
 if(method==='confirmation'){
   assert.equal(h.routes.length,0);assert.ok([...h.values.keys()].some(k=>k.includes('onboarding-return')));
   h.runtime.unmount(); // new login runtime emulates a cold restart, same storage
   const later=harness();for(const [k,v]of h.values)later.values.set(k,v);
   later.render();later.fill();nodes(later.render()).find(n=>n.type==='SegmentedButtons').props.onValueChange('signin');
   await later.button('auth.signin.native-action').props.onPress();await flush();assert.equal(later.routes[0]?.params.destinationId,id);later.runtime.unmount();
 }else assert.equal(h.routes[0]?.params.destinationId,id);
 assert.equal(h.seedWrites(),0);assert.equal(h.values.get('buffago:guest_rating_preview:v1'),'preview');h.runtime.unmount();
});
test('wrong password retry, double signup tap and explicit Explore do not lose preview or duplicate navigation',async()=>{
 const h=harness();await h.intent.saveWingShotIntent(h.storage,{destinationId:id});h.render();h.fill();
 nodes(h.render()).find(n=>n.type==='SegmentedButtons').props.onValueChange('signin');h.setBad(true);
 await h.button('auth.signin.native-action').props.onPress();await flush();assert.equal(h.routes.length,0);
 h.setBad(false);await h.button('auth.signin.native-action').props.onPress();await flush();assert.equal(h.routes.length,1);h.runtime.unmount();
 const s=harness();s.render();s.fill();const press=s.button('auth.signin.native-action').props.onPress;await Promise.all([press(),press()]);await flush();assert.equal(s.signupCalls(),1);assert.equal(s.routes.length,1);s.runtime.unmount();
 const c=harness();await c.intent.saveWingShotIntent(c.storage,{destinationId:id});c.render();await c.button('Explore BuffaGo').props.onPress();assert.equal(await c.intent.claimWingShotIntent({storage:c.storage,client:c.client,userId:c.account.id}),null);c.runtime.unmount();
});
for(const provider of ['google','facebook']){
 test(`actual login ${provider} session listener defers to OAuth callback, cancel and error permit retry`,async()=>{
  for(const outcome of ['callback','cancelled','error']){const h=harness({provider,oauthOutcome:outcome});await h.intent.saveWingShotIntent(h.storage,{destinationId:id});h.render();await h.button(`auth.${provider}.button`).props.onPress();await flush();
  assert.deepEqual(h.routes,outcome==='callback'?['/auth/callback']:[]);assert.ok([...h.values.keys()].some(k=>k.includes('onboarding-return')));h.runtime.unmount();}
 });
 test(`actual ${provider} callback deep-link code exchange sends current user to original restaurant`,async()=>{
  const h=harness({callback:true,provider});await h.intent.saveWingShotIntent(h.storage,{destinationId:id});h.render();await flush();await new Promise(r=>setTimeout(r,70));await flush();assert.equal(h.routes.length,1);assert.equal(h.routes[0]?.params.destinationId,id);assert.equal(h.routes[0]?.pathname,'/profile/wing-shots/submit');h.runtime.unmount();
 });
}
test('normal login and saved destination precedence remain intact',async()=>{
 for(const saved of [null,{destinationId:id,kind:'save',userId:'synthetic-account'}]){const h=harness({saved});if(saved)await h.intent.saveWingShotIntent(h.storage,{destinationId:id});h.render();h.fill();await h.button('auth.signin.native-action').props.onPress();await flush();assert.equal(saved?h.routes[0]?.pathname:h.routes[0],saved?'/(tabs)/ratings':'/(tabs)/home');h.runtime.unmount();}
});

test('legacy import cannot replay nested V2 local preview payloads',async()=>{
 const h=harness();h.values.set('buffago:onboarding:seed_rating',JSON.stringify({status:'local_preview',payload:{onboarding_version:'v2',destination_id:id,state_code:'NY',overall:8,sauce:8,meat:8,crispiness:8}}));
 h.render();h.fill();await h.button('auth.signin.native-action').props.onPress();await flush();assert.equal(h.seedWrites(),0);assert.ok(h.values.has('buffago:onboarding:seed_rating'));h.runtime.unmount();
});
test('callback rejects arbitrary return-route injection and preserves saved-action priority',async()=>{
 for(const returnPath of ['https://external.invalid/steal','/(tabs)/home?next=external','/profile/wing-shots/submit']){
  const h=harness({callback:true,returnPath});await h.intent.saveWingShotIntent(h.storage,{destinationId:id});h.render();await flush();await new Promise(r=>setTimeout(r,70));await flush();assert.equal(h.routes[0]?.pathname,'/profile/wing-shots/submit');h.runtime.unmount();
 }
 const h=harness({callback:true,saved:{destinationId:id,kind:'save',userId:'synthetic-account'}});await h.intent.saveWingShotIntent(h.storage,{destinationId:id});h.render();await flush();await new Promise(r=>setTimeout(r,70));await flush();assert.equal(h.routes[0]?.pathname,'/(tabs)/ratings');h.runtime.unmount();
});
for(const provider of ['google','facebook'])test(`actual ${provider} callback rejects anonymous user and permits retry without consuming Wing Shot`,async()=>{
 const h=harness({callback:true,provider});await h.intent.saveWingShotIntent(h.storage,{destinationId:id});
 const getUser=h.client.auth.getUser;h.client.auth.getUser=async()=>({data:{user:{id:'anonymous',is_anonymous:true}}});
 h.render();await flush();assert.equal(h.routes.length,0);assert.ok([...h.values.keys()].some(k=>k.includes('onboarding-return')));
 h.client.auth.getUser=getUser;await h.button('Retry callback').props.onPress();h.render();await flush();await new Promise(r=>setTimeout(r,70));await flush();assert.equal(h.routes[0]?.params.destinationId,id);h.runtime.unmount();
});
