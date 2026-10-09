// Native V2 closure matrix. Requires the isolated Metro fixture with radius QA enabled.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const adbPath = path.join(process.env.LOCALAPPDATA, 'Android/Sdk/platform-tools/adb.exe');
const adb = (...args) => execFileSync(adbPath, args, { timeout: 30000, maxBuffer: 20 * 1024 * 1024 });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const width = Number(process.argv[2]);
const fontScale = Number(process.argv[3]);
const height = { 320: 740, 360: 800, 390: 844, 430: 932 }[width];
if (!height || ![1, 1.3].includes(fontScale)) throw new Error('Usage: node scripts/native-v2-closure.mjs <320|360|390|430> <1|1.3>');
const w = width * 3, h = height * 3;
const out = `artifacts/consolidation-native/targeted-flows`;
mkdirSync(out, { recursive: true });
const resumeMap = !process.argv.includes('--radius');
const result = { width, fontScale, radii: {}, map: {}, tabs: [] };
const ui = async () => {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = adb('shell', 'uiautomator', 'dump', '/sdcard/native-v2-closure.xml').toString();
      if (response.includes('dumped')) return adb('shell', 'cat', '/sdcard/native-v2-closure.xml').toString();
    } catch {}
    await wait(700);
  }
  throw new Error('Android accessibility dump unavailable');
};
const waitFor = async (label, present = true) => {
  for (let attempt = 0; attempt < 20; attempt++) {
    let xml = '';
    try { xml = await ui(); } catch { await wait(1300); continue; }
    if (xml.includes(label) === present) return xml;
    await wait(1300);
  }
  throw new Error(`${label} did not become ${present ? 'visible' : 'hidden'}`);
};
const nodeFor = (xml, label) => {
  const node = (xml.match(/<node\b[^>]*>/g) || []).find(item => item.includes(`content-desc="${label}"`) || item.includes(`text="${label}"`) || item.includes(`resource-id="${label}"`));
  const bounds = node?.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
  if (!bounds) return null;
  const [left, top, right, bottom] = bounds.slice(1).map(Number);
  return { left, top, right, bottom, width: right - left, height: bottom - top, selected: node.includes('selected="true"') };
};
const tapNode = async label => {
  const bounds = nodeFor(await ui(), label);
  if (!bounds || bounds.width < 40 || bounds.height < 40) throw new Error(`${label} has no usable touch bounds`);
  adb('shell', 'input', 'tap', String(Math.round((bounds.left + bounds.right) / 2)), String(Math.round((bounds.top + bounds.bottom) / 2)));
  return bounds;
};
const swipe = (x1, y1, x2, y2) => adb('shell', 'input', 'swipe', ...[x1, y1, x2, y2].map(value => String(Math.round(value))), '450');
const capture = async name => {
  await wait(1300);
  writeFileSync(`${out}/${name}.png`, adb('exec-out', 'screencap', '-p'));
  writeFileSync(`${out}/${name}.xml`, await ui());
};
const navigate = async (label, ready) => {
  await tapNode(label);
  await waitFor(ready);
};


const outcomes = {};
async function step(name, fn) { try { await fn(); outcomes[name]='PASS'; } catch(e) { outcomes[name]='BLOCKED: '+e.message; await capture(name+'-blocked'); } writeFileSync(out+'/result.json',JSON.stringify(outcomes,null,2)); console.log(name+': '+outcomes[name]); }
const back = () => adb('shell','input','keyevent','4');
await step('home-find-wings',async()=>{
 await navigate('Home navigation','Wing Scout');
 for(let i=0;i<4 && !nodeFor(await ui(),'Find Wings');i++) {swipe(w*.5,h*.75,w*.5,h*.3);await wait(400);}
 await tapNode('Find Wings'); await waitFor('Step 1 of 4'); await capture('home-find-wings'); await tapNode('Close'); await waitFor('Step 1 of 4',false);
});
await step('social-modes-filters',async()=>{
 await navigate('Social navigation','Feed'); await tapNode('All'); await waitFor('Latest wing ratings'); await capture('social-feed-all');
 await tapNode('Leaderboard'); await waitFor('Ratings'); await wait(500); await capture('social-leaderboard');
 let state=await ui();const header=nodeFor(state,'Leaderboard');
 if(!header)throw Error('Leaderboard rail unavailable');
 swipe(w*.8,(header.top+header.bottom)/2,w*.2,(header.top+header.bottom)/2);await wait(500);
 await tapNode('Friends'); await waitFor('Wing Friends'); await wait(500); await capture('social-friends');
});
await step('crawls-map-details',async()=>{
 await navigate('Crawls navigation','QA Buffalo Classics');await tapNode('Open routes map'); await waitFor('Routes Map');await wait(4000);await capture('crawls-map-open');await tapNode('Close');await waitFor('Routes Map',false);
 const title=nodeFor(await ui(),'QA Buffalo Classics');if(!title)throw Error('Route title missing');adb('shell','input','tap',String((title.left+title.right)/2),String((title.top+title.bottom)/2));await waitFor('Stops');await capture('crawls-details');back();await waitFor('Stops',false);
});
await step('background-resume',async()=>{
 await navigate('Wingdex navigation','Showing places within');adb('shell','input','keyevent','3');await wait(1000);adb('shell','am','start','-n','com.buffago.app/.MainActivity');await waitFor('Wingdex navigation');await capture('background-resume');
});
await step('crawls-resume',async()=>{await navigate('Crawls navigation','Resume crawl');await tapNode('Resume crawl');await wait(5000);await capture('crawls-resume');const state=await ui();if(state.includes('Resume crawl') && state.includes('Crawls navigation'))throw Error('Resume did not leave crawl list');});
console.log('Targeted native flows completed');


