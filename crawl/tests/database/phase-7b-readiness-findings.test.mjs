import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const foundation = await readFile(new URL('../../supabase/local/phase-2b/20261009_local_phase2b_foundation.sql', import.meta.url), 'utf8');
const user = '11111111-1111-4111-8111-111111111111';
const destination = '22222222-2222-4222-8222-222222222222';
const otherDestination = '33333333-3333-4333-8333-333333333333';
const photo = '44444444-4444-4444-8444-444444444444';
const firstRating = '55555555-5555-4555-8555-555555555555';
const secondRating = '66666666-6666-4666-8666-666666666666';
const otherUser = '77777777-7777-4777-8777-777777777777';
const firstCrawl = '88888888-8888-4888-8888-888888888888';
const secondCrawl = '99999999-9999-4999-8999-999999999999';

// Acceptance regressions for the five blockers reproduced during Phase 7B.
async function fixture({ defaults = false, functionDefaults = false } = {}) {
  const db = new PGlite();
  await db.exec(`
    create schema auth; create schema storage;
    create role anon nologin; create role authenticated nologin;
    create role service_role nologin bypassrls;
    ${functionDefaults ? 'alter default privileges grant execute on functions to anon, authenticated, service_role;' : ''}
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb) $$;
    create table auth.users(id uuid primary key);
    create table public.destinations(id uuid primary key);
    create table public.crawls(crawl_id uuid primary key);
    insert into public.crawls values ('${firstCrawl}'),('${secondCrawl}');
    create table public.destination_ratings(
      id uuid primary key,user_id uuid references auth.users(id) on delete cascade,
      destination_id uuid not null references public.destinations(id) on delete cascade,
      crawl_id uuid not null default '${firstCrawl}' references public.crawls(crawl_id) on delete cascade,
      created_at timestamptz not null default now(),
      weight_score numeric,
      unique(destination_id,crawl_id,user_id)
    );
    create table public.wing_media_submissions(
      id uuid primary key,user_id uuid,media_type text,status text,
      destination_id uuid,owner_deleted_at timestamptz,withdrawn_at timestamptz,
      created_at timestamptz default now(),consent_version text,consented_at timestamptz,
      attribution_preference text,processed_storage_path text
    );
    create table storage.objects(bucket_id text,name text,archived_at timestamptz,is_delete_marker boolean default false);
    insert into auth.users values ('${user}'),('${otherUser}');
    insert into public.destinations values ('${destination}'),('${otherDestination}');
    insert into public.wing_media_submissions(id,user_id,media_type,status,destination_id,consent_version,consented_at,attribution_preference,processed_storage_path)
      values ('${photo}','${user}','photo','approved','${destination}','v1',now(),'anonymous','processed/${photo}/primary');
    insert into storage.objects values ('wing-submissions','processed/${photo}/primary',null,false);
    ${defaults ? 'alter default privileges in schema public grant all on tables to anon, authenticated, service_role;' : ''}
  `);
  await db.exec(foundation);
  return db;
}
async function signIn(db, userId = user) {
  await db.exec(`select set_config('request.jwt.claim.sub','${userId}',false);
    select set_config('request.jwt.claims','{"is_anonymous":false}',false); set role authenticated;`);
}

test('production defaults cannot retain vote UPDATE/DELETE/TRUNCATE privileges', async () => {
  const db = await fixture({ defaults: true });
  try {
    await signIn(db);
    const { rows } = await db.query(`select has_table_privilege('authenticated','public.wing_jury_votes','UPDATE') as update,
      has_table_privilege('authenticated','public.wing_jury_votes','DELETE') as delete,
      has_table_privilege('authenticated','public.wing_jury_votes','TRUNCATE') as truncate`);
    assert.deepEqual(rows[0], { update: false, delete: false, truncate: false });
    await db.query('insert into public.wing_jury_votes(submission_id,user_id,vote) values ($1,$2,1)', [photo,user]);
    await assert.rejects(db.exec('truncate public.wing_jury_votes'), /permission denied/);
    assert.equal((await db.query('select count(*)::int as n from public.wing_jury_votes')).rows[0].n, 1);
    assert.equal((await db.query('select like_count from public.wing_jury_photo_vote_counts')).rows[0].like_count, 1);
  } finally { await db.close(); }
});

test('deleting one of multiple ratings preserves the still-eligible Favorite', async () => {
  const db = await fixture();
  try {
    await db.query('insert into public.destination_ratings(id,user_id,destination_id,crawl_id) values ($1,$2,$3,$5),($4,$2,$3,$6)', [firstRating,user,destination,secondRating,firstCrawl,secondCrawl]);
    await signIn(db);
    await db.query('insert into public.user_destination_favorites(user_id,destination_id) values ($1,$2)', [user,destination]);
    await db.exec('reset role');
    await db.query('delete from public.destination_ratings where id=$1', [firstRating]);
    assert.equal((await db.query('select count(*)::int as n from public.destination_ratings')).rows[0].n, 1);
    assert.equal((await db.query('select count(*)::int as n from public.user_destination_favorites')).rows[0].n, 1);
    await db.query('delete from public.destination_ratings where id=$1', [secondRating]);
    assert.equal((await db.query('select count(*)::int as n from public.user_destination_favorites')).rows[0].n, 0);
  } finally { await db.close(); }
});

test('rating UPDATE clears Want to Try for the newly-rated destination', async () => {
  const db = await fixture();
  try {
    await db.query('insert into public.destination_ratings(id,user_id,destination_id) values ($1,$2,$3)', [firstRating,user,otherDestination]);
    await signIn(db);
    await db.query('insert into public.user_want_to_try(user_id,destination_id) values ($1,$2)', [user,destination]);
    await db.exec('reset role');
    await db.query('update public.destination_ratings set destination_id=$1 where id=$2', [destination,firstRating]);
    assert.equal((await db.query('select count(*)::int as n from public.user_want_to_try')).rows[0].n, 0);
  } finally { await db.close(); }
});

test('auth-user deletion cascades its vote and updates counts', async () => {
  const db = await fixture();
  try {
    await signIn(db);
    await db.query('insert into public.wing_jury_votes(submission_id,user_id,vote) values ($1,$2,1)', [photo,user]);
    await db.exec('reset role');
    await db.query('delete from auth.users where id=$1', [user]);
    assert.equal((await db.query('select count(*)::int as n from public.wing_jury_votes')).rows[0].n, 0);
    assert.equal((await db.query('select like_count from public.wing_jury_photo_vote_counts')).rows[0].like_count, 0);
  } finally { await db.close(); }
});

test('archived/deleted storage metadata fails photo eligibility and denies votes', async () => {
  const db = await fixture();
  try {
    await db.exec('update storage.objects set archived_at=now(),is_delete_marker=true');
    assert.equal((await db.query('select private.is_public_wing_jury_photo($1) as eligible', [photo])).rows[0].eligible, false);
    await signIn(db);
    await assert.rejects(db.query('insert into public.wing_jury_votes(submission_id,user_id,vote) values ($1,$2,1)', [photo,user]), /photo_is_not_eligible/);
    assert.equal((await db.query('select count(*)::int as n from public.wing_jury_votes')).rows[0].n, 0);
  } finally { await db.close(); }
});

test('all feature ACLs are exact under production-style defaults and reruns', async () => {
  const db = await fixture({ defaults: true, functionDefaults: true });
  const required = {
    user_destination_favorites: ['SELECT', 'INSERT', 'DELETE'],
    user_want_to_try: ['SELECT', 'INSERT', 'DELETE'],
    wing_jury_votes: ['SELECT', 'INSERT'],
    wing_jury_photo_vote_counts: ['SELECT'],
  };
  try {
    await db.exec(foundation);
    for (const [table, allowed] of Object.entries(required)) {
      for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) {
        const { rows } = await db.query(`select
          has_table_privilege('authenticated',$1,$2) as authenticated,
          has_table_privilege('anon',$1,$2) as anon,
          has_table_privilege('service_role',$1,$2) as service`, [`public.${table}`, privilege]);
        assert.deepEqual(rows[0], { authenticated: allowed.includes(privilege), anon: false, service: privilege === 'SELECT' }, `${table} ${privilege}`);
      }
    }
    const { rows } = await db.query(`select
      has_function_privilege('authenticated','public.is_public_wing_jury_photo(uuid)','EXECUTE') as authenticated,
      has_function_privilege('anon','public.is_public_wing_jury_photo(uuid)','EXECUTE') as anon,
      has_function_privilege('service_role','public.is_public_wing_jury_photo(uuid)','EXECUTE') as service`);
    assert.deepEqual(rows[0], { authenticated: false, anon: false, service: true });
    for (const signature of ['lock_user_destination(uuid,uuid)', 'require_authenticated_user()',
      'validate_favorite_insert()', 'validate_want_to_try_insert()', 'remove_want_to_try_after_rating()',
      'remove_favorite_after_rating_delete()', 'lock_rating_collection_identities()',
      'validate_wing_jury_vote_insert()', 'enforce_wing_jury_vote_immutability()',
      'refresh_wing_jury_photo_vote_counts()', 'is_public_wing_jury_photo(uuid)']) {
      for (const role of ['anon', 'authenticated', 'service_role']) {
        assert.equal((await db.query(`select has_function_privilege($1,$2,'EXECUTE') as allowed`, [role, `private.${signature}`])).rows[0].allowed,
          role === 'authenticated' && signature === 'is_public_wing_jury_photo(uuid)', `${role} ${signature}`);
      }
    }
    await signIn(db);
    await assert.rejects(db.query('select public.is_public_wing_jury_photo($1)', [photo]), /permission denied/);
    await db.exec('reset role; set role anon');
    await assert.rejects(db.query('select public.is_public_wing_jury_photo($1)', [photo]), /permission denied/);
    await assert.rejects(db.query('select * from public.user_want_to_try'), /permission denied/);
    await db.exec('reset role; set role service_role');
    assert.equal((await db.query('select public.is_public_wing_jury_photo($1) as eligible', [photo])).rows[0].eligible, true);
    assert.equal((await db.query('select count(*)::int as n from public.user_want_to_try')).rows[0].n, 0);
    await assert.rejects(db.query('insert into public.wing_jury_votes(submission_id,user_id,vote) values ($1,$2,1)', [photo,user]), /permission denied/);
  } finally { await db.close(); }
});

test('privileged vote mutations are denied while auth cascades update each verdict count', async () => {
  const db = await fixture();
  try {
    await signIn(db);
    await db.query('insert into public.wing_jury_votes(submission_id,user_id,vote) values ($1,$2,0)', [photo,user]);
    await db.exec('reset role');
    await assert.rejects(db.query('update public.wing_jury_votes set vote=1 where submission_id=$1', [photo]), /wing_jury_vote_is_immutable/);
    await assert.rejects(db.query('delete from public.wing_jury_votes where submission_id=$1', [photo]), /wing_jury_vote_is_immutable/);
    await signIn(db, otherUser);
    await db.query('insert into public.wing_jury_votes(submission_id,user_id,vote) values ($1,$2,-1)', [photo,otherUser]);
    await db.exec('reset role; begin');
    await db.query('delete from auth.users where id=$1', [user]);
    assert.deepEqual((await db.query('select like_count,neutral_count,dislike_count from public.wing_jury_photo_vote_counts')).rows[0], { like_count: 0, neutral_count: 0, dislike_count: 1 });
    await db.exec('rollback');
    assert.deepEqual((await db.query('select like_count,neutral_count,dislike_count from public.wing_jury_photo_vote_counts')).rows[0], { like_count: 0, neutral_count: 1, dislike_count: 1 });
    await db.exec('reset role');
    await db.query('delete from auth.users where id in ($1,$2)', [user,otherUser]);
    assert.deepEqual((await db.query('select like_count,neutral_count,dislike_count from public.wing_jury_photo_vote_counts')).rows[0], { like_count: 0, neutral_count: 0, dislike_count: 0 });
  } finally { await db.close(); }
});

test('rating reassignment reconciles both identities and rolls back with the rating', async () => {
  const db = await fixture();
  try {
    await db.query('insert into public.destination_ratings(id,user_id,destination_id) values ($1,$2,$3)', [firstRating,user,destination]);
    await signIn(db);
    await db.query('insert into public.user_destination_favorites(user_id,destination_id) values ($1,$2)', [user,destination]);
    await db.query('insert into public.user_want_to_try(user_id,destination_id) values ($1,$2)', [user,otherDestination]);
    await db.exec('reset role; begin');
    await db.query('update public.destination_ratings set destination_id=$1 where id=$2', [otherDestination,firstRating]);
    assert.equal((await db.query('select count(*)::int as n from public.user_destination_favorites')).rows[0].n, 0);
    assert.equal((await db.query('select count(*)::int as n from public.user_want_to_try')).rows[0].n, 0);
    await db.exec('rollback');
    assert.equal((await db.query('select count(*)::int as n from public.user_destination_favorites')).rows[0].n, 1);
    assert.equal((await db.query('select count(*)::int as n from public.user_want_to_try')).rows[0].n, 1);
    await signIn(db, otherUser);
    await db.query('insert into public.user_want_to_try(user_id,destination_id) values ($1,$2)', [otherUser,otherDestination]);
    await db.exec('reset role');
    await db.query('update public.destination_ratings set user_id=$1,destination_id=$2 where id=$3', [otherUser,otherDestination,firstRating]);
    assert.equal((await db.query('select count(*)::int as n from public.user_destination_favorites')).rows[0].n, 0);
    assert.deepEqual((await db.query('select user_id,destination_id from public.user_want_to_try')).rows, [{ user_id: user, destination_id: otherDestination }]);
  } finally { await db.close(); }
});

test('individual storage lifecycle markers and missing objects each fail closed', async () => {
  const db = await fixture();
  try {
    for (const statement of [
      'update storage.objects set archived_at=now(),is_delete_marker=false',
      'update storage.objects set archived_at=null,is_delete_marker=true',
      'update storage.objects set archived_at=null,is_delete_marker=null',
      'delete from storage.objects',
    ]) {
      await db.exec(statement);
      assert.equal((await db.query('select public.is_public_wing_jury_photo($1) as eligible', [photo])).rows[0].eligible, false);
    }
  } finally { await db.close(); }
});

test('anonymous-auth identities cannot read or delete private lists or permanent votes', async () => {
  const db = await fixture();
  try {
    await db.query('insert into public.destination_ratings(id,user_id,destination_id) values ($1,$2,$3)', [firstRating,user,destination]);
    await signIn(db);
    await db.query('insert into public.user_destination_favorites(user_id,destination_id) values ($1,$2)', [user,destination]);
    await db.query('insert into public.user_want_to_try(user_id,destination_id) values ($1,$2)', [user,otherDestination]);
    await db.query('insert into public.wing_jury_votes(submission_id,user_id,vote) values ($1,$2,1)', [photo,user]);
    await db.exec(`select set_config('request.jwt.claims','{"is_anonymous":true}',false)`);
    for (const table of ['user_destination_favorites', 'user_want_to_try', 'wing_jury_votes', 'wing_jury_photo_vote_counts']) {
      assert.deepEqual((await db.query(`select * from public.${table}`)).rows, [], table);
    }
    for (const table of ['user_destination_favorites', 'user_want_to_try']) {
      assert.deepEqual((await db.query(`delete from public.${table} returning *`)).rows, [], table);
    }
    await signIn(db);
    assert.equal((await db.query('select count(*)::int as n from public.user_destination_favorites')).rows[0].n, 1);
    assert.equal((await db.query('select count(*)::int as n from public.user_want_to_try')).rows[0].n, 1);
    await signIn(db, otherUser);
    assert.deepEqual((await db.query('select * from public.wing_jury_votes')).rows, []);
    await assert.rejects(db.query('insert into public.wing_jury_votes(submission_id,user_id,vote) values ($1,$2,1)', [photo,user]), /owner_mismatch|row-level security/);
  } finally { await db.close(); }
});

test('server-only restaurant summary includes all scored ratings and excludes null scores', async () => {
  const db = await fixture({ functionDefaults: true });
  try {
    await db.query(`insert into public.crawls(crawl_id)
      select md5('summary-crawl-' || series)::uuid from generate_series(1,1002) series`);
    await db.query(`insert into public.destination_ratings(id,user_id,destination_id,crawl_id,weight_score)
      select md5('summary-rating-' || series)::uuid,$1,$2,md5('summary-crawl-' || series)::uuid,
        case when series=1002 then null when series=1001 then 5 else 1 end
      from generate_series(1,1002) series`, [user,destination]);
    await signIn(db);
    await assert.rejects(db.query('select public.wing_jury_restaurant_rating_summary($1)', [destination]), /permission denied/);
    await db.exec('reset role; set role anon');
    await assert.rejects(db.query('select public.wing_jury_restaurant_rating_summary($1)', [destination]), /permission denied/);
    await db.exec('reset role; set role service_role');
    const summary = (await db.query('select public.wing_jury_restaurant_rating_summary($1) as summary', [destination])).rows[0].summary;
    assert.equal(summary.rating_count, 1001);
    assert.ok(Math.abs(summary.average_weight_score - 1005 / 1001) < 1e-12);
    assert.deepEqual((await db.query('select public.wing_jury_restaurant_rating_summary($1) as summary', [otherDestination])).rows[0].summary,
      { average_weight_score: null, rating_count: 0 });
  } finally { await db.close(); }
});

test('fixed-snapshot isolation fails closed before collection or rating mutations', async () => {
  const db = await fixture();
  try {
    await db.query('insert into public.destination_ratings(id,user_id,destination_id) values ($1,$2,$3)', [firstRating,user,destination]);
    await signIn(db);
    for (const isolation of ['repeatable read', 'serializable']) {
      await db.exec(`begin isolation level ${isolation}`);
      await assert.rejects(db.query('insert into public.user_want_to_try(user_id,destination_id) values ($1,$2)', [user,otherDestination]),
        (error) => error.code === '25001' && /require_read_committed/.test(error.message));
      await db.exec('rollback');
      await db.exec(`begin isolation level ${isolation}`);
      await assert.rejects(db.query('insert into public.user_destination_favorites(user_id,destination_id) values ($1,$2)', [user,destination]),
        (error) => error.code === '25001' && /require_read_committed/.test(error.message));
      await db.exec('rollback; reset role');
      await db.exec(`begin isolation level ${isolation}`);
      await assert.rejects(db.query('update public.destination_ratings set destination_id=$1 where id=$2', [otherDestination,firstRating]),
        (error) => error.code === '25001' && /require_read_committed/.test(error.message));
      await db.exec('rollback');
      assert.deepEqual((await db.query('select id,destination_id from public.destination_ratings')).rows,
        [{ id: firstRating, destination_id: destination }]);
      await signIn(db);
    }
    assert.equal((await db.query('select count(*)::int as n from public.user_want_to_try')).rows[0].n, 0);
    assert.equal((await db.query('select count(*)::int as n from public.user_destination_favorites')).rows[0].n, 0);
  } finally { await db.close(); }
});

