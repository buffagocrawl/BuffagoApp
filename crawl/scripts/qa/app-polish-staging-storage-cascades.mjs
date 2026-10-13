import assert from 'node:assert/strict';
import {writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {admin,client,check,readJSON,sql,saveEvidence,localPath,credentials} from './app-polish-staging-common.mjs';
const f=readJSON('.expo/app-polish-staging-fixtures.json'),w=readJSON('.expo/app-polish-staging-worker-submission.json');
const receipts=process.argv.includes('--resume')?readJSON('../artifacts/app-polish/release-qa/deployment/staging-storage-cascade-acceptance.json').receipts.filter(r=>r.status==='PASS'):[];
async function step(name,fn){if(receipts.some(r=>r.name===name&&r.status==='PASS'))return;try{receipts.push({name,status:'PASS',...await fn()});}catch(e){receipts.push({name,status:'FAIL',error:e.message});throw e;}finally{saveEvidence('staging-storage-cascade-acceptance.json',{target:credentials.API_URL,realServices:true,receipts});}}
await step('actual worker produces protected derivatives and preserves cropped original in review',async()=>{
 const row=check(await admin.from('wing_media_submissions').select('*').eq('id',w.submissionId).single());assert.equal(row.status,'in_review');assert.ok(row.processed_storage_path);assert.ok(row.thumbnail_storage_path);
 const folder=localPath('../artifacts/app-polish/release-qa/staging/');mkdirSync(folder,{recursive:true});
 const files=[];
 for(const [label,path] of [['original',row.original_storage_path],['primary',row.processed_storage_path],['thumbnail',row.thumbnail_storage_path]]){
  const blob=check(await admin.storage.from('wing-submissions').download(path)),bytes=Buffer.from(await blob.arrayBuffer()),hash=createHash('sha256').update(bytes).digest('hex');
  writeFileSync(new URL(`worker-${label}.jpg`,folder),bytes);files.push({label,bytes:bytes.length,sha256:hash});
  if(label==='original')assert.equal(hash,w.inputSha256);
 }
 const job=check(await admin.from('wing_photo_derivative_jobs').select('status,attempt_count').eq('submission_id',w.submissionId).single());assert.equal(job.status,'succeeded');assert.equal(job.attempt_count,2);
 const receipt=check(await admin.from('wing_photo_derivative_receipts').select('event,attempt_number').eq('submission_id',w.submissionId));assert.equal(receipt.filter(r=>r.event==='succeeded').length,1);assert.ok(receipt.some(r=>r.event==='lease_expired'));
 assert.ok((await client(f.actors.voter.token).rpc('set_wing_jury_photo_vote',{p_submission_id:w.submissionId,p_vote:1})).error);
 return {files,attempts:job.attempt_count,receiptCount:receipt.length,moderationMode:'actual manual-review provider; no live model/provider and no fake repository'};
});
await step('real private Storage signed URL expires and guests cannot download originals directly',async()=>{
 const path=w.original;
 const signed=check(await admin.storage.from('wing-submissions').createSignedUrl(path,1));assert.equal((await fetch(signed.signedUrl)).status,200);
 await new Promise(resolve=>setTimeout(resolve,2200));assert.ok((await fetch(signed.signedUrl)).status>=400);
 assert.ok((await client().storage.from('wing-submissions').download(path)).error);
});
await step('real Auth account deletion cascades votes and stale token cannot vote',async()=>{
 const other=client(f.actors.other.token),id=f.photos[0].id;
 check(await other.rpc('set_wing_jury_photo_vote',{p_submission_id:id,p_vote:1}));
 check(await admin.auth.admin.deleteUser(f.actors.other.id));
 for(const table of ['wing_media_photo_votes','wing_jury_votes'])assert.equal(check(await admin.from(table).select('submission_id').eq('user_id',f.actors.other.id)).length,0);
 assert.ok((await other.rpc('set_wing_jury_photo_vote',{p_submission_id:id,p_vote:1})).error);
 const counts=check(await admin.from('wing_jury_photo_vote_counts').select('like_count,dislike_count').eq('submission_id',id).single());assert.equal(counts.like_count,0);assert.equal(counts.dislike_count,1);
 const ownerless=check(await admin.from('wing_media_submissions').select('user_id,owner_deleted_at').eq('id',w.submissionId).single());assert.equal(ownerless.user_id,null);assert.ok(ownerless.owner_deleted_at);
 sql(`update public.wing_media_submissions set original_retain_until=now()-interval '1 second' where id='${w.submissionId}'`);
});
await step('real media deletion cascades both vote stores counts and original audit snapshots',async()=>{
 const id=f.photos[3].id;
 check(await admin.from('wing_media_submissions').delete().eq('id',id));
 for(const table of ['wing_media_photo_votes','wing_jury_votes','wing_jury_photo_vote_counts'])assert.equal(check(await admin.from(table).select('submission_id').eq('submission_id',id)).length,0);
 for(const table of ['photo_vote_bridge_legacy_snapshot','photo_vote_bridge_jury_snapshot'])assert.equal(sql(`select count(*) from private.${table} where submission_id='${id}'`),'0');
 check(await admin.storage.from('wing-submissions').remove([f.photos[3].original,f.photos[3].primary,f.photos[3].thumbnail]));
});
console.log('Real worker object receipts, signed expiry, account/media cascades passed; cleanup queued separately.');
