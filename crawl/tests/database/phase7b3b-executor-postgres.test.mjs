import {before,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,appendFile} from 'node:fs/promises';
import {startDisposablePostgres,fixture,query,session,observeBlocked,ids,asUser} from '../../scripts/phase7b25-postgres.mjs';
import {transactionKernel,productionPlan,executeDisposableKernel,snapshotSQL,effectivePrivilegeGate,version,migrationHash,frozenBytes} from '../../scripts/phase7b3b-feature-executor.mjs';
const bootstrap=new URL('./fixtures/phase7b3a-production-shaped-bootstrap.sql',import.meta.url);
before(async()=>{
 await startDisposablePostgres();
 await query('buffago_phase7b25','create role supabase_auth_admin nologin; create role supabase_storage_admin nologin;');
});
async function fresh(){
 const db=await fixture({bootstrap,migration:false});
 // Synthetic current Supabase ledger shape; actual production shape is a gate.
 await query(db,`create schema supabase_migrations; create table supabase_migrations.schema_migrations(version text primary key,statements text[],name text);
 insert into supabase_migrations.schema_migrations values('20261009201342',array['synthetic history; NEVER REPLAY'],'wing_photo_vote_gallery_eligibility');`);
 return db;
}
const absent=db=>query(db,"select to_regclass('public.wing_jury_votes') is null and (select count(*)=1 from supabase_migrations.schema_migrations)");
const kernel=async(db)=>transactionKernel({snapshot:await query(db,snapshotSQL),expectedDatabase:db,strict:false});
const audit=event=>appendFile(new URL('../../.expo/phase7b3b-executor-evidence.jsonl',import.meta.url),JSON.stringify(event)+'\n');

test('production plan rejects wrong target and absent authorization; hash pins frozen bytes',async()=>{
 await assert.rejects(productionPlan({project:'wrong'}),/Wrong target/);
 await assert.rejects(productionPlan({project:'vhfxnizaxdanmvmouuaf',host:'evil.example'}),/target endpoint/);
 await assert.rejects(productionPlan({project:'vhfxnizaxdanmvmouuaf',host:'db.vhfxnizaxdanmvmouuaf.supabase.co',port:5432,database:'postgres',user:'postgres',tls:'verify-full',migrationHash}),/historyException/);
 const bytes=await frozenBytes();assert.ok(bytes.sql.startsWith('-- QUARANTINED'));assert.ok(bytes.preflight.includes('begin read only;'));
 await assert.rejects(productionPlan({project:'vhfxnizaxdanmvmouuaf',host:'db.vhfxnizaxdanmvmouuaf.supabase.co',port:5432,database:'postgres',user:'postgres',tls:'verify-full',migrationHash:'0'.repeat(64)}),/Expected values/);
 await assert.rejects(transactionKernel({snapshot:'0'.repeat(32),expectedDatabase:'postgres',strict:false}),/Fixture lane/);
 // Prior 3A package tamper tests already cover changed bytes/extra files. No rerun.
});
test('full strict production lane rejects surrogate fingerprints without any ledger or DDL writes',async()=>{
 const db=await fresh();
 await assert.rejects(executeDisposableKernel(query,db,{audit}),/existing_trigger_drift.*trg_rating_after_insert/);
 assert.equal(await absent(db),'t');
});
test('remaining read-only packet executes on PG17.6 and exact snapshot artifact matches constructor',async()=>{
 const db=await fresh();
 const packet=await readFile(new URL('../../../docs/phase-7b3b-remaining-production-readonly.sql',import.meta.url),'utf8');
 await query(db,packet);assert.equal(await absent(db),'t');
 const snapshotArtifact=await readFile(new URL('../../../docs/phase-7b3b-catalog-snapshot-readonly.sql',import.meta.url),'utf8');
 assert.ok(snapshotArtifact.endsWith(snapshotSQL+'\n'));
 assert.match(await query(db,snapshotArtifact),/^[a-f0-9]{32}$/);
});
test('fixture transaction kernel applies frozen body and records only original SQL atomically; repeated application refuses',async()=>{
 const db=await fresh(); const history=await query(db,"select row_to_json(t) from supabase_migrations.schema_migrations t");
 await executeDisposableKernel(query,db,{strict:false,audit});
 const {sql}=await frozenBytes();
 assert.equal(await query(db,`select statements[1] from supabase_migrations.schema_migrations where version='${version}'`),sql.trim());
 assert.equal(await query(db,"select row_to_json(t) from supabase_migrations.schema_migrations t where version='20261009201342'"),history);
 await assert.rejects(executeDisposableKernel(query,db,{strict:false,audit}),/nonforward_ledger/);
 assert.equal(await query(db,'select count(*) from supabase_migrations.schema_migrations'),'2');
});
test('unexpected catalog and full historical ledger drift, wrong DB and execution role reject',async()=>{
 const db=await fresh(); let sql=await kernel(db);
 await query(db,'create index fixture_drift on public.destinations(name)');
 await assert.rejects(query(db,sql),/snapshot_drift/);assert.equal(await absent(db),'t');
 sql=await kernel(db);await query(db,"update supabase_migrations.schema_migrations set name='unexpected'");
 await assert.rejects(query(db,sql),/snapshot_drift/);assert.equal(await absent(db),'t');
 const snapshot=await query(db,snapshotSQL);
 await assert.rejects(query(db,await transactionKernel({snapshot,expectedDatabase:'buffago_phase7b25_999',strict:false})),/identity/);
 await assert.rejects(query(db,'set role authenticated; '+await kernel(db)),/permission denied|identity/);
 assert.equal(await absent(db),'t');
});
test('existing feature name and nonforward ledger reject without replacing objects',async()=>{
 const db=await fresh();await query(db,'create table public.wing_jury_votes(marker text)');
 await assert.rejects(query(db,await kernel(db)),/relation_type_index_collision/);
 assert.equal(await query(db,"select column_name from information_schema.columns where table_name='wing_jury_votes'"),'marker');
 const other=await fresh();await query(other,"insert into supabase_migrations.schema_migrations values('20261011100000',array['not replayed'],'future')");
 await assert.rejects(query(other,await kernel(other)),/nonforward_ledger/);
 assert.equal(await query(other,"select to_regclass('public.wing_jury_votes') is null"),'t');
});
test('ledger insertion failure AFTER feature DDL rolls back all DDL and preserves history',async()=>{
 const db=await fresh();await query(db,`alter table supabase_migrations.schema_migrations add constraint fixture_ledger_reject check(version<>'${version}')`);
 await assert.rejects(query(db,await kernel(db)),/fixture_ledger_reject/);
 assert.equal(await absent(db),'t');
 assert.equal(await query(db,"select count(*) from pg_trigger where not tgisinternal and tgrelid='public.destination_ratings'::regclass"),'3');
});
test('partial feature failure rolls back DDL and no new ledger row appears',async()=>{
 const db=await fresh();const sql=await kernel(db);
 // Explicit fault injection into test execution stream, never frozen artifact.
 await assert.rejects(query(db,sql.replace('create table public.wing_jury_votes','select 1/0; create table public.wing_jury_votes')),/22012/);
 assert.equal(await absent(db),'t');
});
test('pre-COMMIT effective ACL guard rejects inherited default-grant rights',async()=>{
 const db=await fresh();
 await query(db,"create role fixture_extra nologin; grant fixture_extra to authenticated with set false; alter default privileges for role postgres in schema public grant update on tables to fixture_extra");
 await assert.rejects(query(db,await kernel(db)),/unapproved_table_grantee|effective_acl.*authenticated/);
 assert.equal(await absent(db),'t');
});
test('standalone default ACL grantees and SET-only membership refuse atomically',async()=>{
 const db=await fresh();
 await query(db,"alter default privileges for role postgres in schema public grant select on tables to fixture_extra");
 await assert.rejects(query(db,await kernel(db)),/unapproved_table_grantee/);assert.equal(await absent(db),'t');
 const other=await fresh();
 await query(other,"grant fixture_extra to service_role with inherit false, set true");
 try {await assert.rejects(query(other,await kernel(other)),/unapproved_set_role_path/);assert.equal(await absent(other),'t');}
 finally {await query(other,'revoke fixture_extra from service_role');}
});
test('unexpected column grants and grant options reject before COMMIT',async()=>{
 const db=await fresh(),sql=await kernel(db);
 await assert.rejects(query(db,sql.replace(effectivePrivilegeGate,'grant update(like_count) on public.wing_jury_photo_vote_counts to service_role;\n'+effectivePrivilegeGate)),/unapproved_column_acl/);
 assert.equal(await absent(db),'t');
 await assert.rejects(query(db,sql.replace(effectivePrivilegeGate,'grant select on public.wing_jury_votes to authenticated with grant option;\n'+effectivePrivilegeGate)),/unapproved_table_grantee/);
 assert.equal(await absent(db),'t');
});
test('concurrent feature executors serialize; stale second executor refuses after first commit',async()=>{
 const db=await fresh(), sql=await kernel(db), holder=session(db,'phase7b3b-holder');
 try {
  await holder.execute(sql.slice(0,sql.lastIndexOf('commit;')));
  const waiter=query(db,sql,'phase7b3b-waiter').then(value=>({value}),error=>({error}));
  const blocked=await observeBlocked(db,'phase7b3b-waiter');assert.ok(blocked.blockers.length);
  await holder.execute('commit');const result=await waiter;
  assert.match(result.error?.message??'',/snapshot_drift/);
  assert.equal(await query(db,'select count(*) from supabase_migrations.schema_migrations'),'2');
 } finally {await holder.close();}
});
test('lost commit acknowledgement records unknown outcome; read-only inspection proves committed version',async()=>{
 const db=await fresh();const events=[];
 const uncertain=async(database,sql)=>{
  const result=await query(database,sql);
  if(sql.includes('insert into supabase_migrations.schema_migrations')) throw new Error('simulated lost COMMIT acknowledgement');
  return result;
 };
 await assert.rejects(executeDisposableKernel(uncertain,db,{strict:false,audit:async event=>{events.push(event);await audit(event);}}),/lost COMMIT/);
 assert.equal(events.at(-1).status,'failed-or-unknown');
 assert.equal(await query(db,`select count(*) from supabase_migrations.schema_migrations where version='${version}'`),'1');
 assert.equal(await query(db,"select to_regclass('public.wing_jury_votes') is not null"),'t');
 await assert.rejects(executeDisposableKernel(query,db,{strict:false,audit}),/nonforward_ledger/);
});
test('kernel integration preserves rating triggers, cleanup, media cascade and owner/guest RLS',async()=>{
 const db=await fresh();
 const baseline=await query(db,"select json_agg(json_build_array(tgname,pg_get_triggerdef(oid,true)) order by tgname) from pg_trigger where not tgisinternal and tgrelid='public.destination_ratings'::regclass");
 await query(db,await kernel(db));
 assert.equal(await query(db,"select json_agg(json_build_array(tgname,pg_get_triggerdef(oid,true)) order by tgname) from pg_trigger where not tgisinternal and tgrelid='public.destination_ratings'::regclass and tgname in ('destination_rating_friend_notification','guard_buffacoin_rating_writes','trg_rating_after_insert')"),baseline);
 await query(db,`${asUser()} insert into public.user_want_to_try(user_id,destination_id) values('${ids.user}','${ids.destination}');`);
 await query(db,`insert into public.destination_ratings(id,user_id,destination_id,crawl_id,weight_score) values('${ids.rating}','${ids.user}','${ids.destination}','${ids.crawl}',4)`);
 await query(db,`update public.wing_media_submissions set rating_id='${ids.rating}' where id='${ids.photo}'`);
 assert.equal(await query(db,'select count(*) from public.user_want_to_try'),'0');
 await query(db,`${asUser()} insert into public.user_destination_favorites(user_id,destination_id) values('${ids.user}','${ids.destination}'); insert into public.wing_jury_votes(submission_id,user_id,vote) values('${ids.photo}','${ids.user}',1);`);
 await assert.rejects(query(db,`${asUser(ids.other)} insert into public.user_want_to_try(user_id,destination_id) values('${ids.user}','${ids.otherDestination}')`),/owner|policy|user_mismatch/);
 await assert.rejects(query(db,`${asUser(ids.other,true)} insert into public.wing_jury_votes(submission_id,user_id,vote) values('${ids.photo}','${ids.other}',1)`),/anonymous|authenticated|policy/);
 await assert.rejects(query(db,`delete from public.destination_ratings where id='${ids.rating}'`),/rating_id_fkey/);
 assert.equal(await query(db,'select count(*) from public.user_destination_favorites'),'1');
 await query(db,`update public.wing_media_submissions set rating_id=null where id='${ids.photo}'; delete from public.destination_ratings where id='${ids.rating}';`);
 assert.equal(await query(db,'select count(*) from public.user_destination_favorites'),'0');
 await query(db,`delete from public.wing_media_submissions where id='${ids.photo}'`);
 assert.equal(await query(db,'select count(*) from public.wing_jury_votes'),'0');
 assert.equal(await query(db,'select count(*) from public.wing_jury_photo_vote_counts'),'0');
});
