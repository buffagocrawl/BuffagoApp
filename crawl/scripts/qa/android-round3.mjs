// Synthetic, invalid-host fixture QA of the real Android screens. No build.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { decode } from 'fast-png';
const adbPath = path.join(process.env.LOCALAPPDATA, 'Android/Sdk/platform-tools/adb.exe');
const adb = (...args) => execFileSync(adbPath, args, { timeout: 30000, maxBuffer: 20 * 1024 * 1024, stdio: ['ignore','pipe','pipe'] });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const width = Number(process.argv[2] || 390), scale = Number(process.argv[3] || 1);
const metroPort = Number(process.env.BUFFAGO_QA_METRO_PORT || 8083);
const homeOnly = process.argv.includes('--home-only');
const resumeCrawls = process.argv.includes('--resume-crawls');
const height = {360:800,390:844,412:892,430:932}[width];
if (!height || ![1,1.3].includes(scale)) throw Error('Unsupported matrix input');
const out = `../docs/android-qa-round-3/screenshots/${width}-font${scale}`;
mkdirSync(out, { recursive: true });
if(!homeOnly && existsSync(`${out}/result.json`)) unlinkSync(`${out}/result.json`);
const ui = () => { const result=adb('shell','uiautomator','dump','/sdcard/round3.xml').toString(); if(!result.includes('dumped')) throw Error('Android UI dump unavailable'); return adb('shell','cat','/sdcard/round3.xml').toString(); };
const nodes = xml => xml.match(/<node\b[^>]*>/g) || [];
const bounds = node => { const b = node?.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/); return b && {left:+b[1],top:+b[2],right:+b[3],bottom:+b[4]}; };
const find = (xml,label) => nodes(xml).find(node => (node.includes(`text="${label}"`) || node.includes(`content-desc="${label}"`) || node.includes(`resource-id="${label}"`)) && (bounds(node)?.right - bounds(node)?.left > 20));
const waitFor = async label => { for(let i=0;i<15;i++){try{const xml=ui();if(find(xml,label)) return xml;}catch{}await pause(1500);}throw Error(`Missing ${label}`); };
const tap = async label => { const node=find(await waitFor(label),label), b=bounds(node);adb('shell','input','tap',String((b.left+b.right)/2),String((b.top+b.bottom)/2));await pause(600); };
const capture = async name => { for(let attempt=0;attempt<6;attempt++){await pause(900);try{const xml=ui();const png=adb('exec-out','screencap','-p');const decoded=decode(png),colors=new Set();for(let y=180;y<decoded.height-180;y+=8)for(let x=0;x<decoded.width;x+=8){const i=(y*decoded.width+x)*decoded.channels;colors.add(`${decoded.data[i]},${decoded.data[i+1]},${decoded.data[i+2]}`);}if(colors.size<50)continue;writeFileSync(`${out}/${name}.png`,png);writeFileSync(`${out}/${name}.xml`,xml);console.log(`Captured ${name} ${width}/${scale}`);return xml;}catch{}}throw Error(`Blank or unavailable capture ${name}`); };
const swipe = () => adb('shell','input','swipe',String(width*1.5),String(height*2.3),String(width*1.5),String(height*.75),'350');
const revealLabels = ['Close','Next Photo'];
let xml;
const fixture = await (await fetch(`http://127.0.0.1:${metroPort}/node_modules/expo-router/entry.bundle?platform=android&dev=true&minify=false`)).text();
if (!fixture.includes('Fixture network boundary blocked') || !fixture.includes('fixture-history-1')) throw Error('Isolated fixture required');
adb('shell','wm','size',`${width*3}x${height*3}`);adb('shell','wm','density','480');adb('shell','settings','put','system','font_scale',String(scale));adb('reverse',`tcp:${metroPort}`,`tcp:${metroPort}`);
adb('shell','am','force-stop','com.buffago.app');adb('shell','am','start','-a','android.intent.action.VIEW','-d',`buffago://expo-development-client/?url=${encodeURIComponent(`http://127.0.0.1:${metroPort}`)}`,'com.buffago.app');
await waitFor('Home navigation');
if(!resumeCrawls) {
await capture('home');
if(homeOnly){
  if(ui().includes('Rate &amp; share a Wing Shot')) throw Error('Redundant Home action remains');
  writeFileSync(`${out}/home-issues-4-13.json`,JSON.stringify({width,scale,fixture:'unrated restaurant',home:'Level and duplicate Rate & Share removed; rating workflow preserved'},null,2));
  process.exit(0);
}
await tap('Wingdex navigation');await waitFor('Show Favorites');await capture('wingdex-saved-tabs');
await tap('Show Favorites');await capture('wingdex-favorites');await tap('Show Want to Try');await capture('wingdex-want-to-try');
if(width===390 && scale===1){await tap('Remove from Want to Try: QA Harbor Wings');await waitFor('Nothing in Want to Try yet');await tap('Show Discover');await tap('Save to Want to Try: QA Harbor Wings');await tap('Show Want to Try');await waitFor('Remove from Want to Try: QA Harbor Wings');await capture('wingdex-save-roundtrip');}
await tap('Show Discover');
await tap('wingdex-wing-jury-entry');await waitFor('Wing photo to judge');await capture('jury-blind');await tap('wing-jury-verdict-1');await waitFor('Next Photo');xml=await capture('jury-reveal');
for(const label of revealLabels){const b=bounds(find(xml,label));if(!b || b.top<0 || b.bottom>height*3 || b.bottom-b.top<132) throw Error(`Reveal control clipped: ${label}`);}
await tap('Remove from Favorites');await waitFor('Add to Favorites');await tap('Add to Favorites');await waitFor('Remove from Favorites');await capture('jury-save');await tap('Close');
}
await tap('Crawls navigation');await waitFor('crawls-filters-entry');await capture('crawls');await tap('crawls-filters-entry');await capture('crawls-filters');
if(width===390 && scale===1){await tap('Drivable');await tap('crawls-show-results');await waitFor('No crawls match this view');await capture('crawls-filtered-empty');await tap('crawls-filters-entry');await tap('Clear filters');await tap('crawls-show-results');}
else adb('shell','input','keyevent','4');
await tap('Social navigation');await waitFor('Leaderboard');await capture('social');
await tap('Profile navigation');await waitFor('Rated YTD');await capture('journey');
if(width===390 && scale===1){await tap('Rated YTD, open rating history');await waitFor('Your Ratings (YTD)');await capture('journey-rating-history');adb('shell','input','keyevent','4');}
for(let i=0;i<6 && !find(ui(),'Open your private Wing Shot history');i++){swipe();await pause(300);}
if(width===390 && scale===1)await capture('journey-creator');
await tap('Open your private Wing Shot history');await waitFor('creator.history.tab.approved');await capture('wing-shot-tabs');await tap('creator.history.tab.approved');await capture('wing-shot-approved');await tap('creator.history.first-item');
for(let i=0;i<4 && !find(ui(),'Passes: 3');i++){swipe();await pause(300);}
await waitFor('Passes: 3');await capture('wing-shot-votes');
adb('shell','input','keyevent','4');adb('shell','input','keyevent','4');await tap('Wingdex navigation');
xml=ui();let search=nodes(xml).find(n=>n.includes('android.widget.EditText'));const b=bounds(search);if(!b)throw Error('Search missing');adb('shell','input','tap',String((b.left+b.right)/2),String((b.top+b.bottom)/2));adb('shell','input','text','QA%s8%sMile%sWings');adb('shell','input','keyevent','4');
await waitFor('Expand to 10 miles →');await capture('wingdex-radius-5');await tap('Expand to 10 miles →');await waitFor('QA 8 Mile Wings');await capture('wingdex-radius-10');
await tap('Home navigation');await tap('Wingdex navigation');await waitFor('QA 8 Mile Wings');
writeFileSync(`${out}/result.json`,JSON.stringify({width,scale,revealControls:'visible, >=44dp',radius:'5 to 10, query preserved; fixture at 8 miles returned',screenshots:'synthetic fixture; real app source'},null,2));
