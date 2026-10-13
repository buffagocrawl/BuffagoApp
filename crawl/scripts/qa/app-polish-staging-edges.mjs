import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readJSON,client,admin,check,sql,saveEvidence,localPath,credentials} from './app-polish-staging-common.mjs';
const f=readJSON('.expo/app-polish-staging-fixtures.json'),voter=client(f.actors.voter.token);
const receipts=process.argv.includes('--resume')?readJSON('../artifacts/app-polish/release-qa/deployment/staging-edge-phase-acceptance.json').receipts.filter(r=>r.status==='PASS'):[];
async function step(name,fn){if(receipts.some(r=>r.name===name&&r.status==='PASS'))return;try{const detail=await fn();receipts.push({name,status:'PASS',...(detail||{})});}catch(e){receipts.push({name,status:'FAIL',error:e.message});throw e;}finally{saveEvidence('staging-edge-phase-acceptance.json',{target:credentials.API_URL,nativeGatewayAuthRESTStorage:true,receipts});}}
async function call(name,body,token=f.actors.voter.token){const r=await fetch(`${credentials.API_URL}/functions/v1/${name}`,{method:'POST',signal:AbortSignal.timeout(20000),headers:{Connection:'close',apikey:credentials.ANON_KEY,'content-type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body)});return {status:r.status,data:await r.json()};}
function stage(name){execFileSync('C:/Users/Brand/AppData/Local/Programs/Python/Python312/python.exe',[localPath('scripts/qa/app-polish-stage-functions.py').pathname.replace(/^\//,''),'--candidate','--only',name],{encoding:'utf8',maxBuffer:1024*1024});}
const id=f.photos[4].id;
await step('vote-only candidate phase preserves old reveal/gallery and adds authoritative counts',async()=>{
 stage('wing-jury-vote');
 const r=await call('wing-jury-vote',{submission_id:id,vote:0});assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.neutral_count,1);assert.equal(r.data.dislike_count,0);
 const duplicate=await call('wing-jury-vote',{submission_id:id,vote:1});assert.equal(duplicate.data.existing_vote,true);assert.equal(duplicate.data.vote,0);
 const old=await call('wing-jury-reveal',{submission_id:id});assert.equal(old.status,200,JSON.stringify(old.data));
 assert.equal((await call('wing-jury-vote',{submission_id:id,vote:1},null)).status,401);
 assert.equal((await call('wing-jury-vote',{submission_id:f.photos[1].id,vote:1})).status,403);
});
await step('reveal candidate phase follows RPC change and preserves guest privacy',async()=>{
 stage('wing-jury-reveal');
 check(await voter.rpc('set_wing_jury_photo_vote',{p_submission_id:id,p_vote:-1}));
 const r=await call('wing-jury-reveal',{submission_id:id});assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.photo_dislike_count,1);assert.equal(r.data.photo_neutral_count,0);
 const guest=await call('wing-jury-reveal',{submission_id:id,guest_verdict_registered:true},null);assert.equal(guest.status,200);assert.equal(guest.data.personal_rating,null);
 assert.equal((await call('wing-jury-reveal',{submission_id:id},null)).status,403);
});
await step('gallery candidate phase matches canonical counts, ordering and failed-photo exclusion',async()=>{
 stage('wing-public-gallery');
 check(await voter.rpc('set_wing_jury_photo_vote',{p_submission_id:f.photos[3].id,p_vote:1}));
 const r=await call('wing-public-gallery',{destination_ids:[f.destination],include_images:true,include_covers:true},null);assert.equal(r.status,200,JSON.stringify(r.data));
 const images=r.data.restaurants[0].images;assert.equal(images.length,4);assert.equal(images[0].submission_id,f.photos[3].id);
 assert.equal(images[0].like_count,1);assert.ok(!images.some(p=>p.submission_id===f.photos[1].id));
 for(const p of images){const c=check(await admin.from('wing_jury_photo_vote_counts').select('like_count,neutral_count,dislike_count').eq('submission_id',p.submission_id).single());assert.equal(p.like_count,c.like_count);assert.equal(p.dislike_count,c.dislike_count);}
});
await step('Wingman candidate gateway/config fails closed; external-provider success remains blocked',async()=>{
 stage('wingman-intake');
 const invalid=await call('wingman-intake',{restaurant:'Synthetic Cafe',state:'ZZ'},'not-a-valid-jwt');assert.equal(invalid.status,401,JSON.stringify(invalid.data));
 const signed=await call('wingman-intake',{restaurant:'Synthetic Cafe',state:'ZZ'});assert.equal(signed.status,500);assert.match(signed.data.error,/OPENAI_API_KEY/);
 return {coverage:'native JWT gateway + missing-config failure only',outstanding:'successful verification/insertion requires separate non-production OpenAI/Places credentials and permitted provider acceptance; no provider responses mocked'};
});
await step('real PostgREST atomic Wingman limiter retains signed/anonymous limits and service-only access',async()=>{
 const signed=await Promise.all(Array.from({length:20},()=>admin.rpc('wingman_consume_rate_limit',{p_user_id:f.actors.other.id,p_ip_address:'synthetic-stage-signed'})));
 signed.forEach(check);assert.equal(signed.filter(r=>r.data===true).length,10);
 const anonymous=await Promise.all(Array.from({length:8},()=>admin.rpc('wingman_consume_rate_limit',{p_user_id:null,p_ip_address:'synthetic-stage-anonymous'})));
 anonymous.forEach(check);assert.equal(anonymous.filter(r=>r.data===true).length,3);
 assert.ok((await voter.rpc('wingman_consume_rate_limit',{p_user_id:f.actors.voter.id,p_ip_address:'synthetic-denied'})).error);
});
console.log('Three candidate photo functions and independent phases passed real native services; Wingman positive provider path remains blocked.');
