// Android emulator smoke test with the development-only synthetic gallery fixture.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const adbPath = path.join(process.env.LOCALAPPDATA, 'Android/Sdk/platform-tools/adb.exe');
const adb = (...args) => execFileSync(adbPath, args, { timeout: 30000, maxBuffer: 20 * 1024 * 1024 });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const metroPort = Number(process.env.BUFFAGO_QA_METRO_PORT || 8081);
if (!Number.isInteger(metroPort) || metroPort < 1 || metroPort > 65535) throw new Error('Invalid QA Metro port');
const rejectVote = process.argv.includes('--reject-vote');
const width = Number(process.argv[2] || 320);
const fontScale = Number(process.argv[3] || 1.3);
const height = { 320: 740, 390: 844 }[width];
if (!height || ![1, 1.3].includes(fontScale)) throw new Error('Use 320 or 390 dp and font scale 1 or 1.3');
const out = path.join(process.env.BUFFAGO_QA_ARTIFACT_ROOT || 'artifacts/wingdex-photos/native-gallery', `${width}-font${fontScale}`);
mkdirSync(out, { recursive: true });

const ui = async () => {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      if (adb('shell', 'uiautomator', 'dump', '/sdcard/wingdex-gallery-qa.xml').toString().includes('dumped'))
        return adb('shell', 'cat', '/sdcard/wingdex-gallery-qa.xml').toString();
    } catch {}
    await delay(700);
  }
  throw new Error('Accessibility tree unavailable');
};
const nodeFor = (xml, label) => {
  const node = (xml.match(/<node\b[^>]*>/g) || []).find(item => item.includes(`content-desc="${label}"`) || item.includes(`text="${label}"`) || item.includes(`hint="${label}"`));
  const bounds = node?.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
  if (!bounds) return null;
  const [left, top, right, bottom] = bounds.slice(1).map(Number);
  return { left, top, right, bottom, width: right - left, height: bottom - top };
};
const waitFor = async (label, present = true) => {
  for (let attempt = 0; attempt < 24; attempt++) {
    try {
      const xml = await ui();
      if (xml.includes(label) === present) return xml;
    } catch {}
    await delay(1300);
  }
  throw new Error(`${label} did not become ${present ? 'visible' : 'hidden'}`);
};
const tap = async label => {
  const bounds = nodeFor(await ui(), label);
  if (!bounds || bounds.width < 40 || bounds.height < 40) throw new Error(`${label} is not tappable`);
  adb('shell', 'input', 'tap', String(Math.round((bounds.left + bounds.right) / 2)), String(Math.round((bounds.top + bounds.bottom) / 2)));
  return bounds;
};
const capture = async name => {
  await delay(1200);
  writeFileSync(`${out}/${name}.png`, adb('exec-out', 'screencap', '-p'));
  writeFileSync(`${out}/${name}.xml`, await ui());
};

// Every smoke run must use the isolated fixture and current gallery/viewer source.
{
  const bundle = await fetch(`http://127.0.0.1:${metroPort}/node_modules/expo-router/entry.bundle?platform=android&dev=true&minify=false`);
  const source = await bundle.text();
  if (!bundle.ok || !source.includes('Fixture network boundary blocked') || !source.includes('fixture-photo-1') || !source.includes('getVoteVersion'))
    throw new Error('Gallery smoke requires the current isolated synthetic gallery Metro fixture');
}
adb('shell', 'wm', 'size', `${width * 3}x${height * 3}`);
adb('shell', 'wm', 'density', '480');
adb('shell', 'settings', 'put', 'system', 'font_scale', String(fontScale));
adb('reverse', `tcp:${metroPort}`, `tcp:${metroPort}`);
adb('shell', 'am', 'force-stop', 'com.buffago.app');
adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', `buffago://expo-development-client/?url=${encodeURIComponent(`http://127.0.0.1:${metroPort}`)}`, 'com.buffago.app');
await waitFor('Home navigation');
await tap('Wingdex navigation');
await waitFor('2 photos');
await tap('2 photos');
await waitFor('Open approved restaurant photo');
await capture('gallery');
await tap('Open approved restaurant photo');
await waitFor('Close photo');
await waitFor('1 of 2');
await capture('viewer-first');
const controls = await ui();
for (const label of ['Close photo', 'Like, 0', 'Dislike, 0']) {
  const bounds = nodeFor(controls, label);
  if (!bounds || bounds.width < 132 || bounds.height < 132 || bounds.top < 72 || bounds.bottom > height * 3 - 72)
    throw new Error(`${label} must have a visible 44dp target within safe screen bounds`);
}
const likeBounds = nodeFor(controls, 'Like, 0'), dislikeBounds = nodeFor(controls, 'Dislike, 0');
if (likeBounds.right > dislikeBounds.left && likeBounds.top < dislikeBounds.bottom && dislikeBounds.top < likeBounds.bottom)
  throw new Error('Vote controls overlap');
if (rejectVote) {
  const beforeVote = nodeFor(await ui(), 'Like, 0');
  if (!beforeVote) throw new Error('Like zero not rendered');
  await tap('Like, 0');
  await waitFor('Could not save your vote. Check your connection and try again.');
  const rejectedXml = await ui();
  const rejectedVote = (rejectedXml.match(/<node\b[^>]*>/g) || []).find(n => n.includes('content-desc="Like, 0"'));
  if (!rejectedVote || rejectedVote.includes('selected="true"')) throw new Error('Rejected vote did not roll back');
  await capture('vote-rejection-rollback');
  await tap('Retry');
  await waitFor('Could not save your vote. Check your connection and try again.', false);
  await tap('Dislike, 0');
  await waitFor('Could not save your vote. Check your connection and try again.');
  const disliked = (await ui()).match(/<node\b[^>]*>/g).find(n => n.includes('content-desc="Dislike, 0"'));
  if (!disliked || disliked.includes('selected="true"')) throw new Error('Rejected downvote did not roll back');
  await capture('downvote-rejection-rollback');
  await tap('Retry');
  await waitFor('Could not save your vote. Check your connection and try again.', false);
}

const layoutOnly = process.argv.includes('--layout-only');
if (!layoutOnly) {
let xml = await ui();
const image = nodeFor(xml, 'Photo 1 of QA Harbor Wings');
if (!image) throw new Error('First full-screen image did not render');
const cx = Math.round((image.left + image.right) / 2);
const cy = Math.round((image.top + image.bottom) / 2);
adb('shell', `input tap ${cx} ${cy}; input tap ${cx} ${cy}`);
await capture('viewer-double-tap');
adb('shell', 'input', 'swipe', String(cx + 170), String(cy), String(cx - 170), String(cy), '450');
xml = await waitFor('1 of 2');
if (!xml.includes('Photo 1 of QA Harbor Wings')) throw new Error('Zoomed pan changed photos');
await capture('viewer-zoomed-pan');
await tap('Reset zoom');
await delay(800);
adb('shell', 'input', 'swipe', String(cx + 170), String(cy), String(cx - 170), String(cy), '450');
await waitFor('2 of 2');
await capture('viewer-second');
adb('shell', 'input', 'keyevent', '3');
await delay(1000);
adb('shell', 'am', 'start', '-n', 'com.buffago.app/.MainActivity');
await waitFor('Close photo');
await waitFor('2 of 2');
await capture('viewer-background-resume');
adb('shell', 'input', 'keyevent', '4');
await waitFor('Close photo', false);
await waitFor('Open approved restaurant photo');
await capture('viewer-android-back');
await tap('Open approved restaurant photo');
await waitFor('Close photo');
await waitFor('1 of 2');
await capture('viewer-reopened');
}
await tap('Close photo');
await waitFor('Close photo', false);
await waitFor('Open approved restaurant photo');
await capture('viewer-closed');
adb('shell', 'input', 'keyevent', '4');
await waitFor('Open approved restaurant photo', false);
await waitFor('2 photos');
await capture('wingdex-return');
if (process.argv.includes('--empty-gallery')) {
  await tap('Search destinations…');
  adb('shell', 'input', 'text', 'QA%sNorthside');
  adb('shell', 'input', 'keyevent', '4');
  await waitFor('QA Northside Wings');
  await tap('QA Northside Wings');
  await waitFor('0 Pictures');
  await tap('0 Pictures');
  await waitFor('Be the first to add a photo');
  const empty = await ui();
  if (empty.includes('Open approved restaurant photo')) throw new Error('Empty restaurant retained unrelated photos');
  await capture('empty-gallery');
  await tap('Close');
  await waitFor('Be the first to add a photo', false);
}
writeFileSync(`${out}/result.json`, JSON.stringify({ width, fontScale, gallery: true, viewer: true,
  voteRejectedAndRolledBack: rejectVote || undefined, doubleTap: !layoutOnly || undefined, zoomedPanStayedOnPhoto: !layoutOnly || undefined, swipeAtOneXChangedPhoto: !layoutOnly || undefined, close: true,
  androidBack: true, viewerAndroidBack: !layoutOnly || undefined, viewerReopened: !layoutOnly || undefined, viewerBackgroundResume: !layoutOnly || undefined, wingdexReturn: true,
  emptyGallery: process.argv.includes('--empty-gallery') || undefined,
  pinch: 'BLOCKED: touchscreen sendevent permission denied; single-pointer input only' }, null, 2));
console.log(`${width}dp/${fontScale}: ${layoutOnly ? 'responsive gallery/viewer layout, Close and gallery Back' : 'gallery, viewer, zoomed pan, swipe, Close, Back'} passed`);
