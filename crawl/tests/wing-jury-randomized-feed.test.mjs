import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { boundaryFixture, request } from './helpers/wingJuryEdgeHarness.mjs';

const foundation = await readFile(new URL('../supabase/local/phase-2b/20261009_local_phase2b_foundation.sql', import.meta.url), 'utf8');
const proposal = await readFile(new URL('../supabase/proposals/android-qa-round-3-randomized-jury-feed.sql', import.meta.url), 'utf8');
const seed = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const snapshot = new Date(Date.now()-1000).toISOString();
const id = (number) => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const owner = id(900001); const viewer = id(900002); const otherViewer = id(900003);
const query = 'select public.wing_jury_randomized_feed_candidates($1,$2,$3,$4,$5,$6,$7,$8) as payload';

function argumentsFor({latitude=null,longitude=null,user=null,judged=[],after=null,limit=24,sessionSeed=seed}={}) {
  return [latitude,longitude,user,judged,sessionSeed,snapshot,after?.page_number??0,limit];
}
async function fixture(destinations, photos) {
  const db = new PGlite();
  await db.exec(`
    create schema auth; create schema storage;
    create role anon nologin; create role authenticated nologin;
    create role service_role nologin bypassrls;
    alter default privileges grant execute on functions to anon, authenticated, service_role;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb) $$;
    create table auth.users(id uuid primary key);
    create table public.destinations(id uuid primary key, lat double precision, lng double precision);
    create table public.destination_ratings(id uuid primary key,user_id uuid,destination_id uuid,
      created_at timestamptz default now(),weight_score numeric);
    create table public.wing_media_submissions(id uuid primary key,user_id uuid,media_type text,status text,
      destination_id uuid,owner_deleted_at timestamptz,withdrawn_at timestamptz,
      created_at timestamptz not null,consent_version text,consented_at timestamptz,
      attribution_preference text,processed_storage_path text);
    create table storage.objects(bucket_id text,name text,archived_at timestamptz,is_delete_marker boolean default false,
      primary key(bucket_id,name));
    insert into auth.users values ('${owner}'),('${viewer}'),('${otherViewer}');
  `);
  await db.query(`insert into public.destinations select * from jsonb_to_recordset($1::jsonb)
    as entry(id uuid,lat double precision,lng double precision)`, [JSON.stringify(destinations)]);
  await db.query(`insert into public.wing_media_submissions
    select entry.id,$2::uuid,'photo','approved',entry.destination_id,null,null,entry.created_at,'v1',
      '2020-01-01'::timestamptz,'anonymous','processed/'||entry.id::text||'/primary'
    from jsonb_to_recordset($1::jsonb) as entry(id uuid,destination_id uuid,created_at timestamptz)`,
  [JSON.stringify(photos.map((photo) => ({ created_at: '2020-01-01T00:00:00.000001Z', ...photo }))), owner]);
  await db.exec(`insert into storage.objects(bucket_id,name)
    select 'wing-submissions',processed_storage_path from public.wing_media_submissions;`);
  await db.exec(foundation);
  assert.equal((await db.query("select to_regclass('public.api_rate_limits') as table_name")).rows[0].table_name,null);
  await db.exec(proposal);
  assert.equal((await db.query("select to_regclass('public.api_rate_limits') as table_name")).rows[0].table_name,null);
  const rateSecurity=(await db.query("select relrowsecurity from pg_class where oid='private.wing_jury_session_creation_log'::regclass")).rows[0];
  assert.equal(rateSecurity.relrowsecurity,true);
  async function candidates(options) { return (await db.query(query, argumentsFor(options))).rows[0].payload.candidates; }
  async function handler(options = {}) {
    const f = await boundaryFixture({ ...options, adminOverrides: {
      // Match PostgREST JSON transport rather than leaking PGlite Date objects
      // into the handler; created_at is already lossless SQL text.
      sessionSnapshotQuery: async (args) => {
        try {return {data:(await db.query('select public.wing_jury_randomized_session_snapshot($1,$2,$3,$4) as snapshot',[args.p_session_id,args.p_user_id,args.p_latitude,args.p_longitude])).rows[0].snapshot,error:null};}
        catch(error){return {data:null,error:{message:error.message}};}
      },
      feedQuery: async (args) => {
        try { return { error: null, data: (await db.query(query,
          [args.p_latitude,args.p_longitude,args.p_user_id,args.p_judged_submission_ids,args.p_session_id,args.p_snapshot_at,args.p_after_page,args.p_limit])).rows[0].payload }; }
        catch(error) { return { error: { message: error.message }, data: null }; }
      },
      publicEligibility: async (submission) => (await db.query('select public.is_public_wing_jury_photo($1) as public', [submission])).rows[0].public,
      ...options.adminOverrides,
    } });
    return { ...f, serve: await f.handler('wing-jury-feed') };
  }
  return { db, candidates, handler };
}



async function traverse(f,opts={}) { const rows=[];let after=opts.after||null;do{const page=await f.candidates({...opts,after,limit:2});rows.push(...page);if(page.length<2)break;after=page.at(-1);}while(after);return rows; }
test('persisted seeded sessions progressively expand tiers, interleave uneven restaurants, replay pages and preserve every photo',async()=>{
 const ds=[0.01,0.1,0.2,0.6,1,2,5,null].map((lng,i)=>({id:id(100+i),lat:lng==null?null:0,lng}));
 const ps=ds.flatMap((d,i)=>Array.from({length:i===0?8:3},(_,j)=>({id:id(1+i*20+j),destination_id:d.id})));
 const f=await fixture(ds,ps);try{
  const ordered=await traverse(f,{latitude:0,longitude:0});assert.equal(ordered.length,ps.length);assert.equal(new Set(ordered.map(p=>p.id)).size,ps.length);
  assert.equal(new Set(ordered.slice(0,2).map(p=>p.destination_id)).size,2);
  const tiers=(await f.db.query('select tier from private.wing_jury_feed_manifest where session_id=$1 order by tier',[seed])).rows;assert.deepEqual([...new Set(tiers.map(r=>r.tier))],[0,1,2,3,4]);
  assert.deepEqual((await f.candidates({latitude:0,longitude:0,limit:2})).map(p=>p.id),ordered.slice(0,2).map(p=>p.id));
  const alternate=await traverse(f,{latitude:0,longitude:0,sessionSeed:id(900004)});assert.notDeepEqual(ordered.map(p=>p.id),alternate.map(p=>p.id));
  const {serve,admin}=await f.handler();let cursor=null;const seen=[];do{
   const response=await serve(request({feed_mode:'randomized_v2',latitude:0,longitude:0,limit:2,cursor},null));assert.equal(response.status,200);const b=await response.json();seen.push(...b.photos.map(p=>p.submission_id));cursor=b.next_cursor;
   b.photos.forEach(p=>assert.deepEqual(Object.keys(p).sort(),['expires_at','media_type','signed_url','submission_id']));
  }while(cursor);assert.equal(seen.length,ps.length);assert.equal(new Set(seen).size,ps.length);assert.ok(admin.signedPaths.every(c=>c.paths.length<=12));assert.equal(admin.calls.some(c=>c.table),false);
 }finally{await f.db.close();}
});
test('eligibility gaps and votes do not cause clumps when another restaurant remains, and snapshots exclude new uploads',async()=>{
 const ds=[{id:id(101),lat:0,lng:0},{id:id(102),lat:0,lng:0.1}];const ps=Array.from({length:16},(_,i)=>({id:id(i+1),destination_id:ds[i%2].id}));const f=await fixture(ds,ps);try{
  const first=await f.candidates({limit:1});const last=first[0];
  const remove=ps.filter(p=>p.destination_id!==last.destination_id).slice(0,5).map(p=>p.id);
  await f.db.query('update public.wing_media_submissions set withdrawn_at=now() where id=any($1::uuid[])',[remove]);
  const next=await f.candidates({after:last,limit:1});assert.notEqual(next[0].destination_id,last.destination_id);
  const remaining=await traverse(f,{after:next[0]});
  const manifest=(await f.db.query('select count(*)::integer as n from private.wing_jury_feed_manifest where session_id=$1',[seed])).rows[0];assert.equal(manifest.n,16);
  const all=(await f.db.query('select submission_ids from private.wing_jury_feed_pages where session_id=$1 order by page_number',[seed])).rows.flatMap(r=>r.submission_ids);assert.equal(new Set(all).size,all.length);
 }finally{await f.db.close();}
});
test('no-location manifest uses randomized All and private roles cannot query state or invoke allocation',async()=>{
 const f=await fixture([{id:id(101),lat:0,lng:0}],[{id:id(1),destination_id:id(101)},{id:id(2),destination_id:id(101)}]);try{
  for(const role of ['anon','authenticated']){await f.db.exec('set role '+role);await assert.rejects(f.candidates(),/permission denied/);await assert.rejects(f.db.query('select * from private.wing_jury_feed_manifest'),/permission denied/);await assert.rejects(f.db.query('select * from private.wing_jury_session_creation_log'),/permission denied/);await f.db.exec('reset role');}
  await f.db.exec('set role service_role');assert.equal((await f.candidates()).length,2);await assert.rejects(f.candidates({limit:25}),/invalid_feed_limit/);await f.db.exec('reset role');
  assert.equal((await f.db.query('select tier from private.wing_jury_feed_manifest')).rows[0].tier,4);
  const {serve}=await f.handler();const b=await(await serve(request({feed_mode:'randomized_v2',limit:1},null))).json();assert.equal(b.location_fallback,true);assert.ok(b.next_cursor);
  assert.equal((await serve(request({cursor:b.next_cursor},null))).status,400);
 }finally{await f.db.close();}
});



test('transient signing failures replay the same manifest page without consuming photos and cursor expiry is controlled',async()=>{
 const ds=[{id:id(101),lat:0,lng:0},{id:id(102),lat:0,lng:0.1}];const ps=Array.from({length:6},(_,i)=>({id:id(i+1),destination_id:ds[i%2].id}));const f=await fixture(ds,ps);try{
  const failing=await f.handler({adminOverrides:{storageError:true}});
  const body={feed_mode:'randomized_v2',feed_session_id:seed,feed_snapshot_at:snapshot,limit:2};
  assert.equal((await failing.serve(request(body,null))).status,503);
  const allocated=(await f.db.query('select submission_ids from private.wing_jury_feed_pages where session_id=$1 and page_number=1',[seed])).rows[0].submission_ids;
  const healthy=await f.handler();const recovered=await(await healthy.serve(request(body,null))).json();
  assert.deepEqual(recovered.photos.map(p=>p.submission_id),allocated);
  const stored=(await f.db.query("select to_char(snapshot_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') as snapshot from private.wing_jury_feed_sessions where id=$1",[seed])).rows[0].snapshot;
  assert.equal(healthy.admin.calls.find(c=>c.rpc==='wing_jury_randomized_feed_candidates').args.p_snapshot_at,stored);
  assert.equal((await f.db.query('select count(*)::integer as n from private.wing_jury_feed_pages where session_id=$1',[seed])).rows[0].n,1);
  let cursor=recovered.next_cursor;const seen=[...allocated];do{const b=await(await healthy.serve(request({feed_mode:'randomized_v2',cursor,limit:2},null))).json();seen.push(...b.photos.map(p=>p.submission_id));cursor=b.next_cursor;}while(cursor);
  assert.equal(seen.length,6);assert.equal(new Set(seen).size,6);
  await f.db.query("update private.wing_jury_feed_sessions set expires_at=now()-interval '1 second' where id=$1",[seed]);
  assert.equal((await healthy.serve(request({feed_mode:'randomized_v2',cursor:recovered.next_cursor,limit:2},null))).status,409);
 }finally{await f.db.close();}
});

test('phone clock skew and changed retry timestamps cannot change server snapshot; active sessions renew beyond 15 minutes',async()=>{
 const f=await fixture([{id:id(101),lat:0,lng:0}],[{id:id(1),destination_id:id(101)},{id:id(2),destination_id:id(101)},{id:id(3),destination_id:id(101)}]);try{
  const {serve}=await f.handler();const future='2099-01-01T00:00:00Z';
  const requestBody={feed_mode:'randomized_v2',feed_session_id:seed,feed_snapshot_at:future,limit:1};
  const first=await(await serve(request(requestBody,null))).json();assert.equal(first.ok,true);
  const state=(await f.db.query('select snapshot_at,expires_at from private.wing_jury_feed_sessions where id=$1',[seed])).rows[0];
  assert.ok(new Date(state.snapshot_at).getTime()<=Date.now());assert.ok(new Date(state.expires_at).getTime()>Date.now()+23*60*60*1000);
  const retry=await(await serve(request({...requestBody,feed_snapshot_at:'2000-01-01'},null))).json();assert.deepEqual(retry.photos.map(p=>p.submission_id),first.photos.map(p=>p.submission_id));
  const preserved=(await f.db.query('select snapshot_at from private.wing_jury_feed_sessions where id=$1',[seed])).rows[0].snapshot_at;assert.deepEqual(preserved,state.snapshot_at);
  await f.db.query("update private.wing_jury_feed_sessions set expires_at=now()+interval '1 minute' where id=$1",[seed]);
  const next=await(await serve(request({feed_mode:'randomized_v2',cursor:first.next_cursor,limit:1},null))).json();assert.equal(next.ok,true);
  const renewed=(await f.db.query('select expires_at from private.wing_jury_feed_sessions where id=$1',[seed])).rows[0].expires_at;assert.ok(new Date(renewed).getTime()>Date.now()+23*60*60*1000);
 }finally{await f.db.close();}
});
test('expiry survives bounded cleanup and continuation snapshot is immutable',async()=>{
 const f=await fixture([{id:id(101),lat:0,lng:0}],[{id:id(1),destination_id:id(101)},{id:id(2),destination_id:id(101)}]);try{
  const first=await f.candidates({limit:1});const args=argumentsFor({after:first[0]});args[5]=new Date(Date.parse(snapshot)-1000).toISOString();
  await assert.rejects(f.db.query(query,args),/invalid_feed_snapshot/);
  args[6]=0;await assert.rejects(f.db.query(query,args),/invalid_feed_snapshot/);
  await f.db.exec('delete from private.wing_jury_feed_sessions');
  await f.db.exec(`insert into private.wing_jury_feed_sessions(id,snapshot_at,expires_at) select gen_random_uuid(),now()-interval '1 hour',now()-interval '1 minute' from generate_series(1,45)`);
  await f.db.query("insert into private.wing_jury_feed_sessions(id,snapshot_at,expires_at) values($1,$2,now()-interval '1 minute')",[seed,snapshot]);
  await assert.rejects(f.candidates(),/expired_feed_session/);
  await assert.rejects(f.candidates({after:first[0]}),/expired_feed_session/);
  const stale=argumentsFor({sessionSeed:id(900010)});stale[5]=new Date(Date.now()-16*60*1000).toISOString();
  await assert.rejects(f.db.query(query,stale),/expired_feed_session/);
 }finally{await f.db.close();}
});
test('randomized feed ignores forged identity and uses verified Auth user',async()=>{
 for(const invalid of [false,true]){
  const f=await boundaryFixture({user:{id:viewer},adminOverrides:invalid?{authError:{message:'invalid token'}}:{}});
  await (await f.handler('wing-jury-feed'))(request({feed_mode:'randomized_v2',user_id:otherViewer,p_user_id:otherViewer}));
  assert.equal(f.admin.calls.find(c=>c.rpc==='wing_jury_randomized_feed_candidates').args.p_user_id,invalid?null:viewer);
  assert.equal(f.admin.calls.find(c=>c.authToken).authToken,'verified-user-token');
 }
});
test('guest and authenticated creation budgets are atomic, retries remain available and housekeeping commits on denial',async()=>{
 const f=await fixture([{id:id(101),lat:0,lng:0}],[{id:id(1),destination_id:id(101)},{id:id(2),destination_id:id(101)}]);try{
  const payload=async(options={})=>(await f.db.query(query,argumentsFor(options))).rows[0].payload;
  const first=await payload({limit:1});
  await f.db.exec(`insert into private.wing_jury_session_creation_log(created_at) select now() from generate_series(1,29)`);
  assert.equal((await payload({sessionSeed:id(910001)})).error,'feed_rate_limited');
  assert.equal((await payload({limit:1})).candidates[0].id,first.candidates[0].id);
  assert.equal((await payload({user:viewer,sessionSeed:id(910002)})).candidates.length,2);
  await f.db.query(`insert into private.wing_jury_session_creation_log(principal,created_at) select $1::uuid,now() from generate_series(1,9)`,[viewer]);
  assert.equal((await payload({user:viewer,sessionSeed:id(910003)})).error,'feed_rate_limited');
  assert.equal((await payload({user:otherViewer,sessionSeed:id(910004)})).candidates.length,2);
  assert.equal((await f.db.query('select count(*)::int n from private.wing_jury_feed_sessions')).rows[0].n,3);
  await f.db.exec(`insert into private.wing_jury_session_creation_log(created_at) select now()-interval '2 hours' from generate_series(1,205);
    insert into private.wing_jury_feed_sessions(id,snapshot_at,expires_at) select gen_random_uuid(),now()-interval '2 days',now()-interval '1 day' from generate_series(1,25)`);
  assert.equal((await payload({sessionSeed:id(910005)})).error,'feed_rate_limited');
  assert.equal((await f.db.query("select count(*)::int n from private.wing_jury_session_creation_log where created_at<now()-interval '1 hour'")).rows[0].n,5);
  assert.equal((await f.db.query('select count(*)::int n from private.wing_jury_feed_sessions where expires_at<now()')).rows[0].n,5);
  const {serve}=await f.handler();
  for(const ip of ['1.2.3.4','5.6.7.8']){
    const req=request({feed_mode:'randomized_v2',feed_session_id:id(910006),user_id:viewer},null);
    for(const header of ['x-forwarded-for','cf-connecting-ip','x-real-ip'])req.headers.set(header,ip);
    const response=await serve(req);assert.equal(response.status,429);const body=await response.json();assert.equal(body.error,'feed_rate_limited');assert.equal(body.retryable,true);assert.equal(body.retry_after_seconds,60);assert.equal(response.headers.get('retry-after'),'60');
  }
  const anonymous=await f.handler({user:{id:viewer,is_anonymous:true}});
  assert.equal((await anonymous.serve(request({feed_mode:'randomized_v2',feed_session_id:id(910008)}))).status,429);
  const invalid=await f.handler({user:{id:viewer},adminOverrides:{authError:{message:'invalid token'}}});
  assert.equal((await invalid.serve(request({feed_mode:'randomized_v2',feed_session_id:id(910009)}))).status,429);
  const authenticated=await f.handler({user:{id:viewer}});
  assert.equal((await authenticated.serve(request({feed_mode:'randomized_v2',feed_session_id:id(910007)}))).status,429);
 }finally{await f.db.close();}
});
test('global budget and active session capacity reject before materializing manifests',async()=>{
 const f=await fixture([{id:id(101),lat:0,lng:0}],[{id:id(1),destination_id:id(101)}]);try{
  await f.db.exec(`insert into private.wing_jury_session_creation_log(principal,created_at) select gen_random_uuid(),now() from generate_series(1,120)`);
  assert.equal((await f.db.query(query,argumentsFor({user:viewer}))).rows[0].payload.error,'feed_rate_limited');
  assert.equal((await f.db.query('select count(*)::int n from private.wing_jury_feed_manifest')).rows[0].n,0);
  await f.db.exec(`delete from private.wing_jury_session_creation_log;insert into private.wing_jury_feed_sessions(id,snapshot_at,expires_at) select gen_random_uuid(),now(),now()+interval '1 hour' from generate_series(1,1000)`);
  assert.equal((await f.db.query(query,argumentsFor())).rows[0].payload.error,'feed_rate_limited');
 }finally{await f.db.close();}
});
test('oversized catalog refuses snapshot without retaining a truncated manifest',async()=>{
 const f=await fixture([{id:id(101),lat:0,lng:0}],Array.from({length:10001},(_,i)=>({id:id(i+1),destination_id:id(101)})));try{
  assert.equal((await f.db.query(query,argumentsFor())).rows[0].payload.error,'feed_capacity_exceeded');
  for(const table of ['wing_jury_feed_manifest','wing_jury_feed_sessions'])assert.equal((await f.db.query('select count(*)::int n from private.'+table)).rows[0].n,0);
 }finally{await f.db.close();}
});
test('hourly budgets, absolute lifetime and session lookup permissions remain enforced',async()=>{
 const f=await fixture([{id:id(101),lat:0,lng:0}],[{id:id(1),destination_id:id(101)}]);try{
  await f.db.exec(`insert into private.wing_jury_session_creation_log(created_at) select now()-interval '2 minutes' from generate_series(1,300)`);
  assert.equal((await f.db.query(query,argumentsFor())).rows[0].payload.error,'feed_rate_limited');
  await f.db.query(`insert into private.wing_jury_session_creation_log(principal,created_at) select $1::uuid,now()-interval '2 minutes' from generate_series(1,60)`,[viewer]);
  assert.equal((await f.db.query(query,argumentsFor({user:viewer}))).rows[0].payload.error,'feed_rate_limited');
  await f.db.exec('delete from private.wing_jury_session_creation_log');
  await f.candidates();
  await f.db.query("update private.wing_jury_feed_sessions set snapshot_at=$1,expires_at=now()+interval '1 hour' where id=$2",[new Date(Date.now()-23*60*60*1000).toISOString(),seed]);
  const stored=(await f.db.query('select public.wing_jury_randomized_session_snapshot($1,null,null,null) as snapshot',[seed])).rows[0].snapshot;
  const args=argumentsFor();args[5]=stored;await f.db.query(query,args);
  assert.equal((await f.db.query("select expires_at<=snapshot_at+interval '24 hours' as bounded from private.wing_jury_feed_sessions where id=$1",[seed])).rows[0].bounded,true);
  for(const role of ['anon','authenticated']){
    await f.db.exec('set role '+role);
    await assert.rejects(f.db.query('select public.wing_jury_randomized_session_snapshot($1,null,null,null)',[seed]),/permission denied/);
    await f.db.exec('reset role');
  }
 }finally{await f.db.close();}
});
