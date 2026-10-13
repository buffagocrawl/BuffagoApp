import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { deployedVotingFixtureSQL } from './helpers/photo-vote-compatibility-fixture.mjs';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const user='11111111-1111-4111-8111-111111111111';
const owner='77777777-7777-4777-8777-777777777777';
const photo='44444444-4444-4444-8444-444444444444';
const claims=uid=>`select set_config('request.jwt.claim.sub','${uid}',false);select set_config('request.jwt.claims','{"sub":"${uid}","is_anonymous":false}',false);`;
test('local shared Jury vote proposal preserves legacy votes and enforces edits, withdrawal, counts and RLS',async(t)=>{
  const db=new PGlite();t.after(()=>db.close());
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
  await db.exec(read('./database/fixtures/phase7b25-postgres-bootstrap.sql'));
  await db.exec('alter table auth.users add column is_anonymous boolean not null default false;');
  await db.exec(read('../supabase/local/phase-2b/20261009_local_phase2b_foundation.sql'));
  await db.exec(deployedVotingFixtureSQL());
  await db.exec(claims(user)+`insert into public.wing_jury_votes values('${photo}','${user}',-1,now());insert into public.wing_media_photo_votes values('${photo}','${user}',1);`);
  await db.exec(read('../supabase/proposals/app-polish-shared-photo-votes.sql'));
  const counts=async()=> (await db.query('select like_count,dislike_count,neutral_count from public.wing_jury_photo_vote_counts')).rows[0];
  assert.deepEqual(await counts(),{like_count:1,dislike_count:1,neutral_count:0});
  assert.equal((await db.query(`select vote from public.wing_jury_votes where user_id='${user}'`)).rows[0].vote,-1);
  await db.exec('set role authenticated;'+claims(user));
  const set=choice=>db.query(`select public.set_wing_jury_photo_vote('${photo}',${choice===null?'null':choice}::smallint) as vote`);
  let result=await set(1);assert.equal(result.rows[0].vote.like_count,2);assert.equal(result.rows[0].vote.dislike_count,0);
  result=await set(0);assert.equal(result.rows[0].vote.like_count,1);assert.equal(result.rows[0].vote.neutral_count,1);
  result=await set(null);assert.equal(result.rows[0].vote.vote,null);assert.equal(result.rows[0].vote.neutral_count,0);
  await set(-1);await set(-1);assert.deepEqual(await counts(),{like_count:1,dislike_count:1,neutral_count:0});
  await assert.rejects(db.exec(`insert into public.wing_jury_votes values('${photo}','${user}',1,now())`),/duplicate key/);
  await assert.rejects(db.exec(`delete from public.wing_jury_votes where user_id='${user}'`),/permission denied/);
  await assert.rejects(db.exec(`update public.wing_jury_votes set vote=1`),/permission denied/);
  await assert.rejects(db.exec(`insert into public.wing_jury_votes values('${photo}','${owner}',0,now())`),/owner_mismatch|row-level security/);
  await assert.rejects(set(2),/invalid_vote/);
  await db.exec(`select set_config('request.jwt.claims','{"is_anonymous":true}',false)`);
  await assert.rejects(set(1),/authentication_required/);
  await db.exec('reset role;'+claims(user)+`update public.wing_media_submissions set withdrawn_at=now() where id='${photo}'`);
  await assert.rejects(set(1),/not_eligible/);
  assert.deepEqual(await counts(),{like_count:1,dislike_count:1,neutral_count:0});
  await db.exec(`delete from auth.users where id='${user}'`);
  assert.deepEqual(await counts(),{like_count:1,dislike_count:0,neutral_count:0});
  // The reduced phase-2b fixture predates the deployed media-delete contract.
  // Exercise that cascade without changing the proposal's actual FK schema.
  await db.exec('alter table public.wing_jury_votes drop constraint wing_jury_votes_submission_id_fkey;alter table public.wing_jury_votes add constraint wing_jury_votes_submission_id_fkey foreign key(submission_id) references public.wing_media_submissions(id) on delete cascade;');
  await db.exec(`delete from public.wing_media_submissions where id='${photo}'`);
  assert.equal((await db.query('select * from public.wing_jury_votes')).rows.length,0);
});
