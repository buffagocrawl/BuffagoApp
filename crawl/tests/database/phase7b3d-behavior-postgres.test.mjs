import {before,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {startDisposablePostgres,fixture,query,session,observeBlocked,ids,asUser} from '../../scripts/phase7b25-postgres.mjs';
import {frozenBytes} from '../../scripts/phase7b3b-feature-executor.mjs';
import {ratingRpcRetry} from '../../lib/ratingRpcRetry.js';
const root=new URL('../../supabase/migrations/',import.meta.url);
const comparisons=JSON.parse(await readFile(new URL('../../../docs/phase-7b3c-source-comparisons.json',import.meta.url),'utf8'));
async function matched(name){const row=comparisons.results.find(r=>r.function===name && r.match!=='NO MATCH');assert.ok(row);const source=await readFile(new URL(row.file,root),'utf8');const match=source.match(new RegExp(`create (?:or replace )?function public\\.${name}\\([\\s\\S]*?as \\$\\$([\\s\\S]*?)\\$\\$;`,'i'));assert.ok(match);const normalized=row.match==='LF-normalized'?match[0].replaceAll('\r\n','\n'):match[0];const body=row.match==='LF-normalized'?match[1].replaceAll('\r\n','\n'):match[1];assert.equal(createHash('md5').update(body).digest('hex'),row.productionMD5);return normalized;}
before(async()=>{await startDisposablePostgres();await query('buffago_phase7b25','create role supabase_auth_admin nologin; create role supabase_storage_admin nologin;');});
async function ratingFixture(){const db=await fixture({bootstrap:new URL('./fixtures/phase7b3a-production-shaped-bootstrap.sql',import.meta.url),migration:false});
 await query(db,`alter table public.destination_ratings alter column id set default gen_random_uuid();
alter table public.destination_ratings add column crispiness smallint,add column sauce smallint,add column meat smallint,add column overall smallint,add column wings_eaten smallint,add column tag_id bigint,add column sauce_style smallint,add column spice_level smallint,add column would_order_again boolean,add column flavor_vibe smallint[];
alter table public.crawls add column user_id uuid,add column is_solo boolean,add column status text,add column start_time timestamptz,add column end_time timestamptz;
alter table public.routes add column stop1_id uuid,add column stop2_id uuid,add column stop3_id uuid,add column stop4_id uuid,add column stop5_id uuid;
update public.crawls set user_id='${ids.user}';update public.routes set stop1_id='${ids.destination}';
create table public.route_ordered_destinations(route_id uuid,destination_id uuid,stop_order integer);
create table public.rating_verification_receipts(rating_id uuid primary key,user_id uuid,destination_id uuid,crawl_id uuid,verification_type text,wing_shot_eligible boolean,eligibility_reason text,validator_version text,accuracy_class text,distance_bucket text,metadata jsonb);
create table public.rating_submission_operations(user_id uuid,operation_id uuid,rating_id uuid,crawl_id uuid,surface text,unique(user_id,operation_id));
-- Explicit fault witness, NOT production referral implementation.
create function public.settle_referral_for_rating_internal(uuid,uuid) returns jsonb language plpgsql as $$begin if current_setting('fixture.referral_fail',true)='on' then raise exception 'fixture_referral_failure';end if;return '{}'::jsonb;end;$$;`);
 await query(db,await matched('submit_validated_restaurant_rating'));await query(db,await matched('submit_validated_crawl_rating'));await query(db,(await frozenBytes()).sql);return db;}
const op='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const scores=`42::float8,-78::float8,10::float8,4::smallint,4::smallint,4::smallint,4::smallint`;
const home=`select public.submit_validated_restaurant_rating('${op}','${ids.destination}',${scores})`;
const crawl=`select public.submit_validated_crawl_rating('${ids.crawl}','${ids.destination}',${scores})`;
test('matched Home rollback after referral, receipt replay and cleanup execute actual body',async()=>{const db=await ratingFixture();await query(db,`${asUser()} insert into public.user_want_to_try values('${ids.user}','${ids.destination}',now())`);
 await assert.rejects(query(db,asUser()+`set fixture.referral_fail='on';`+home),/fixture_referral_failure/);
 assert.equal(await query(db,'select count(*) from public.destination_ratings'),'0');assert.equal(await query(db,'select count(*) from public.rating_submission_operations'),'0');assert.equal(await query(db,'select count(*) from public.user_want_to_try'),'1');
 const first=JSON.parse((await query(db,asUser()+home)).split('\n').at(-1)),replay=JSON.parse((await query(db,asUser()+home)).split('\n').at(-1));assert.equal(first.rating_id,replay.rating_id);assert.equal(replay.idempotent_replay,true);assert.equal(await query(db,'select count(*) from public.destination_ratings'),'1');assert.equal(await query(db,'select count(*) from public.user_want_to_try'),'0');});
test('matched Home concurrent operation loses with uniqueness; later same-operation replay recovers',async()=>{const db=await ratingFixture(),holder=session(db,'7b3d-home-holder');try{await holder.execute('begin;'+asUser()+home);const waiter=query(db,asUser()+home,'7b3d-home-waiter');const rejection=assert.rejects(waiter,/duplicate key/);await observeBlocked(db,'7b3d-home-waiter');await holder.execute('commit');await rejection;const replay=JSON.parse((await query(db,asUser()+home)).split('\n').at(-1));assert.equal(replay.idempotent_replay,true);assert.equal(await query(db,'select count(*) from public.destination_ratings'),'1');assert.equal(await query(db,'select count(*) from public.rating_submission_operations'),'1');}finally{await holder.close();}});
test('matched Crawl conflict UPDATE keeps rating/provenance identity; late helper failure rolls scores back',async()=>{const db=await ratingFixture();const first=JSON.parse((await query(db,asUser()+crawl)).split('\n').at(-1));await assert.rejects(query(db,asUser()+`set fixture.referral_fail='on';`+crawl.replaceAll('4::smallint','8::smallint')),/fixture_referral_failure/);assert.equal(await query(db,'select overall from public.destination_ratings'),'4');const replay=JSON.parse((await query(db,asUser()+crawl.replaceAll('4::smallint','7::smallint'))).split('\n').at(-1));assert.equal(first.rating_id,replay.rating_id);assert.equal(await query(db,'select count(*) from public.rating_verification_receipts'),'1');assert.equal(await query(db,'select overall from public.destination_ratings'),'7');});
test('matched upload and approval bodies enforce derivative settlement and canonical Storage existence',async()=>{const db=await ratingFixture();await query(db,`alter table public.wing_media_submissions add column correlation_id uuid,add column thumbnail_storage_path text;
alter table public.wing_photo_derivative_jobs add column id uuid default gen_random_uuid(),add column purpose text,add column status text default 'pending',add column correlation_id uuid;
alter table public.wing_photo_derivative_jobs alter column fixture_id set default gen_random_uuid();
create unique index fixture_derivative_submission on public.wing_photo_derivative_jobs(submission_id);
create table public.wing_photo_derivative_receipts(submission_id uuid,event text,correlation_id uuid);
alter table public.wing_processing_jobs add column job_kind text,add column status text;
-- Explicit surrogate blocker; real owner/retention/moderation parity remains live.
create function public.wing_photo_processing_blocker(uuid) returns text language sql as $$select null::text$$;`);
 await query(db,(await matched('enqueue_wing_photo_upload_derivatives')).replace('create function','create or replace function'));await query(db,(await matched('guard_wing_photo_approval')).replace('create function','create or replace function'));
 await query(db,`update public.wing_media_submissions set status='in_review',thumbnail_storage_path='thumbnails/'||id||'/preview';`);
 await assert.rejects(query(db,`update public.wing_media_submissions set status='approved'`),/processed_photo_required/);
 await query(db,`insert into public.wing_photo_derivative_jobs(submission_id,status) values('${ids.photo}','succeeded');`);
 await assert.rejects(query(db,`update public.wing_media_submissions set status='approved'`),/processed_photo_required/);
 await query(db,`insert into storage.objects(bucket_id,name) values('wing-submissions','thumbnails/${ids.photo}/preview');update public.wing_media_submissions set status='approved';`);
 assert.equal(await query(db,`select public.is_public_wing_jury_photo('${ids.photo}')`),'t');
 // Execute the existing upload trigger on a second actual row.
 await query(db,`insert into public.wing_media_submissions(id,user_id,media_type,status,destination_id,consent_version,consented_at,attribution_preference,original_storage_path,correlation_id) values('${op}','${ids.user}','photo','in_review','${ids.destination}','v1',now(),'anonymous','original/${ids.user}/${op}/upload','${op}');`);
 assert.equal(await query(db,`select count(*) from public.wing_photo_derivative_jobs where submission_id='${op}'`),'1');assert.equal(await query(db,`select count(*) from public.wing_photo_derivative_receipts where submission_id='${op}'`),'1');
});

async function accountFixture(){const db=await ratingFixture();await query(db,`alter table public.wing_media_submissions add column thumbnail_storage_path text,add column owner_pseudonym_id uuid,add column user_caption text,add column updated_at timestamptz,add column correlation_id uuid;
create table public.wing_account_deletion_manifests(id uuid primary key default gen_random_uuid(),user_id uuid,owner_pseudonym_id uuid,object_paths text[],correlation_id uuid unique,status text default 'pending',failure_reason text,completed_at timestamptz);
create table public.wing_submission_mutation_receipts(user_id uuid,submission_id uuid,mutation_kind text,idempotency_key text unique,request_fingerprint text,result jsonb,correlation_id uuid,owner_pseudonym_id uuid,owner_deleted_at timestamptz);
alter table public.wing_submission_state_transitions add column from_status text,add column to_status text,add column actor_type text,add column actor_id uuid,add column trigger_source text,add column idempotency_key text,add column request_fingerprint text,add column correlation_id uuid,add column metadata jsonb;
alter table public.wing_submission_state_transitions alter column fixture_id set default gen_random_uuid();
alter table public.social_content_jobs add column generated_media_path text,add column status text,add column updated_at timestamptz,add column failure_code text,add column failure_reason text;
alter table public.rating_verification_receipts add column owner_pseudonym_id uuid,add column owner_deleted_at timestamptz;
create table public.social_community_visit_intents(user_id uuid,status text,owner_pseudonym_id uuid,owner_deleted_at timestamptz);
create table public.social_community_reward_events(user_id uuid,owner_pseudonym_id uuid,owner_deleted_at timestamptz);
create table public.wing_submission_upload_intents(user_id uuid,status text,updated_at timestamptz);`);
for(const t of ['wing_creator_reward_events','wing_creator_badge_events','wing_notification_receipts'])await query(db,`alter table public.${t} add column user_id uuid,add column owner_pseudonym_id uuid,add column owner_deleted_at timestamptz;`);
for(const n of ['withdraw_wing_submission','prepare_wing_account_media_cleanup','complete_wing_account_media_cleanup'])await query(db,await matched(n));return db;}
test('matched prepare retains linked rating and Jury counts; completion failure is terminal for that manifest',async()=>{const db=await accountFixture();await query(db,asUser(ids.other)+home);const rating=await query(db,'select id from public.destination_ratings');await query(db,`update public.wing_media_submissions set rating_id='${rating}';`);
await query(db,`${asUser()} insert into public.wing_jury_votes(user_id,submission_id,vote) values('${ids.user}','${ids.photo}',1);`);
const prepare=`select public.prepare_wing_account_media_cleanup('${ids.other}','${op}')`;
const receipt=JSON.parse(await query(db,prepare));assert.equal((JSON.parse(await query(db,prepare))).manifest_id,receipt.manifest_id);
assert.equal(await query(db,`select rating_id::text||':'||status||':'||(user_id is null)::text from public.wing_media_submissions where id='${ids.photo}'`),`${rating}:withdrawn:true`);
assert.equal(await query(db,`select count(*) from public.wing_jury_votes`),'1');assert.equal(await query(db,`select public.is_public_wing_jury_photo('${ids.photo}')`),'f');
await assert.rejects(query(db,`delete from auth.users where id='${ids.other}'`),/foreign key constraint/);
assert.equal(await query(db,`select public.complete_wing_account_media_cleanup('${receipt.manifest_id}',false,'storage failure')`),'t');assert.equal(await query(db,`select public.complete_wing_account_media_cleanup('${receipt.manifest_id}',true,null)`),'f');assert.equal(await query(db,`select status from public.wing_account_deletion_manifests`),'failed');
});
test('matched withdrawal delegates transition once and replays receipt; helper failure is atomic',async()=>{const db=await accountFixture();await query(db,`create function public.wing_transition_submission(uuid,text,text,text,uuid,text,text,uuid,jsonb) returns uuid language plpgsql as $$begin if current_setting('fixture.transition_fail',true)='on' then raise exception 'fixture_transition_failure';end if;update public.wing_media_submissions set status=$2,withdrawn_at=now() where id=$1 and status=$3;return $1;end;$$;`);
const rpc=`select public.withdraw_wing_submission('${ids.photo}','approved','withdraw-test','${op}')`;
await assert.rejects(query(db,asUser(ids.other)+`set fixture.transition_fail='on';`+rpc),/fixture_transition_failure/);assert.equal(await query(db,'select count(*) from public.wing_submission_mutation_receipts'),'0');
const first=await query(db,asUser(ids.other)+rpc);assert.equal(await query(db,asUser(ids.other)+rpc),first);assert.equal(await query(db,'select count(*) from public.wing_submission_mutation_receipts'),'1');assert.equal(await query(db,`select public.is_public_wing_jury_photo('${ids.photo}')`),'f');
});
test('whole-RPC retry recovers real PostgreSQL transaction aborts with stable Home operation and no partial cleanup',async()=>{
 for(const code of ['40P01','40001']){
  const db=await ratingFixture();await query(db,`create sequence public.fixture_retry_attempt;create or replace function public.settle_referral_for_rating_internal(uuid,uuid) returns jsonb language plpgsql as $$begin if nextval('public.fixture_retry_attempt')=1 then raise exception 'fixture_transaction_abort' using errcode='${code}';end if;return '{}'::jsonb;end;$$;`);
  await query(db,`${asUser()} insert into public.user_want_to_try values('${ids.user}','${ids.destination}',now())`);let calls=0;
  const client={async rpc(name,p){assert.equal(name,'submit_validated_restaurant_rating');assert.equal(p.p_operation_id,op);calls++;try{return {data:await query(db,asUser()+home),error:null};}catch(error){assert.match(error.message,new RegExp(code));return {error:{code}};}}};
  const response=await ratingRpcRetry(client,'submit_validated_restaurant_rating',{p_operation_id:op},async()=>{
   assert.equal(await query(db,'select count(*) from public.destination_ratings'),'0');assert.equal(await query(db,'select count(*) from public.rating_submission_operations'),'0');assert.equal(await query(db,'select count(*) from public.user_want_to_try'),'1');
  });
  assert.equal(response.error,null);assert.equal(calls,2);assert.equal(await query(db,'select count(*) from public.destination_ratings'),'1');assert.equal(await query(db,'select count(*) from public.rating_submission_operations'),'1');assert.equal(await query(db,'select count(*) from public.user_want_to_try'),'0');
 }
});
