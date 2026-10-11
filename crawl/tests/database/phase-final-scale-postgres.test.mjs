import {before,test} from 'node:test';
import assert from 'node:assert/strict';
import {appendFile,readFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {startDisposablePostgres,fixture,query,session,observeBlocked,ids,asUser} from '../../scripts/phase7b25-postgres.mjs';
import {transactionKernel,snapshotSQL,version} from '../../scripts/phase7b3b-feature-executor.mjs';

const bootstrap=new URL('./fixtures/phase7b3a-production-shaped-bootstrap.sql',import.meta.url);
before(async()=>{await startDisposablePostgres();await query('buffago_phase7b25','create role supabase_auth_admin nologin; create role supabase_storage_admin nologin;');});
async function fresh(){
 const db=await fixture({bootstrap,migration:false});
 await query(db,`create schema supabase_migrations; create table supabase_migrations.schema_migrations(version text primary key,statements text[],name text,created_by text,idempotency_key text unique,rollback text[]); insert into supabase_migrations.schema_migrations values('20261009201342',array['fixture only; never replay'],'fixture',null,null,null);`);
 return db;
}
const kernel=async db=>transactionKernel({snapshot:await query(db,snapshotSQL),expectedDatabase:db,strict:false});
const absent=async db=>assert.equal(await query(db,`select to_regclass('public.wing_jury_votes') is null and not exists(select 1 from supabase_migrations.schema_migrations where version='${version}')`),'t');
async function measure(label,body){const start=performance.now();await body();const result={label,elapsedMs:Math.round(performance.now()-start),fixture:'PG17.6 synthetic prerequisites; not production sizing/parity',at:new Date().toISOString()};await appendFile(new URL('../../.expo/final-release/scale-measurements.jsonl',import.meta.url),JSON.stringify(result)+'\n');console.log(JSON.stringify(result));return result;}

test('frozen index build and whole six-column ledger comparison handle 100k media/ratings and 20k history rows',async()=>{
 const db=await fresh();
 // Bulk seeding precedes the feature and is not a helper parity test. Existing
 // synthetic instrumentation reads future tables; disable it ONLY for fixture
 // data setup, restore every attachment before snapshot/application. FKs stay on.
 await query(db,'alter table public.destination_ratings disable trigger user;alter table public.wing_media_submissions disable trigger user;');
 for(let start=1;start<=100000;start+=10000) await query(db,`insert into public.crawls(crawl_id) select md5('scale-crawl-'||i)::uuid from generate_series(${start},${start+9999}) i; insert into public.destination_ratings(id,user_id,destination_id,crawl_id,weight_score) select gen_random_uuid(),'${ids.user}','${ids.destination}',md5('scale-crawl-'||i)::uuid,4 from generate_series(${start},${start+9999}) i;
 insert into public.wing_media_submissions(id,user_id,media_type,status,destination_id,consent_version,consented_at,attribution_preference,processed_storage_path) select gen_random_uuid(),'${ids.other}','photo','approved','${ids.destination}','v1',now(),'anonymous','processed/fixture-'||i from generate_series(${start},${start+9999}) i;`);
 await query(db,`insert into supabase_migrations.schema_migrations select (20000000000000::bigint+i)::text,array[repeat('synthetic old SQL; ',60)],'fixture-'||i,'owner-'||i,'operation-'||i,array['never execute'] from generate_series(1,20000) i; analyze public.wing_media_submissions; analyze public.destination_ratings;`);
 await query(db,'alter table public.destination_ratings enable trigger user;alter table public.wing_media_submissions enable trigger user;');
 const original=await query(db,"select md5(string_agg(to_jsonb(m)::text,E'\\n' order by version)) from supabase_migrations.schema_migrations m");
 await measure('snapshot-20001-ledger-rows',async()=>assert.match(await query(db,snapshotSQL),/^[a-f0-9]{32}$/));
 const sql=await kernel(db);const result=await measure('feature-kernel-index-100001-media-100000-ratings',()=>query(db,sql));
 assert.ok(result.elapsedMs<60000,'Frozen statement budget must not be relaxed');
 assert.equal(await query(db,`select md5(string_agg(to_jsonb(m)::text,E'\\n' order by version)) from supabase_migrations.schema_migrations m where version<>'${version}'`),original);
 assert.equal(await query(db,"select count(*) from pg_index where indexrelid='public.wing_media_submissions_wing_jury_candidate_idx'::regclass and indisvalid and indisready"),'1');
 assert.equal(await query(db,'select count(*) from public.destination_ratings'),'100000');
});

test('long-running rating writer forces frozen 5s lock timeout and atomic refusal',async()=>{
 const db=await fresh(),sql=await kernel(db),holder=session(db,'final-scale-rating-holder');
 try {
  // Same relation lock as INSERT, without invoking prefeature synthetic helpers.
  await holder.execute('begin;lock table public.destination_ratings in row exclusive mode');
  const pending=query(db,sql,'final-scale-lock-waiter').then(value=>({value}),error=>({error}));
  assert.ok((await observeBlocked(db,'final-scale-lock-waiter')).blockers.length);
  const result=await pending;assert.match(result.error?.message??'',/55P03|lock timeout/);await absent(db);
  await holder.execute('rollback');await query(db,await kernel(db));
  assert.equal(await query(db,'select count(*) from public.destination_ratings'),'0');
 } finally {await holder.close();}
});

test('ledger readers remain available while one executor owns the exclusive ledger lock',async()=>{
 const db=await fresh(),holder=session(db,'final-scale-ledger-holder');
 try {await holder.execute('begin; lock table supabase_migrations.schema_migrations in exclusive mode');
  assert.equal(await query(db,"begin read only;set local statement_timeout='2s';select count(*) from supabase_migrations.schema_migrations;rollback;"),'1');
 } finally {await holder.close();}
 await absent(db);
});

test('32 concurrent Jury writers on one photo preserve exact counts and gallery state',async()=>{
 const db=await fresh();await query(db,await kernel(db));
 const users=JSON.parse(await query(db,"with u as(insert into auth.users(id) select gen_random_uuid() from generate_series(1,32) returning id) select json_agg(id) from u"));
 const gallery=await query(db,"select like_count||':'||dislike_count from public.wing_media_submissions");
 await Promise.all(users.map((user,i)=>query(db,`${asUser(user)} insert into public.wing_jury_votes(submission_id,user_id,vote) values('${ids.photo}','${user}',${i%3-1});`)));
 assert.equal(await query(db,"select like_count||':'||neutral_count||':'||dislike_count from public.wing_jury_photo_vote_counts"),'10:11:11');
 assert.equal(await query(db,"select like_count||':'||dislike_count from public.wing_media_submissions"),gallery);
 assert.equal(await query(db,'select count(*) from public.wing_jury_votes'),'32');
});

test('non-destructive rating containment disables only new triggers and preserves feature data',async()=>{
 const db=await fresh();await query(db,await kernel(db));
 const baseline=await query(db,"select json_agg(json_build_array(tgname,tgenabled,pg_get_triggerdef(oid)) order by tgname) from pg_trigger where tgrelid='public.destination_ratings'::regclass and not tgisinternal and tgname not like 'destination_ratings_%'");
 await query(db,`${asUser()} insert into public.user_want_to_try(user_id,destination_id) values('${ids.user}','${ids.destination}');`);
 // Reviewed emergency proposal only; production needs explicit incident authority.
 const candidate=await readFile(new URL('../../../docs/buffago-final-rating-containment-candidate.sql',import.meta.url),'utf8');
 // Only the database identity predicate is adapted for this dedicated fixture.
 assert.equal(candidate.split("current_database()<>'postgres'").length,2);
 await query(db,candidate.replace("current_database()<>'postgres'",`current_database()<>'${db}'`));
 await query(db,`insert into public.destination_ratings(id,user_id,destination_id,crawl_id,weight_score) values(gen_random_uuid(),'${ids.user}','${ids.destination}','${ids.crawl}',4);`);
 assert.equal(await query(db,'select count(*) from public.user_want_to_try'),'1');
 assert.equal(await query(db,"select count(*) from pg_trigger where tgrelid='public.destination_ratings'::regclass and tgname in ('destination_ratings_lock_collection_identities','destination_ratings_remove_want_to_try','destination_ratings_update_want_to_try','destination_ratings_remove_invalid_favorite') and tgenabled='D'"),'4');
 assert.equal(await query(db,"select json_agg(json_build_array(tgname,tgenabled,pg_get_triggerdef(oid)) order by tgname) from pg_trigger where tgrelid='public.destination_ratings'::regclass and not tgisinternal and tgname not like 'destination_ratings_%'"),baseline);
 assert.equal(await query(db,`select count(*) from supabase_migrations.schema_migrations where version='${version}'`),'1');
 await assert.rejects(query(db,`${asUser()} insert into public.user_want_to_try(user_id,destination_id) values('${ids.user}','${ids.otherDestination}');`),/42501|permission denied/);
});

test('containment candidate rejects trigger drift without disabling baseline or feature handlers',async()=>{
 const db=await fresh();await query(db,await kernel(db));
 const candidate=(await readFile(new URL('../../../docs/buffago-final-rating-containment-candidate.sql',import.meta.url),'utf8')).replace("current_database()<>'postgres'",`current_database()<>'${db}'`);
 await query(db,'alter table public.destination_ratings disable trigger destination_ratings_remove_want_to_try');
 await assert.rejects(query(db,candidate),/containment_trigger_drift/);
 assert.equal(await query(db,"select count(*) from pg_trigger where tgrelid='public.destination_ratings'::regclass and tgname='destination_ratings_lock_collection_identities' and tgenabled='O'"),'1');
 assert.equal(await query(db,"select has_table_privilege('authenticated','public.user_want_to_try','INSERT')"),'t');
});

test('containment refuses inherited PUBLIC delete rights and rolls back its revokes/disables',async()=>{
 const db=await fresh();await query(db,await kernel(db));
 await query(db,'grant delete on public.user_want_to_try to public');
 const candidate=(await readFile(new URL('../../../docs/buffago-final-rating-containment-candidate.sql',import.meta.url),'utf8')).replace("current_database()<>'postgres'",`current_database()<>'${db}'`);
 await assert.rejects(query(db,candidate),/containment_feature_write_still_allowed/);
 assert.equal(await query(db,"select has_table_privilege('authenticated','public.user_want_to_try','INSERT')"),'t');
 assert.equal(await query(db,"select count(*) from pg_trigger where tgrelid='public.destination_ratings'::regclass and tgname='destination_ratings_lock_collection_identities' and tgenabled='O'"),'1');
});
