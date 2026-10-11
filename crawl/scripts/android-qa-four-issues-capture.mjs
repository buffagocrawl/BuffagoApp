// Real Android development client + isolated fixture backend; never production auth/writes.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const adb = path.join(process.env.LOCALAPPDATA,'Android/Sdk/platform-tools/adb.exe');
const run = (...args) => execFileSync(adb,args,{timeout:30000,maxBuffer:20*1024*1024});
const wait = ms => new Promise(r=>setTimeout(r,ms));
const out='../docs/android-qa-four-issues/screenshots'; mkdirSync(out,{recursive:true});
const mode=process.argv[2]||'signed-in';
const xml=()=>{const result=run('shell','uiautomator','dump','/sdcard/four-issues.xml').toString();if(!result.includes('dumped to:'))return '';return run('shell','cat','/sdcard/four-issues.xml').toString();};
function bounds(source,label) {
  const nodes=[...source.matchAll(/<node\b[^>]*>/g)].map(m=>m[0]);
  const node=nodes.find(n=>n.includes(`content-desc="${label}"`)||n.includes(`text="${label}"`));
  if(!node)return null;
  const m=node.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
  return {x:(+m[1]+ +m[3])/2,y:(+m[2]+ +m[4])/2,left:+m[1],top:+m[2],right:+m[3],bottom:+m[4],selected:node.includes('selected="true"')};
}
async function until(label){for(let i=0;i<12;i++){let source='';try { source=xml(); } catch {} if(bounds(source,label))return source;await wait(1000);}throw Error(`Missing ${label}`);}
const tap=async label=>{const b=bounds(await until(label),label);run('shell','input','tap',String(Math.round(b.x)),String(Math.round(b.y)));await wait(500);};
const capture=name=>{const source=xml();writeFileSync(`${out}/${name}.xml`,source);writeFileSync(`${out}/${name}.png`,run('exec-out','screencap','-p'));};
const results=[];
let ready=false;
for(let attempt=0;attempt<40;attempt++) {
  try { ready=(await fetch('http://127.0.0.1:8081/status',{signal:AbortSignal.timeout(2000)})).ok; } catch {}
  if(ready)break;
  await wait(1000);
}
assert.ok(ready,'Local fixture Metro is not ready');
// Warm the local manifest before launching: slow first config resolution can
// otherwise time out the existing development client while Metro starts.
const manifest=await (await fetch('http://127.0.0.1:8081/',{headers:{'expo-platform':'android'},signal:AbortSignal.timeout(60000)})).json();
await (await fetch(manifest.launchAsset.url,{signal:AbortSignal.timeout(60000)})).arrayBuffer();
for(const width of (process.argv[3]?.split(',').map(Number) || (mode==='signed-in'?[360,390,412,430]:[390]))) {
  for(const scale of (process.argv[4]?.split(',').map(Number) || (mode==='signed-in'?[1,1.3]:[1]))) {
    const height={360:800,390:844,412:915,430:932}[width];
    run('shell','wm','size',`${width*3}x${height*3}`);run('shell','wm','density','480');
    run('shell','settings','put','system','font_scale',String(scale));run('reverse','tcp:8081','tcp:8081');
    run('shell','am','force-stop','com.buffago.app');
    run('shell','am','start','-a','android.intent.action.VIEW','-d','buffago://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081','com.buffago.app');
    if(['welcome','early-bird'].includes(mode)) {
      await until(mode==='welcome'?'Welcome Bonus — 100 BuffaCoins':'Early Bird Bonus — 250 BuffaCoins');
      capture(`${mode}-notice-390dp`);
      await tap('Got it'); await tap('Wingdex navigation'); await until('50 miles');
      capture(`${mode}-balance-390dp`);
      results.push({mode,width,fontScale:scale,committedBonusNotice:true});
      console.log(JSON.stringify(results.at(-1)));
      continue;
    }
    await until(mode==='guest'?'Sign in navigation':'Profile navigation');
    await tap('Wingdex navigation');await until('50 miles');
    const source=await until('Most photos');
    for(const label of ['5 miles','10 miles','25 miles','50 miles','100 miles','250 miles','Overall score','Nearest','Most ratings','Most photos']) {
      const b=bounds(source,label);assert.ok(b,`${width}/${scale}: ${label} missing`);
      assert.ok(b.left>=0&&b.right<=width*3,`${label} clipped horizontally`);
      assert.ok(b.bottom<=height*3-120,`${label} hidden under navigation`);
      assert.ok(b.bottom-b.top>=48*3-2,`${label} touch height below 48dp`);
    }
    capture(`${mode}-wingdex-${width}dp-font${scale}`);
    await tap('Wing Jury');await until('Wing photo to judge');
    capture(`${mode}-jury-${width}dp-font${scale}`);
    run('shell','input','keyevent','4');await until('50 miles');
    if(mode==='signed-in' && width===360 && scale===1 && process.argv[5]==='behavior') {
      for(const miles of [5,10,25,50,100,250]) {await tap(`${miles} miles`);const next=await until(`${miles} miles`);assert.ok(bounds(next,`${miles} miles`).selected,`${miles} did not select`);}
      for(const label of ['Overall score','Nearest','Most ratings','Most photos']) {await tap(label);assert.ok(bounds(xml(),label).selected,`${label} did not select`);}
    }
    for(const label of ['Home navigation','Crawls navigation','Wingdex navigation','Social navigation',mode==='guest'?'Sign in navigation':'Profile navigation']) assert.ok(bounds(xml(),label));
    results.push({mode,width,fontScale:scale,filtersFullyVisible:true,touchTargetsAtLeast48dp:true,juryRoute:true,backReturnsToWingdex:true,fiveTabs:true});
    console.log(JSON.stringify(results.at(-1)));
  }
}
writeFileSync(`${out}/verification-${mode}.json`,JSON.stringify(results,null,2));
