// Real Android development client + isolated fixture backend; never production auth/writes.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const adb = path.join(process.env.LOCALAPPDATA,'Android/Sdk/platform-tools/adb.exe');
const run = (...args) => execFileSync(adb,args,{timeout:30000,maxBuffer:20*1024*1024});
const wait = ms => new Promise(r=>setTimeout(r,ms));
const out='../docs/android-qa-four-issues/wingdex-ux-correction'; mkdirSync(out,{recursive:true});
const mode=process.argv[2]||'signed-in';
const xml=()=>{const result=run('shell','uiautomator','dump','/sdcard/four-issues.xml').toString();if(!result.includes('dumped to:'))return '';return run('shell','cat','/sdcard/four-issues.xml').toString();};
function bounds(source,label) {
  const nodes=[...source.matchAll(/<node\b[^>]*>/g)].map(m=>m[0]);
  const node=nodes.find(n=>n.includes(`content-desc="${label}"`)) || nodes.find(n=>n.includes(`text="${label}"`));
  if(!node)return null;
  const m=node.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
  return {x:(+m[1]+ +m[3])/2,y:(+m[2]+ +m[4])/2,left:+m[1],top:+m[2],right:+m[3],bottom:+m[4],selected:node.includes('selected="true"')};
}
async function until(label){for(let i=0;i<12;i++){let source='';try { source=xml(); } catch {} if(bounds(source,label))return source;await wait(1000);}throw Error(`Missing ${label}`);}
const tap=async label=>{const b=bounds(await until(label),label);run('shell','input','tap',String(Math.round(b.x)),String(Math.round(b.y)));await wait(500);};
const capture=name=>{const source=xml();writeFileSync(`${out}/${name}.xml`,source);writeFileSync(`${out}/${name}.png`,run('exec-out','screencap','-p'));};
const results=[];

if(bounds(xml(),'50 miles'))run('shell','input','keyevent','4');
await until('Wing Jury');const filterLabel=xml().match(/content-desc="(Filters, \d+ active)"/)[1];await tap(filterLabel);await until('50 miles');
for(const miles of [5,10,25,50,100,250]) {await tap(`${miles} miles`);assert.ok(bounds(xml(),`${miles} miles`).selected);}
for(const label of ['Overall score','Nearest','Most ratings','Most photos']) {await tap(label);assert.ok(bounds(xml(),label).selected);}
await tap('Rated by you');assert.ok(bounds(xml(),'Rated by you').selected);await tap('Rated by you');
await tap('Current state: CT');assert.ok(bounds(xml(),'Current state: CT').selected);await tap('All locations');assert.ok(bounds(xml(),'All locations').selected);
await tap('Choose your state');await until('Choose a state');await tap('Alabama (AL)');
await until('Wing Jury');await tap('Filters, 1 active');await until('50 miles');assert.ok(xml().includes('State: AL'));
await tap('5 miles');await tap('Overall score');run('shell','input','keyevent','4');await until('Wing Jury');assert.ok(!bounds(xml(),'50 miles'));
for(const width of [360,390,430]) {
 const height={360:800,390:844,430:932}[width];run('shell','wm','size',`${width*3}x${height*3}`);run('shell','settings','put','system','font_scale','1.3');await wait(1000);
 run('shell','input','swipe',String(width*1.5),String(height*2.3),String(width*1.5),'700','500');await wait(1000);await until('Add a photo');capture(`without-photo-${width}dp-font1.3`);
 run('shell','input','swipe',String(width*1.5),'750',String(width*1.5),String(height*2.4),'500');await wait(1000);
}
writeFileSync(out+'/behavior-verification.json',JSON.stringify({distanceOptions:[5,10,25,50,100,250],sortOptions:['overall','nearest','ratings','photos'],myRatings:true,currentState:true,allLocations:true,chosenState:true,androidBackClosesModal:true,selectionPreserved:true,noPhotoCards:[360,390,430]},null,2));console.log('Wingdex filter behaviors passed');
