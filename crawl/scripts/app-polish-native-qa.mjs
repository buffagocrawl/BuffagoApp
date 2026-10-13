// Local synthetic Android UI checks. No upload/restaurant/production write path.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const adbPath=path.join(process.env.LOCALAPPDATA,'Android/Sdk/platform-tools/adb.exe');
const adb=(...args)=>execFileSync(adbPath,args,{timeout:30000,maxBuffer:30*1024*1024});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const out=path.resolve(process.env.BUFFAGO_POLISH_QA_ARTIFACT_ROOT || '../artifacts/app-polish/native');mkdirSync(out,{recursive:true});
const xml=()=>{for(let i=0;i<3;i++){try{adb('shell','uiautomator','dump','--compressed','/sdcard/app-polish.xml');return adb('shell','cat','/sdcard/app-polish.xml').toString();}catch(error){if(i===2)throw error;}}};
const nodes=state=>state.match(/<node\b[^>]*>/g)||[];
const matching=(state,label)=>nodes(state).filter(n=>n.includes(`text="${label}"`)||n.includes(`content-desc="${label}"`)||n.includes(`hint="${label}"`)||n.includes(`resource-id="${label}"`));
const bounds=node=>{const m=node?.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);if(!m)throw Error('Missing node bounds');return m.slice(1).map(Number);};
const tap=async(label,index=0)=>{await delay(1200);const [x,y,r,b]=bounds(matching(xml(),label)[index]);adb('shell','input','tap',String(Math.round((x+r)/2)),String(Math.round((y+b)/2)));await delay(700);};
const wait=async label=>{for(let i=0;i<20;i++){const state=xml();if(matching(state,label).length)return state;await delay(500);}throw Error(`Missing ${label}`);};
const capture=async name=>{await delay(600);const state=xml();writeFileSync(path.join(out,`${name}.png`),adb('exec-out','screencap','-p'));writeFileSync(path.join(out,`${name}.xml`),state);return state;};
const openFixture=async()=>{adb('shell','am','start','-a','android.intent.action.VIEW','-d','buffago://dev-app-polish','com.buffago.app');await wait('Local app polish fixtures');};
const bundle=await fetch('http://127.0.0.1:8086/node_modules/expo-router/entry.bundle?platform=android&dev=true&minify=false');
const source=await bundle.text();assert.ok(bundle.ok&&source.includes('Fixture network boundary blocked')&&source.includes('Local verification retry; no restaurant created.'),'Opt-in isolated Metro fixture required');
const scenario=process.argv[2];
if(scenario==='statusbar'){
  await openFixture();await tap('Test Wing Shot framing');await wait('Choose from Library');await tap('Choose from Library');await wait('Frame your Wing Shot');
  await capture('statusbar-modal-open');adb('shell','input','keyevent','KEYCODE_HOME');await delay(600);
  adb('shell','am','start','-a','android.intent.action.MAIN','-c','android.intent.category.LAUNCHER','-n','com.buffago.app/.MainActivity');
  await wait('Frame your Wing Shot');await delay(700);await capture('statusbar-modal-foreground');
  await tap('Cancel');await tap('Not now, close Wing Shot');await wait('Local app polish fixtures');await capture('statusbar-after-dismissal');
  adb('shell','input','keyevent','KEYCODE_HOME');await delay(500);adb('shell','am','start','-a','android.intent.action.MAIN','-c','android.intent.category.LAUNCHER','-n','com.buffago.app/.MainActivity');
  await wait('Local app polish fixtures');await capture('statusbar-app-foreground');
}else if(scenario==='confidence'){
  await openFixture();await tap('Test Wingman confidence');await wait('Restaurant name');await tap('Search');
  await wait('Restaurant-match confidence: 95%');await wait('Wing confidence: 50%');await capture('wingman-confidence-50');await tap('Close');
}else if(scenario==='focus'){
  if (!matching(xml(),'Town or city').length) { await openFixture();await tap('Test Wingman focus');await wait('Restaurant name');await tap('Search');await wait('Town or city'); }
  await delay(500);let state=await capture('wingman-town-keyboard');
  assert.ok(matching(state,'wingman-city').some(n=>n.includes('focused="true"')),'Town must own focus');
  adb('shell','input','text','Buffalo');await tap('Search');await wait('More details');
  state=await capture('wingman-details-keyboard');assert.ok(matching(state,'wingman-extra-info').some(n=>n.includes('focused="true"')),'Details must own focus');
  // ADB injects hardware key events: two R keys trigger RN's development
  // reload shortcut even in a native modal. Use IME-equivalent safe test text.
  adb('shell','input','text','Main%sSt');await capture('wingman-entered-details');await tap('Search');await wait('Local verification retry; no restaurant created.');
  await capture('wingman-verification-retry');await tap('Close');
}else if(scenario==='gallery'){
  await openFixture();await capture('inline-first');
  let state=xml();const [x,y,r,b]=bounds(matching(state,'Open approved restaurant photo')[0]);
  adb('shell','input','swipe',String(r-60),String((y+b)/2),String(x+60),String((y+b)/2),'450');await wait('2 of 2');
  await capture('inline-swiped');await tap('Open approved restaurant photo');await wait('Close photo');await wait('2 of 2');await capture('viewer-tapped-second');
  await tap('Like, 0');await wait('Like, 1');await capture('viewer-vote');await tap('Close photo');
  await wait('Like, 1');await capture('inline-vote-synchronized');
  // Scroll the outer screen vertically; the horizontal strip must not trap it.
  adb('shell','input','swipe','580','1900','580','650','500');await wait('Restaurant detail — same votes');
  const detailPhotos=matching(xml(),'Open approved restaurant photo');
  const [dx,dy,dr,db]=bounds(detailPhotos.at(-1));
  adb('shell','input','swipe',String(dx+60),String((dy+db)/2),String(dr-60),String((dy+db)/2),'450');await delay(900);
  const synchronized=await capture('restaurant-detail-synchronized');
  assert.ok(matching(synchronized,'Like, 1').length>=2,'Inline and detail must show the same selected vote');
  await tap('Like, 1',1);await wait('Like, 0');await capture('detail-withdrawal-synchronized');
}else if(scenario==='frame-pinch'){
  await openFixture();await tap('Test Wing Shot framing');await wait('Choose from Library');await tap('Choose from Library');await wait('Frame your Wing Shot');
  await capture('pinch-before');
  const [x,y,r,b]=bounds(matching(xml(),'Final square photo crop')[0]);
  const gesture=adb('shell','am','instrument','-w','-e','x',String((x+r)/2),'-e','y',String((y+b)/2),'-e','from','180','-e','to','540','com.buffago.polishqa/com.buffago.polishqa.PinchInstrumentation').toString();
  assert.ok(gesture.includes('two-pointer pinch injected')&&!gesture.includes('error='),gesture);
  writeFileSync(path.join(out,'pinch-injection.txt'),gesture);
  await capture('pinch-after');
  adb('shell','input','swipe',String((x+r)/2),String((y+b)/2),String(x+30),String(y+30),'550');await capture('pinch-and-drag-confirmed-frame');
  await tap('Confirm framing');await wait('Your selected wing photo');await delay(1200);
  assert.ok(matching(xml(),'Replace selected Wing Shot').some(node=>node.includes('enabled="true"')),'Synthetic validation must finish');
  await capture('pinch-and-drag-confirmed-preview');await tap('Not now, close Wing Shot');
}else if(scenario==='frame'){
  await openFixture();await tap('Test Wing Shot framing');await wait('Choose from Library');await tap('Choose from Library');await wait('Frame your Wing Shot');
  await capture('framing-initial');
  const [x,y,r,b]=bounds(matching(xml(),'Final square photo crop')[0]);
  adb('shell','input','swipe',String((x+r)/2),String((y+b)/2),String(x+20),String(y+20),'500');await capture('framing-dragged');
  await tap('Reset');await capture('framing-reset');await tap('Cancel');await wait('Choose from Library');
  await tap('Choose from Library');await wait('Frame your Wing Shot');
  adb('shell','input','swipe',String((x+r)/2),String((y+b)/2),String(x+20),String((y+b)/2),'500');await capture('framing-confirmed-frame');
  await tap('Confirm framing');await wait('Your selected wing photo');await delay(1200);
  assert.ok(matching(xml(),'Replace selected Wing Shot').some(node=>node.includes('enabled="true"')),'Validation must finish before confirmation completes');
  await capture('framing-confirmed-preview');await tap('Not now, close Wing Shot');
}else if(scenario==='jury'){
  adb('shell','am','start','-a','android.intent.action.VIEW','-d','buffago://wing-jury','com.buffago.app');await wait('Wing photo to judge');
  await tap('Like');await wait('QA Harbor Wings');await capture('jury-vote');
  await tap('Dislike, 0');await wait('Dislike, 1');await capture('jury-vote-changed');
  await tap('Dislike, 1');await wait('Dislike, 0');await capture('jury-vote-withdrawn');
}else if(scenario==='wingdex'){
  adb('shell','am','start','-a','android.intent.action.VIEW','-d','buffago://home','com.buffago.app');await wait('Wingdex navigation');
  await tap('Wingdex navigation');await wait('Open approved restaurant photo');await capture('wingdex-inline');
  const [x,y,r,b]=bounds(matching(xml(),'Open approved restaurant photo')[0]);
  adb('shell','input','swipe',String(r-60),String((y+b)/2),String(x+60),String((y+b)/2),'450');await wait('2 of 2');await capture('wingdex-inline-swiped');
}else if(scenario==='snapshot') await capture(process.argv[3]||'snapshot');
else throw Error('Use focus, gallery, frame, jury, wingdex or snapshot');
console.log(JSON.stringify({scenario,passed:true,artifacts:out,pinch:scenario==='frame-pinch'?'Two-pointer gesture injected on Android emulator; physical device QA remains outstanding.':'Not exercised in this scenario.'}));
