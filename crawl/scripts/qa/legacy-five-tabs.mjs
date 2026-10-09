import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const adb = (...args) => execFileSync('adb', args, { timeout: 30000, maxBuffer: 20 * 1024 * 1024 });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const out = 'artifacts/visual-polish-v2/retest';
mkdirSync(out, { recursive: true });
const tabs = [
  ['home', 95, 'Level 4 · Wing Scout'],
  ['crawls', 275, 'QA Buffalo Classics'],
  ['wingdex', 480, 'QA Harbor Wings'],
  ['social', 675, 'Feed'],
  ['journey', 855, 'Your wings, milestones, and next adventure'],
];
for (const [name, x, label] of tabs) {
  adb('shell', 'input', 'tap', String(x), '2090');
  let xml = '';
  for (let attempt = 0; attempt < 12; attempt++) {
    await wait(1800);
    adb('shell', 'uiautomator', 'dump', '/sdcard/five-tabs.xml');
    xml = adb('shell', 'cat', '/sdcard/five-tabs.xml').toString();
    if (xml.includes(label)) break;
  }
  if (!xml.includes(label)) throw new Error(`${name}: expected content absent`);
  await wait(2000);
  writeFileSync(`${out}/five-tab-${name}.png`, adb('exec-out', 'screencap', '-p'));
  writeFileSync(`${out}/five-tab-${name}.xml`, xml);
  console.log(`${name}: captured`);
}
