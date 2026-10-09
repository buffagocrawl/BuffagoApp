// Local Android screenshots of the real screens with an isolated fixture client.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const adb = path.join(process.env.LOCALAPPDATA, 'Android/Sdk/platform-tools/adb.exe');
const variant = process.argv[4] || 'no-photo';
const out = 'artifacts/visual-polish-v2/completion' + (variant === 'approved' ? '/approved' : '');
mkdirSync(out, { recursive: true });
const run = (...args) => execFileSync(adb, args, { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 20 * 1024 * 1024, timeout: 30000 });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const captures = [];
let metroReady = false;
for (let attempt=0;attempt<30;attempt++) {
  try { metroReady = (await fetch('http://127.0.0.1:8081/status')).ok; } catch {}
  if (metroReady) break;
  await wait(2000);
}
if (!metroReady) throw new Error('Local Metro is not ready');
const widths = process.argv[2] ? [Number(process.argv[2])] : [320, 360, 390, 430];
const scale = Number(process.argv[3] || 1);
for (const width of widths) {
  const height = {320:740,360:800,390:844,430:932}[width];
  const w = width * 3, h = height * 3;
  run('shell', 'wm', 'size', `${w}x${h}`);
  run('shell', 'wm', 'density', '480');
  run('shell', 'settings', 'put', 'system', 'font_scale', String(scale));
  run('reverse', 'tcp:8081', 'tcp:8081');
  run('shell', 'am', 'force-stop', 'com.buffago.app');
  run('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'buffago://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081', 'com.buffago.app');
  await wait(14000);
  let appReady = false;
  for (let attempt=0;attempt<36;attempt++) {
    run('shell','uiautomator','dump','/sdcard/native-ready.xml');
    if (run('shell','cat','/sdcard/native-ready.xml').toString().includes('Profile navigation')) { appReady = true; break; }
    await wait(5000);
  }
  if (!appReady) throw new Error('Authenticated fixture screen did not become ready');
  const tap = (x,y) => run('shell','input','tap',String(Math.round(x)),String(Math.round(y)));
  const swipe = (x1,y1,x2,y2) => run('shell','input','swipe',String(Math.round(x1)),String(Math.round(y1)),String(Math.round(x2)),String(Math.round(y2)),'450');
  const ui = () => {
    run('shell','uiautomator','dump','/sdcard/native-visual.xml');
    return run('shell','cat','/sdcard/native-visual.xml').toString();
  };
  const waitFor = async label => {
    for (let attempt=0;attempt<20;attempt++) {
      if (ui().includes(label)) return;
      await wait(1500);
    }
    throw new Error(`Screen did not expose ${label}`);
  };
  const bounds = label => {
    const node=(ui().match(/<node\b[^>]*>/g)||[]).find(n=>n.includes(`text="${label}"`)||n.includes(`content-desc="${label}"`));
    const b=node?.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
    return b && Number(b[3])-Number(b[1])>40 && Number(b[4])-Number(b[2])>40 ? {x:(Number(b[1])+Number(b[3]))/2,y:(Number(b[2])+Number(b[4]))/2, selected:node.includes('selected="true"')} : null;
  };
  const capture = async name => {
    await wait(1800);
    const file = `${out}/${width}-font${scale}-${name}-fixture.png`;
    writeFileSync(file, run('exec-out','screencap','-p'));
    captures.push({ file, width, height, fontScale:scale, fixture:true });
  };
  tap(w*.1,h-110); await capture(`home-top-${variant === 'approved' ? 'approved-photo' : 'no-photo'}`);
  swipe(w*.5,h*.7,w*.5,h*.3); await capture('home-scrolled');
  if (process.argv[5] === 'home') { console.log(`Captured Home ${width}dp font ${scale}`); continue; }
  tap(w*.3,h-110); await capture('crawls');
  const rail=bounds('All routes');
  if(rail) swipe(w*.8,rail.y,w*.15,rail.y);
  await capture('crawls-filters-scrolled');
  tap(w*.5,h-110); await waitFor('Showing places within 5 mi'); await capture(`wingdex-5mi-${variant}`);
  for(const miles of [10,25,50]) {
    let option=null;
    for(let attempt=0;attempt<5 && !option;attempt++) {
      option=bounds(`${miles} miles`);
      if(option) break;
      const visibleRadius=[5,10,25,50].map(mi=>bounds(`${mi} miles`)).find(Boolean);
      if(!visibleRadius) throw new Error('Wingdex radius rail is not visible');
      swipe(w*.75,visibleRadius.y,w*.25,visibleRadius.y);
      await wait(700);
    }
    if(!option) throw new Error(`${miles} mile option could not be reached`);
    tap(option.x,option.y); await waitFor(`Showing places within ${miles} mi`);
    if(!bounds(`${miles} miles`)?.selected) throw new Error(`${miles} mile option did not select`);
    await capture(`wingdex-${miles}mi`);
  }
  tap(w*.7,h-110); await capture('social-feed');
  const feed=bounds('Feed'); if(feed) swipe(w*.8,feed.y,w*.15,feed.y);
  await capture('social-filters');
  tap(w*.9,h-110); await capture('journey-profile');
  swipe(w*.5,h*.75,w*.5,h*.3); await capture('journey-statistics');
  swipe(w*.5,h*.75,w*.5,h*.3); await capture('journey-creator-challenges');
  console.log(`Captured ${width}dp font ${scale}`);
}
writeFileSync(`${out}/manifest-${widths.join('-')}-font${scale}.json`,JSON.stringify(captures,null,2));
