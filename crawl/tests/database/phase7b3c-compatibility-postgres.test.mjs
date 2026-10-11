import {before,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {startDisposablePostgres,fixture,query,session,observeBlocked,ids,asUser} from '../../scripts/phase7b25-postgres.mjs';
import {frozenBytes,effectivePrivilegeGate,snapshotSQL,snapshotExpression} from '../../scripts/phase7b3b-feature-executor.mjs';
const bootstrap=new URL('./fixtures/phase7b3a-production-shaped-bootstrap.sql',import.meta.url);
before(async()=>{
 await startDisposablePostgres();
 await query('buffago_phase7b25','create role supabase_auth_admin nologin; create role supabase_storage_admin nologin;');
});
const pristine=()=>fixture({bootstrap,migration:false});
const defaults=`alter default privileges for role postgres in schema public grant all privileges on tables to anon,authenticated,service_role;
alter default privileges for role postgres in schema public grant all privileges on sequences to anon,authenticated,service_role;
alter default privileges for role postgres in schema public grant execute on functions to anon,authenticated,service_role;`;
const defaultCatalog=`select json_agg(json_build_array(defaclrole::regrole::text,defaclnamespace::regnamespace::text,defaclobjtype,defaclacl::text) order by defaclnamespace,defaclobjtype) from pg_default_acl where defaclrole='postgres'::regrole`;
async function applyWithGate(db){
 const {sql}=await frozenBytes(); const terminal=sql.lastIndexOf('commit;');
 // Insert executor guard before the original terminal COMMIT. Original frozen
 // bytes/file/hash unchanged; NO ledger writes or full snapshot in this suite.
 await query(db,sql.slice(0,terminal)+effectivePrivilegeGate+'\n'+sql.slice(terminal));
}
test('actual B03 public table/sequence/function default ACL shape is removed only on new features',async()=>{
 const db=await pristine();await query(db,defaults);
 const before=await query(db,defaultCatalog);
 await query(db,`create table public.fixture_default_probe(id integer); create sequence public.fixture_default_sequence;
create function public.fixture_default_function() returns integer language sql as $$select 1$$;`);
 assert.equal(await query(db,"select has_table_privilege('anon','public.fixture_default_probe','MAINTAIN') and has_sequence_privilege('anon','public.fixture_default_sequence','UPDATE') and has_function_privilege('anon','public.fixture_default_function()','EXECUTE')"),'t');
 await applyWithGate(db);
 assert.equal(await query(db,defaultCatalog),before);
 assert.equal(await query(db,"select has_table_privilege('anon','public.wing_jury_votes','MAINTAIN') or has_table_privilege('authenticated','public.wing_jury_votes','UPDATE') or has_table_privilege('service_role','public.wing_jury_photo_vote_counts','UPDATE') or has_function_privilege('anon','public.wing_jury_restaurant_rating_summary(uuid)','EXECUTE')"),'f');
 assert.equal(await query(db,"select count(*) from pg_class where relnamespace='public'::regnamespace and relkind='S' and relname like '%jury%'"),'0');
});
test('B02 six-column ledger accepts proposed SQL types at PREPARE without executing any ledger write',async()=>{
 const db=await pristine();
 await query(db,`create schema supabase_migrations; create table supabase_migrations.schema_migrations(
version text not null,statements text[],name text,created_by text,idempotency_key text,rollback text[],
constraint schema_migrations_pkey primary key(version),constraint schema_migrations_idempotency_key_key unique(idempotency_key));
prepare phase7b3c_representation(text,text,text[]) as insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,$3);
deallocate phase7b3c_representation;`);
 const {sql}=await frozenBytes();
 // SELECT/parameter type checks only. SQL-level representability is narrower
 // than vendor tool compatibility or human approval of a custom history lane.
 assert.equal(await query(db,"select pg_typeof(array['original file']::text[])::text||':'||cardinality(array['original file']::text[])"),'text[]:1');
 assert.ok(sql.endsWith('commit;\n')||sql.endsWith('commit;\r\n'));
 assert.equal(await query(db,'select count(*) from supabase_migrations.schema_migrations'),'0');
 // Actual ledger includes three nullable metadata columns omitted from 3B's
 // reduced fixture. The guard now hashes the whole row, without needing writes.
 assert.ok(snapshotExpression.includes('md5(to_jsonb(m)::text)'));
 assert.equal(await query(db,"with baseline as (select 'v'::text version,array['sql']::text[] statements,'name'::text name,null::text created_by,null::text idempotency_key,null::text[] rollback), drift as (select version,statements,name,'changed'::text created_by,idempotency_key,rollback from baseline) select (select md5(to_jsonb(b)::text) from baseline b)<>(select md5(to_jsonb(d)::text) from drift d)"),'t');
 const snapshotArtifact=await readFile(new URL('../../../docs/phase-7b3b-catalog-snapshot-readonly.sql',import.meta.url),'utf8');
 assert.ok(snapshotArtifact.endsWith(snapshotSQL+'\n')); // Not executed.
});
async function buffacoinFixture(){
 const db=await pristine();
 await query(db,`alter table public.destinations add column state_id integer;
alter table public.routes alter column id set default gen_random_uuid();
alter table public.routes add column title text,add column city text,add column created_by uuid,add column is_public boolean,add column is_token_route boolean;
alter table public.crawls alter column crawl_id set default gen_random_uuid();
alter table public.crawls add column user_id uuid,add column status text,add column crawl_type text,add column is_solo boolean,add column created_at timestamptz default now();
alter table public.destination_ratings add column sauce smallint,add column crispiness smallint,add column meat smallint,add column overall smallint,add column would_order_again boolean,add column tag_id bigint,add column wings_eaten smallint,add column sauce_style smallint,add column flavor_vibe smallint[],add column spice_level smallint,add column buffacoin_operation_id uuid;
create table public.states(state_id integer primary key,state_code text);
create table public.buffacoin_wallets(user_id uuid primary key,balance integer,updated_at timestamptz);
create table public.buffacoin_ledger(id uuid primary key,user_id uuid,delta integer,reason text,crawl_id uuid,state_id integer,destination_id uuid);
create table public.buffacoin_rating_operations(operation_id uuid primary key,user_id uuid,destination_id uuid,crawl_id uuid,rating_id uuid,debit_ledger_id uuid,coin_cost integer,new_balance integer);
insert into public.states values(1,'NY'); update public.destinations set state_id=1;
insert into public.buffacoin_wallets values('${ids.user}',10,now());`);
 const source=await readFile(new URL('../../supabase/migrations/20260729153000_serrano_trust_repair.sql',import.meta.url),'utf8');
 const match=source.match(/create or replace function public\.submit_buffacoin_rating_v1\([\s\S]*?as \$\$([\s\S]*?)\$\$;/);
 assert.ok(match);assert.equal(createHash('md5').update(match[1]).digest('hex'),'bc00b094b62a76dd269dc3aca0a72213');
 await query(db,match[0]);await applyWithGate(db);return db;
}
const operation='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const rpc=`select row_to_json(r) from public.submit_buffacoin_rating_v1('${operation}','${ids.destination}','NY',3,'{"sauce":4,"crispiness":4,"meat":4,"overall":4}') r`;
test('matched Buffacoin body preserves debit/rating/Want atomic rollback and idempotent retry with surrogate reward dependencies',async()=>{
 const db=await buffacoinFixture();
 await query(db,`${asUser()} insert into public.user_want_to_try(user_id,destination_id) values('${ids.user}','${ids.destination}')`);
 await assert.rejects(query(db,`${asUser()} set buffago.fixture_after_fail='on'; ${rpc}`),/fixture_reward_failure/);
 assert.equal(await query(db,'select balance from public.buffacoin_wallets'),'10');
 assert.equal(await query(db,'select count(*) from public.buffacoin_ledger'),'0');
 assert.equal(await query(db,'select count(*) from public.buffacoin_rating_operations'),'0');
 assert.equal(await query(db,'select count(*) from public.user_want_to_try'),'1');
 const first=await query(db,asUser()+rpc),replay=await query(db,asUser()+rpc);assert.equal(first,replay);
 assert.equal(await query(db,'select balance from public.buffacoin_wallets'),'7');
 assert.equal(await query(db,'select count(*) from public.buffacoin_ledger'),'1');
 assert.equal(await query(db,'select count(*) from public.destination_ratings'),'1');
 assert.equal(await query(db,'select count(*) from public.user_want_to_try'),'0');
});
test('matched Buffacoin operation advisory lock serializes actual repeated RPCs without double debit',async()=>{
 const db=await buffacoinFixture(),holder=session(db,'phase7b3c-buffacoin-holder');
 try{
  const first=await holder.execute('begin; '+asUser()+rpc);
  const waiting=query(db,asUser()+rpc,'phase7b3c-buffacoin-waiter');
  const blocked=await observeBlocked(db,'phase7b3c-buffacoin-waiter');assert.ok(blocked.blockers.length);
  console.log(JSON.stringify({test:'matched-buffacoin-operation-lock',blockedPid:blocked.pid,blockers:blocked.blockers,wait:blocked.wait}));
  await holder.execute('commit');assert.equal(await waiting,first);
  assert.equal(await query(db,'select balance from public.buffacoin_wallets'),'7');
  assert.equal(await query(db,'select count(*) from public.buffacoin_ledger'),'1');
 }finally{await holder.close();}
});
