import {before,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {startDisposablePostgres,fixture,query,ids,asUser} from '../scripts/phase7b25-postgres.mjs';
import {deployedVotingFixtureSQL} from './helpers/photo-vote-compatibility-fixture.mjs';
const enabled=process.env.BUFFAGO_PHASE7B3D_NATIVE17==='1';
before(async()=>{if(enabled)await startDisposablePostgres();});
const proposal=await readFile(new URL('../supabase/proposals/app-polish-shared-photo-votes.sql',import.meta.url),'utf8');
test('PG17 latest-action reconciliation of all three inspected shapes preserves both audit inputs',{skip:!enabled},async()=>{
 for(const [legacy,jury,status,galleryTime,juryTime,expected] of [
  [1,-1,'approved','2026-10-11 14:26:26.27651+00','2026-10-11 19:59:23.129031+00',-1],
  [1,0,'failed','2026-10-11 14:26:46.559983+00','2026-10-11 19:59:05.979572+00',1],
  [-1,1,'approved','2026-10-11 20:35:35.215217+00','2026-10-11 20:01:07.666547+00',-1],
 ]){
  const db=await fixture();
  await query(db,'alter table auth.users add column is_anonymous boolean not null default false;'+deployedVotingFixtureSQL());
  await query(db,asUser(ids.user)+`insert into public.wing_jury_votes values('${ids.photo}','${ids.user}',${jury},'${juryTime}');
   insert into public.wing_media_photo_votes(submission_id,user_id,vote) values('${ids.photo}','${ids.user}',${legacy});`);
  await query(db,`alter table public.wing_media_photo_votes disable trigger trg_validate_wing_media_photo_vote;
   update public.wing_media_photo_votes set created_at='2026-10-10',updated_at='${galleryTime}' where user_id='${ids.user}';
   alter table public.wing_media_photo_votes enable trigger trg_validate_wing_media_photo_vote;
   update public.wing_media_submissions set status='${status}' where id='${ids.photo}';`);
  await query(db,proposal);
  assert.equal(await query(db,`select vote from public.wing_media_photo_votes where user_id='${ids.user}'`),String(expected));
  assert.equal(await query(db,`select vote from public.wing_jury_votes where user_id='${ids.user}'`),String(status==='approved'?expected:jury));
  for(const [source,vote] of [['legacy',legacy],['jury',jury]])
   assert.equal(await query(db,`select original_row->>'vote' from private.photo_vote_bridge_${source}_snapshot where user_id='${ids.user}'`),String(vote));
 }
});
