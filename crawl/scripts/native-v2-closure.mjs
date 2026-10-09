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
const out = `artifacts/visual-polish-v2/final-native/${width}-font${fontScale}`;
mkdirSync(out, { recursive: true });
const resumeMap = process.argv.includes('--resume-map');
const result = resumeMap
  ? { ...JSON.parse(readFileSync(`${out}/result.json`, 'utf8')), map: {}, tabs: [] }
  : { width, fontScale, radii: {}, map: {}, tabs: [] };
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

for (let attempt = 0; attempt < 30; attempt++) {
  try { if ((await fetch('http://127.0.0.1:8081/status')).ok) break; } catch {}
  if (attempt === 29) throw new Error('Metro unavailable');
  await wait(2000);
}
adb('shell', 'wm', 'size', `${w}x${h}`);
adb('shell', 'wm', 'density', '480');
adb('shell', 'settings', 'put', 'system', 'font_scale', String(fontScale));
adb('reverse', 'tcp:8081', 'tcp:8081');
adb('shell', 'am', 'force-stop', 'com.buffago.app');
adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'buffago://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081', 'com.buffago.app');
await waitFor('Home navigation');
await navigate('Wingdex navigation', 'Showing places within 5 mi');

if (!resumeMap) for (const miles of [5, 10, 25, 50]) {
  if (miles !== 5) {
    let option;
    for (let attempt = 0; attempt < 6; attempt++) {
      const xml = await ui();
      option = nodeFor(xml, `${miles} miles`);
      if (option?.width > 40 && option.height > 40) break;
      const visible = [5, 10, 25, 50].map(value => nodeFor(xml, `${value} miles`)).find(node => node?.width > 40 && node.height > 40);
      if (!visible) throw new Error('Radius rail disappeared');
      swipe(w * .76, (visible.top + visible.bottom) / 2, w * .25, (visible.top + visible.bottom) / 2);
      await wait(600);
    }
    if (!option || option.width <= 40) throw new Error(`${miles} mile chip cannot be reached`);
    adb('shell', 'input', 'tap', String(Math.round((option.left + option.right) / 2)), String(Math.round((option.top + option.bottom) / 2)));
  }
  const xml = await waitFor(`Showing places within ${miles} mi`);
  const selected = nodeFor(xml, `${miles} miles`);
  if (!selected?.selected) throw new Error(`${miles} mile chip is not selected`);
  await capture(`radius-${miles}-selected`);

  const names = new Set();
  for (let scroll = 0; scroll < 9; scroll++) {
    const current = await ui();
    for (const match of current.matchAll(/QA (8|18|38) Mile Wings/g)) names.add(Number(match[1]));
    swipe(w * .5, h * .74, w * .5, h * .31);
    await wait(350);
  }
  const observed = [...names].sort((a, b) => a - b);
  const expected = [8, 18, 38].filter(distance => distance <= miles);
  result.radii[miles] = { selected: true, observed, expected };
  if (JSON.stringify(observed) !== JSON.stringify(expected)) throw new Error(`${miles} mile results ${observed} differ from ${expected}`);
  await capture(`radius-${miles}-results`);
  writeFileSync(`${out}/result.json`, JSON.stringify(result, null, 2));
  for (let scroll = 0; scroll < 9; scroll++) swipe(w * .5, h * .31, w * .5, h * .78);
  await waitFor('Location');
  console.log(`${width}dp/${fontScale}: ${miles} miles selected; results ${observed.join(',') || 'nearby only'}`);
}

const tapMapAction = async () => {
  const xml = await ui();
  const action = nodeFor(xml, 'Open Wingdex map') || nodeFor(xml, 'Map');
  if (!action || action.width < 40 || action.height < 40) throw new Error('Wingdex Map action has no usable touch bounds');
  adb('shell', 'input', 'tap', String(Math.round((action.left + action.right) / 2)), String(Math.round((action.top + action.bottom) / 2)));
};
await tapMapAction();
let xml = await waitFor('Restaurants Map');
await wait(6000);
await capture('map-open');
const map = nodeFor(xml, 'Google Map');
if (!map || map.width < 200 || map.height < 200) throw new Error('Google Map surface missing');
const mx = (map.left + map.right) / 2, my = (map.top + map.bottom) / 2;
swipe(mx - map.width * .2, my, mx + map.width * .2, my + map.height * .12);
await capture('map-panned');
const zx = Math.round(mx - map.width * .15), zy = Math.round(my - map.height * .15);
adb('shell', `input tap ${zx} ${zy}; input tap ${zx} ${zy}`);
await capture('map-zoomed');
xml = await ui();
const close = nodeFor(xml, 'Close');
const nav = nodeFor(xml, 'Wingdex navigation');
const surface = nodeFor(xml, 'modal-surface');
if (!close || !nav || !surface || close.width < 44 * 3 || close.height < 44 * 3 || close.bottom >= nav.top || surface.bottom >= nav.top) throw new Error(`Map dialog overlaps navigation or Close has an undersized target: ${JSON.stringify({ close, surface, nav })}`);
result.map.closeBounds = close;
result.map.surfaceBounds = surface;
result.map.navTop = nav.top;
await tapNode('Close');
await waitFor('Restaurants Map', false);
await capture('map-closed');
await tapMapAction();
await waitFor('Restaurants Map');
adb('shell', 'input', 'keyevent', '4');
await waitFor('Restaurants Map', false);
result.map.androidBack = true;

for (const [name, label, ready] of [
  ['home', 'Home navigation', 'Level 4 · Wing Scout'],
  ['crawls', 'Crawls navigation', 'QA Buffalo Classics'],
  ['wingdex', 'Wingdex navigation', `Showing places within ${resumeMap ? 5 : 50} mi`],
  ['social', 'Social navigation', 'Latest in New York'],
  ['journey', 'Profile navigation', 'Your wings, milestones, and next adventure'],
]) {
  await navigate(label, ready);
  await capture(`tab-${name}`);
  result.tabs.push(name);
}
writeFileSync(`${out}/result.json`, JSON.stringify(result, null, 2));
console.log(`${width}dp/${fontScale}: map Close, Back, pan, zoom and five tabs passed`);
