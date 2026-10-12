// Approval artifact validation only. Never connects to Supabase/production.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const proposal=readFileSync(new URL('../docs/android-qa-rating-photo-proposed.sql.txt',import.meta.url),'utf8');
test('review-only eligibility proposal changes only the two coin exclusions',()=>{
 const historical=readFileSync(new URL('../supabase/migrations/20260729160000_wing_shot_rating_rule.sql',import.meta.url),'utf8');
 const functions=historical.slice(historical.indexOf('create or replace function public.wing_shot_rating_is_eligible'),historical.indexOf('create or replace function public.get_wing_shot_rating_eligibility'));
 const expected=functions.replace(/^\s*and not coalesce\(rating\.is_buffacoin, false\)\r?\n/m,'')
   .replace(/  if coalesce\(v_rating\.is_buffacoin, false\) then\r?\n    return 'buffacoin_rating';\r?\n  end if;\r?\n/,'');
 const actual=proposal.slice(proposal.indexOf('create or replace function'),proposal.lastIndexOf('commit;'));
 assert.equal(actual.replace(/\r\n/g, '\n').trim(),expected.replace(/\r\n/g, '\n').trim());
});
test('proposed SQL accepts coin photos while retaining owner, restaurant, score and duplicate guards locally',async()=>{
 const db=new PGlite();
 const owner='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
 const dest='00000000-0000-4000-8000-000000000003',wrong='00000000-0000-4000-8000-000000000004';
 const id='00000000-0000-4000-8000-000000000005';
 try {
  await db.exec(`create table public.destination_ratings(id uuid primary key,user_id uuid,destination_id uuid,is_buffacoin boolean,crispiness integer,sauce integer,meat integer,overall integer);
   create table public.wing_media_submissions(rating_id uuid);
   create table public.wing_submission_upload_intents(rating_id uuid,status text);`);
  await db.exec(proposal);
  await db.query('insert into destination_ratings values($1,$2,$3,true,8,9,8,9)',[id,owner,dest]);
  const eligible=async user=>(await db.query('select wing_shot_rating_is_eligible($1,$2) as value',[id,user])).rows[0].value;
  const reason=async(user,restaurant)=>(await db.query('select wing_shot_rating_eligibility_reason($1,$2,$3) as value',[id,user,restaurant])).rows[0].value;
  assert.equal(await eligible(owner),true);assert.equal(await reason(owner,dest),'eligible');
  assert.equal(await eligible(other),false);assert.equal(await reason(other,dest),'rating_not_owned');
  assert.equal(await reason(owner,wrong),'destination_mismatch');
  await db.query('update destination_ratings set overall=null where id=$1',[id]);
  assert.equal(await eligible(owner),false);assert.equal(await reason(owner,dest),'incomplete_rating');
  await db.query('update destination_ratings set overall=9,is_buffacoin=false where id=$1',[id]);
  assert.equal(await eligible(owner),true);
  await db.query('insert into wing_media_submissions values($1)',[id]);assert.equal(await eligible(owner),false);
  await db.exec('delete from wing_media_submissions');
  for(const status of ['reserved','finalized']){
   await db.query('insert into wing_submission_upload_intents values($1,$2)',[id,status]);assert.equal(await eligible(owner),false);
   await db.exec('delete from wing_submission_upload_intents');
  }
 } finally { await db.close(); }
});
