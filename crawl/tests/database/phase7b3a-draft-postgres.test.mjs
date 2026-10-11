import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { startDisposablePostgres, fixture, query, session, observeBlocked, asUser, ids } from '../../scripts/phase7b25-postgres.mjs';
import { verifyPackage } from '../../supabase/local/phase-7b3a/verify-package.mjs';

const base = new URL('../../supabase/local/phase-7b3a/', import.meta.url);
const pack = await verifyPackage(base);
const migration = new URL(pack.artifacts[0].path, base);
const draft = await readFile(migration, 'utf8');
const bootstrap = new URL('./fixtures/phase7b3a-production-shaped-bootstrap.sql', import.meta.url);
before(async () => {
  await startDisposablePostgres();
  await query('buffago_phase7b25', 'create role supabase_auth_admin nologin; create role supabase_storage_admin nologin;');
});
const fresh = () => fixture({ bootstrap, migration });
const pristine = () => fixture({ bootstrap, migration: false });
const rating = (id=ids.rating,user=ids.user,dest=ids.destination,crawl=ids.crawl) =>
  `insert into public.destination_ratings(id,user_id,destination_id,crawl_id,weight_score) values('${id}','${user}','${dest}','${crawl}',4)`;
const want = (user=ids.user,dest=ids.destination) => `insert into public.user_want_to_try(user_id,destination_id) values('${user}','${dest}')`;
const favorite = () => `insert into public.user_destination_favorites(user_id,destination_id) values('${ids.user}','${ids.destination}')`;
const vote = (user=ids.user,value=1) => `insert into public.wing_jury_votes(submission_id,user_id,vote) values('${ids.photo}','${user}',${value})`;
const count = (db,table) => query(db,`select count(*) from public.${table}`);
async function catalog(db) {
  return query(db,`select json_agg(json_build_array(c.oid::regclass::text,t.tgname,pg_get_triggerdef(t.oid,true),md5(p.prosrc),p.proowner::regrole::text) order by c.oid,t.tgname)
    from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_proc p on p.oid=t.tgfoid
    where not t.tgisinternal and c.oid in ('auth.users'::regclass,'public.users'::regclass,'public.destination_ratings'::regclass,
      'public.wing_media_submissions'::regclass,'public.wing_media_photo_votes'::regclass,'storage.objects'::regclass)
    and t.tgname not like 'destination_ratings_%'`);
}
async function race(db,holderSql,waiterSql,error=null) {
  const tag=`phase7b3a-${Math.random().toString(36).slice(2)}`;
  const holder=session(db,tag+'-holder');
  try {
    await holder.execute(`begin; ${holderSql}`);
    const waiter=query(db,waiterSql,tag+'-waiter').then(value=>({value}),error=>({error}));
    const blocked=await observeBlocked(db,tag+'-waiter');
    console.log(JSON.stringify({applicationName:tag,blockedPid:blocked.pid,blockers:blocked.blockers,wait:blocked.wait}));
    await holder.execute('commit');
    const done=await waiter;
    if(error) { assert.ok(done.error); assert.match(done.error.message,error); }
    else assert.ifError(done.error);
  } finally { await holder.close(); }
}

test('exact quarantined draft preserves all 18 existing attachments/functions and fails closed on reapply',async()=>{
  const db=await pristine();
  const before=await catalog(db);
  assert.equal(JSON.parse(before).length,18);
  await query(db,draft);
  assert.equal(await catalog(db),before);
  await assert.rejects(query(db,draft),/phase7b3a_relation_type_index_collision/);
  assert.equal(await catalog(db),before);
  assert.equal(await count(db,'wing_jury_votes'),'0');
});

test('prerequisite constraint/trigger/role/overload/index drift rejects before feature DDL',async()=>{
  const db=await pristine();
  const cases=[
    ['alter table public.wing_media_submissions drop constraint wing_media_submissions_rating_id_fkey',
      'alter table public.wing_media_submissions add constraint wing_media_submissions_rating_id_fkey foreign key(rating_id) references public.destination_ratings(id) on delete restrict',/constraint_drift/],
    ['alter table public.destination_ratings disable trigger guard_buffacoin_rating_writes',
      'alter table public.destination_ratings enable trigger guard_buffacoin_rating_writes',/existing_trigger_drift/],
    ['grant usage on schema private to authenticated','revoke usage on schema private from authenticated',/untrusted_schema_privilege/],
    ['create function private.lock_user_destination(text) returns void language sql as $$select$$',
      'drop function private.lock_user_destination(text)',/function_name_or_overload_collision/],
    ['create index wing_jury_votes_user_idx on public.destinations(name)',
      'drop index public.wing_jury_votes_user_idx',/relation_type_index_collision/],
  ];
  for(const [change,restore,error] of cases) {
    await query(db,change);
    await assert.rejects(query(db,draft),error);
    assert.equal(await query(db,"select to_regclass('public.user_want_to_try') is null"),'t');
    await query(db,restore);
  }
  await assert.rejects(query(db,'set role authenticated; '+draft),/requires_verified_postgres_executor/);
  await query(db,draft);
});

test('mid-DDL failure rolls back every additive object and leaves baseline attachments unchanged',async()=>{
  const db=await pristine(); const before=await catalog(db);
  // A transaction fault injection, not a relaxed preflight or release artifact.
  await assert.rejects(query(db,draft.replace('commit;','select 1/0; commit;')),/22012/);
  assert.equal(await query(db,"select to_regclass('public.wing_jury_votes') is null"),'t');
  assert.equal(await catalog(db),before);
  await query(db,draft);
});

test('strict production fingerprints reject the surrogate fixture; metadata never proves behavior',async()=>{
  const db=await pristine();
  await assert.rejects(query(db,await readFile(new URL('production-fingerprint-preflight.sql',base),'utf8')),/existing_trigger_drift.*trg_rating_after_insert/);
  assert.equal(await query(db,"select md5(prosrc) from pg_proc where oid='public.guard_buffacoin_rating_writes()'::regprocedure"),'b20e1dd1709b7f4f309086cc44e57511');
  assert.equal(await query(db,"select md5(prosrc) from pg_proc where oid='public.wing_apply_owner_pseudonymization()'::regprocedure"),'de76b9c0f76f833db3712676d0cc1b60');
});

test('exact draft normalizes inherited grants, pins postgres ownership/path and rejects guests/spoofing',async()=>{
  const db=await fresh();
  const rights={user_destination_favorites:['SELECT','INSERT','DELETE'],user_want_to_try:['SELECT','INSERT','DELETE'],wing_jury_votes:['SELECT','INSERT'],wing_jury_photo_vote_counts:['SELECT']};
  for(const [table,allowed] of Object.entries(rights)) {
    for(const privilege of ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) {
      assert.equal(await query(db,`select has_table_privilege('authenticated','public.${table}','${privilege}')`),allowed.includes(privilege)?'t':'f');
      assert.equal(await query(db,`select has_table_privilege('anon','public.${table}','${privilege}')`),'f');
      assert.equal(await query(db,`select has_table_privilege('service_role','public.${table}','${privilege}')`),privilege==='SELECT'?'t':'f');
    }
  }
  const names=[...draft.matchAll(/create function (\w+\.\w+)\(/g)].map(m=>m[1]);
  for(const name of names) {
    assert.equal(await query(db,`select bool_and(proowner='postgres'::regrole and prosecdef and proconfig @> array['search_path=pg_catalog']) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname||'.'||p.proname='${name}'`),'t');
  }
  await assert.rejects(query(db,'set role anon; '+vote()),/42501/);
  await assert.rejects(query(db,asUser(ids.user,true)+vote()),/authentication_required/);
  await assert.rejects(query(db,asUser(ids.other)+want()),/owner_mismatch/);
  await query(db,asUser()+want());
  assert.match(await query(db,asUser(ids.other)+'select count(*) from public.user_want_to_try'),/\n0$/);
  assert.equal(await query(db,'set role service_role; select public.is_public_wing_jury_photo(\''+ids.photo+'\')'),'t');
});

test('media physical delete cascades Jury/gallery/counts; baseline restrictions still block deletion atomically',async()=>{
  const db=await fresh(); await query(db,asUser()+vote());
  await assert.rejects(query(db,'delete from public.wing_jury_votes'),/immutable/);
  await assert.rejects(query(db,'update public.wing_jury_votes set vote=0'),/immutable/);
  await query(db,`insert into public.wing_processing_jobs(fixture_id,submission_id) values('${ids.rating}','${ids.photo}')`);
  await assert.rejects(query(db,`delete from public.wing_media_submissions where id='${ids.photo}'`),/23503/);
  assert.equal(await count(db,'wing_jury_votes'),'1');
  await query(db,`delete from public.wing_processing_jobs; delete from public.wing_media_submissions where id='${ids.photo}'`);
  for(const table of ['wing_jury_votes','wing_jury_photo_vote_counts','wing_media_photo_votes'])assert.equal(await count(db,table),'0');
});

test('withdrawal retains immutable counts/votes but denies feed/count visibility/new votes',async()=>{
  const db=await fresh();
  await query(db,"update public.wing_media_submissions set consent_version=U&'\\00a0\\feff'");
  await assert.rejects(query(db,asUser()+vote()),/not_eligible/);
  await query(db,"update public.wing_media_submissions set consent_version='v1'");
  await query(db,asUser()+vote());
  await assert.rejects(query(db,"update public.wing_media_submissions set status='withdrawn'"),/23514/);
  await query(db,"update public.wing_media_submissions set status='withdrawn',withdrawn_at=now()");
  assert.equal(await count(db,'wing_jury_votes'),'1');
  assert.equal(await query(db,'select like_count from public.wing_jury_photo_vote_counts'),'1');
  assert.match(await query(db,asUser()+'select count(*) from public.wing_jury_photo_vote_counts'),/\n0$/);
  await assert.rejects(query(db,asUser(ids.third)+vote(ids.third)),/not_eligible/);
  assert.equal(await query(db,'set role service_role; select count(*) from public.wing_jury_feed_candidates(null,null,null,null,null,null,null,null,24)'),'0');
});

test('matched gallery helpers keep mutable gallery counts independent from immutable Jury votes',async()=>{
  const db=await fresh();
  await query(db,`grant select,insert,update,delete on public.wing_media_photo_votes to authenticated;
    ${asUser()} ${vote()}`);
  assert.equal(await query(db,'select like_count from public.wing_media_submissions'),'9');
  await query(db,`${asUser(ids.third)} insert into public.wing_media_photo_votes(submission_id,user_id,vote) values('${ids.photo}','${ids.third}',1)`);
  assert.equal(await query(db,'select like_count from public.wing_media_submissions'),'2');
  assert.equal(await query(db,'select like_count from public.wing_jury_photo_vote_counts'),'1');
  await query(db,`${asUser(ids.third)} update public.wing_media_photo_votes set vote=-1 where user_id='${ids.third}'`);
  assert.equal(await query(db,'select like_count from public.wing_media_submissions'),'1');
  assert.equal(await query(db,'select like_count from public.wing_jury_photo_vote_counts'),'1');
});

test('rating/crawl/route/account RESTRICT failures preserve lists; supported unlink then cascade cleans favorites',async()=>{
  const db=await fresh();
  await query(db,asUser()+want()); await query(db,rating()); await query(db,asUser()+favorite());
  await query(db,`update public.wing_media_submissions set rating_id='${ids.rating}'`);
  for(const sql of [`delete from public.destination_ratings where id='${ids.rating}'`,`delete from public.crawls where crawl_id='${ids.crawl}'`,
    'delete from public.routes',`delete from auth.users where id='${ids.user}'`,`delete from public.destinations where id='${ids.destination}'`]) {
    await assert.rejects(query(db,sql),/23503/);
    assert.equal(await count(db,'user_destination_favorites'),'1');
    assert.equal(await count(db,'destination_ratings'),'1');
  }
  await query(db,'update public.wing_media_submissions set rating_id=null; delete from public.crawls');
  assert.equal(await count(db,'user_destination_favorites'),'0');
  assert.equal(await count(db,'user_want_to_try'),'0');
  await query(db,`delete from public.wing_media_submissions; delete from public.destinations where id='${ids.destination}'`);
});

test('account owner pseudonymization and Jury cascade maintain exact neutral/like/dislike counts',async()=>{
  const db=await fresh();
  await query(db,asUser()+vote(ids.user,1)); await query(db,asUser(ids.other)+vote(ids.other,0)); await query(db,asUser(ids.third)+vote(ids.third,-1));
  await query(db,`delete from auth.users where id='${ids.other}'`);
  assert.equal(await query(db,`select user_id is null and owner_deleted_at is not null from public.wing_media_submissions`),'t');
  assert.equal(await query(db,'select like_count||\',\'||neutral_count||\',\'||dislike_count from public.wing_jury_photo_vote_counts'),'1,0,1');
  await query(db,`delete from auth.users where id in ('${ids.user}','${ids.third}')`);
  assert.equal(await query(db,'select like_count+neutral_count+dislike_count from public.wing_jury_photo_vote_counts'),'0');
});

test('matched guard and notification source with surrogate dependencies preserve atomic rating cleanup',async()=>{
  const db=await fresh(); await query(db,asUser()+want());
  const buffacoin=rating().replace('weight_score)','weight_score,is_buffacoin)').replace(',4)',',4,true)');
  await assert.rejects(query(db,asUser()+buffacoin),/buffacoin_rating_requires_atomic_transaction/);
  await assert.rejects(query(db,"set buffago.fixture_after_fail='on'; "+rating()),/fixture_reward_failure/);
  assert.equal(await count(db,'user_want_to_try'),'1'); assert.equal(await count(db,'destination_ratings'),'0');
  await query(db,`insert into public.friendships values('${ids.user}','${ids.other}','accepted');
    insert into public.notification_preferences values('${ids.other}',true);
    insert into public.engagement_feature_flags values('friend_rating_push',true);
    set buffago.atomic_buffacoin_write='on'; ${asUser()} ${buffacoin}`);
  assert.equal(await count(db,'notification_outbox'),'1'); assert.equal(await count(db,'user_want_to_try'),'0');
  assert.equal(await query(db,"select want_count from public.fixture_trigger_events where name='fixture_social_dependency'"),'1');
  assert.equal(await query(db,"select want_count from public.fixture_trigger_events where name='trg_rating_after_insert'"),'0');
});

test('separate backends: exact draft rating/Want races, reassignment and final Favorite cleanup',async()=>{
  const db=await fresh();
  await race(db,rating(),asUser()+want(),/want_to_try_requires_unrated/);
  await race(db,asUser(ids.other)+want(ids.other,ids.otherDestination),rating(ids.otherRating,ids.other,ids.otherDestination));
  await query(db,asUser()+favorite());
  await race(db,`delete from public.destination_ratings where id='${ids.rating}'`,asUser()+favorite(),/favorite_requires_existing/);
  await query(db,rating());
  await race(db,asUser()+favorite(),`delete from public.destination_ratings where id='${ids.rating}'`);
  assert.equal(await count(db,'user_destination_favorites'),'0'); assert.equal(await count(db,'user_want_to_try'),'0');
  await query(db,rating()); await query(db,asUser()+favorite());
  await race(db,`update public.destination_ratings set destination_id='${ids.otherDestination}' where id='${ids.rating}'`,
    asUser()+want(ids.user,ids.otherDestination),/want_to_try_requires_unrated/);
  await race(db,`update public.destination_ratings set destination_id='${ids.destination}' where id='${ids.rating}'`,
    asUser()+want(),/want_to_try_requires_unrated/);
  assert.equal(await count(db,'user_destination_favorites'),'0');
});

test('exact draft rejects fixed-snapshot isolation including null-owner rating events',async()=>{
  const db=await fresh();
  await assert.rejects(query(db,'begin isolation level serializable; '+rating()+'; commit'),/25001/);
  await assert.rejects(query(db,'begin isolation level repeatable read; '+rating().replace(`'${ids.user}'`,'null')+'; commit'),/25001/);
  await assert.rejects(query(db,'begin isolation level repeatable read; '+asUser()+want()+'; commit'),/25001/);
  assert.equal(await count(db,'destination_ratings'),'0');
  await query(db,asUser()+want()); await query(db,rating());
  assert.equal(await count(db,'user_want_to_try'),'0');
});

test('separate backends: media delete/vote both orderings leave no orphan Jury counts',async()=>{
  let db=await fresh();
  await race(db,asUser()+vote(),`delete from public.wing_media_submissions where id='${ids.photo}'`);
  assert.equal(await count(db,'wing_jury_votes'),'0'); assert.equal(await count(db,'wing_jury_photo_vote_counts'),'0');
  db=await fresh();
  await race(db,`delete from public.wing_media_submissions where id='${ids.photo}'`,asUser()+vote(),/not_eligible/);
  assert.equal(await count(db,'wing_jury_photo_vote_counts'),'0');
});

test('separate backends: conflicting vote retries and account deletion serialize exact count arithmetic',async()=>{
  const db=await fresh();
  await race(db,asUser()+vote(ids.user,0),asUser()+vote(ids.user,1)+' on conflict do nothing');
  assert.equal(await query(db,`select vote from public.wing_jury_votes where user_id='${ids.user}'`),'0');
  await race(db,asUser(ids.other)+vote(ids.other,1),asUser(ids.third)+vote(ids.third,-1));
  const fourth='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  await query(db,`insert into auth.users(id) values('${fourth}')`);
  await race(db,`delete from auth.users where id='${ids.user}'`,asUser(fourth)+vote(fourth,1));
  assert.equal(await query(db,'select like_count||\',\'||neutral_count||\',\'||dislike_count from public.wing_jury_photo_vote_counts'),'2,0,1');
});
