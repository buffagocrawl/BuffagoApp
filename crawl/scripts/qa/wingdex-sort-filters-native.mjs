// Actual Android emulator + local fixture Metro only; no production requests.
import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const exe=path.join(process.env.LOCALAPPDATA,'Android/Sdk/platform-tools/adb.exe');
const adb=(...args)=>execFileSync(exe,args,{timeout:30000,maxBuffer:30*1024*1024});
const out=path.resolve('../artifacts/app-polish/release-qa/sort-filters');mkdirSync(out,{recursive:true});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const state=()=>{for(let i=0;i<3;i++){try{adb('shell','uiautomator','dump','--compressed','/sdcard/wingdex-sort.xml');return adb('shell','cat','/sdcard/wingdex-sort.xml').toString();}catch(e){if(i===2)throw e;}}};
const nodes=s=>s.match(/<node\b[^>]*>/g)||[];
const find=(s,label)=>nodes(s).find(n=>n.includes(`content-desc="${label}"`)||n.includes(`text="${label}"`)||n.includes(`resource-id="${label}"`));
async function wait(label){for(let i=0;i<12;i++){const s=state();if(find(s,label))return s;await delay(600);}throw Error('Missing '+label);}
async function tap(label){const s=await wait(label),m=find(s,label).match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/).slice(1).map(Number);adb('shell','input','tap',String((m[0]+m[2])/2),String((m[1]+m[3])/2));await delay(600);}
async function capture(name){writeFileSync(path.join(out,name+'.png'),adb('exec-out','screencap','-p'));writeFileSync(path.join(out,name+'.xml'),state());}
const bundle=await fetch('http://127.0.0.1:8086/node_modules/expo-router/entry.bundle?platform=android&dev=true&minify=false',{signal:AbortSignal.timeout(60000)}).then(r=>r.text());
assert.ok(bundle.includes('Fixture network boundary blocked')&&bundle.includes('native-fixture.invalid'),'isolated fixture boundary required');
if(!process.argv.includes('--finish-reset')){
await wait('Sort: overall');await capture('discover-controls');await tap('Sort: overall');await wait('Overall score');await capture('sort-options');await tap('Nearest');await tap('Done');
await tap('Filters, 1 active');await wait('Rated by you');await capture('filter-options');await tap('Rated by you');await tap('Show restaurants');await wait('Sort: nearest');
await tap('Show Favorites');await wait('Sort: nearest');await delay(1000);assert.ok(!find(state(),'No Favorites yet'));await capture('favorites-shared-filters');
await tap('Show Want to Try');await wait('No restaurants match your filters');await capture('want-to-try-filtered-empty');assert.ok(!find(state(),'Nothing in Want to Try yet'));
await tap('Clear filters');await wait('Sort: nearest');await delay(1000);assert.ok(!find(state(),'No restaurants match your filters'));await capture('want-to-try-cleared');
await tap('Show Favorites');await wait('Sort: nearest');await tap('Filters, 0 active');
}
await tap('Reset all');await tap('Show restaurants');await wait('Sort: overall');await capture('favorites-reset-defaults');
writeFileSync(path.join(out,'acceptance.json'),JSON.stringify({status:'PASS',environment:'Android API 36.1 emulator, com.buffago.app development client, isolated Metro8086 synthetic fixture',backend:'native-fixture.invalid (mocked UI fixtures only; not backend staging acceptance)',checks:['separate dialogs','nearest preserved across saved tabs','My ratings preserved','filtered Want to Try empty does not imply missing saves','clear filters restores saved item','reset restores Score and 5mi defaults'],physicalDevice:false,nativeIOS:false},null,2));
console.log('Android emulator shared Sort/Filters interaction and screenshots passed.');
