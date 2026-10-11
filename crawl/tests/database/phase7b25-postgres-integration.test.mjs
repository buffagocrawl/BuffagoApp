import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { startDisposablePostgres, fixture, query, scalar, session, observeBlocked, asUser, ids } from '../../scripts/phase7b25-postgres.mjs';

before(startDisposablePostgres);
const rating = (id = ids.rating, user = ids.user, destination = ids.destination, crawl = ids.crawl) =>
  `insert into public.destination_ratings(id,user_id,destination_id,crawl_id,weight_score) values('${id}','${user}','${destination}','${crawl}',4)`;
const favorite = (user = ids.user, destination = ids.destination) =>
  `insert into public.user_destination_favorites(user_id,destination_id) values('${user}','${destination}')`;
const want = (user = ids.user, destination = ids.destination) =>
  `insert into public.user_want_to_try(user_id,destination_id) values('${user}','${destination}')`;
const vote = (user = ids.user, verdict = 1) =>
  `insert into public.wing_jury_votes(submission_id,user_id,vote) values('${ids.photo}','${user}',${verdict})`;
const count = async (db, table) => (await scalar(db, `select count(*)::int n from public.${table}`)).n;
const counts = db => scalar(db, `select like_count,neutral_count,dislike_count from public.wing_jury_photo_vote_counts where submission_id='${ids.photo}'`);

async function race(db, holderSql, waiterSql, expectError = null) {
  const tag = `phase7b25-race-${Math.random().toString(36).slice(2)}`;
  const holder = session(db, `${tag}-holder`);
  let waiter;
  try {
    await holder.execute(`begin; ${holderSql}`);
    waiter = query(db, waiterSql, `${tag}-waiter`);
    // Attach rejection handling before observing: expected errors cannot become
    // unhandled rejections while the monitor uses its third independent backend.
    const result = waiter.then(value => ({ value }), error => ({ error }));
    const observed = await observeBlocked(db, `${tag}-waiter`);
    assert.ok(observed.blockers.length > 0);
    console.log(JSON.stringify({ interleaving: tag, blockedPid: observed.pid, blockerPids: observed.blockers, waitEvent: observed.wait }));
    await holder.execute('commit');
    const completed = await result;
    if (expectError) { assert.ok(completed.error); assert.match(completed.error.message, expectError); }
    else { assert.ifError(completed.error); }
    return completed;
  } finally { await holder.close(); if (waiter) await waiter.catch(() => {}); }
}

test('real PG rating/list eligibility, idempotence, failed-transaction rollback and final-rating cleanup', async () => {
  const db = await fixture();
  await assert.rejects(query(db, `${asUser()} ${favorite()}`), /23514.*favorite_requires_existing_rating/);
  await query(db, `${asUser()} ${want()}; ${want()} on conflict do nothing`);
  assert.equal(await count(db, 'user_want_to_try'), 1);
  await assert.rejects(query(db, `${asUser()} begin; ${rating()}; select 1/0; commit`), /22012/);
  assert.equal(await count(db, 'destination_ratings'), 0);
  assert.equal(await count(db, 'user_want_to_try'), 1);
  await query(db, `${asUser()} ${rating()}; ${favorite()}; ${favorite()} on conflict do nothing`);
  assert.equal(await count(db, 'user_want_to_try'), 0);
  assert.equal(await count(db, 'user_destination_favorites'), 1);
  await assert.rejects(query(db, `${asUser()} ${want()}`), /23514.*want_to_try_requires_unrated_restaurant/);
  await query(db, rating(ids.otherRating, ids.user, ids.destination, ids.otherCrawl));
  await query(db, `delete from public.destination_ratings where id='${ids.rating}'`);
  assert.equal(await count(db, 'user_destination_favorites'), 1);
  await query(db, `delete from public.destination_ratings where id='${ids.otherRating}'`);
  assert.equal(await count(db, 'user_destination_favorites'), 0);
});

test('real roles and JWT claims isolate lists/votes and deny guests, anonymous auth and spoofed owners', async () => {
  const db = await fixture();
  await query(db, `${asUser()} ${want()}; ${vote()}`);
  for (const table of ['user_want_to_try', 'wing_jury_votes']) {
    assert.equal(await query(db, `${asUser(ids.other)} select count(*) from public.${table}`), `${ids.other}\n{"sub":"${ids.other}","is_anonymous":false}\n0`);
    await assert.rejects(query(db, `set role anon; select * from public.${table}`), /42501.*permission denied/);
    assert.match(await query(db, `${asUser(ids.user,true)} select count(*) from public.${table}`), /\n0$/);
  }
  await query(db, `${asUser(ids.other)} delete from public.user_want_to_try where user_id='${ids.user}'`);
  assert.equal(await count(db,'user_want_to_try'), 1);
  await assert.rejects(query(db, `${asUser(ids.other)} ${want(ids.user,ids.otherDestination)}`), /42501.*owner_mismatch/);
  await assert.rejects(query(db, `${asUser(ids.other)} ${vote(ids.user)}`), /42501.*owner_mismatch/);
  await assert.rejects(query(db, `${asUser(ids.user,true)} ${want(ids.user,ids.otherDestination)}`), /42501.*authentication_required/);
  await assert.rejects(query(db, `set role authenticated; ${vote()}`), /42501.*authentication_required/);
});

test('real PG immutable neutral/+1/-1 votes preserve original conflict verdict, exact counts and gallery state', async () => {
  const db = await fixture();
  await query(db, `${asUser()} ${vote(ids.user,0)}`);
  await assert.rejects(query(db, `${asUser()} ${vote(ids.user,1)}`), /23505/);
  await query(db, `${asUser()} ${vote(ids.user,1)} on conflict do nothing`);
  assert.equal((await scalar(db, `select vote from public.wing_jury_votes where user_id='${ids.user}'`)).vote, 0);
  for (const sql of ['update public.wing_jury_votes set vote=1','delete from public.wing_jury_votes','truncate public.wing_jury_votes'])
    await assert.rejects(query(db, `${asUser()} ${sql}`), /42501.*permission denied/);
  for (const sql of ['update public.wing_jury_votes set vote=1','delete from public.wing_jury_votes'])
    await assert.rejects(query(db, sql), /42501.*wing_jury_vote_is_immutable/);
  await query(db, `${asUser(ids.other)} ${vote(ids.other,1)}`);
  await query(db, `${asUser(ids.third)} ${vote(ids.third,-1)}`);
  assert.deepEqual(await counts(db), {like_count:1,neutral_count:1,dislike_count:1});
  assert.equal((await scalar(db, `select like_count from public.wing_media_submissions where id='${ids.photo}'`)).like_count,9);
  assert.equal(await count(db,'wing_media_photo_votes'),1);
  await query(db, `delete from auth.users where id='${ids.user}'`);
  assert.deepEqual(await counts(db), {like_count:1,neutral_count:0,dislike_count:1});
});

test('production-style inherited default privileges normalize exactly and rerunning foundation retains ACLs', async () => {
  const db = await fixture();
  await query(db, await readFile(new URL('../../supabase/local/phase-2b/20261009_local_phase2b_foundation.sql', import.meta.url),'utf8'));
  const allowed = {user_destination_favorites:['SELECT','INSERT','DELETE'],user_want_to_try:['SELECT','INSERT','DELETE'],wing_jury_votes:['SELECT','INSERT'],wing_jury_photo_vote_counts:['SELECT']};
  for (const [table, rights] of Object.entries(allowed)) {
    for (const privilege of ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) {
      assert.deepEqual(await scalar(db, `select has_table_privilege('authenticated','public.${table}','${privilege}') authenticated,has_table_privilege('anon','public.${table}','${privilege}') anon,has_table_privilege('service_role','public.${table}','${privilege}') service`),
        {authenticated:rights.includes(privilege),anon:false,service:privilege==='SELECT'}, `${table}:${privilege}`);
    }
  }
  const functions = JSON.parse(await query(db, `select json_agg(json_build_object('name',p.oid::regprocedure::text,'definer',p.prosecdef,'config',p.proconfig,'anon',has_function_privilege('anon',p.oid,'EXECUTE'),'authenticated',has_function_privilege('authenticated',p.oid,'EXECUTE'),'service',has_function_privilege('service_role',p.oid,'EXECUTE'))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' or (n.nspname='public' and p.proname in ('is_public_wing_jury_photo','wing_jury_restaurant_rating_summary','wing_jury_feed_candidates'))`));
  for (const fn of functions) {
    assert.equal(fn.definer,true,fn.name);
    assert.ok(fn.config.some(value=>value.startsWith('search_path=pg_catalog')),fn.name);
    assert.equal(fn.anon,false,fn.name);
    assert.equal(fn.authenticated,fn.name==='private.is_public_wing_jury_photo(uuid)',fn.name);
    assert.equal(fn.service,!fn.name.startsWith('private.'),fn.name);
  }
  await assert.rejects(query(db, `${asUser()} select private.lock_user_destination('${ids.user}','${ids.destination}')`), /42501/);
  await assert.rejects(query(db, `${asUser()} select public.is_public_wing_jury_photo('${ids.photo}')`), /42501/);
  assert.equal(await query(db, `set role service_role; select public.is_public_wing_jury_photo('${ids.photo}')`),'t');
});

test('rating UPDATE/reassignment cleans both identities and rollback restores both collections', async () => {
  const db=await fixture();
  await query(db,`${rating()}; ${asUser()} ${favorite()}; reset role; ${asUser(ids.other)} ${want(ids.other,ids.otherDestination)}`);
  const reassignment=`update public.destination_ratings set user_id='${ids.other}',destination_id='${ids.otherDestination}' where id='${ids.rating}'`;
  await query(db,`begin; ${reassignment}; rollback`);
  assert.equal(await count(db,'user_destination_favorites'),1); assert.equal(await count(db,'user_want_to_try'),1);
  await query(db,reassignment);
  assert.equal(await count(db,'user_destination_favorites'),0); assert.equal(await count(db,'user_want_to_try'),0);
});

test('separate connections: rating commit rejects blocked Want to Try, save commit is cleared by blocked rating',async()=>{
  const db=await fixture();
  await race(db,rating(),`${asUser()} ${want()}`,/23514.*want_to_try_requires_unrated_restaurant/);
  assert.equal(await count(db,'user_want_to_try'),0);
  await race(db,`${asUser(ids.other)} ${want(ids.other,ids.otherDestination)}`,rating(ids.otherRating,ids.other,ids.otherDestination));
  assert.equal(await count(db,'user_want_to_try'),0); assert.equal(await count(db,'destination_ratings'),2);
});

test('separate connections: final rating deletion rejects blocked Favorite and Favorite commit is subsequently cleaned',async()=>{
  const db=await fixture(); await query(db,rating());
  await race(db,`delete from public.destination_ratings where id='${ids.rating}'`,`${asUser()} ${favorite()}`,/23514.*favorite_requires_existing_rating/);
  assert.equal(await count(db,'user_destination_favorites'),0);
  await query(db,rating());
  await race(db,`${asUser()} ${favorite()}`,`delete from public.destination_ratings where id='${ids.rating}'`);
  assert.equal(await count(db,'user_destination_favorites'),0);
});

test('separate connections: conflicting same-user vote retry preserves first verdict and increments once',async()=>{
  const db=await fixture();
  await race(db,`${asUser()} ${vote(ids.user,0)}`,`${asUser()} ${vote(ids.user,1)} on conflict do nothing`);
  assert.equal(await count(db,'wing_jury_votes'),1); assert.deepEqual(await counts(db),{like_count:0,neutral_count:1,dislike_count:0});
});

test('separate connections: distinct-user votes and account cascade serialize exact count arithmetic',async()=>{
  const db=await fixture();
  await race(db,`${asUser()} ${vote()}`,`${asUser(ids.other)} ${vote(ids.other)}`);
  assert.deepEqual(await counts(db),{like_count:2,neutral_count:0,dislike_count:0});
  await race(db,`delete from auth.users where id='${ids.user}'`,`${asUser(ids.third)} ${vote(ids.third)}`);
  assert.deepEqual(await counts(db),{like_count:2,neutral_count:0,dislike_count:0}); assert.equal(await count(db,'wing_jury_votes'),2);
});

test('separate connections: photo withdrawal before vote rejects; vote first holds metadata until commit',async()=>{
  const db=await fixture();
  await race(db,`update public.wing_media_submissions set withdrawn_at=now() where id='${ids.photo}'`,`${asUser()} ${vote()}`,/42501.*photo_is_not_eligible/);
  assert.equal(await count(db,'wing_jury_votes'),0);
  await query(db,'update public.wing_media_submissions set withdrawn_at=null');
  await race(db,`${asUser()} ${vote()}`,`update public.wing_media_submissions set withdrawn_at=now() where id='${ids.photo}'`);
  assert.equal(await count(db,'wing_jury_votes'),1);
  assert.equal(await query(db,`set role service_role; select public.is_public_wing_jury_photo('${ids.photo}')`),'f');
});

test('separate connections: existing storage archive locks eligibility and denies later votes',async()=>{
  const db=await fixture();
  await race(db,`update storage.objects set archived_at=now(),is_delete_marker=true`,`${asUser()} ${vote()}`,/42501.*photo_is_not_eligible/);
  assert.equal(await count(db,'wing_jury_votes'),0);
});

test('unsupported isolation fails closed before list and rating mutation; complete READ COMMITTED retry succeeds',async()=>{
  const db=await fixture();
  for(const level of ['repeatable read','serializable']) {
    await assert.rejects(query(db,`${asUser()} begin isolation level ${level}; ${want()}; commit`),/25001.*require_read_committed/);
    await assert.rejects(query(db,`begin isolation level ${level}; ${rating()}; commit`),/25001.*require_read_committed/);
  }
  assert.equal(await count(db,'user_want_to_try'),0); assert.equal(await count(db,'destination_ratings'),0);
  await query(db,`${asUser()} begin isolation level read committed; ${want()}; commit`);
  await query(db,`begin isolation level read committed; ${rating()}; commit`);
  assert.equal(await count(db,'user_want_to_try'),0); assert.equal(await count(db,'destination_ratings'),1);
});

test('real multi-statement deadlock aborts one transaction and whole-transaction retry preserves invariants',async()=>{
  const db=await fixture(); const a=session(db,'phase7b25-deadlock-a'),b=session(db,'phase7b25-deadlock-b');
  try {
    await a.execute(`begin; set deadlock_timeout='100ms'; ${asUser()} ${want()}`);
    await b.execute(`begin; set deadlock_timeout='100ms'; ${asUser()} ${want(ids.user,ids.otherDestination)}`);
    const ap=a.execute(rating(ids.rating,ids.user,ids.otherDestination)).then(value=>({value}),error=>({error}));
    await observeBlocked(db,'phase7b25-deadlock-a');
    const bp=b.execute(rating(ids.otherRating)).then(value=>({value}),error=>({error}));
    // Abort selection is nondeterministic; the surviving transaction can finish
    // only after the selected victim rolls back on psql connection exit.
    // The released survivor may emit its marker before the victim's child
    // process close event: inspect both results instead of event delivery order.
    const [ar,br]=await Promise.all([ap,bp]);
    assert.equal(Number(Boolean(ar.error))+Number(Boolean(br.error)),1);
    const victim=ar.error?'a':'b'; assert.match((ar.error??br.error).message,/40P01.*deadlock detected/);
    const survivor=victim==='a'?b:a; await survivor.execute('commit');
    // Retry every statement of the victim at the supported isolation level.
    const retry=victim==='a'?`${want()}; ${rating(ids.rating,ids.user,ids.otherDestination)}`:`${want(ids.user,ids.otherDestination)}; ${rating(ids.otherRating)}`;
    // The surviving rating now makes the retried save invalid: retry observes
    // current state and rejects atomically rather than retaining a stale save.
    await assert.rejects(query(db,`${asUser()} begin; ${retry}; commit`),/23514.*want_to_try_requires_unrated_restaurant/);
    assert.equal(await count(db,'destination_ratings'),1);
    assert.equal((await scalar(db,`select count(*)::int n from public.user_want_to_try w join public.destination_ratings r using(user_id,destination_id)`)).n,0);
  }finally{await a.close();await b.close();}
});

const lit = value => value == null ? 'null' : `'${String(value).replaceAll("'","''")}'`;
function feedCall({lat=null,lng=null,user=null,excluded=[],after=null,limit=120}={}) {
  return `public.wing_jury_feed_candidates(${lat??'null'},${lng??'null'},${lit(user)}::uuid,
    array[${excluded.map(lit).join(',')}]::uuid[],${after?.distance??'null'},${lit(after?.destination_id)}::uuid,
    ${lit(after?.created_at)}::timestamptz,${lit(after?.id)}::uuid,${limit})`;
}
async function feed(db,args={}) {
  return JSON.parse(await query(db,`set role service_role; select coalesce(json_agg(row_to_json(candidate)),'[]') from ${feedCall(args)} candidate`));
}
async function discoveryCatalog(db) {
  await query(db,`
    insert into public.destinations(id,lat,lng)
      select md5('feed-destination-'||series)::uuid,
        case when series=700 then 42 when series=701 then null else 20 end,
        case when series=700 then -78 when series=701 then null else 20 end
      from generate_series(1,701) series;
    insert into public.wing_media_submissions(id,user_id,media_type,status,destination_id,consent_version,consented_at,attribution_preference,processed_storage_path,created_at)
      select md5('feed-photo-'||series)::uuid,'${ids.other}','photo','approved',md5('feed-destination-'||series)::uuid,
        'v1',now(),'anonymous','processed/'||md5('feed-photo-'||series)::uuid||'/primary',
        '2026-01-01 00:00:00.123456+00'::timestamptz
      from generate_series(1,701) series;
    insert into storage.objects(bucket_id,name)
      select 'wing-submissions',processed_storage_path from public.wing_media_submissions where id<>'${ids.photo}';
    -- Closer destinations without any public eligible photo cannot stop radius
    -- expansion or prevent further eligible destinations from being found.
    insert into public.destinations(id,lat,lng)
      select md5('empty-close-destination-'||series)::uuid,42,-78 from generate_series(1,300) series;
    analyze public.destinations; analyze public.wing_media_submissions; analyze storage.objects;
  `);
}

test('real service-only catalog RPC discovers beyond 250 destinations/500 photos and keysets all eligible rows',async()=>{
  const db=await fixture(); await discoveryCatalog(db);
  for(const role of ['anon','authenticated'])
    await assert.rejects(query(db,`set role ${role}; select * from ${feedCall()}`),/42501.*permission denied/);
  const nearest=await feed(db,{lat:42,lng:-78,limit:2});
  const nearId=await query(db,"select md5('feed-photo-700')::uuid");
  assert.equal(nearest.length,2); assert.ok(nearest.some(row=>row.id===nearId)); assert.ok(nearest.every(row=>row.distance===0));
  for(const location of [{},{lat:42,lng:-78}]) {
    const seen=[];let after=null;
    for(let page=0;page<10;page++) {
      const rows=await feed(db,{...location,after});
      if(!rows.length)break;
      assert.ok(rows.length<=120);
      seen.push(...rows);after=rows.at(-1);
    }
    assert.equal(seen.length,702);assert.equal(new Set(seen.map(row=>row.id)).size,702);
    assert.ok(seen.some(row=>row.id===nearId));
    assert.ok(seen.some(row=>row.created_at==='2026-01-01T00:00:00.123456Z'));
    if(location.lat!=null){assert.equal(seen.at(-1).distance,null);assert.equal(seen.filter(row=>row.distance===null).length,1);}
    else assert.ok(seen.every(row=>row.distance===null));
  }
  await query(db,`${asUser()} ${vote()}`);
  assert.ok(!(await feed(db,{user:ids.user})).some(row=>row.id===ids.photo));
  assert.ok(!(await feed(db,{excluded:[ids.photo]})).some(row=>row.id===ids.photo));
});

test('real feed distance crosses antimeridian, retains null-coordinate fallback and validates bounds/position',async()=>{
  const db=await fixture();
  await query(db,`update public.destinations set lat=0,lng=-179.9 where id='${ids.destination}';
    insert into public.wing_media_submissions(id,user_id,media_type,status,destination_id,consent_version,consented_at,attribution_preference,processed_storage_path)
      values('${ids.otherRating}','${ids.other}','photo','approved','${ids.otherDestination}','v1',now(),'anonymous','processed/${ids.otherRating}/primary');
    insert into storage.objects(bucket_id,name) values('wing-submissions','processed/${ids.otherRating}/primary')`);
  const rows=await feed(db,{lat:0,lng:179.9});
  assert.equal(rows[0].id,ids.photo);assert.ok(rows[0].distance>22000 && rows[0].distance<22500);
  assert.equal(rows[1].id,ids.otherRating);assert.equal(rows[1].distance,null);
  assert.equal((await feed(db,{lat:0,lng:179.9,after:rows[0]}))[0].id,ids.otherRating);
  assert.deepEqual(await feed(db,{lat:0,lng:179.9,after:rows[1]}),[]);
  for(const args of [{lat:0},{lat:91,lng:0},{limit:121},{limit:0},{after:{id:ids.photo}},
    {after:{id:ids.photo,destination_id:ids.destination,created_at:'infinity'}},{excluded:Array(501).fill(ids.photo)}])
    await assert.rejects(feed(db,args),/22023.*invalid_feed/);
});

test('representative real PostgreSQL EXPLAIN ANALYZE covers catalog feed, list RLS, rating and Storage lookup',async()=>{
  const db=await fixture(); await discoveryCatalog(db);
  await query(db,`${asUser()} insert into public.user_want_to_try(user_id,destination_id)
    select '${ids.user}',id from public.destinations where id<>'${ids.destination}'`);
  await query(db,`insert into public.destination_ratings(id,user_id,destination_id)
    select md5('plan-rating-'||id)::uuid,'${ids.other}',id from public.destinations;
    analyze public.destination_ratings; analyze public.user_want_to_try;`);
  const source=await readFile(new URL('../../supabase/local/phase-2b/20261009_local_phase2b_foundation.sql',import.meta.url),'utf8');
  const body=source.split('create or replace function public.wing_jury_feed_candidates(')[1].split('create or replace function private.validate_wing_jury_vote_insert()')[0].match(/return query\s+([\s\S]*?)\nend;/)[1];
  const replacements={p_latitude:'42::double precision',p_longitude:'(-78)::double precision',p_user_id:`'${ids.user}'::uuid`,p_judged_submission_ids:"'{}'::uuid[]",p_after_distance:'null::double precision',p_after_destination_id:'null::uuid',p_after_created_at:'null::timestamptz',p_after_submission_id:'null::uuid',p_limit:'120'};
  const located=body.replace(/\bp_[a-z_]+\b/g,name=>replacements[name]??name);
  const plans=[
    ['feed-located-current-rpc-body',located],
    ['feed-no-location-current-rpc-body',located.replaceAll('42::double precision','null::double precision').replaceAll('(-78)::double precision','null::double precision')],
    ['private-list-owner-query',`select * from public.user_want_to_try where user_id='${ids.user}' and destination_id='${ids.otherDestination}'`],
    ['rating-eligibility',`select 1 from public.destination_ratings where user_id='${ids.other}' and destination_id='${ids.destination}'`],
    ['active-storage',`select 1 from storage.objects where bucket_id='wing-submissions' and name='processed/${ids.photo}/primary' and archived_at is null and is_delete_marker=false`],
  ];
  for(const [name,sql] of plans){
    const raw=await query(db,`explain(analyze,buffers,format json) ${sql}`);
    const explained=JSON.parse(raw)[0];const nodes=[];
    const visit=node=>{nodes.push({node:node['Node Type'],index:node['Index Name'],rows:node['Actual Rows'],loops:node['Actual Loops'],sort:node['Sort Method']});for(const child of node.Plans??[])visit(child);};visit(explained.Plan);
    console.log(JSON.stringify({queryPlan:name,planningMs:explained['Planning Time'],executionMs:explained['Execution Time'],sharedHits:explained.Plan['Shared Hit Blocks'],nodes}));
    assert.ok(explained['Execution Time']>=0);
    if(name.startsWith('feed-'))assert.equal(explained.Plan['Actual Rows'],120);
    if(name==='rating-eligibility')assert.ok(nodes.some(node=>node.index?.includes('destination_ratings_destination_id_crawl_id_user_id_key')));
    if(name==='active-storage')assert.ok(nodes.some(node=>node.index==='synthetic_storage_bucket_name_idx'));
  }
  // Execute the private-list plan with RLS enabled for the real caller role.
  const rls=await query(db,`${asUser()} explain(analyze,buffers,format json) select * from public.user_want_to_try where destination_id='${ids.otherDestination}'`);
  const explained=JSON.parse(rls.slice(rls.indexOf('[\n')))[0];
  assert.equal(explained.Plan['Actual Rows'],1);
  console.log(JSON.stringify({queryPlan:'private-list-authenticated-rls',planningMs:explained['Planning Time'],executionMs:explained['Execution Time'],plan:explained.Plan}));
});

test('real PostgreSQL typed JSON parsing rejects invalid verdicts; numeric strings remain typed-SQL compatible',async()=>{
  const db=await fixture();
  const payload=verdict=>JSON.stringify({submission_id:ids.photo,user_id:ids.user,vote:verdict});
  const insert=verdict=>`${asUser()} insert into public.wing_jury_votes(submission_id,user_id,vote)
    select submission_id,user_id,vote from json_populate_record(null::public.wing_jury_votes,${lit(payload(verdict))}::json)`;
  for(const [value,code] of [[null,'23502'],['garbage','22P02'],[true,'22P02'],[0.2,'22P02'],[2,'23514']])
    await assert.rejects(query(db,insert(value)),new RegExp(code));
  assert.equal(await count(db,'wing_jury_votes'),0);
  // json_populate_record models PostgreSQL typed-row conversion, not a running
  // PostgREST HTTP server. Strict JSON type checks remain the Edge contract.
  await query(db,insert('1'));
  assert.equal((await scalar(db,`select vote from public.wing_jury_votes where user_id='${ids.user}'`)).vote,1);
  assert.deepEqual(await counts(db),{like_count:1,neutral_count:0,dislike_count:0});
});

test('separate connections: rating reassignment locks both original and newly rated collection identities',async()=>{
  const db=await fixture();await query(db,rating());
  await race(db,`update public.destination_ratings set destination_id='${ids.otherDestination}' where id='${ids.rating}'`,
    `${asUser()} ${want(ids.user,ids.otherDestination)}`,/23514.*want_to_try_requires_unrated_restaurant/);
  await race(db,`update public.destination_ratings set destination_id='${ids.destination}' where id='${ids.rating}'`,
    `${asUser()} ${favorite(ids.user,ids.otherDestination)}`,/23514.*favorite_requires_existing_rating/);
  assert.equal(await count(db,'user_destination_favorites'),0);assert.equal(await count(db,'user_want_to_try'),0);
});

test('real service-only restaurant aggregate includes all scored history beyond 1000 rows and excludes nulls',async()=>{
  const db=await fixture();
  await query(db,`insert into public.crawls(crawl_id) select md5('aggregate-crawl-'||series)::uuid from generate_series(1,1002) series;
    insert into public.destination_ratings(id,user_id,destination_id,crawl_id,weight_score)
      select md5('aggregate-rating-'||series)::uuid,'${ids.user}','${ids.destination}',md5('aggregate-crawl-'||series)::uuid,
        case when series=1002 then null when series=1001 then 5 else 1 end from generate_series(1,1002) series`);
  for(const role of ['anon','authenticated'])
    await assert.rejects(query(db,`set role ${role}; select public.wing_jury_restaurant_rating_summary('${ids.destination}')`),/42501.*permission denied/);
  const summary=JSON.parse(await query(db,`set role service_role;select public.wing_jury_restaurant_rating_summary('${ids.destination}')`));
  assert.equal(summary.rating_count,1001);assert.ok(Math.abs(summary.average_weight_score-1005/1001)<1e-12);
  assert.deepEqual(JSON.parse(await query(db,`set role service_role;select public.wing_jury_restaurant_rating_summary('${ids.otherDestination}')`)),{rating_count:0,average_weight_score:null});
});
