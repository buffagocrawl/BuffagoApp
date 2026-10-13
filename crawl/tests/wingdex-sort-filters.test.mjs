import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {selectWingdexCollection,matchesWingdexRestaurant,wingdexEmptyState,readAllWingdexRows,WINGDEX_SELECTION_DEFAULTS} from '../lib/wingdexCollection.js';
const rows=Array.from({length:1201},(_,i)=>({destination_id:String(i),name:`Wings ${i}`,stateCode:i%2?'NY':'CT',distanceMi:i,count:i%3,avgWeight:i,myAvgWeight:i,ratedByMe:i%2===1,countsByTag:{7:i%2}}));
const base={...WINGDEX_SELECTION_DEFAULTS,locationMode:'all'};
for(const tab of ['discover','favorites','wantToTry']){
 test(`${tab}: shared predicates and all existing order options operate on the full collection`,()=>{
  const selection={...base,selectedTagId:7,stateCodeFilter:'NY',locationMode:'state'};
  for(const sort of ['overall','nearest','ratings','photos']){
   const selected=selectWingdexCollection(rows,{...selection,sort},{hasCoordinates:true,pictureCounts:{1199:100}});
   assert.equal(selected.length,600);assert.ok(selected.every(r=>r.stateCode==='NY'&&r.countsByTag[7]>0));
   if(sort==='nearest')assert.equal(selected[0].destination_id,'1');
   if(sort==='photos')assert.equal(selected[0].destination_id,'1199');
   if(sort==='overall')assert.equal(selected[0].destination_id,'1199');
   if(sort==='ratings')assert.equal(selected[0].count,2);
  }
  assert.ok(selectWingdexCollection(rows,{...base,query:'Wings 1200'}).some(r=>r.destination_id==='1200'),'match outside initial render/server page');
 });
 test(`${tab}: filtered empty is distinct from no saved restaurants and clear/reset recover`,()=>{
  const selected={...base,query:'no-match'};assert.equal(selectWingdexCollection(rows,selected).length,0);assert.equal(wingdexEmptyState(rows.length,selected),'filtered');assert.equal(wingdexEmptyState(0,selected),'empty');
  assert.equal(selectWingdexCollection(rows,base).length,1201);
  assert.equal(selectWingdexCollection(rows,WINGDEX_SELECTION_DEFAULTS,{hasCoordinates:true}).length,6);
 });
}
test('tab changes preserve shared selections and cannot bypass the common pipeline',()=>{
 const screen=readFileSync(new URL('../app/(tabs)/ratings/index.jsx',import.meta.url),'utf8');
 assert.match(screen,/onPress=\{\(\) => setSavedView\(value\)\}/);
 assert.match(screen,/selectWingdexCollection\(rows, selection, collectionContext\)/);
 assert.match(screen,/selectWingdexCollection\(savedRows, selection, collectionContext\)/);
 assert.match(screen,/data=\{displayedRows\}/);
 assert.match(screen,/complete\.get\(row.destination_id\)/,'saved data uses complete rating metadata');
 assert.match(screen,/setSortOpen\(true\)/);assert.match(screen,/<Dialog.Title>Sort<\/Dialog.Title>/);assert.match(screen,/<Dialog.Title>Filters<\/Dialog.Title>/);
 assert.doesNotMatch(screen,/Filters & sorting|Sort & ratings/);
});
test('My ratings preserves personal-score ordering; radius handles zero coordinates and unknown distance',()=>{
 assert.equal(selectWingdexCollection(rows,{...base,selectedTagId:'my'})[0].destination_id,'1199');
 assert.equal(matchesWingdexRestaurant({...rows[0],distanceMi:6},WINGDEX_SELECTION_DEFAULTS,{hasCoordinates:true}),false);
 assert.equal(matchesWingdexRestaurant({...rows[0],distanceMi:null},WINGDEX_SELECTION_DEFAULTS,{hasCoordinates:true}),true);
 assert.equal(matchesWingdexRestaurant({...rows[0],address:'42 Main Street'},{...base,query:'main street'}),true,'saved address search preserved through common predicate');
});
test('pagination aggregates all server pages before filtering and propagates failure/cancellation',async()=>{
 const requests=[];const result=await readAllWingdexRows(()=>({range:async(a,b)=>{requests.push([a,b]);return {data:rows.slice(a,b+1),error:null};}}));
 assert.equal(result.data.length,1201);assert.equal(requests.length,4);
 const lowerCap=await readAllWingdexRows(()=>({range:async(a,b)=>({data:rows.slice(a,Math.min(b+1,a+100)),error:null})}));assert.equal(lowerCap.data.length,1201);
 assert.equal(selectWingdexCollection(result.data,{...base,query:'Wings 1200'}).length,1);
 const err={message:'offline'};assert.equal((await readAllWingdexRows(()=>({range:async()=>({error:err})}))).error,err);
 let called=false;await readAllWingdexRows(()=>{called=true;},{isCurrent:()=>false});assert.equal(called,false);
});
