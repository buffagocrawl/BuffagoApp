// Run against an isolated native-visual fixture Metro and Android development client.
// All interactions and votes below use synthetic data; no production writes.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const port = Number(process.env.BUFFAGO_QA_METRO_PORT || 8091);
assert.ok(Number.isInteger(port) && port > 0 && port < 65536);
const exe = path.join(process.env.LOCALAPPDATA, 'Android/Sdk/platform-tools/adb.exe');
const adb = (...args) => execFileSync(exe, args, { timeout: 30000, maxBuffer: 30 * 1024 * 1024 });
const out = path.resolve('artifacts/wingdex-photos/wingman-photo-controls');
mkdirSync(out, { recursive: true });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function state() {
  const result = adb('shell', 'uiautomator', 'dump', '/sdcard/wingdex-fix.xml').toString();
  assert.ok(result.includes('dumped'), 'Accessibility snapshot unavailable');
  return adb('shell', 'cat', '/sdcard/wingdex-fix.xml').toString();
}
const nodes = xml => xml.match(/<node\b[^>]*>/g) || [];
const xmlLabel = label => label.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const find = (xml, label) => nodes(xml).find(node => ['content-desc', 'text', 'resource-id'].some(attr => node.includes(`${attr}="${xmlLabel(label)}"`)));
async function wait(label) {
  for (let attempt = 0; attempt < 15; attempt++) {
    let xml;
    try { xml = state(); } catch { await delay(1000); continue; }
    if (find(xml, label)) return xml;
    await delay(1000);
  }
  throw new Error(`Missing ${label}`);
}
async function tap(label) {
  const node = find(await wait(label), label);
  tapNode(node);
  await delay(600);
}
function tapNode(node) {
  const [left, top, right, bottom] = node.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/).slice(1).map(Number);
  adb('shell', 'input', 'tap', String((left + right) / 2), String((top + bottom) / 2));
}
function capture(name) {
  writeFileSync(path.join(out, `${name}.png`), adb('exec-out', 'screencap', '-p'));
  writeFileSync(path.join(out, `${name}.xml`), state());
}
async function scrollTo(label) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const xml = state();
    if (find(xml, label)) return xml;
    adb('shell', 'input', 'swipe', '585', '2180', '585', '1400', '400');
    await delay(600);
  }
  throw Error(`Cannot scroll to ${label}`);
}
async function searchFor(text) {
  await tap('Clear filters');
  const search = nodes(state()).find(node => node.includes('class="android.widget.EditText"'));
  assert.ok(search);
  tapNode(search);
  adb('shell', 'input', 'text', text);
  adb('shell', 'input', 'keyevent', '4');
  await delay(800);
}

const response = await fetch(`http://127.0.0.1:${port}/node_modules/expo-router/entry.bundle?platform=android&dev=true&minify=false`, { signal: AbortSignal.timeout(60000) });
assert.ok(response.ok);
const bundle = await response.text();
for (const marker of ['Fixture network boundary blocked', 'native-fixture.invalid', 'fixture-photo-1', 'wingdex_empty_state', 'showInlineVotes', 'home-destination-photo', 'Already favorited']) assert.ok(bundle.includes(marker), `Missing isolated/current bundle marker ${marker}`);
adb('reverse', `tcp:${port}`, `tcp:${port}`);
adb('shell', 'input', 'keyevent', '224');
adb('shell', 'wm', 'dismiss-keyguard');
adb('shell', 'am', 'force-stop', 'com.buffago.app');
adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', `buffago://expo-development-client/?url=${encodeURIComponent(`http://127.0.0.1:${port}`)}`, 'com.buffago.app');
await wait('Wingdex navigation');
await tap('Wingdex navigation');
if (!process.argv.includes('--saved-home-only')) {
await wait('Open approved restaurant photo');
let xml = state();
assert.ok(!xml.includes('Wingman: Add a place'), 'Populated results must not show Wingman');
assert.ok(!/content-desc="(?:Like|Dislike),/.test(xml), 'Main cards must not have inline voting');
capture('wingdex-entry-and-clean-cards');
const photo = find(xml, 'Open approved restaurant photo');
const [left, top, right, bottom] = photo.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/).slice(1).map(Number);
adb('shell', 'input', 'swipe', String(right - 60), String((top + bottom) / 2), String(left + 60), String((top + bottom) / 2), '400');
await wait('2 of 2');
capture('card-swiped-second-photo');
await tap('Open approved restaurant photo');
await wait('Close photo');
await wait('2 of 2');
await wait('Like, 0');
await wait('Dislike, 0');
capture('viewer-voting');
await tap('Like, 0');
xml = await wait('Like, 1');
assert.ok(find(xml, 'Like, 1').includes('selected="true"'), 'Viewer vote must remain selected');
capture('viewer-vote-selected');
await tap('Close photo');
xml = await wait('Open approved restaurant photo');
assert.ok(!xml.includes('Wingman: Add a place'), 'Populated results must not show Wingman after viewer dismissal');
assert.ok(!/content-desc="(?:Like|Dislike),/.test(xml), 'Returning from viewer must not reveal inline votes');
capture('wingdex-after-viewer-vote');
// A search with no matches exposes the empty-state action and prefills the dialog.
const search = nodes(xml).find(node => node.includes('class="android.widget.EditText"'));
assert.ok(search, 'Wingdex search input present');
tapNode(search);
adb('shell', 'input', 'text', 'QA_missing_place');
adb('shell', 'input', 'keyevent', '4');
await wait('No restaurants match your filters');
await wait('Wingman: Add a place');
capture('filtered-empty-wingman-entry');
await tap('Wingman: Add a place');
xml = await wait('Wingman');
assert.ok(xml.includes('QA_missing_place'), 'Search is passed into Wingman');
capture('filtered-search-wingman-prefill');
await tap('Close');
// Rated restaurant: one favorite control, with add/remove reflected immediately.
}
await searchFor('Long');
const ratedName = 'QA Long Restaurant Name Buffalo Wing House & Grill';
await scrollTo(`Remove from Favorites: ${ratedName}`);
await wait('Already favorited');
capture('rated-already-favorited');
await tap(`Remove from Favorites: ${ratedName}`);
await wait('Favorite');
capture('rated-favorite');
await tap(`Add to Favorites: ${ratedName}`);
await wait('Already favorited');
// This destination has no photo; use its separate details navigation to select it.
await tap(ratedName);
await wait('Close restaurant details');
await scrollTo('Set Destination');
await tap('Set Destination');
await wait('No Wing Shots yet');
capture('home-no-photo-fallback');
assert.ok(!find(state(), 'home-destination-photo'));
await tap('Wingdex navigation');
// Unrated restaurant: Want to Try is the sole saved control.
await searchFor('Harbor');
await scrollTo('Remove from Want to Try: QA Harbor Wings');
await wait('Want to Try');
capture('unrated-want-to-try');
await tap('Remove from Want to Try: QA Harbor Wings');
await wait('Add to Want to Try');
capture('unrated-add-to-want-to-try');
await tap('Add to Want to Try: QA Harbor Wings');
await wait('Remove from Want to Try: QA Harbor Wings');
assert.ok(!nodes(state()).some(node => node.includes('text="Saved"')));
await tap('Show Want to Try');
await scrollTo('Set QA Harbor Wings as your Home destination');
await tap('Set QA Harbor Wings as your Home destination');
await wait('Open photo of QA Harbor Wings');
capture('home-current-destination-photo');
assert.ok(find(state(), 'View restaurant ratings and details'), 'Separate navigation remains');
await tap('Open photo of QA Harbor Wings');
await wait('Close photo');
await wait('1 of 1');
capture('home-photo-viewer');
await tap('Close photo');
await wait('Open photo of QA Harbor Wings');
capture('home-photo-dismissed');
writeFileSync(path.join(out, 'acceptance.json'), JSON.stringify({
  status: 'PASS', environment: 'Android emulator development client, isolated synthetic native-visual fixtures',
  productionWrites: false, physicalDevice: false,
  runMode: process.argv.includes('--saved-home-only') ? 'saved-home-only' : 'all',
  checks: [...(process.argv.includes('--saved-home-only') ? [] : ['Wingman is absent from populated results and opens from empty results with search prefill', 'main cards have no inline votes', 'card swipe updates counter and selected viewer photo', 'viewer vote updates count and selection', 'returning to cards keeps voting hidden', 'filtered empty results retain Wingman and prefill search']), 'four rated/unrated saved labels and favorite/Want to Try toggling', 'Home no-photo fallback', 'Home current photo opens and dismisses existing viewer with separate navigation retained'],
}, null, 2));
console.log(`PASS: ${out}`);
