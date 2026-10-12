import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {loadBuffacoinRatingCosts,refreshBuffacoinRatingQuote} from '../lib/buffacoinPricing.js';
import {classifyBuffacoinTransactionError} from '../lib/buffacoinRatingTransaction.js';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const owner='10000000-0000-4000-a000-000000000001',other='10000000-0000-4000-a000-000000000002',dest='20000000-0000-4000-a000-000000000001';
function client(quote){const calls=[];return {calls,auth:{getSession:async()=>({data:{session:{user:{id:owner},access_token:'owner-token'}}})},rpc:(name,args)=>({setHeader:async(k,v)=>{calls.push({name,args,k,v});return quote(args);}})};}
test('exact quote counts beyond response caps, isolates owner/restaurant/paid status, and denies guest access',async()=>{
 const db=new PGlite();try{
  await db.exec(read('./helpers/buffacoin-transaction-fixture.sql'));
  await db.exec(read('../supabase/proposals/android-qa-issue14-buffacoin-confirmation.sql'));
  await db.query(`insert into destination_ratings(id,user_id,destination_id,is_buffacoin) select gen_random_uuid(),$1,$2,true from generate_series(1,1101)`,[owner,dest]);
  await db.query(`insert into destination_ratings(id,user_id,destination_id,is_buffacoin) values(gen_random_uuid(),$1,$2,false),(gen_random_uuid(),$3,$2,true),(gen_random_uuid(),$1,gen_random_uuid(),true)`,[owner,dest,other]);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);
  const c=client(async args=>({data:(await db.query('select * from get_my_buffacoin_rating_costs($1)',[args.p_destination_ids])).rows}));
  assert.equal(await refreshBuffacoinRatingQuote({supabase:c,destinationId:dest,userId:owner}),1102);
  await db.query(`insert into destination_ratings(id,user_id,destination_id,is_buffacoin) values(gen_random_uuid(),$1,$2,true)`,[owner,dest]);
  assert.equal(await refreshBuffacoinRatingQuote({supabase:c,destinationId:dest,userId:owner}),1103,'refresh observes a new paid rating');
  assert.equal(c.calls[0].v,'Bearer owner-token');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[other]);
  assert.equal((await db.query('select * from get_my_buffacoin_rating_costs($1)',[[dest]])).rows[0].coin_cost,2);
  const roles=(await db.query("select has_function_privilege('anon','get_my_buffacoin_rating_costs(uuid[])','EXECUTE') as anon,has_function_privilege('authenticated','get_my_buffacoin_rating_costs(uuid[])','EXECUTE') as authenticated")).rows[0];
  assert.deepEqual(roles,{anon:false,authenticated:true});
  await db.exec("select set_config('request.jwt.claim.sub','',false)");
  await assert.rejects(db.query('select * from get_my_buffacoin_rating_costs($1)',[[dest]]),/unauthorized/);
 }finally{await db.close();}
});
test('quotes batch all requested destinations and reject incomplete results or account changes without fallback',async()=>{
 const ids=Array.from({length:205},(_,i)=>String(i));const c=client(async args=>({data:args.p_destination_ids.map(destination_id=>({destination_id,coin_cost:5}))}));
 assert.equal(Object.keys(await loadBuffacoinRatingCosts({supabase:c,destinationIds:ids,userId:owner})).length,205);
 assert.deepEqual(c.calls.map(c=>c.args.p_destination_ids.length),[100,100,5]);
 await assert.rejects(refreshBuffacoinRatingQuote({supabase:client(async()=>({data:[]})),destinationId:dest,userId:owner}),/quote_unavailable/);
 await assert.rejects(refreshBuffacoinRatingQuote({supabase:c,destinationId:dest,userId:other}),/account_changed/);
 await assert.rejects(refreshBuffacoinRatingQuote({supabase:c,destinationId:dest,userId:owner,isCurrent:()=>false}),/account_changed/);
});
test('confirmation refresh and submission preflight require new consent while recovery keeps the original payment request',()=>{
 const source=read('../app/(tabs)/ratings/index.jsx');const wizard=read('../components/RatingWizardDialog.jsx');
 assert.match(source,/onBeforeConfirmation=\{refreshCoinConfirmationQuote\}/);
 assert.match(wizard,/step === totalSteps - 2 && onBeforeConfirmation/);
 assert.match(wizard,/if \(!await onBeforeConfirmation\(\)\) return/);
 assert.match(source,/if \(!existingOperation\) \{[\s\S]*?refreshBuffacoinRatingQuote/);
 assert.match(source,/if \(quote !== spendTimes\) \{[\s\S]*?confirm again[\s\S]*?return;/);
 assert.doesNotMatch(source,/coinCountsByDest|nextCostObj/);
 assert.equal(classifyBuffacoinTransactionError({code:'P0001',message:'coin_cost_mismatch'},{previouslyDispatched:true}),'definitive_failure');
 assert.equal(classifyBuffacoinTransactionError({message:'timeout'},{previouslyDispatched:true}),'ambiguous');
});
test('cost mismatch rolls back, renewed consent pays once, and a lost response replays the original price and receipt',async()=>{
 const {createBuffacoinOperationStore,reconcileBuffacoinOperation}=await import('../lib/buffacoinOperationStore.js');
 const db=new PGlite();try{
  await db.exec(read('./helpers/buffacoin-transaction-fixture.sql'));
  await db.exec(read('../supabase/proposals/android-qa-issue14-buffacoin-confirmation.sql'));
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);
  await db.query("insert into states values(1,'NY');");
  await db.query('insert into destinations values($1,1)',[dest]);
  await db.query('insert into buffacoin_wallets(user_id,balance) values($1,10)',[owner]);
  await db.query('insert into destination_ratings(id,user_id,destination_id,is_buffacoin) values(gen_random_uuid(),$1,$2,true)',[owner,dest]);
  const values=new Map();const storage={getItem:async k=>values.get(k)??null,setItem:async(k,v)=>values.set(k,v),removeItem:async k=>values.delete(k)};
  const store=createBuffacoinOperationStore(storage),operationId='30000000-0000-4000-a000-000000000001';
  const request={userId:owner,operationId,destinationId:dest,stateCode:'NY',coinCost:1,rating:{sauce:8,crispiness:8,meat:8,overall:9}};
  let loseResponse=false;
  const rpc={rpc:async(_name,args)=>{
    try{
      const rows=(await db.query('select * from submit_buffacoin_rating_v1($1,$2,$3,$4,$5)',[args.p_operation_id,args.p_destination_id,args.p_state_code,args.p_coin_cost,args.p_rating])).rows;
      if(loseResponse){loseResponse=false;throw new Error('response lost');}
      return {data:rows,error:null};
    }catch(error){return {error};}
  }};
  await store.prepare(request);
  // Simulate a previous dispatch with an unknown outcome; receipt lookup precedes mismatch.
  await store.update({userId:owner,operationId,status:'ambiguous'});
  const failed=await reconcileBuffacoinOperation({store,supabase:rpc,userId:owner});
  assert.equal(failed.status,'definitive_failure');assert.equal(failed.error.message,'coin_cost_mismatch');
  assert.equal((await db.query('select balance from buffacoin_wallets')).rows[0].balance,10);
  assert.equal((await db.query('select count(*)::int n from buffacoin_ledger')).rows[0].n,0);
  const reopened=createBuffacoinOperationStore(storage);
  assert.equal((await reconcileBuffacoinOperation({store:reopened,supabase:rpc,userId:owner})).error.message,'coin_cost_mismatch');
  await reopened.clear({userId:owner,operationId});
  const quoted=(await db.query('select * from get_my_buffacoin_rating_costs($1)',[[dest]])).rows[0].coin_cost;
  assert.equal(quoted,2);
  // Only explicit renewed consent prepares the revised quote, using the same safe ID.
  await reopened.prepare({...request,coinCost:quoted});loseResponse=true;
  assert.equal((await reconcileBuffacoinOperation({store:reopened,supabase:rpc,userId:owner})).status,'ambiguous');
  assert.equal((await db.query('select * from get_my_buffacoin_rating_costs($1)',[[dest]])).rows[0].coin_cost,3);
  const replay=await reconcileBuffacoinOperation({store:reopened,supabase:rpc,userId:owner});
  assert.equal(replay.status,'committed');assert.equal(replay.receipt.new_balance,8);
  const counts=(await db.query('select (select count(*)::int from buffacoin_ledger) debits,(select count(*)::int from destination_ratings) ratings,(select count(*)::int from buffacoin_rating_operations) receipts')).rows[0];
  assert.deepEqual(counts,{debits:1,ratings:2,receipts:1});
 }finally{await db.close();}
});
test('actual submission preflight never prepares payment when price changes, is unknown, or cannot be fetched',async()=>{
 const {default:vm}=await import('node:vm');const source=read('../app/(tabs)/ratings/index.jsx');
 const start=source.indexOf('async (payload, existingOperation = null) => {');const end=source.indexOf('}, [\n  accountScope',start)+1;
 for(const [oldCost,newCost,fail] of [[1,2,false],[null,1,false],[1,1,true]]){
  let prepared=0,display=null;const alerts=[];
  const scope={user:{id:owner},coinRatingDest:{destination_id:dest,stateCode:'NY'},coinCostForActive:oldCost,
    coinSubmitRef:{current:false},confirmedCoinDestinations:{current:new Set()},accountScope:{capture:()=>1,current:()=>true},accountRef:{current:owner},
    setCoinSubmitting:()=>{},setCoinCostForActive:value=>{display=value;},setCoinCostByDest:()=>{},supabase:{},
    refreshBuffacoinRatingQuote:async()=>{if(fail)throw new Error('offline');return newCost;},
    coinOperationStore:{prepare:async()=>{prepared++;}},Alert:{alert:(...args)=>alerts.push(args)}};
  const submit=vm.runInNewContext('('+source.slice(start,end)+')',scope);
  await submit({wouldOrderAgain:true});
  assert.equal(prepared,0);assert.equal(scope.coinSubmitRef.current,false);
  assert.equal(alerts[0][0],fail?'Price unavailable':'BuffaCoin price updated');
  if(!fail)assert.equal(display,newCost);
 }
});
test('actual wizard blocks entry to confirmation until the quote callback succeeds',async()=>{
 const {default:vm}=await import('node:vm');const source=read('../components/RatingWizardDialog.jsx');
 const start=source.indexOf('async () => {',source.indexOf('const goNext'));const end=source.indexOf('\n  };',start)+4;
 for(const available of [false,true]){
  let step=8,calls=0;const scope={saving:false,finalizeInFlightRef:{current:false},step,totalSteps:10,
    onBeforeConfirmation:async()=>{calls++;return available;},setStep:fn=>{step=fn(step);}};
  await vm.runInNewContext('('+source.slice(start,end)+')',scope)();
  assert.equal(calls,1);assert.equal(step,available?9:8);assert.equal(scope.finalizeInFlightRef.current,false);
 }
});
