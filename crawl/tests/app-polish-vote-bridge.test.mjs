import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';
import { deployedVotingFixtureSQL } from './helpers/photo-vote-compatibility-fixture.mjs';
import { mobileModule } from './helpers/mobile-runtime.mjs';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const user='11111111-1111-4111-8111-111111111111',owner='77777777-7777-4777-8777-777777777777',photo='44444444-4444-4444-8444-444444444444';
const claims=id=>`select set_config('request.jwt.claim.sub','${id}',false);select set_config('request.jwt.claims','{"sub":"${id}","is_anonymous":false}',false);`;
const exports={};const oldSource=process.env.BUFFAGO_RELEASED_VOTE_SOURCE
 ? readFileSync(process.env.BUFFAGO_RELEASED_VOTE_SOURCE,'utf8')
 : read('./fixtures/legacy-photo-voting.js');
vm.runInNewContext(ts.transpileModule(oldSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports});
const modern=mobileModule('lib/wingdexPhotos.js',{'./photoVoteEvents.js':{publishPhotoVote(){}}});
test('actual previous and new controllers share upserts, neutral/change/withdrawal, counts and current votes',async t=>{
 const db=new PGlite();t.after(()=>db.close());
 await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
 await db.exec(read('./database/fixtures/phase7b25-postgres-bootstrap.sql'));
 await db.exec('alter table auth.users add column is_anonymous boolean not null default false;');
 await db.exec(read('../supabase/local/phase-2b/20261009_local_phase2b_foundation.sql'));
 await db.exec(deployedVotingFixtureSQL());
 await db.exec(claims(user)+`insert into public.wing_media_photo_votes(submission_id,user_id,vote) values('${photo}','${user}',1);`);
 await db.exec(`insert into public.wing_jury_votes values('${photo}','${user}',-1,clock_timestamp());`);
 const pending='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 await db.exec(`insert into public.wing_media_submissions(id,user_id,media_type,status) values('${pending}','${owner}','photo','pending');`);
 // Already deployed Mango prerequisites and representative existing review.
 await db.exec(`alter table public.destinations add column address text,add column city text,add column state_id integer,add column created_by uuid;
 alter table public.destinations alter column id set default gen_random_uuid();
 create table public.app_user_roles(user_id uuid,role text,active boolean,revoked_at timestamptz);
 create table public.destination_suggestions(id uuid primary key default gen_random_uuid(),user_id uuid,state_id integer,restaurant_name text,address text,created_at timestamptz default now());
 create function public.buffago_product_pulse_operations() returns jsonb language sql as $$select '{}'::jsonb$$;
 create function public.get_buffago_growth_snapshot() returns jsonb language sql security definer as $$ select jsonb_build_object('product_pulse', public.buffago_product_pulse_operations() || jsonb_build_object('feedback',jsonb_build_object('open_total',7))) $$;
 insert into public.app_user_roles values('${owner}','wing_reviewer',true,null);
 insert into public.destination_suggestions(user_id,state_id,restaurant_name,address) values('${user}',1,'Existing Reviewed','1 Fixture Lane'),('${user}',1,'Pending Restaurant','2 Fixture Lane');`);
 await db.exec(read('../supabase/migrations/20261013011230_mango_restaurant_review.sql'));
 const suggestion=(await db.query("select id from public.destination_suggestions where restaurant_name='Existing Reviewed'")).rows[0].id;
 await db.query('select public.mango_review_restaurant($1,$2,$3,$4,$5)',[suggestion,owner,'reject','Synthetic review, keep history.',null]);
 const reviewBefore=(await db.query('select * from public.restaurant_suggestion_reviews')).rows;
 const growthBefore=(await db.query('select public.get_buffago_growth_snapshot() value')).rows[0].value;
 await db.exec(read('../supabase/proposals/app-polish-shared-photo-votes.sql'));
 assert.deepEqual((await db.query('select * from public.restaurant_suggestion_reviews')).rows,reviewBefore);
 assert.deepEqual((await db.query('select public.get_buffago_growth_snapshot() value')).rows[0].value,growthBefore);
 // Re-application remains data-idempotent; one-time release uses a ledger.
 await db.exec(read('../supabase/proposals/app-polish-shared-photo-votes.sql'));
 assert.equal((await db.query(`select original_row->>'vote' vote from private.photo_vote_bridge_legacy_snapshot where user_id='${user}'`)).rows[0].vote,'1');
 assert.equal((await db.query(`select vote from public.wing_media_photo_votes where user_id='${user}'`)).rows[0].vote,-1);
 await db.exec('set role authenticated;'+claims(user));
 const query=(sql,params=[])=>db.query(sql,params);
 const client={auth:{getUser:async()=>({data:{user:{id:user,is_anonymous:false}},error:null})},
  rpc:async(_,args)=>({data:(await query('select public.set_wing_jury_photo_vote($1,$2::smallint) vote',[args.p_submission_id,args.p_vote])).rows[0].vote,error:null}),
  from:table=>{
   const filters=[];const q={select(){return q;},eq(k,v){filters.push([k,v]);return q;},in(k,v){filters.push([k,v]);return q;},delete(){q.removing=true;return q;},
    upsert:async row=>({data:(await query(`insert into public.wing_media_photo_votes(submission_id,user_id,vote) values($1,$2,$3) on conflict(submission_id,user_id) do update set vote=excluded.vote returning *`,[row.submission_id,row.user_id,row.vote])).rows,error:null}),
    then(resolve,reject){const id=filters.find(([k])=>k==='user_id')?.[1]||user;return query(q.removing?`delete from public.${table} where submission_id=$1 and user_id=$2`:`select submission_id,vote from public.${table} where submission_id=$1 and user_id=$2`,[photo,id]).then(data=>resolve({data:data.rows,error:null}),reject);}};return q;
  }};
 const counts=async()=> (await query(`select like_count,dislike_count,neutral_count from public.wing_jury_photo_vote_counts where submission_id=$1`,[photo])).rows[0];
 const check=async()=>{
  const c=await counts();await db.exec('reset role;');
  const legacy=(await query(`select like_count,dislike_count from public.wing_media_submissions where id=$1`,[photo])).rows[0];
  assert.equal(legacy.like_count,c.like_count);assert.equal(legacy.dislike_count,c.dislike_count);
  await db.exec('set role authenticated;');
  const oldOwn=await exports.loadOwnPhotoVotes([{submission_id:photo}],client),newOwn=await modern.loadOwnPhotoVotes([{submission_id:photo}],client);
  assert.equal(oldOwn[0].current_vote,newOwn[0].current_vote);
  return {...c,submission_id:photo,current_vote:newOwn[0].current_vote};
 };
 let state=await check();assert.equal(state.current_vote,-1);
 for(const [controller,choice,expected] of [[exports,1,1],[modern,0,0],[exports,-1,-1],[exports,-1,null],[modern,1,1],[modern,1,null]]){
  await controller.createVoteController(client)(state,choice,()=>{});state=await check();assert.equal(state.current_vote,expected);
 }
 await client.rpc('set_wing_jury_photo_vote',{p_submission_id:photo,p_vote:1});
 await assert.rejects(query(`insert into public.wing_jury_votes(submission_id,user_id,vote) values($1,$2,1)`,[photo,user]),/duplicate key/);
 await assert.rejects(query(`insert into public.wing_media_photo_votes(submission_id,user_id,vote) values($1,$2,1)`,[pending,user]),/not eligible/);
 await assert.rejects(client.rpc('set_wing_jury_photo_vote',{p_submission_id:pending,p_vote:1}),/not_eligible/);
 await assert.rejects(query(`update public.wing_media_photo_votes set user_id=$1 where user_id=$2`,[owner,user]),/identity|row-level security/);
 await db.exec(`select set_config('request.jwt.claims','{"is_anonymous":true}',false)`);
 await assert.rejects(query(`delete from public.wing_media_photo_votes where user_id=$1`,[user]),/authentication_required/);
 await db.exec('reset role;'+claims(user));
 await db.exec(`delete from auth.users where id='${user}'`);
 assert.equal((await query(`select * from public.wing_media_photo_votes where user_id=$1`,[user])).rows.length,0);
 assert.equal((await query(`select * from private.photo_vote_bridge_legacy_snapshot where user_id=$1`,[user])).rows.length,0);
 const remaining=await counts();assert.equal(remaining.like_count,1);
 await db.exec(`delete from public.wing_media_submissions where id='${photo}'`);
 assert.equal((await query('select * from public.wing_jury_votes')).rows.length,0);
 assert.equal((await query('select * from public.wing_media_photo_votes')).rows.length,0);
 assert.equal((await query(`select status from public.wing_media_submissions where id=$1`,[pending])).rows[0].status,'pending');
});
