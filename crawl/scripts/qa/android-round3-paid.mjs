// Real client paid-rating UI against the invalid-host durable synthetic server.
import { execFileSync } from 'node:child_process';
import { mkdirSync,writeFileSync } from 'node:fs';
import { decode } from 'fast-png';
import path from 'node:path';
const adbPath=path.join(process.env.LOCALAPPDATA,'Android/Sdk/platform-tools/adb.exe');
const adb=(...args)=>execFileSync(adbPath,args,{timeout:30000,maxBuffer:20*1024*1024,stdio:['ignore','pipe','pipe']});
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const width=Number(process.argv[2]||390),scale=Number(process.argv[3]||1),height={360:800,390:844,412:892,430:932}[width];
const out=`../docs/android-qa-round-3/screenshots/${width}-font${scale}`;mkdirSync(out,{recursive:true});
const ui=()=>{if(!adb('shell','uiautomator','dump','/sdcard/round3-paid.xml').toString().includes('dumped'))throw Error('UI unavailable');return adb('shell','cat','/sdcard/round3-paid.xml').toString();};
const nodes=xml=>xml.match(/<node\b[^>]+>/g)||[];
const bounds=n=>{const b=n?.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);return b&&{left:+b[1],top:+b[2],right:+b[3],bottom:+b[4]};};
const labelNode=(xml,label)=>nodes(xml).find(n=>(n.includes(`text="${label}"`)||n.includes(`content-desc="${label}"`)||n.includes(`resource-id="${label}"`))&&bounds(n)?.right-bounds(n)?.left>30);
async function waitFor(label){for(let i=0;i<16;i++){try{const xml=ui();if(labelNode(xml,label))return xml;}catch{}await pause(1000);}throw Error(`Missing ${label}`);}
const tapNode=n=>{const b=bounds(n);if(!b)throw Error('Target missing');adb('shell','input','tap',String((b.left+b.right)/2),String((b.top+b.bottom)/2));};
const tap=async label=>{tapNode(labelNode(await waitFor(label),label));await pause(400);};
async function capture(name){for(let i=0;i<5;i++){await pause(800);try{const xml=ui(),png=adb('exec-out','screencap','-p'),p=decode(png),colors=new Set();for(let y=180;y<p.height-180;y+=8)for(let x=0;x<p.width;x+=8){const k=(y*p.width+x)*p.channels;colors.add(`${p.data[k]},${p.data[k+1]},${p.data[k+2]}`);}if(colors.size<50)continue;writeFileSync(`${out}/${name}.png`,png);writeFileSync(`${out}/${name}.xml`,xml);console.log(`Captured ${name} ${width}/${scale}`);return xml;}catch{}}throw Error(`Invalid capture ${name}`);}
const launch=()=>{adb('shell','am','force-stop','com.buffago.app');adb('shell','am','start','-a','android.intent.action.VIEW','-d','buffago://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8088','com.buffago.app');};
const bundle=await(await fetch('http://127.0.0.1:8088/node_modules/expo-router/entry.bundle?platform=android&dev=true&minify=false')).text();
if(!bundle.includes('Fixture response lost after commit')||!bundle.includes('buffacoin-check-status'))throw Error('Current isolated paid fixture required');
adb('shell','wm','size',`${width*3}x${height*3}`);adb('shell','wm','density','480');adb('shell','settings','put','system','font_scale',String(scale));adb('reverse','tcp:8088','tcp:8088');launch();await waitFor('Wingdex navigation');await tap('Wingdex navigation');
const current=ui();if(labelNode(current,'buffacoin-check-status')){await tap('buffacoin-check-status');await waitFor('Rating submitted!');await tap('Rate another');}
let rate=labelNode(ui(),'Rate · 1');if(!rate){adb('shell','input','swipe',String(width*1.5),String(height*2.2),String(width*1.5),String(height*.7),'450');await pause(700);rate=labelNode(ui(),'Rate · 1');}
tapNode(rate);await waitFor('Skip photo upload and continue');await capture('buffacoin-optional-photo');await tap('Skip photo upload and continue');await waitFor('Next');
for(let step=0;step<9;step++)await tap('Next');await tap('Yes');await capture('buffacoin-before-submit');
tapNode(nodes(ui()).find(n=>/(?:text|content-desc)="Spend 1/.test(n)&&n.includes('Submit')));
await waitFor('Checking your rating');await capture('buffacoin-unresolved');await tap('Later');await waitFor('buffacoin-check-status');await capture('buffacoin-check-status');
launch();await waitFor('Wingdex navigation');await tap('Wingdex navigation');await waitFor('buffacoin-check-status');await capture('buffacoin-restart-status');
await tap('buffacoin-check-status');await waitFor('Rating submitted!');await capture('buffacoin-confirmed');
writeFileSync(`${out}/buffacoin-result.json`,JSON.stringify({width,scale,fixture:true,result:'lost response, persistent Check Rating Status after restart, existing receipt confirmed; synthetic ledger only'},null,2));
