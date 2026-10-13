import test from 'node:test';
import assert from 'node:assert/strict';
import { scheduleWingmanFocus } from '../lib/wingmanFocus.js';
import { confirmedWingShotCrop } from '../lib/wingShotFraming.js';
import { mobileModule, hookRuntime, findElement } from './helpers/mobile-runtime.mjs';

const flush = async () => { for (let i=0;i<30;i++) await Promise.resolve(); };
const all = (tree, type) => !tree ? [] : Array.isArray(tree) ? tree.flatMap(n=>all(n,type))
  : [...(tree.type===type ? [tree] : []), ...all(tree.props?.children,type)];

test('focus retries after transitions, avoids refocusing typing, and cancels stale steps',()=>{
  const scheduled=[];let input=null;let focused=false;let calls=0;
  const cleanup=scheduleWingmanFocus(()=>input,{schedule:(fn,delay)=>{scheduled.push({fn,delay});return scheduled.length-1;},cancel:id=>scheduled[id].cancelled=true});
  scheduled[0].fn();input={focus(){calls++;focused=true;},isFocused:()=>focused};scheduled[1].fn();scheduled[1].fn();
  assert.equal(calls,1);assert.deepEqual(scheduled.map(t=>t.delay),[0,350]);
  cleanup();assert.ok(scheduled.every(t=>t.cancelled));
});

test('Wingman native modal focuses town then details and preserves both in verification retries',async()=>{
  const runtime=hookRuntime();const inputs=[];const focused=[];const requests=[];const timers=[];
  const {default:Dialog}=mobileModule('components/WingmanAddDialog.jsx',{
    '../lib/wingmanAsync':mobileModule('lib/wingmanAsync.ts',{}),
    '../supabase/functions/_shared/wingmanConfidence':mobileModule('supabase/functions/_shared/wingmanConfidence.ts',{}),
    react:runtime.react,'react/jsx-runtime':runtime.jsx,
    'react-native':{View:'view',ScrollView:'scroll',Pressable:'pressable',Alert:{alert(){}},Modal:'modal',Keyboard:{dismiss(){}},KeyboardAvoidingView:'keyboard',Platform:{OS:'ios'}},
    'react-native-paper':{Portal:'portal',Dialog:Object.assign('dialog',{Title:'title',Content:'content',ScrollArea:'area',Actions:'actions'}),Text:'text',Button:'button',TextInput:'input',ActivityIndicator:'spinner'},
    '../lib/wingmanFocus':{scheduleWingmanFocus:get=>scheduleWingmanFocus(get,{schedule:fn=>{timers.push(fn);return timers.length-1;},cancel:id=>timers[id]=()=>{}})},
    '../lib/supabase.js':{supabase:{from:()=>({select(){return this;},order:async()=>({data:[]})})}},
    '../lib/Wingman/WingmanService.ts':{WingmanService:class{async run(request){requests.push(request);return {success:false,userMessage:'Fixture verification retry'};}}},
  });
  const props={visible:true,initialRestaurant:'Fixture Wings',initialStateId:1,initialStateCode:'NY'};
  const render=()=>{const tree=runtime.render(Dialog,props);for(const node of all(tree,'input')){inputs.push(node);node.props.ref.current={focus:()=>focused.push(node.props.testID),isFocused:()=>false};}return tree;};
  render();let tree=render();all(tree,'modal')[0].props.onShow();tree=render();timers.splice(0).forEach(fn=>fn());
  assert.equal(focused.at(-1),'wingman-restaurant-name');
  all(tree,'button').find(n=>n.props.children==='Search').props.onPress();await flush();tree=render();timers.splice(0).forEach(fn=>fn());
  assert.equal(focused.at(-1),'wingman-city');findElement(tree,'wingman-city').props.onChangeText('Buffalo');tree=render();
  all(tree,'button').find(n=>n.props.children==='Search').props.onPress();await flush();tree=render();timers.splice(0).forEach(fn=>fn());
  assert.equal(focused.at(-1),'wingman-extra-info');findElement(tree,'wingman-extra-info').props.onChangeText('Near the harbor');tree=render();
  all(tree,'button').find(n=>n.props.children==='Search').props.onPress();await flush();render();
  assert.equal(requests.at(-1).city,'Buffalo');assert.equal(requests.at(-1).extraInfo,'Near the harbor');
  assert.ok(requests.at(-1).rawInput.includes('Buffalo Near the harbor'));
  assert.equal(inputs.findLast(n=>n.props.testID==='wingman-extra-info').props.value,'Near the harbor');
  runtime.unmount();
});

test('confirmed square cannot expose blank pixels, including rounding and extreme pans',()=>{
  for(const [width,height] of [[4032,3024],[3024,4032],[2048,2048],[1,1]]){
    for(const x of [-1e6,-0.3,0,width-0.1,1e6])for(const y of [-1e6,0,height,1e6]){
      const crop=confirmedWingShotCrop({originX:x,originY:y,width:Math.min(width,height)/2+0.8,height:Math.min(width,height)/2+0.8},width,height);
      assert.equal(crop.width,crop.height);assert.ok(crop.originX>=0&&crop.originY>=0);
      assert.ok(crop.originX+crop.width<=width&&crop.originY+crop.height<=height);
      assert.ok(Object.values(crop).every(Number.isInteger));
    }
  }
  assert.throws(()=>confirmedWingShotCrop({originX:0,originY:NaN,width:20,height:20},200,300));
});

test('framing preview resets, cancels, and confirms the actual crop once',async()=>{
  const runtime=hookRuntime();let reset=0,cancel=0;const crops=[],confirmed=[];let finish;
  const pending=new Promise(resolve=>finish=resolve);
  const {WingShotFramingPreview}=mobileModule('components/wingShots/WingShotFramingPreview.tsx',{
    react:runtime.react,'react/jsx-runtime':runtime.jsx,'react-native':{Image:'image',Pressable:'pressable',Text:'text',View:'view',useWindowDimensions:()=>({width:390,height:844})},
    'react-native-gesture-handler':{GestureHandlerRootView:'root'},'react-native-zoom-toolkit':{CropZoom:'crop'},
    './mediaAdapter':{frameWingShotMedia:async(media,rect)=>{crops.push(rect);await pending;return {...media,uri:'confirmed.jpg'};}},
  });
  const props={media:{uri:'original.jpg',width:2048,height:1536},onConfirm:m=>confirmed.push(m),onCancel:()=>cancel++};
  const render=()=>runtime.render(WingShotFramingPreview,props);let tree=render();
  const crop=all(tree,'crop')[0];assert.equal(crop.props.panMode,'clamp');assert.equal(crop.props.scaleMode,'clamp');
  crop.props.ref.current={reset:()=>reset++,crop:()=>({crop:{originX:100,originY:200,width:800,height:800}})};
  assert.equal(findElement(tree,'wing-shot.frame-confirm').props.disabled,true);
  all(tree,'image')[0].props.onLoad();tree=render();findElement(tree,'wing-shot.frame-reset').props.onPress();assert.equal(reset,1);
  findElement(tree,'wing-shot.frame-confirm').props.onPress();findElement(tree,'wing-shot.frame-confirm').props.onPress();
  assert.equal(crops.length,1);assert.equal(confirmed.length,0);finish();await flush();assert.equal(confirmed[0].uri,'confirmed.jpg');
  findElement(render(),'wing-shot.frame-cancel').props.onPress();assert.equal(cancel,1);runtime.unmount();
});

test('the upload adapter bakes the crop before resizing and retains its original source',async()=>{
  const operations=[];let crop=null,resize=null;
  const {frameWingShotMedia}=mobileModule('components/wingShots/mediaAdapter.ts',{
    'react-native':{Platform:{OS:'ios'}},'expo-file-system':{File:class{size=1024;}},'expo-image-picker':{},
    '../../lib/wingShotFraming':{confirmedWingShotCrop},'../../lib/wingShotLimits':{WING_SHOT_PHOTO_MAX_BYTES:20*1024*1024},
    'expo-image-manipulator':{SaveFormat:{JPEG:'jpeg'},ImageManipulator:{manipulate:uri=>{
      operations.push(['source',uri]);return {crop:rect=>{crop=rect;operations.push(['crop',rect]);},resize:size=>{resize=size;operations.push(['resize',size]);},
        renderAsync:async()=>({saveAsync:async options=>{operations.push(['save',options]);return {uri:'confirmed.jpg',width:resize?.width||crop.width,height:resize?.width||crop.height};}})};
    }}},
  });
  // The normalized decoder's dimensions are authoritative after EXIF rotation.
  const selected={uri:'oriented.jpg',originalUri:'camera.heic',width:3024,height:4032,kind:'photo',mimeType:'image/jpeg',sizeBytes:12};
  const framed=await frameWingShotMedia(selected,{originX:12.3,originY:300.2,width:3000,height:3000});
  assert.deepEqual(operations.map(([kind])=>kind),['source','crop','resize','save']);
  assert.deepEqual(crop,{originX:12,originY:300,width:3000,height:3000});assert.equal(resize.width,2048);
  assert.equal(framed.uri,'confirmed.jpg');assert.equal(framed.thumbnailUri,framed.uri);assert.equal(framed.originalUri,'camera.heic');
  assert.equal(framed.width,2048);assert.equal(framed.height,2048);assert.equal(framed.sizeBytes,1024);
  assert.equal(operations.at(-1)[1].compress,0.95);
  await assert.rejects(framed.getUploadBody(),/Native media/);
});
