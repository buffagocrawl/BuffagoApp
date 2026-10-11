import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ratingRpcRetry} from '../lib/ratingRpcRetry.js';
for(const name of ['submit_validated_restaurant_rating','submit_validated_crawl_rating','submit_buffacoin_rating_v1']) {
 test(`${name} retries whole RPC with stable identity and input`,async()=>{
  const parameters={p_operation_id:'same-operation',p_crawl_id:'same-crawl',p_rating:{overall:4}};const calls=[];
  const client={async rpc(n,p){calls.push(JSON.parse(JSON.stringify({n,p})));p.p_rating.overall=99;return calls.length<3?{error:{code:calls.length===1?'40P01':'40001'}}:{data:'receipt',error:null};}};
  assert.equal((await ratingRpcRetry(client,name,parameters,async()=>{})).data,'receipt');
  assert.equal(calls.length,3);assert.ok(calls.every(c=>JSON.stringify(c.p)===JSON.stringify(parameters)));
 });
}
test('exhaustion is bounded; authorization, uniqueness and unknown transport outcomes are never retried',async()=>{
 for(const code of ['40P01','42501','23505',undefined]){let calls=0;const error={code};assert.equal((await ratingRpcRetry({async rpc(){calls++;return {error};}},'submit_buffacoin_rating_v1',{},async()=>{})).error,error);assert.equal(calls,code==='40P01'?3:1);}
 let calls=0;await assert.rejects(ratingRpcRetry({async rpc(){calls++;throw new Error('unknown COMMIT');}},'submit_buffacoin_rating_v1',{}),/unknown COMMIT/);assert.equal(calls,1);
});
test('account switch during retry retains original bearer token; a stale caller is refused before RPC',async()=>{
 let session={user:{id:'A'},access_token:'A-token'},calls=0;const sent=[];
 const client={auth:{getSession:async()=>({data:{session},error:null})},rpc(){return {setHeader(key,value){sent.push({key,value});calls++;return Promise.resolve(calls===1?{error:{code:'40P01'}}:{data:'receipt',error:null});}};}};
 await ratingRpcRetry(client,'submit_validated_restaurant_rating',{p_operation_id:'same'},async()=>{session={user:{id:'B'},access_token:'B-token'};},'A');
 assert.equal(calls,2);assert.deepEqual(sent,[{key:'Authorization',value:'Bearer A-token'},{key:'Authorization',value:'Bearer A-token'}]);
 await assert.rejects(ratingRpcRetry(client,'submit_validated_restaurant_rating',{},async()=>{},'A'),/account_changed/);assert.equal(calls,2);
});
