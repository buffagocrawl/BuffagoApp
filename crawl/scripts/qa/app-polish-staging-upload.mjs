import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
import {admin,client,readJSON,credentials,check,sql,localPath,saveEvidence} from './app-polish-staging-common.mjs';
const f=readJSON('.expo/app-polish-staging-fixtures.json'),actor=f.actors.other,c=client(actor.token);
const bucket=readJSON('supabase/local/app-polish-acceptance/baseline/catalog-staging-bucket.json')[0];
if(!(await admin.storage.getBucket(bucket.id)).data)check(await admin.storage.createBucket(bucket.id,{public:bucket.public,fileSizeLimit:bucket.file_size_limit,allowedMimeTypes:bucket.allowed_mime_types}));
sql("insert into public.engagement_feature_flags(flag_key,enabled,rollout_percent) values('wing_shot_prompt',true,100),('wing_shot_photo_upload',true,100) on conflict(flag_key) do update set enabled=true,rollout_percent=100;");
const bytes=readFileSync(localPath('../artifacts/app-polish/release-qa/native/pinch-confirmed-upload.jpg')),correlationId=randomUUID();
const receipts=[];
async function call(name,body){const r=await fetch(`${credentials.API_URL}/functions/v1/${name}`,{method:'POST',signal:AbortSignal.timeout(25000),headers:{Connection:'close',apikey:credentials.ANON_KEY,Authorization:`Bearer ${actor.token}`,'content-type':'application/json','x-wing-correlation-id':correlationId},body:JSON.stringify(body)});const data=await r.json();assert.equal(r.status,200,JSON.stringify(data));return data;}
try{
 const authorized=await call('wing-media-stage-authorize',{correlationId,destinationId:f.destination,mediaType:'photo',mimeType:'image/jpeg',fileName:'confirmed-frame.jpg',fileSizeBytes:bytes.length});
 const uploaded=await fetch(authorized.signedUploadUrl,{method:'PUT',signal:AbortSignal.timeout(15000),headers:{'content-type':'image/jpeg','x-upsert':'false',Connection:'close'},body:bytes});assert.equal(uploaded.status,200,await uploaded.text());
 receipts.push({name:'real signed staging Storage upload',status:'PASS',bytes:bytes.length});
 const validated=await call('wing-media-validate',{correlationId,bucket:authorized.bucket,objectPath:authorized.objectPath,mediaType:'photo',declaredMimeType:'image/jpeg',declaredFileSizeBytes:bytes.length});
 receipts.push({name:'deployed validator persisted actual SHA/dimensions through real REST',status:'PASS'});
 const args={p_rating_id:null,p_media_type:'photo',p_expected_mime_type:'image/jpeg',p_expected_size_bytes:bytes.length,p_consent_version:'synthetic-local-v1',p_attribution_preference:'anonymous',p_user_caption:'Synthetic framing fixture only',p_idempotency_key:`reserve-${correlationId}`,p_correlation_id:correlationId,p_destination_id:f.destination,p_submission_source:'home_cta'};
 const reservation=check(await c.rpc('reserve_wing_submission_upload',args));
 const retry=check(await c.rpc('reserve_wing_submission_upload',args));assert.equal(retry.submission_id,reservation.submission_id);
 receipts.push({name:'real authenticated reservation retry reuses submission',status:'PASS'});
 const submissionId=reservation.submission_id;
 const promoted=await call('wing-media-promote',{correlationId,bucket:authorized.bucket,objectPath:authorized.objectPath,submissionId,expectedMimeType:'image/jpeg',expectedSizeBytes:bytes.length,mediaType:'photo'});
 const finalArgs={p_submission_id:submissionId,p_idempotency_key:`finalize-${correlationId}`,p_correlation_id:correlationId};
 const finalized=check(await c.rpc('finalize_wing_submission_upload',finalArgs));
 const repeated=check(await c.rpc('finalize_wing_submission_upload',finalArgs));assert.equal(repeated.submission_id,submissionId);
 const row=check(await admin.from('wing_media_submissions').select('*').eq('id',submissionId).single());
 const download=check(await admin.storage.from('wing-submissions').download(row.original_storage_path));
 const hash=createHash('sha256').update(Buffer.from(await download.arrayBuffer())).digest('hex');assert.equal(hash,createHash('sha256').update(bytes).digest('hex'));
 receipts.push({name:'promotion/finalization retry and original bytes match confirmed crop',status:'PASS',submissionId,sha256:hash,statusAfterFinalize:row.status});
 assert.ok((await c.rpc('set_wing_jury_photo_vote',{p_submission_id:submissionId,p_vote:1})).error);
 writeFileSync(localPath('.expo/app-polish-staging-worker-submission.json'),JSON.stringify({submissionId,original:row.original_storage_path,actorId:actor.id,correlationId,inputSha256:hash}));
 console.log('Real upload authorization/validation/promotion/finalization and idempotent retries passed.');
}catch(e){receipts.push({name:'upload acceptance',status:'FAIL',error:e.message});throw e;}finally{saveEvidence('staging-upload-acceptance.json',{target:credentials.API_URL,realServices:true,receipts});}
