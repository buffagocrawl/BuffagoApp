// Uses the existing emulator/invalid-host fixture; exercises image faults only.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const adbPath = path.join(process.env.LOCALAPPDATA, 'Android/Sdk/platform-tools/adb.exe');
const adb = (...args) => execFileSync(adbPath, args, { timeout: 15000, maxBuffer: 20 * 1024 * 1024 });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const width = Number(process.argv[2] || 320), scale = Number(process.argv[3] || 1.3);
const height = { 320: 740, 390: 844 }[width];
if (!height || ![1, 1.3].includes(scale)) throw new Error('Use 320/1.3 or 390/1');
const root = path.join(process.env.BUFFAGO_QA_ARTIFACT_ROOT || 'artifacts/consolidation-native/image-faults', `${width}-font${scale}`);
mkdirSync(root, { recursive: true });
const control = async command => {
  const res = await fetch('http://127.0.0.1:8084/control', { method: 'POST', headers: { Connection: 'close' }, body: JSON.stringify(command) });
  if (!res.ok) throw new Error('Local image fixture control failed');
  return res.json();
};
const evidence = async () => (await fetch('http://127.0.0.1:8084/evidence', { headers: { Connection: 'close' } })).json();
const nodes = xml => xml.match(/<node\b[^>]*>/g) || [];
const node = (xml, label) => nodes(xml).find(n => n.includes(`content-desc="${label}"`) || n.includes(`text="${label}"`));
// Paper progress bars are native Views with busy accessibility state.
const spinner = xml => nodes(xml).some(n => n.includes('content-desc="busy"') || /content-desc="Loading photo(?:, busy)?"/.test(n));
const ui = async () => {
  for (let i = 0; i < 3; i++) {
    try {
      const result = adb('shell', 'uiautomator', 'dump', '/sdcard/native-image-faults.xml').toString();
      if (result.includes('dumped')) return adb('shell', 'cat', '/sdcard/native-image-faults.xml').toString();
    } catch {}
    await pause(400);
  }
  throw new Error('BLOCKED: native accessibility dump unavailable');
};
const wait = async (predicate, description, attempts = 8) => {
  for (let i = 0; i < attempts; i++) { const xml = await ui(); if (predicate(xml)) return xml; await pause(400); }
  throw new Error(description);
};
const label = (name, present = true) => wait(xml => Boolean(node(xml, name)) === present, `${name} did not become ${present ? 'visible' : 'hidden'}`);
const tap = async name => {
  const n = node(await ui(), name), b = n?.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
  if (!b) throw new Error(`${name} has no native bounds`);
  const [x, y, right, bottom] = b.slice(1).map(Number);
  if (right - x < 40 || bottom - y < 40 || y < 72 || bottom > height * 3 - 72) throw new Error(`${name} is inaccessible`);
  adb('shell', 'input', 'tap', String(Math.round((x + right) / 2)), String(Math.round((y + bottom) / 2)));
};
const capture = async (name, xml) => {
  writeFileSync(path.join(root, name + '.png'), adb('exec-out', 'screencap', '-p'));
  writeFileSync(path.join(root, name + '.xml'), xml || await ui());
};
const results = {};
const checkpoint = async () => {
  writeFileSync(path.join(root, 'result.json'), JSON.stringify({ width, fontScale: scale, checks: results }, null, 2));
  writeFileSync(path.join(root, 'server-evidence.json'), JSON.stringify(await evidence(), null, 2));
};
const record = async name => { results[name] = 'FIXTURE PASS'; await checkpoint(); console.log(name + ': FIXTURE PASS'); };
const back = () => adb('shell', 'input', 'keyevent', '4');
const closeGallery = async () => { back(); await label('2 photos'); };
const openGallery = async scenario => { await control({ scenario }); await tap('2 photos'); };
const loadedViewer = async () => {
  return wait(xml => Boolean(node(xml, 'Photo 1 of QA Harbor Wings')) && !spinner(xml)
    && node(xml, 'Like, 0')?.includes('enabled="true"'), 'Full image never finished loading');
};
const closeViewer = async () => { await tap('Close photo'); await label('Close photo', false); };
const swipeGallery = async backwards => {
  const scroller = nodes(await ui()).filter(n => n.includes('class="android.widget.HorizontalScrollView"') && n.includes('scrollable="true"')).at(-1);
  const [left, top, right, bottom] = scroller.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/).slice(1).map(Number);
  const start = backwards ? left + 60 : right - 60, end = backwards ? right - 60 : left + 60;
  adb('shell', 'input', 'swipe', String(start), String(Math.round((top + bottom) / 2)), String(end), String(Math.round((top + bottom) / 2)), '400');
};
let xml;

try {
  const bundle = await fetch('http://127.0.0.1:8085/node_modules/expo-router/entry.bundle?platform=android&dev=true&minify=false');
  const source = await bundle.text();
  if (!bundle.ok || !source.includes('Fixture network boundary blocked') || !source.includes('8084/state?kind=') || !source.includes('EXPO_PUBLIC_BUFFAGO_NATIVE_IMAGE_FAULT_QA'))
    throw new Error('Requires opt-in fault fixture Metro on 8085');
  await control({ scenario: 'success' });
  adb('shell', 'wm', 'size', `${width * 3}x${height * 3}`); adb('shell', 'wm', 'density', '480');
  adb('shell', 'settings', 'put', 'system', 'font_scale', String(scale));
  for (const port of [8084, 8085]) adb('reverse', `tcp:${port}`, `tcp:${port}`);
  if (!process.argv.includes('--attach')) {
  adb('shell', 'am', 'force-stop', 'com.buffago.app');
  adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'buffago://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8085', 'com.buffago.app');
  // Startup dumps can briefly be unavailable before the app mounts.
  for (let i = 0; i < 8; i++) { try { await label('Home navigation'); break; } catch (e) { if (i === 7) throw e; } }
  await tap('Wingdex navigation'); await label('2 photos');
  } else { back(); await label('2 photos'); }

  if (!process.argv.includes('--only-thumbnails')) {
  const skipGalleryDelay = process.argv.includes('--skip-gallery-delay');
  await openGallery(skipGalleryDelay ? 'success' : 'gallery-delay');
  if (!skipGalleryDelay) {
  let xml = await wait(spinner, 'Gallery loading indicator missing'); await capture('gallery-loading', xml);
  await control({ release: true }); await label('Open approved restaurant photo');
  await wait(xml => !spinner(xml), 'Gallery spinner remained after response');
  await capture('thumbnails-loaded'); await record('delayed-gallery-and-successful-thumbnails');
  } else await label('Open approved restaurant photo');

  await control({ scenario: 'delayed-full' }); await tap('Open approved restaurant photo');
  let loading;
  for (let i = 0; i < 30; i++) { loading = await evidence(); if (loading.held) break; await pause(100); }
  if (!loading.held) throw new Error('Delayed full image was not held by fixture');
  // Dumping XML while this animated spinner is active can outlast the native
  // HTTP timeout. Preserve independent pixel/HTTP evidence before releasing.
  writeFileSync(path.join(root, 'full-image-loading.png'), adb('exec-out', 'screencap', '-p'));
  writeFileSync(path.join(root, 'loading-server-evidence.json'), JSON.stringify(loading, null, 2));
  results['full-loading-accessibility-assertion'] = 'BLOCKED: dump idle exceeds image timeout; native screenshot requires visual review';
  await control({ release: true }); await loadedViewer(); await capture('full-image-loaded'); await record('delayed-full-image-and-success');
  await closeViewer();

  for (const scenario of ['full-fail', 'expired-full']) {
    await control({ scenario }); await tap('Open approved restaurant photo');
    xml = await label('Photo could not load. Check your connection and retry.');
    if (spinner(xml)) throw new Error('Terminal image failure retained a spinner');
    if (xml.includes('/image/') || xml.includes('signed_url') || xml.includes('private-original')) throw new Error('Image URL/path leaked to native UI');
    await capture(scenario, xml);
    if (process.argv.includes('--dismiss-errors')) {
      if (scenario === 'full-fail') await closeViewer();
      else { back(); await label('Close photo', false); }
      await tap('Open approved restaurant photo');
      await label('Photo could not load. Check your connection and retry.');
      await record(scenario + '-terminal-dismissal');
    }
    await control({ scenario: 'success' }); await tap('Retry'); await loadedViewer();
    await capture(scenario + '-retried'); await record(scenario + '-retry'); await closeViewer();
  }
  await closeGallery();
  }
  for (const scenario of ['mixed', 'all-fail']) {
    await openGallery(scenario); xml = await label('Photo unavailable');
    if (spinner(xml)) throw new Error('Broken thumbnail retained a spinner');
    const network = await evidence();
    const thumbs = network.requests.filter(r => r.revision === network.revision && r.kind === 'thumb');
    if (!thumbs.some(r => r.ordinal === 0 && r.status === 503)
      || !thumbs.some(r => r.ordinal === 1 && r.status === (scenario === 'all-fail' ? 503 : 200)))
      throw new Error('Both thumbnail fault responses must be observed');
    await capture(scenario, xml);
    if (scenario === 'all-fail' && process.argv.includes('--dismiss-errors')) {
      await closeGallery(); await openGallery('all-fail'); await label('Photo unavailable');
      await record('all-failed-gallery-android-back');
    }
    if (scenario === 'mixed') {
      // Reveal the valid second thumbnail in the existing horizontal gallery.
      await swipeGallery(false);
      await label('Open approved restaurant photo'); await tap('Open approved restaurant photo');
      await label('Photo 1 of QA Harbor Wings', false); await label('Photo 2 of QA Harbor Wings');
      await wait(xml => !spinner(xml), 'Valid image remained loading'); await capture('mixed-valid-photo');
      back(); await label('Close photo', false);
      // Return to the first item so Retry photo is visible.
      await swipeGallery(true);
    }
    await control({ scenario: 'success' }); await tap('Retry photo');
    await label('Photo unavailable', false); await label('Open approved restaurant photo');
    await capture(scenario + '-recovered'); await record(scenario + '-thumbnail-isolation-and-retry');
    await tap('Close'); await label('2 photos');
  }
  await checkpoint();
} catch (error) {
  results.failure = error.message.startsWith('BLOCKED:') ? error.message : 'FAIL: ' + error.message;
  await capture('failure').catch(() => {}); await checkpoint(); console.error(results.failure); process.exitCode = 1;
} finally { await control({ release: true }); }
