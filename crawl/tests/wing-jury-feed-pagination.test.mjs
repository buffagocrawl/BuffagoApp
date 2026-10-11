import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { boundaryFixture, request } from './helpers/wingJuryEdgeHarness.mjs';

const foundation = await readFile(new URL('../supabase/local/phase-2b/20261009_local_phase2b_foundation.sql', import.meta.url), 'utf8');
const id = (number) => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const owner = id(900001); const viewer = id(900002); const otherViewer = id(900003);
const query = 'select * from public.wing_jury_feed_candidates($1,$2,$3,$4,$5,$6,$7,$8,$9)';

function argumentsFor({ latitude = null, longitude = null, user = null, judged = [], after = null, limit = 120 } = {}) {
  return [latitude, longitude, user, judged, after?.distance ?? null, after?.destination_id ?? null,
    after?.created_at ?? null, after?.id ?? null, limit];
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
  async function candidates(options) { return (await db.query(query, argumentsFor(options))).rows; }
  async function handler(options = {}) {
    const f = await boundaryFixture({ ...options, adminOverrides: {
      // Match PostgREST JSON transport rather than leaking PGlite Date objects
      // into the handler; created_at is already lossless SQL text.
      feedQuery: async (args) => ({ error: null, data: JSON.parse(JSON.stringify((await db.query(query,
        [args.p_latitude,args.p_longitude,args.p_user_id,args.p_judged_submission_ids,args.p_after_distance,
          args.p_after_destination_id,args.p_after_created_at,args.p_after_submission_id,args.p_limit])).rows)) }),
      publicEligibility: async (submission) => (await db.query('select public.is_public_wing_jury_photo($1) as public', [submission])).rows[0].public,
      ...options.adminOverrides,
    } });
    return { ...f, serve: await f.handler('wing-jury-feed') };
  }
  return { db, candidates, handler };
}

test('actual SQL and actual Edge handler traverse nearest then distant full catalog beyond both old cutoffs without repeats', async () => {
  const destinations = Array.from({ length: 620 }, (_, index) => ({ id: id(10620 - index), lat: 0, lng: (index + 1) / 100 }));
  destinations.push({ id: id(11000), lat: 0, lng: 0 }, { id: id(11001), lat: 0, lng: 100 }, { id: id(11002), lat: null, lng: null });
  const photos = destinations.slice(0, 620).map((destination, index) => ({ id: id(index + 1), destination_id: destination.id }));
  photos.push({ id: id(7000), destination_id: destinations[0].id, created_at: '2020-01-01T00:00:00.000002Z' },
    { id: id(7001), destination_id: destinations[0].id, created_at: '2020-01-01T00:00:00.000002Z' },
    { id: id(7002), destination_id: id(11001) }, { id: id(7003), destination_id: id(11002) });
  const f = await fixture(destinations, photos);
  try {
    const expected = [id(1),id(7000),id(7001),...Array.from({ length: 619 }, (_, index) => id(index + 2)),id(7002),id(7003)];
    const ordered = []; let after = null;
    do {
      const page = await f.candidates({ latitude: 0, longitude: 0, after });
      ordered.push(...page.map((row) => row.id)); after = page.at(-1);
      if (page.length < 120) break;
    } while (after);
    assert.deepEqual(ordered, expected);
    const { serve, admin } = await f.handler();
    let cursor = null; const seen = [];
    do {
      const response = await serve(request({ latitude: 0, longitude: 0, limit: 24, cursor }, null));
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.location_fallback, false);
      assert.ok(body.photos.length <= 24);
      body.photos.forEach((photo) => assert.deepEqual(Object.keys(photo).sort(), ['expires_at','media_type','signed_url','submission_id']));
      seen.push(...body.photos.map((photo) => photo.submission_id));
      cursor = body.next_cursor;
      assert.equal(Boolean(cursor), body.has_more);
    } while (cursor);
    assert.deepEqual(seen, expected);
    assert.equal(new Set(seen).size, 624);
    assert.ok(admin.signedPaths.every((call) => call.paths.length <= 12));
    assert.equal(admin.calls.some((call) => call.table), false, 'feed uses bounded RPC results, no client-side catalog reads');
  } finally { await f.db.close(); }
});

test('global distances cover antimeridian, poles and antipodes; location denied includes unknown coordinates deterministically', async () => {
  const destinations = [{ id:id(101),lat:0,lng:-179.9 },{ id:id(102),lat:0,lng:170 },
    { id:id(103),lat:90,lng:-170 },{ id:id(104),lat:-90,lng:10 },{ id:id(105),lat:null,lng:null }];
  const photos = destinations.map((destination,index) => ({ id:id(index+1),destination_id:destination.id }));
  const f = await fixture(destinations,photos);
  try {
    const across = await f.candidates({ latitude:0,longitude:179.9 });
    assert.equal(across[0].id,id(1));
    assert.ok(Math.abs(across[0].distance - 22238.9853289) < 0.001);
    assert.equal(across.at(-1).distance,null);
    const polar = await f.candidates({ latitude:90,longitude:10 });
    assert.equal(polar[0].id,id(3));
    assert.ok(polar.every((row) => row.distance === null || Number.isFinite(row.distance)));
    assert.ok(Math.abs(polar.find((row) => row.id === id(4)).distance - Math.PI*6371000) < 0.001);
    const { serve } = await f.handler();
    const denied = await (await serve(request({ latitude:null,longitude:null },null))).json();
    assert.equal(denied.location_fallback,true);
    assert.deepEqual(denied.photos.map((row) => row.submission_id),photos.map((row) => row.id));
  } finally { await f.db.close(); }
});

test('full-catalog vote and guest exclusions run before LIMIT and missing assets/consent never crowd out usable photos', async () => {
  const destinations = [{ id:id(101),lat:0,lng:0 }];
  const photos = Array.from({ length:130 },(_,index) => ({ id:id(index+1),destination_id:id(101) }));
  const f = await fixture(destinations,photos);
  try {
    await f.db.exec(`select set_config('request.jwt.claim.sub','${viewer}',false);
      select set_config('request.jwt.claims','{"is_anonymous":false}',false);
      insert into public.wing_jury_votes(submission_id,user_id,vote)
      select id,'${viewer}',0 from public.wing_media_submissions where id <= '${id(125)}';`);
    assert.deepEqual((await f.candidates({ user:viewer })).map((row) => row.id), photos.slice(125).map((row) => row.id));
    assert.equal((await f.candidates({ user:otherViewer })).length,120);
    assert.deepEqual((await f.candidates({ judged:photos.slice(0,125).map((row) => row.id) })).map((row) => row.id), photos.slice(125).map((row) => row.id));
    await f.db.query('delete from storage.objects where name=$1',[`processed/${id(126)}/primary`]);
    await f.db.query("update public.wing_media_submissions set consent_version='' where id=$1",[id(127)]);
    assert.deepEqual((await f.candidates({ user:viewer })).map((row) => row.id),[id(128),id(129),id(130)]);
    const { serve,admin } = await f.handler({ user:{ id:viewer } });
    const body = await (await serve(request({ judged_submission_ids:[id(128)] }))).json();
    assert.deepEqual(body.photos.map((row) => row.submission_id),[id(128),id(129),id(130)],'authenticated excludes own immutable votes, not client-supplied IDs');
    assert.equal(admin.calls.find((call) => call.rpc==='wing_jury_feed_candidates').args.p_user_id,viewer);
  } finally { await f.db.close(); }
});

test('work cap returns an empty continuation and later requests reach usable catalog rows; consumed cursors do not skip signed rows', async () => {
  const destinations = [{ id:id(101),lat:0,lng:0 }];
  const photos = Array.from({ length:1203 },(_,index) => ({ id:id(index+1),destination_id:id(101) }));
  const f = await fixture(destinations,photos);
  try {
    const { serve,admin } = await f.handler({ adminOverrides:{ missingSignedPaths:photos.slice(0,1200).map((photo)=>`processed/${photo.id}/primary`) } });
    const first = await (await serve(request({ limit:1 },null))).json();
    assert.deepEqual(first.photos,[]);
    assert.equal(first.has_more,true); assert.ok(first.next_cursor);
    assert.equal(admin.calls.filter((call) => call.rpc==='wing_jury_feed_candidates').length,10);
    assert.equal(admin.signedPaths.length,100);
    const second = await (await serve(request({ limit:1,cursor:first.next_cursor },null))).json();
    assert.equal(second.photos[0].submission_id,id(1201));
    assert.equal(second.has_more,true);
    const third = await (await serve(request({ limit:2,cursor:second.next_cursor },null))).json();
    assert.deepEqual(third.photos.map((row) => row.submission_id),[id(1202),id(1203)]);
    assert.equal(third.has_more,false);
  } finally { await f.db.close(); }
});

test('SQL RPC validates inputs and denies all client roles even with broad inherited function defaults', async () => {
  const f = await fixture([{ id:id(101),lat:0,lng:0 }],[{ id:id(1),destination_id:id(101) }]);
  try {
    for (const role of ['anon','authenticated']) {
      await f.db.exec(`set role ${role}`);
      await assert.rejects(f.candidates(), /permission denied for function/);
      await f.db.exec('reset role');
    }
    await f.db.exec('set role service_role');
    assert.equal((await f.candidates()).length,1);
    for (const options of [{limit:0},{limit:121},{latitude:0},{latitude:Infinity,longitude:0},
      {latitude:NaN,longitude:0},{latitude:0,longitude:181},{judged:Array(501).fill(id(1))},{judged:[null]},
      {after:{destination_id:id(101)}},{after:{distance:1}},{after:{distance:Infinity,destination_id:id(101),created_at:'2020-01-01',id:id(1)}}])
      await assert.rejects(f.candidates(options), /invalid_feed_/);
    await f.db.exec('reset role');
    const metadata = (await f.db.query("select prosecdef,proconfig from pg_proc where proname='wing_jury_feed_candidates'")).rows[0];
    assert.equal(metadata.prosecdef,true); assert.deepEqual(metadata.proconfig,['search_path=pg_catalog']);
  } finally { await f.db.close(); }
});

test('NULL-coordinate tier continues across pages, includes invalid stored pairs, and rechecks withdrawal/votes after a cursor is issued', async () => {
  const destinations = [{id:id(601),lat:0,lng:0},{id:id(101),lat:0,lng:null},
    {id:id(102),lat:91,lng:0},{id:id(103),lat:null,lng:null}];
  const photos = [{id:id(1),destination_id:id(601)},{id:id(2),destination_id:id(101)},
    {id:id(3),destination_id:id(101)},{id:id(4),destination_id:id(102)},{id:id(5),destination_id:id(103)}];
  const f = await fixture(destinations,photos);
  try {
    assert.deepEqual((await f.candidates()).map((row)=>row.id),[id(2),id(3),id(4),id(5),id(1)]);
    const { serve } = await f.handler({user:{id:viewer}});
    const first = await (await serve(request({latitude:0,longitude:0,limit:1}))).json();
    assert.equal(first.photos[0].submission_id,id(1));
    await f.db.query('update public.wing_media_submissions set withdrawn_at=now() where id=$1',[id(2)]);
    const second = await (await serve(request({latitude:0,longitude:0,limit:1,cursor:first.next_cursor}))).json();
    assert.equal(second.photos[0].submission_id,id(3));
    await f.db.exec(`select set_config('request.jwt.claim.sub','${viewer}',false);
      select set_config('request.jwt.claims','{"is_anonymous":false}',false);`);
    await f.db.query('insert into public.wing_jury_votes(submission_id,user_id,vote) values ($1,$2,0)',[id(4),viewer]);
    const last = await (await serve(request({latitude:0,longitude:0,limit:1,cursor:second.next_cursor}))).json();
    assert.equal(last.photos[0].submission_id,id(5));
    assert.equal(last.has_more,false); assert.equal(last.next_cursor,null);
  } finally { await f.db.close(); }
});
