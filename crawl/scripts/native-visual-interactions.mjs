// Non-destructive navigation in the isolated native fixture client.
import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
const adb=path.join(process.env.LOCALAPPDATA,'Android/Sdk/platform-tools/adb.exe');
const run=(...args)=>execFileSync(adb,args,{maxBuffer:20*1024*1024,timeout:30000});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const out='artifacts/visual-polish-v2/completion/interactions';mkdirSync(out,{recursive:true});
const prefix=process.argv[2]?`${process.argv[2]}-`:'';
const size=[...run('shell','wm','size').toString().matchAll(/(\d+)x(\d+)/g)].at(-1);
const w=Number(size[1]),h=Number(size[2]);
const xml=()=>{const result=run('shell','uiautomator','dump','/sdcard/native-visual.xml').toString();return result.includes('dumped')?run('shell','cat','/sdcard/native-visual.xml').toString():'';};
async function waitFor(label) {
 for(let attempt=0;attempt<24;attempt++) {
  const state=xml();
  if(state.includes(`text="${label}"`)||state.includes(`content-desc="${label}"`)||(label==='Map'&&state.includes('Open Wingdex map')))return;
  await wait(1000);
 }
 throw new Error(`Screen did not expose ${label}`);
}
function press(label){
 const node=(xml().match(/<node\b[^>]*>/g)||[]).find(n=>n.includes(`text="${label}"`)||n.includes(`content-desc="${label}"`)||(label==='Map'&&n.includes('content-desc="Open Wingdex map"')));
 const b=node?.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);if(!b)throw new Error(`Missing ${label}`);
 run('shell','input','tap',String(Math.round((+b[1]+ +b[3])/2)),String(Math.round((+b[2]+ +b[4])/2)));
}
async function capture(name,required){await wait(2500);const state=xml();if(required&&!state.includes(required))throw new Error(`Missing ${required}`);writeFileSync(`${out}/${prefix}${name}-fixture.png`,run('exec-out','screencap','-p'));writeFileSync(`${out}/${prefix}${name}-fixture.xml`,state);}
press('Home navigation');await wait(500);run('shell','input','swipe',String(w*.5),String(h*.7),String(w*.5),String(h*.3),'400');await wait(500);
press('Find Wings');await capture('home-find-wings','Step 1 of 4');press('Close');await wait(500);
press('Wingdex navigation');await waitFor('Map');
press('Map');await waitFor('Restaurants Map');await capture('wingdex-map-access','Restaurants Map');press('Close');await wait(500);
press('Profile navigation');await wait(700);
run('shell','input','swipe',String(w*.5),String(h*.3),String(w*.5),String(h*.8),'400');await wait(500);
await waitFor('Rating history');press('Rating history');await capture('journey-rating-history');run('shell','input','keyevent','4');await wait(500);
console.log('Fixture navigation: Find Wings, map access/fallback, rating history captured.');
