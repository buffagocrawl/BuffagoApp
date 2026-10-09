// Targeted Android navigation checks. Requires the isolated invalid-host Metro fixture.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const adbPath = path.join(process.env.LOCALAPPDATA, 'Android/Sdk/platform-tools/adb.exe');
const adb = (...args) => execFileSync(adbPath, args, { timeout: 30000, maxBuffer: 20 * 1024 * 1024 });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const metroPort = Number(process.env.BUFFAGO_QA_METRO_PORT || 8081);
if (!Number.isInteger(metroPort) || metroPort < 1 || metroPort > 65535) throw new Error('Invalid QA Metro port');
const width = Number(process.argv[2] || 320);
const fontScale = Number(process.argv[3] || 1.3);
const onlyStep = process.argv.find(arg => arg.startsWith('--only='))?.slice('--only='.length);
const stepNames = ['home-find-wings', 'social-modes-filters', 'crawls-map-details', 'background-resume', 'crawls-resume'];
if (onlyStep && !stepNames.includes(onlyStep)) throw new Error('Unknown --only native flow');
const height = { 320: 740, 360: 800, 390: 844, 430: 932 }[width];
if (!height || ![1, 1.3].includes(fontScale)) throw new Error('Usage: node scripts/qa/native-consolidation-flows.mjs <320|360|390|430> <1|1.3>');
const w = width * 3, h = height * 3;
const out = path.join(process.env.BUFFAGO_QA_ARTIFACT_ROOT || 'artifacts/consolidation-native', 'targeted-flows');
mkdirSync(out, { recursive: true });
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
const waitFor = async (label, present = true, exact = false) => {
  for (let attempt = 0; attempt < 20; attempt++) {
    let xml = '';
    try { xml = await ui(); } catch { await wait(1300); continue; }
    if ((exact ? Boolean(nodeFor(xml, label)) : xml.includes(label)) === present) return xml;
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


// Require the verified invalid-host fixture before tapping any app controls.
const bundle = await fetch(`http://127.0.0.1:${metroPort}/node_modules/expo-router/entry.bundle?platform=android&dev=true&minify=false`);
const source = await bundle.text();
if (!bundle.ok || !source.includes('Fixture network boundary blocked') || !source.includes('native-fixture.invalid'))
  throw new Error('Native flow QA requires the isolated invalid-host Metro fixture');
adb('shell', 'wm', 'size', `${w}x${h}`);
adb('shell', 'wm', 'density', '480');
adb('shell', 'settings', 'put', 'system', 'font_scale', String(fontScale));
adb('reverse', `tcp:${metroPort}`, `tcp:${metroPort}`);
adb('shell', 'am', 'force-stop', 'com.buffago.app');
adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d',
  `buffago://expo-development-client/?url=${encodeURIComponent(`http://127.0.0.1:${metroPort}`)}`, 'com.buffago.app');
await waitFor('Home navigation');
const outcomes = {};
async function step(name, fn) {
  if (onlyStep && onlyStep !== name) return;
  try {
    await fn();
    outcomes[name] = 'PASS';
  } catch (error) {
    outcomes[name] = 'FAIL: ' + error.message;
    await capture(name + '-failed');
  }
  writeFileSync(path.join(out, 'result.json'), JSON.stringify({ width, fontScale, checks: outcomes }, null, 2));
  console.log(name + ': ' + outcomes[name]);
}
const back = () => adb('shell', 'input', 'keyevent', '4');
await step('home-find-wings', async () => {
  await navigate('Home navigation', 'Wing Scout');
  for (let i = 0; i < 4; i++) {
    const action = nodeFor(await ui(), 'Find Wings');
    if (action?.width > 40 && action.height > 40) break;
    swipe(w * .5, h * .75, w * .5, h * .3);
    await wait(400);
  }
  await tapNode('Find Wings');
  await waitFor('Step 1 of 4');
  await capture('home-find-wings');
  await tapNode('Close');
  await waitFor('Step 1 of 4', false);
});
await step('social-modes-filters', async () => {
  await navigate('Social navigation', 'Feed');
  await tapNode('All');
  await waitFor('Latest wing ratings');
  await capture('social-feed-all');
  await tapNode('Leaderboard');
  await waitFor('Ratings');
  await capture('social-leaderboard');
  const header = nodeFor(await ui(), 'Leaderboard');
  if (!header) throw new Error('Leaderboard rail unavailable');
  swipe(w * .8, (header.top + header.bottom) / 2, w * .2, (header.top + header.bottom) / 2);
  await wait(500);
  await tapNode('Friends');
  await waitFor('Wing Friends');
  await capture('social-friends');
});
await step('crawls-map-details', async () => {
  await navigate('Crawls navigation', 'QA Buffalo Classics');
  const expectList = async () => {
    await waitFor('Crawls navigation', true, true);
    await waitFor('Open routes map', true, true);
    await waitFor('Stops rated', true, true);
  };
  await tapNode('Open routes map');
  await waitFor('Routes Map');
  await wait(4000);
  await capture('crawls-map-open');
  const close = nodeFor(await ui(), 'Close');
  if (!close || close.width < 44 * 3 || close.height < 44 * 3 || close.left < 0 || close.right > w || close.top < 24 * 3 || close.bottom > h - 24 * 3)
    throw new Error('Map Close must have a 44dp target inside the safe screen bounds');
  await tapNode('Close');
  await waitFor('Routes Map', false, true);
  await expectList();
  await capture('crawls-map-closed');
  await tapNode('Open routes map');
  await waitFor('Routes Map', true, true);
  back();
  await waitFor('Routes Map', false, true);
  await expectList();
  await capture('crawls-map-back');
  const title = nodeFor(await ui(), 'QA Buffalo Classics');
  if (!title) throw new Error('Route title missing');
  adb('shell', 'input', 'tap', String(Math.round((title.left + title.right) / 2)), String(Math.round((title.top + title.bottom) / 2)));
  await waitFor('Stops', true, true);
  await capture('crawls-details');
  back();
  await waitFor('Stops', false, true);
  await expectList();
  await capture('crawls-details-back');
});
await step('background-resume', async () => {
  await navigate('Wingdex navigation', 'Showing places within');
  adb('shell', 'input', 'keyevent', '3');
  await wait(1000);
  adb('shell', 'am', 'start', '-n', 'com.buffago.app/.MainActivity');
  await waitFor('Wingdex navigation');
  await capture('background-resume');
});
await step('crawls-resume', async () => {
  await navigate('Crawls navigation', 'Resume crawl');
  await tapNode('Resume crawl');
  await waitFor('QA Buffalo Classics');
  await waitFor('QA Harbor Wings');
  await capture('crawls-resume');
  const state = await ui();
  if (state.includes('Resume crawl') && state.includes('Crawls navigation'))
    throw new Error('Resume did not leave crawl list');
  if (!nodeFor(state, 'QA Harbor Wings')) throw new Error('Resumed first stop is not visible');
});
if (Object.values(outcomes).some(value => value !== 'PASS')) process.exitCode = 1;
console.log('Targeted native flows completed');
