import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {startDisposablePostgres,query} from '../../scripts/phase7b25-postgres.mjs';

const sql=await readFile(new URL('../../../docs/security-hotfix-delete-account-rpc.sql',import.meta.url),'utf8');
// Production body is not local. Explicit inert ACL fixture, never a parity claim.
const body=' SELECT p_user_id; ';
const fixtureSQL=sql.replace('4f108f4b39ec1d613fd5b1ba6be97c82',createHash('md5').update(body).digest('hex'));
const db='buffago_phase7b25';let ready=false;
async function setup(){if(ready)return;await startDisposablePostgres();await query(db,`
create function public.delete_account_data(p_user_id uuid) returns uuid language sql security definer as $body$${body}$body$;
grant execute on function public.delete_account_data(uuid) to anon, authenticated, service_role;
create table public.fixture_account(id uuid primary key);
create function public.fixture_rating() returns integer language sql as 'select 1';
create function public.fixture_crawl() returns integer language sql as 'select 2';
create function public.fixture_buffacoin() returns integer language sql as 'select 3';
create function public.fixture_photo() returns integer language sql as 'select 4';
grant select on public.fixture_account to anon, authenticated;
`);ready=true;}
const acl=()=>query(db,"select proacl::text from pg_proc where oid='public.delete_account_data(uuid)'::regprocedure");
const unrelated=()=>query(db,"select jsonb_build_object('functions',(select jsonb_agg(to_jsonb(p) order by p.oid) from pg_proc p where p.oid <> 'public.delete_account_data(uuid)'::regprocedure),'tables',(select jsonb_agg(to_jsonb(c) order by c.oid) from pg_class c where c.relnamespace='public'::regnamespace),'defaults',(select jsonb_agg(to_jsonb(d)) from pg_default_acl d))");
test('production fingerprint guard rejects synthetic body before ACL changes',async()=>{await setup();const before=await acl();await assert.rejects(query(db,sql),/source\/owner\/SECURITY DEFINER drift/);assert.equal(await acl(),before);});
test('ACL-only hotfix preserves all non-ACL target metadata and unrelated permissions',async()=>{await setup();const before=await unrelated();const metadata=await query(db,"select (to_jsonb(p)-'proacl')::text from pg_proc p where oid='public.delete_account_data(uuid)'::regprocedure");await query(db,fixtureSQL);assert.equal(await unrelated(),before);assert.equal(await query(db,"select (to_jsonb(p)-'proacl')::text from pg_proc p where oid='public.delete_account_data(uuid)'::regprocedure"),metadata);});
for(const role of ['anon','authenticated'])test(`${role} actual SQL RPC invocation is denied`,async()=>{await setup();await query(db,fixtureSQL);await assert.rejects(query(db,`set role ${role}; select public.delete_account_data('00000000-0000-4000-8000-000000000001');`),/permission denied for function delete_account_data/);});
test('service-role named RPC argument remains permitted; reported v15 ordering contract',async()=>{await setup();await query(db,fixtureSQL);assert.equal(await query(db,"set role service_role; select public.delete_account_data(p_user_id=>'00000000-0000-4000-8000-000000000001');"),'00000000-0000-4000-8000-000000000001');});
test('second application has identical ACL and is safe',async()=>{await setup();await query(db,fixtureSQL);const before=await acl();await query(db,fixtureSQL);assert.equal(await acl(),before);});
test('unexpected inherited grant aborts and rolls back all attempted ACL changes',async()=>{await setup();await query(db,'create role fixture_executor; grant execute on function public.delete_account_data(uuid) to fixture_executor; grant fixture_executor to authenticated; grant execute on function public.delete_account_data(uuid) to anon;');const before=await acl();try{await assert.rejects(query(db,fixtureSQL),/effective EXECUTE boundary failed/);assert.equal(await acl(),before);}finally{await query(db,'revoke fixture_executor from authenticated;');}});
test('NOINHERIT SET ROLE path also fails closed without changing memberships',async()=>{await setup();await query(db,'grant fixture_executor to anon with inherit false, set true;');const before=await acl();try{await assert.rejects(query(db,fixtureSQL),/SET ROLE into an executor/);assert.equal(await acl(),before);}finally{await query(db,'revoke fixture_executor from anon;');}});
