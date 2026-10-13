import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {deployedVotingFixtureSQL} from './helpers/photo-vote-compatibility-fixture.mjs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const user='11111111-1111-4111-8111-111111111111',photo='44444444-4444-4444-8444-444444444444';
const cases=[
 ['conflict 1',1,-1,'approved','2026-10-11T14:26:26.27651Z','2026-10-11T19:59:23.129031Z',-1],
 ['conflict 2',1,0,'failed','2026-10-11T14:26:46.559983Z','2026-10-11T19:59:05.979572Z',1],
 ['conflict 3',-1,1,'approved','2026-10-11T20:35:35.215217Z','2026-10-11T20:01:07.666547Z',-1],
 ['later neutral',1,0,'approved','2026-10-11T14:00:00Z','2026-10-11T15:00:00Z',0],
 ['contradictory tie',1,-1,'approved','2026-10-11T14:00:00Z','2026-10-11T14:00:00Z',null],
 ['future chronology',1,-1,'approved','2099-01-01T14:00:00Z','2026-10-11T14:00:00Z',null],
 ['agreeing tie',1,1,'approved','2026-10-11T14:00:00Z','2026-10-11T14:00:00Z',1],
];
for(const [name,legacy,jury,status,galleryTime,juryTime,expected] of cases){
 test(`${name}: latest valid recorded action with both source records preserved`,async t=>{
  const db=new PGlite();t.after(()=>db.close());
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
  await db.exec(read('./database/fixtures/phase7b25-postgres-bootstrap.sql'));
  await db.exec('alter table auth.users add column is_anonymous boolean not null default false;');
  await db.exec(read('../supabase/local/phase-2b/20261009_local_phase2b_foundation.sql'));
  await db.exec(deployedVotingFixtureSQL());
  await db.exec(`select set_config('request.jwt.claim.sub','${user}',false);select set_config('request.jwt.claims','{"sub":"${user}","is_anonymous":false}',false);
   insert into public.wing_jury_votes values('${photo}','${user}',${jury},'${juryTime}');
   insert into public.wing_media_photo_votes(submission_id,user_id,vote) values('${photo}','${user}',${legacy});
   alter table public.wing_media_photo_votes disable trigger trg_validate_wing_media_photo_vote;
   update public.wing_media_photo_votes set created_at='2026-10-10T00:00:00Z',updated_at='${galleryTime}' where user_id='${user}';
   alter table public.wing_media_photo_votes enable trigger trg_validate_wing_media_photo_vote;
   update public.wing_media_submissions set status='${status}' where id='${photo}';`);
  if(expected===null){
   await assert.rejects(db.exec(read('../supabase/proposals/app-polish-shared-photo-votes.sql')),/history_requires_review/);
   await db.exec('rollback');
   assert.equal((await db.query(`select vote from public.wing_jury_votes where user_id='${user}'`)).rows[0].vote,jury);
   return;
  }
  await db.exec(read('../supabase/proposals/app-polish-shared-photo-votes.sql'));
  assert.equal((await db.query(`select vote from public.wing_media_photo_votes where submission_id='${photo}' and user_id='${user}'`)).rows[0].vote,expected);
  assert.equal((await db.query(`select vote from public.wing_jury_votes where submission_id='${photo}' and user_id='${user}'`)).rows[0].vote,status==='approved'?expected:jury);
  for(const [source,vote] of [['legacy',legacy],['jury',jury]])
   assert.equal((await db.query(`select original_row->>'vote' vote from private.photo_vote_bridge_${source}_snapshot where submission_id='${photo}' and user_id='${user}'`)).rows[0].vote,String(vote));
  const auditBefore=(await db.query(`select original_row from private.photo_vote_bridge_jury_snapshot where user_id='${user}'`)).rows;
  await db.exec(read('../supabase/proposals/app-polish-shared-photo-votes.sql'));
  assert.deepEqual((await db.query(`select original_row from private.photo_vote_bridge_jury_snapshot where user_id='${user}'`)).rows,auditBefore);
  await db.exec('set role authenticated');
  await assert.rejects(db.query('select * from private.photo_vote_bridge_jury_snapshot'),/permission denied/);
  await db.exec('reset role');
  if(status==='failed'){
   await db.exec('set role authenticated');
   await assert.rejects(db.query('select public.set_wing_jury_photo_vote($1,1::smallint)',[photo]),/not_eligible/);
   await db.exec('reset role');
  }
  await db.exec(`delete from auth.users where id='${user}'`);
  assert.equal((await db.query(`select count(*)::integer total from private.photo_vote_bridge_jury_snapshot where user_id='${user}'`)).rows[0].total,0);
 });
}
test('previous prototype mirror timestamps cannot be reinterpreted as original actions',async t=>{
 const db=new PGlite();t.after(()=>db.close());
 await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
 await db.exec(read('./database/fixtures/phase7b25-postgres-bootstrap.sql'));
 await db.exec('alter table auth.users add column is_anonymous boolean not null default false;');
 await db.exec(read('../supabase/local/phase-2b/20261009_local_phase2b_foundation.sql'));
 await db.exec(deployedVotingFixtureSQL());
 await db.exec('create table private.photo_vote_bridge_legacy_snapshot(submission_id uuid,user_id uuid,original_row jsonb)');
 await assert.rejects(db.exec(read('../supabase/proposals/app-polish-shared-photo-votes.sql')),/prior_bridge_requires_review/);
 await db.exec('rollback');
 assert.equal((await db.query("select to_regclass('private.photo_vote_bridge_jury_snapshot') as relation")).rows[0].relation,null);
});
