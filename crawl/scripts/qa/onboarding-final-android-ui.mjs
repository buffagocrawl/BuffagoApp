// Guest-only UI evidence helper. Do not enter credentials or use a personal install.
import {execFileSync} from 'node:child_process';
import {writeFileSync,mkdirSync,appendFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const dir=fileURLToPath(new URL('../../../artifacts/onboarding-v2-final-qa/',import.meta.url));mkdirSync(dir+'ui',{recursive:true});
const serial=process.env.QA_ANDROID_SERIAL||'emulator-5554';
const adb=(...args)=>execFileSync('adb',['-s',serial,...args],{timeout:20000,maxBuffer:4*1024*1024});
const log=x=>appendFileSync(dir+'actions.jsonl',JSON.stringify({time:new Date().toISOString(),device: 'Android QA emulator',...x})+'\n');
function nodes(){adb('shell','rm','-f','/sdcard/onboarding-qa.xml');adb('shell','uiautomator','dump','/sdcard/onboarding-qa.xml');const xml=adb('shell','cat','/sdcard/onboarding-qa.xml').toString();const rows=[...xml.matchAll(/<node\s+([^>]+)>/g)].map(m=>Object.fromEntries([...m[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(a=>[a[1],a[2].replaceAll('&amp;','&').replaceAll('&apos;',"'").replaceAll('&quot;','"')])));return {xml,rows};}
const [action,...args]=process.argv.slice(2);
if(action==='launch'){
 adb('shell','am','force-stop','com.buffago.app');const started=Date.now();
 adb('shell','am','start','-a','android.intent.action.VIEW','-d','buffago://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081','com.buffago.app');
 let home=false;
 while(Date.now()-started<60000){try{const current=nodes();home=current.rows.some(n=>n['content-desc']==='Home navigation');if(home)break;}catch{}}
 if(home){adb('shell','screencap','-p','/sdcard/onboarding-qa.png');writeFileSync(dir+'screenshots/'+args[0]+'.png',adb('exec-out','cat','/sdcard/onboarding-qa.png'));}
 log({action,name:args[0],home,elapsedMs:Date.now()-started,pid:adb('shell','pidof','com.buffago.app').toString().trim()});
 if(!home)throw Error('Home not reached');
}
if(action==='nodes'){console.log(nodes().rows.filter(n=>n.text||n['content-desc']).map(n=>({text:n.text,label:n['content-desc'],bounds:n.bounds})));}
if(action==='tap'){const target=nodes().rows.find(n=>n.text===args[0]||n['content-desc']===args[0]);if(!target)throw Error('Visible target missing: '+args[0]);const b=target.bounds.match(/\d+/g).map(Number);if(b[2]<=b[0]||b[3]<=b[1])throw Error('Target is offscreen');adb('shell','input','tap',String((b[0]+b[2])>>1),String((b[1]+b[3])>>1));log({action,target:args[0]});}
if(action==='shot'){const {xml}=nodes();writeFileSync(dir+'ui/'+args[0]+'.xml',xml);adb('shell','screencap','-p','/sdcard/onboarding-qa.png');writeFileSync(dir+'screenshots/'+args[0]+'.png',adb('exec-out','cat','/sdcard/onboarding-qa.png'));log({action,name:args[0]});}
if(action==='back'){adb('shell','input','keyevent','4');log({action});}
if(action==='input'){adb('shell','input','text',args[0].replaceAll(' ','%s'));log({action,characters:args[0].length});}
