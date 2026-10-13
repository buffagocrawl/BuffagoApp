import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { startDisposablePostgres, fixture, query, session, observeBlocked, ids, asUser } from '../scripts/phase7b25-postgres.mjs';
import { deployedVotingFixtureSQL } from './helpers/photo-vote-compatibility-fixture.mjs';

// Explicit opt-in to the existing verified, disposable loopback PG17 harness.
// No connection string, installed cluster, migration command, or remote target.
const enabled=process.env.BUFFAGO_PHASE7B3D_NATIVE17==='1';
before(async()=>{if(enabled)await startDisposablePostgres();});
const proposal=await readFile(new URL('../supabase/proposals/app-polish-shared-photo-votes.sql',import.meta.url),'utf8');
const edit=value=>`select public.set_wing_jury_photo_vote('${ids.photo}',${value===null?'null':value}::smallint);`;
const insert=`insert into public.wing_jury_votes(submission_id,user_id,vote) values('${ids.photo}','${ids.user}',1);`;
const countsSQL=`select like_count||','||neutral_count||','||dislike_count from public.wing_jury_photo_vote_counts where submission_id='${ids.photo}'`;
async function fresh(){const db=await fixture();await query(db,'alter table auth.users add column is_anonymous boolean not null default false;'+deployedVotingFixtureSQL()+proposal);return db;}

test('two screens editing the same Jury record serialize and leave exactly one vote',{skip:!enabled},async()=>{
  const db=await fresh();const holder=session(db,'polish-edit-holder');
  try{
    await holder.execute('begin;'+asUser(ids.user)+edit(1));
    const second=query(db,asUser(ids.user)+edit(-1),'polish-edit-waiter');
    await observeBlocked(db,'polish-edit-waiter');await holder.execute('commit');await second;
    assert.equal(await query(db,countsSQL),'1,0,1');
    assert.equal(await query(db,`select count(*) from public.wing_jury_votes where submission_id='${ids.photo}' and user_id='${ids.user}'`),'1');
    await query(db,asUser(ids.user)+edit(null));assert.equal(await query(db,countsSQL),'1,0,0');
  }finally{await holder.close();}
});

test('first Jury verdict and detail vote change serialize in either order',{skip:!enabled},async()=>{
  for(const juryFirst of [true,false]){
    const db=await fresh();const holder=session(db,'polish-first-holder');
    try{
      await holder.execute('begin;'+asUser(ids.user)+(juryFirst?insert:edit(-1)));
      const pending=query(db,asUser(ids.user)+(juryFirst?edit(-1):insert),'polish-first-waiter').then(value=>({value}),error=>({error}));
      await observeBlocked(db,'polish-first-waiter');await holder.execute('commit');const result=await pending;
      if(juryFirst)assert.ifError(result.error);else assert.match(result.error?.message||'',/23505/);
      assert.equal(await query(db,countsSQL),'1,0,1');
    }finally{await holder.close();}
  }
});

const oldUpsert=`insert into public.wing_media_photo_votes(submission_id,user_id,vote) values('${ids.photo}','${ids.user}',-1) on conflict(submission_id,user_id) do update set vote=excluded.vote;`;
test('old upsert/new RPC and old withdrawal/new neutral serialize in either order',{skip:!enabled},async()=>{
 for(const legacyFirst of [true,false]){
  const db=await fresh();const holder=session(db,'bridge-holder');
  try{
   await holder.execute('begin;'+asUser(ids.user)+(legacyFirst?oldUpsert:edit(1)));
   const pending=query(db,asUser(ids.user)+(legacyFirst?edit(1):oldUpsert),'bridge-waiter');
   await observeBlocked(db,'bridge-waiter');await holder.execute('commit');await pending;
   assert.equal(await query(db,`select vote from public.wing_media_photo_votes where user_id='${ids.user}'`),legacyFirst?'1':'-1');
   assert.equal(await query(db,`select vote from public.wing_jury_votes where user_id='${ids.user}'`),legacyFirst?'1':'-1');
   await holder.execute('begin;'+asUser(ids.user)+`delete from public.wing_media_photo_votes where user_id='${ids.user}';`);
   const neutral=query(db,asUser(ids.user)+edit(0),'bridge-neutral');await observeBlocked(db,'bridge-neutral');await holder.execute('commit');await neutral;
   assert.equal(await query(db,countsSQL),'1,1,0');
  }finally{await holder.close();}
 }
});
test('voting serializes with account/media cascades and photo moderation without resurrecting records',{skip:!enabled},async()=>{
 for(const action of ['account','media','withdraw']){
  const db=await fresh();const holder=session(db,'bridge-parent-holder');
  try{
   await holder.execute('begin;'+asUser(ids.user)+edit(1));
   const sql=action==='account'?`delete from auth.users where id='${ids.user}';`:action==='media'?`delete from public.wing_media_submissions where id='${ids.photo}';`:`update public.wing_media_submissions set withdrawn_at=now() where id='${ids.photo}';`;
   const pending=query(db,sql,'bridge-parent-waiter');await observeBlocked(db,'bridge-parent-waiter');await holder.execute('commit');await pending;
   if(action==='withdraw'){
    await assert.rejects(query(db,asUser(ids.user)+edit(-1)),/not_eligible/);
    assert.equal(await query(db,`select count(*) from public.wing_media_photo_votes where user_id='${ids.user}'`),'1');
   }else{
    assert.equal(await query(db,`select count(*) from public.wing_media_photo_votes where user_id='${ids.user}'`),'0');
    assert.equal(await query(db,`select count(*) from public.wing_jury_votes where user_id='${ids.user}'`),'0');
   }
  }finally{await holder.close();}
 }
});
test('legacy mutation on a busy media parent fails retryably without a cascade deadlock or partial write',{skip:!enabled},async()=>{
 const db=await fresh();await query(db,asUser(ids.user)+oldUpsert);
 const holder=session(db,'bridge-busy-parent');
 try{
  await holder.execute(`begin;select id from public.wing_media_submissions where id='${ids.photo}' for update;`);
  await assert.rejects(query(db,asUser(ids.user)+`delete from public.wing_media_photo_votes where user_id='${ids.user}';`),/55P03|could not obtain lock/);
  await holder.execute('commit');
  assert.equal(await query(db,`select vote from public.wing_jury_votes where user_id='${ids.user}'`),'-1');
  await query(db,asUser(ids.user)+`delete from public.wing_media_photo_votes where user_id='${ids.user}';`);
  assert.equal(await query(db,countsSQL),'1,0,0');
 }finally{await holder.close();}
});
