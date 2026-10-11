import {before,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {startDisposablePostgres,fixture,query,session,observeBlocked,ids,asUser} from '../../scripts/phase7b25-postgres.mjs';
import {frozenBytes} from '../../scripts/phase7b3b-feature-executor.mjs';

// Actual frozen feature SQL and fingerprint-matched account RPCs. The reduced
// prerequisite fixture explicitly labels unverified reward/lifecycle helpers.
// These tests do not certify those helpers or Supabase Storage/Auth services.
const bootstrap=new URL('./fixtures/phase7b3a-production-shaped-bootstrap.sql',import.meta.url);
const source=await readFile(new URL('../../supabase/migrations/20260729121000_wing_shots_security_rpc.sql',import.meta.url),'utf8');
const fingerprints={prepare_wing_account_media_cleanup:'7fb25452bff5a1911d85e41bd3b7dbed',complete_wing_account_media_cleanup:'bb59e829e4cf848befa9e9c90fb93801'};
function matched(name){const m=source.match(new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?as \\$\\$([\\s\\S]*?)\\$\\$;`));assert.ok(m);assert.equal(createHash('md5').update(m[1]).digest('hex'),fingerprints[name]);return m[0];}
before(async()=>{await startDisposablePostgres();await query('buffago_phase7b25','create role supabase_auth_admin nologin;create role supabase_storage_admin nologin;');});
async function fresh(){const db=await fixture({bootstrap,migration:false});await query(db,(await frozenBytes()).sql);return db;}
async function account(){const db=await fresh();await query(db,`
alter table public.wing_media_submissions add column thumbnail_storage_path text,add column owner_pseudonym_id uuid,add column user_caption text,add column updated_at timestamptz,add column correlation_id uuid;
create table public.wing_account_deletion_manifests(id uuid primary key default gen_random_uuid(),user_id uuid,owner_pseudonym_id uuid,object_paths text[],correlation_id uuid unique,status text default 'pending',failure_reason text,completed_at timestamptz);
create table public.wing_submission_mutation_receipts(user_id uuid,submission_id uuid,mutation_kind text,idempotency_key text unique,request_fingerprint text,result jsonb,correlation_id uuid,owner_pseudonym_id uuid,owner_deleted_at timestamptz);
alter table public.wing_submission_state_transitions add column from_status text,add column to_status text,add column actor_type text,add column actor_id uuid,add column trigger_source text,add column idempotency_key text,add column request_fingerprint text,add column correlation_id uuid,add column metadata jsonb;
alter table public.wing_submission_state_transitions alter column fixture_id set default gen_random_uuid();
alter table public.social_content_jobs add column generated_media_path text,add column status text,add column updated_at timestamptz,add column failure_code text,add column failure_reason text;
create table public.rating_verification_receipts(user_id uuid,owner_pseudonym_id uuid,owner_deleted_at timestamptz);
create table public.social_community_visit_intents(user_id uuid,status text,owner_pseudonym_id uuid,owner_deleted_at timestamptz);
create table public.social_community_reward_events(user_id uuid,owner_pseudonym_id uuid,owner_deleted_at timestamptz);
create table public.wing_submission_upload_intents(user_id uuid,status text,updated_at timestamptz);`);
for(const table of ['wing_creator_reward_events','wing_creator_badge_events','wing_notification_receipts'])await query(db,`alter table public.${table} add column user_id uuid,add column owner_pseudonym_id uuid,add column owner_deleted_at timestamptz;`);
await query(db,matched('prepare_wing_account_media_cleanup'));await query(db,matched('complete_wing_account_media_cleanup'));return db;}
const correlation='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const correlation2='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const prepare=(who=ids.other,op=correlation)=>`select public.prepare_wing_account_media_cleanup('${who}','${op}')`;
const vote=(who=ids.user,value=1)=>`${asUser(who)} insert into public.wing_jury_votes(user_id,submission_id,vote) values('${who}','${ids.photo}',${value})`;
const metrics=`select json_build_array((select count(*) from public.wing_jury_votes),(select coalesce(sum(like_count+neutral_count+dislike_count),0) from public.wing_jury_photo_vote_counts),(select count(*) from public.wing_media_photo_votes),(select like_count from public.wing_media_submissions where id='${ids.photo}'))`;

test('matched account failed manifest preserves paths and is terminal; fresh correlation has no recoverable owner paths',async()=>{
 const db=await account(),first=JSON.parse(await query(db,prepare()));assert.equal(first.status,'pending');assert.equal(first.object_paths.length,2);
 assert.equal(await query(db,`select public.complete_wing_account_media_cleanup('${first.manifest_id}',false,'batch failed')`),'t');
 const retry=JSON.parse(await query(db,prepare()));assert.equal(retry.manifest_id,first.manifest_id);assert.deepEqual(retry.object_paths,first.object_paths);assert.equal(retry.status,'failed');
 // Existing service-only helper identifies replay by correlation globally.
 // An HTTP caller must never be allowed to claim another account's manifest.
 assert.equal(JSON.parse(await query(db,prepare(ids.user))).manifest_id,first.manifest_id);
 assert.equal(await query(db,`select public.complete_wing_account_media_cleanup('${first.manifest_id}',true,null)`),'f');
 const unrelated=JSON.parse(await query(db,prepare(ids.other,correlation2)));assert.deepEqual(unrelated.object_paths,[]);
 // This is a regression witness for an existing service orchestration hazard,
 // not approval to abandon the failed manifest or its retained private paths.
 assert.equal(await query(db,`select count(*) from storage.objects`),'1');
 assert.equal(await query(db,`select count(*) from auth.users where id='${ids.other}'`),'1');
});

test('matched prepare interrupted before completion replays the original paths without duplicate pseudonymization',async()=>{
 const db=await account();await query(db,vote());const first=JSON.parse(await query(db,prepare()));
 const snapshot=await query(db,`select owner_pseudonym_id::text||':'||owner_deleted_at::text from public.wing_media_submissions`);
 const replay=JSON.parse(await query(db,prepare()));assert.deepEqual(replay,first);assert.equal(await query(db,'select count(*) from public.wing_account_deletion_manifests'),'1');
 assert.equal(await query(db,`select owner_pseudonym_id::text||':'||owner_deleted_at::text from public.wing_media_submissions`),snapshot);
 assert.equal(await query(db,`select count(*) from public.wing_submission_state_transitions`),'1');assert.deepEqual(JSON.parse(await query(db,metrics)),[1,1,1,9]);
 assert.equal(await query(db,`select public.is_public_wing_jury_photo('${ids.photo}')`),'f');
});

test('late matched prepare failure atomically restores owner, manifest, transitions and Jury/gallery state',async()=>{
 const db=await account();await query(db,vote());await query(db,`insert into public.wing_submission_upload_intents values('${ids.other}','reserved',now());
 create function public.fixture_late_account_failure() returns trigger language plpgsql as $$begin raise exception 'fixture_late_account_failure';end;$$;
 create trigger fixture_late_account_failure before update on public.wing_submission_upload_intents for each row execute function public.fixture_late_account_failure();`);
 await assert.rejects(query(db,prepare()),/fixture_late_account_failure/);
 assert.equal(await query(db,`select count(*) from public.wing_account_deletion_manifests`),'0');assert.equal(await query(db,`select count(*) from public.wing_submission_state_transitions`),'0');
 assert.equal(await query(db,`select user_id::text||':'||status from public.wing_media_submissions`),`${ids.other}:approved`);assert.deepEqual(JSON.parse(await query(db,metrics)),[1,1,1,9]);
});

test('matched successful account completion leaves historical Jury votes while deleting voter adjusts exact counts and saved lists',async()=>{
 const db=await account();await query(db,vote(ids.user,1));await query(db,vote(ids.other,0));await query(db,vote(ids.third,-1));
 await query(db,`insert into public.destination_ratings(id,user_id,destination_id,crawl_id) values('${ids.rating}','${ids.other}','${ids.destination}','${ids.crawl}');
 ${asUser(ids.other)} insert into public.user_destination_favorites values('${ids.other}','${ids.destination}',now());insert into public.user_want_to_try values('${ids.other}','${ids.otherDestination}',now());`);
 const first=JSON.parse(await query(db,prepare()));assert.equal(await query(db,`select public.complete_wing_account_media_cleanup('${first.manifest_id}',true,null)`),'t');
 // Completion witnesses the contract flag; actual Storage removal is separate.
 await query(db,`delete from auth.users where id='${ids.other}'`);
 assert.equal(await query(db,`select count(*) from public.user_destination_favorites`),'0');assert.equal(await query(db,`select count(*) from public.user_want_to_try`),'0');
 assert.equal(await query(db,`select like_count||','||neutral_count||','||dislike_count from public.wing_jury_photo_vote_counts`),'1,0,1');assert.equal(await query(db,`select count(*) from public.wing_jury_votes`),'2');
 assert.equal(await query(db,`select count(*) from public.wing_media_submissions`),'1');assert.equal(await query(db,`select count(*) from public.wing_media_photo_votes`),'0');
});

test('every 15 production-matched incoming media RESTRICT edges preserve all Jury/gallery rows atomically',async()=>{
 const db=await fresh();await query(db,vote());const before=await query(db,metrics);
 const edges=JSON.parse(await query(db,`select json_agg(json_build_array(c.conrelid::regclass::text,a.attname) order by c.conrelid::regclass::text) from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1] where c.contype='f' and c.confrelid='public.wing_media_submissions'::regclass and c.confdeltype='r'`));assert.equal(edges.length,15);
 for(const [table,column] of edges){await query(db,`insert into ${table}(fixture_id,${column}) values('${correlation}','${ids.photo}')`);await assert.rejects(query(db,`delete from public.wing_media_submissions where id='${ids.photo}'`),/23503/);assert.equal(await query(db,metrics),before);await query(db,`delete from ${table} where fixture_id='${correlation}'`);}
 await query(db,`delete from public.wing_media_submissions where id='${ids.photo}'`);for(const table of ['wing_jury_votes','wing_jury_photo_vote_counts','wing_media_photo_votes'])assert.equal(await query(db,`select count(*) from public.${table}`),'0');
});

test('frozen eligibility excludes archived objects and delete markers without erasing prior verdicts',async()=>{
 const db=await fresh();await query(db,vote());for(const state of ['archived_at=now()','is_delete_marker=true']){
  await query(db,`update storage.objects set ${state}`);assert.equal(await query(db,`select public.is_public_wing_jury_photo('${ids.photo}')`),'f');
  await assert.rejects(query(db,vote(ids.third)),/not_eligible/);assert.equal(await query(db,`select count(*) from public.wing_jury_votes`),'1');assert.equal(await query(db,`select like_count from public.wing_jury_photo_vote_counts`),'1');
  await query(db,`update storage.objects set archived_at=null,is_delete_marker=false`);
 }
 assert.equal(await query(db,`select public.is_public_wing_jury_photo('${ids.photo}')`),'t');
});

test('withdrawal and votes serialize in both orderings and retain committed verdict history',async()=>{
 for(const withdrawalFirst of [false,true]){const db=await fresh(),holder=session(db,'final-A-withdraw-holder');try{
  const withdraw=`update public.wing_media_submissions set status='withdrawn',withdrawn_at=now() where id='${ids.photo}'`;
  await holder.execute('begin;'+(withdrawalFirst?withdraw:vote()));
  const pending=query(db,withdrawalFirst?vote():withdraw,'final-A-withdraw-waiter').then(value=>({value}),error=>({error}));await observeBlocked(db,'final-A-withdraw-waiter');await holder.execute('commit');const outcome=await pending;
  if(withdrawalFirst)assert.match(outcome.error?.message??'',/not_eligible/);else assert.ifError(outcome.error);
  assert.equal(await query(db,`select count(*) from public.wing_jury_votes`),withdrawalFirst?'0':'1');assert.equal(await query(db,`select public.is_public_wing_jury_photo('${ids.photo}')`),'f');
 }finally{await holder.close();}}
});
