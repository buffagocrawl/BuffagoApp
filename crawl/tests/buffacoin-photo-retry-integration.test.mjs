import test from 'node:test';
import assert from 'node:assert/strict';
import { submitBuffacoinRatingTransaction } from '../lib/buffacoinRatingTransaction.js';
import { createRatingPhotoAttachment } from '../lib/ratingPhotoAttachment.js';
import { createWingShotDraftStore } from '../lib/wingShotDraftStore.js';
import { createWingShotUploadSession, submitWingShot } from '../lib/wingShots.js';

test('ambiguous coin receipt retry and failed/concurrent photo retries keep one debit, rating and media upload',async()=>{
 const receipts=new Map(), submissions=new Map(), disk=new Map();
 const owner='10000000-0000-4000-a000-000000000001', restaurant='10000000-0000-4000-a000-000000000002';
 const rating='10000000-0000-4000-a000-000000000003', photo='10000000-0000-4000-a000-000000000004';
 let balance=100,coinCalls=0,debits=0,reserves=0,promotes=0,finalizes=0;
 const coinClient={rpc:async(name,args)=>{
  assert.equal(name,'submit_buffacoin_rating_v1');coinCalls++;
  if(!receipts.has(args.p_operation_id)){
   balance-=args.p_coin_cost;debits++;
   receipts.set(args.p_operation_id,{operation_id:args.p_operation_id,rating_id:rating,crawl_id:'crawl-a',new_balance:balance});
   throw new Error('network response lost after commit');
  }
  return {data:receipts.get(args.p_operation_id),error:null};
 }};
 const transaction={supabase:coinClient,operationId:'same-coin-operation',destinationId:restaurant,stateCode:'NY',coinCost:1,
  rating:{crispiness:8,sauce:9,meat:8,overall:9}};
 await assert.rejects(submitBuffacoinRatingTransaction(transaction),/response lost/);
 assert.equal(coinCalls,1,'ambiguous commit must not automatically retry');
 const receipt=await submitBuffacoinRatingTransaction(transaction);
 const privatePath=`originals/${owner}/${photo}/source`;
 const photoClient={storage:{from:()=>({upload:async()=>{throw new Error('staged media must not upload again');}})},auth:{getSession:async()=>({data:{session:{access_token:'fixture-token',user:{id:owner}}}})},
  functions:{invoke:async(name)=>{
   assert.equal(name,'wing-media-promote');promotes++;
   return {data:{ok:true,promoted:true,bucket:'wing-submissions',path:privatePath},error:null};
  }},rpc:async(name,args)=>{
   if(name==='reserve_wing_submission_upload'){
    reserves++;assert.equal(args.p_rating_id,receipt.rating_id);assert.equal(args.p_destination_id,restaurant);
    return {data:{submission_id:photo,bucket:'wing-submissions',upload_path:privatePath},error:null};
   }
   if(name==='get_my_wing_submission_history')return {data:[...submissions.values()].map(row=>({...row,display_status:'In Review'})),error:null};
   assert.equal(name,'finalize_wing_submission_upload');finalizes++;
   if(finalizes===1)return {error:{message:'temporary failure'}};
   assert.equal(args.p_submission_id,photo);
   submissions.set(args.p_submission_id,{submission_id:photo,status:'in_review'});
   return {data:submissions.get(photo),error:null};
  }};
 const drafts=createWingShotDraftStore({getItem:async key=>disk.get(key),setItem:async(key,value)=>disk.set(key,value),removeItem:async key=>disk.delete(key)});
 let seq=0;const session=createWingShotUploadSession(()=>`fixture-key-${++seq}`);
 session.staging={bucket:'wing-shot-staging',objectPath:'private/fixture-photo',correlationId:session.correlationId,uploadCompleted:true};
 const pending={ratingId:receipt.rating_id,destinationId:restaurant,operationId:receipt.operation_id,
  draft:{session,media:{kind:'photo',mimeType:'image/jpeg',sizeBytes:100,getUploadBody:async()=>{throw new Error('staged media must not be reread');}},consentAccepted:true,attributionPreference:'anonymous',caption:''}};
 const attach=createRatingPhotoAttachment({submit:submitWingShot,drafts,client:photoClient,userId:owner,flow:'wingdex-rating'});
 await assert.rejects(attach(pending),error=>error.code==='finalization_failed');
 const restored=await drafts.load({userId:owner,flow:'wingdex-rating'});
 assert.equal(restored.draft.session.uploadCompleted,true);
 assert.equal(restored.ratingOperationId,transaction.operationId);
 const retry={...pending,draft:restored.draft};
 const first=attach(retry);assert.equal(await attach(retry),null);await first;
 await assert.rejects(attach(retry),/replaced/);
 assert.deepEqual({balance,debits,ratings:receipts.size,coinCalls,reserves,promotes,finalizes,photos:submissions.size},
  {balance:99,debits:1,ratings:1,coinCalls:2,reserves:1,promotes:1,finalizes:2,photos:1});
 assert.equal(await drafts.load({userId:owner,flow:'wingdex-rating'}),null);
});
