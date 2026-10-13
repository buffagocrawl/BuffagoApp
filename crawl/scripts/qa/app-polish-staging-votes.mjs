import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as legacy from '../../tests/fixtures/legacy-photo-voting.js';
import * as modern from '../../lib/wingdexPhotos.js';
import {admin,client,check,sql,readJSON,localPath,saveEvidence,credentials} from './app-polish-staging-common.mjs';
const f=readJSON('.expo/app-polish-staging-fixtures.json');
assert.equal(f.setupIncomplete,undefined);
const voter=client(f.actors.voter.token),other=client(f.actors.other.token),guest=client();
const results=process.argv.includes('--resume')?readJSON('../artifacts/app-polish/release-qa/deployment/staging-voting-acceptance.json').results.filter(r=>r.status==='PASS'):[];
async function step(name,fn){if(results.some(r=>r.name===name&&r.status==='PASS'))return;try{const result=await fn();results.push({name,status:'PASS',...(result||{})});}catch(e){results.push({name,status:'FAIL',error:e.message});throw e;}finally{saveEvidence('staging-voting-acceptance.json',{target:credentials.API_URL,realAuthRESTStorage:true,results});}}
async function counts(id){return check(await voter.from('wing_jury_photo_vote_counts').select('like_count,neutral_count,dislike_count').eq('submission_id',id).maybeSingle())||{like_count:0,neutral_count:0,dislike_count:0};}
async function own(id){return check(await voter.from('wing_jury_votes').select('vote').eq('submission_id',id).eq('user_id',f.actors.voter.id).maybeSingle())?.vote??null;}
const gallery=async()=>{
 const response=await fetch(`${credentials.API_URL}/functions/v1/wing-public-gallery`,{method:'POST',headers:{apikey:credentials.ANON_KEY,'content-type':'application/json'},body:JSON.stringify({destination_ids:[f.destination],include_images:true,include_covers:true})});
 const data=await response.json();assert.equal(response.status,200,JSON.stringify(data));return data.restaurants[0];
};
await step('baseline captured gallery v3 uses real Storage and excludes failed photo',async()=>{
 const g=await gallery();assert.equal(g.picture_count,4);assert.ok(!g.images.some(p=>p.submission_id===f.photos[1].id));
 const photo=g.images.find(p=>p.submission_id===f.photos[0].id);assert.equal(photo.like_count,1);
 const u=new URL(photo.signed_url);if(u.hostname==='kong'){u.hostname='127.0.0.1';u.port='55321';}
 assert.equal((await fetch(u)).status,200);return {signedDownload:'real Storage token; local kong hostname mapped to published acceptance port',pictures:g.picture_count};
});
await step('single SQL bridge transaction reconciles approved pairs and preserves both audit stores',async()=>{
 sql(readFileSync(localPath('supabase/proposals/app-polish-shared-photo-votes.sql'),'utf8'));
 for(const i of [0,2])assert.equal(await own(f.photos[i].id),-1);
 const failed=check(await admin.from('wing_media_photo_votes').select('vote').eq('submission_id',f.photos[1].id).single());assert.equal(failed.vote,1);
 assert.equal(check(await admin.from('wing_jury_votes').select('vote').eq('submission_id',f.photos[1].id).single()).vote,0);
 assert.equal(await own(f.photos[3].id),0);
 assert.equal(check(await voter.from('wing_media_photo_votes').select('vote').eq('submission_id',f.photos[3].id).single()).vote,0);
 assert.equal(sql('select count(*) from private.photo_vote_bridge_legacy_snapshot'),'3');
 assert.equal(sql('select count(*) from private.photo_vote_bridge_jury_snapshot'),'4');
});
await step('SQL-only phase remains compatible with captured old gallery and canonical counts',async()=>{
 const g=await gallery();assert.equal(g.picture_count,4);assert.equal(g.images.find(p=>p.submission_id===f.photos[0].id).like_count,0);
});
await step('actual old/new controllers share changes, neutral and withdrawals over real PostgREST',async()=>{
 const id=f.photos[4].id;
 let state={submission_id:id,current_vote:await own(id),...await counts(id)};
 for(const [implementation,choice,expected] of [[legacy,1,1],[modern,0,0],[legacy,-1,-1],[legacy,-1,null],[modern,1,1],[modern,1,null]]){
  await implementation.createVoteController(voter)(state,choice,()=>{});
  assert.equal(await own(id),expected);
  const old=await legacy.loadOwnPhotoVotes([{submission_id:id}],voter),next=await modern.loadOwnPhotoVotes([{submission_id:id}],voter);
  assert.equal(old[0].current_vote,next[0].current_vote);
  state={submission_id:id,current_vote:expected,...await counts(id)};
  const row=check(await admin.from('wing_media_submissions').select('like_count,dislike_count').eq('id',id).single());
  assert.equal(row.like_count,state.like_count);assert.equal(row.dislike_count,state.dislike_count);
 }
});
await step('real auth/RLS reject guest, another user identity and failed photo writes',async()=>{
 assert.ok((await guest.rpc('set_wing_jury_photo_vote',{p_submission_id:f.photos[4].id,p_vote:1})).error);
 assert.ok((await other.from('wing_media_photo_votes').upsert({submission_id:f.photos[4].id,user_id:f.actors.voter.id,vote:1},{onConflict:'submission_id,user_id'})).error);
 assert.ok((await voter.rpc('set_wing_jury_photo_vote',{p_submission_id:f.photos[1].id,p_vote:1})).error);
 assert.ok((await voter.from('wing_jury_votes').insert({submission_id:f.photos[0].id,user_id:f.actors.voter.id,vote:1})).error);
});
await step('concurrent old upsert/new RPC requests retain one shared verdict and exact totals',async()=>{
 const id=f.photos[4].id;
 for(let i=0;i<6;i++){
  const responses=await Promise.all([voter.from('wing_media_photo_votes').upsert({submission_id:id,user_id:f.actors.voter.id,vote:-1},{onConflict:'submission_id,user_id'}),voter.rpc('set_wing_jury_photo_vote',{p_submission_id:id,p_vote:1})]);
  for(const r of responses)if(r.error){assert.equal(r.error.code,'55P03');check(await voter.rpc('set_wing_jury_photo_vote',{p_submission_id:id,p_vote:1}));}
  const j=await own(id),l=check(await voter.from('wing_media_photo_votes').select('vote').eq('submission_id',id).single()).vote;
  assert.equal(l,j);assert.equal(Object.values(await counts(id)).reduce((a,b)=>a+b,0),1);
 }
 check(await voter.rpc('set_wing_jury_photo_vote',{p_submission_id:id,p_vote:null}));
});
await step('SQL-only phase keeps old Jury vote/reveal HTTP contracts and duplicate protection',async()=>{
 const call=async(name,body)=>{
  const r=await fetch(`${credentials.API_URL}/functions/v1/${name}`,{method:'POST',headers:{apikey:credentials.ANON_KEY,Authorization:`Bearer ${f.actors.voter.token}`,'content-type':'application/json'},body:JSON.stringify(body)});
  const data=await r.json();assert.equal(r.status,200,JSON.stringify(data));return data;
 };
 const id=f.photos[4].id;
 const first=await call('wing-jury-vote',{submission_id:id,vote:1});assert.equal(first.existing_vote,false);assert.equal(first.vote,1);
 const duplicate=await call('wing-jury-vote',{submission_id:id,vote:-1});assert.equal(duplicate.existing_vote,true);assert.equal(duplicate.vote,1);
 const reveal=await call('wing-jury-reveal',{submission_id:id});assert.equal(reveal.photo_like_count,1);
 check(await voter.rpc('set_wing_jury_photo_vote',{p_submission_id:id,p_vote:null}));
});
console.log('Real baseline/SQL voting acceptance passed; candidate Edge and worker gates are separate.');
