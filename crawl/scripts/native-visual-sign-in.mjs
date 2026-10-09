// Run against normal Metro (BUFFAGO_NATIVE_VISUAL_QA unset). Never submits auth.
import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
const adb=path.join(process.env.LOCALAPPDATA,'Android/Sdk/platform-tools/adb.exe');
const run=(...args)=>execFileSync(adb,args,{maxBuffer:20*1024*1024,timeout:30000});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const out='artifacts/visual-polish-v2/completion/sign-in';mkdirSync(out,{recursive:true});
let metroReady=false;
for(let attempt=0;attempt<30;attempt++) {
 try {metroReady=(await fetch('http://127.0.0.1:8081/status')).ok;}catch{}
 if(metroReady)break;
 await wait(2000);
}
if(!metroReady)throw new Error('Local Metro is not ready');
for(const scale of [1,1.3])for(const width of [320,360,390,430]) {
 const height={320:740,360:800,390:844,430:932}[width];
 run('shell','wm','size',`${width*3}x${height*3}`);run('shell','wm','density','480');
 run('shell','settings','put','system','font_scale',String(scale));run('reverse','tcp:8081','tcp:8081');
 run('shell','am','force-stop','com.buffago.app');
 run('shell','am','start','-a','android.intent.action.VIEW','-d','buffago://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081','com.buffago.app');
 await wait(14000);
 for(let attempt=0;attempt<12;attempt++) {
  run('shell','uiautomator','dump','/sdcard/native-ready.xml');
  if(run('shell','cat','/sdcard/native-ready.xml').toString().includes('Home navigation'))break;
  await wait(5000);
 }
 run('shell','input','tap',String(Math.round(width*3*.9)),String(height*3-110));await wait(2000);
 run('shell','uiautomator','dump','/sdcard/native-visual.xml');
 const xml=run('shell','cat','/sdcard/native-visual.xml').toString();
 if(!xml.includes('Sign in to see your Journey'))throw new Error('Normal sign-in gate was not reached');
 writeFileSync(`${out}/${width}-font${scale}-journey-sign-in-native.png`,run('exec-out','screencap','-p'));
 console.log(`Native sign-in ${width}dp font ${scale}`);
}
