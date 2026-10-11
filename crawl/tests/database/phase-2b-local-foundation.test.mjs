import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const sql = await readFile(new URL('../../supabase/local/phase-2b/20261009_local_phase2b_foundation.sql', import.meta.url), 'utf8');
const ids = {
  user: '11111111-1111-4111-8111-111111111111',
  otherUser: '22222222-2222-4222-8222-222222222222',
  destination: '33333333-3333-4333-8333-333333333333',
  unrated: '44444444-4444-4444-8444-444444444444',
  rating: '55555555-5555-4555-8555-555555555555',
  otherRating: '77777777-7777-4777-8777-777777777777',
  photo: '66666666-6666-4666-8666-666666666666',
};

async function fixture() {
  const db = new PGlite();
  await db.exec(`
    create schema auth; create schema storage;
    create role anon nologin; create role authenticated nologin;
    create role service_role nologin bypassrls;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb) $$;
    create table auth.users(id uuid primary key);
    create table public.destinations(id uuid primary key, name text not null);
    create table public.destination_ratings(
      id uuid primary key, user_id uuid not null references auth.users(id),
      destination_id uuid not null references public.destinations(id),
      created_at timestamptz not null default now(), weight_score numeric
    );
    create table storage.objects(bucket_id text, name text,
      archived_at timestamptz, is_delete_marker boolean not null default false,
      primary key(bucket_id, name));
    create table public.wing_media_submissions(
      id uuid primary key, user_id uuid, media_type text, status text,
      destination_id uuid,
      owner_deleted_at timestamptz, withdrawn_at timestamptz,
      created_at timestamptz not null default now(),
      consent_version text, consented_at timestamptz,
      attribution_preference text, processed_storage_path text,
      like_count integer not null default 0
    );
    create table public.wing_media_photo_votes(
      submission_id uuid, user_id uuid, vote smallint,
      primary key(submission_id,user_id)
    );
    grant select, insert, delete on public.destination_ratings to authenticated;
    grant select, update on public.wing_media_submissions to authenticated;
    grant select on public.wing_media_photo_votes to authenticated;
    insert into auth.users values ('${ids.user}'), ('${ids.otherUser}');
    insert into public.destinations values
      ('${ids.destination}', 'Rated Wings'), ('${ids.unrated}', 'Unrated Wings');
    insert into public.wing_media_submissions values
      ('${ids.photo}', '${ids.otherUser}', 'photo', 'approved', '${ids.destination}', null, null, now(), 'v1', now(),
       'anonymous', 'processed/${ids.photo}/primary');
    insert into storage.objects(bucket_id,name) values ('wing-submissions', 'processed/${ids.photo}/primary');
  `);
  await db.exec(sql);
  return db;
}

async function asUser(db, userId, anonymous = false) {
  await db.exec(`select set_config('request.jwt.claim.sub','${userId ?? ''}',false); select set_config('request.jwt.claims','${JSON.stringify({ is_anonymous: anonymous })}',false); set role authenticated`);
}

test('favorites require a rating, are idempotent, and isolate users', async () => {
  const db = await fixture();
  try {
    await asUser(db, ids.user);
    await assert.rejects(db.query('insert into public.user_destination_favorites values ($1,$2)', [ids.user, ids.destination]), /favorite_requires_existing_rating/);
    await db.query('insert into public.destination_ratings(id,user_id,destination_id) values ($1,$2,$3)', [ids.rating, ids.user, ids.destination]);
    await db.query('insert into public.user_destination_favorites values ($1,$2) on conflict do nothing', [ids.user, ids.destination]);
    await db.query('insert into public.user_destination_favorites values ($1,$2) on conflict do nothing', [ids.user, ids.destination]);
    assert.equal((await db.query('select count(*)::int as n from public.user_destination_favorites')).rows[0].n, 1);
    await db.exec(`select set_config('request.jwt.claim.sub','${ids.otherUser}',false)`);
    assert.deepEqual((await db.query('select * from public.user_destination_favorites')).rows, []);
    assert.equal((await db.query('delete from public.user_destination_favorites where user_id=$1 returning *', [ids.user])).rows.length, 0);
    await db.exec(`select set_config('request.jwt.claim.sub','${ids.user}',false)`);
    assert.equal((await db.query('delete from public.user_destination_favorites where user_id=$1 returning *', [ids.user])).rows.length, 1);
    await db.query('insert into public.user_destination_favorites values ($1,$2)', [ids.user, ids.destination]);
    await db.query('delete from public.destination_ratings where id=$1', [ids.rating]);
    assert.equal((await db.query('select count(*)::int as n from public.user_destination_favorites')).rows[0].n, 0);
  } finally { await db.close(); }
});

test('Want to Try only accepts unrated destinations and clears after successful rating', async () => {
  const db = await fixture();
  try {
    await asUser(db, ids.user);
    await db.query('insert into public.destination_ratings(id,user_id,destination_id) values ($1,$2,$3)', [ids.rating, ids.user, ids.destination]);
    await db.query('insert into public.user_want_to_try values ($1,$2) on conflict do nothing', [ids.user, ids.unrated]);
    await assert.rejects(db.query('insert into public.user_want_to_try values ($1,$2)', [ids.user, ids.destination]), /want_to_try_requires_unrated_restaurant/);
    await db.exec('begin');
    await db.query('insert into public.destination_ratings(id,user_id,destination_id) values ($1,$2,$3)', [ids.otherRating, ids.user, ids.unrated]);
    await db.exec('rollback');
    assert.equal((await db.query('select count(*)::int as n from public.user_want_to_try')).rows[0].n, 1);
    await db.query('insert into public.destination_ratings(id,user_id,destination_id) values ($1,$2,$3)', [ids.otherRating, ids.user, ids.unrated]);
    assert.equal((await db.query('select count(*)::int as n from public.user_want_to_try')).rows[0].n, 0);
    await db.query('delete from public.destination_ratings where id=$1', [ids.rating]);
    await db.query('insert into public.user_want_to_try values ($1,$2)', [ids.user, ids.destination]);
    assert.equal((await db.query('select count(*)::int as n from public.user_want_to_try')).rows[0].n, 1);
  } finally { await db.close(); }
});

test('anonymous writes and cross-user mutations are denied by RLS', async () => {
  const db = await fixture();
  try {
    await asUser(db, ids.user);
    await db.query('insert into public.user_want_to_try values ($1,$2)', [ids.user, ids.unrated]);
    await db.exec(`select set_config('request.jwt.claim.sub','${ids.otherUser}',false); select set_config('request.jwt.claims','{"is_anonymous":false}',false)`);
    assert.deepEqual((await db.query('select * from public.user_want_to_try')).rows, []);
    assert.equal((await db.query('delete from public.user_want_to_try where user_id=$1 returning *', [ids.user])).rows.length, 0);
    await db.exec(`select set_config('request.jwt.claims','{"is_anonymous":true}',false)`);
    await assert.rejects(db.query('insert into public.user_want_to_try values ($1,$2)', [ids.otherUser, ids.unrated]), /authentication_required|row-level security/);
  } finally { await db.close(); }
});

test('Wing Jury votes are separate, immutable, allow neutral, and count only plus-one likes', async () => {
  const db = await fixture();
  try {
    await asUser(db, ids.user);
    await db.query('insert into public.wing_jury_votes values ($1,$2,0)', [ids.photo, ids.user]);
    assert.equal((await db.query('select neutral_count from public.wing_jury_photo_vote_counts where submission_id=$1', [ids.photo])).rows[0].neutral_count, 1);
    await assert.rejects(db.query('insert into public.wing_jury_votes values ($1,$2,1)', [ids.photo, ids.user]), /duplicate key/);
    await assert.rejects(db.query('update public.wing_jury_votes set vote=1 where submission_id=$1 and user_id=$2', [ids.photo, ids.user]), /permission denied|UPDATE/);
    await assert.rejects(db.query('delete from public.wing_jury_votes where submission_id=$1 and user_id=$2', [ids.photo, ids.user]), /permission denied|DELETE/);
    await db.exec(`select set_config('request.jwt.claim.sub','${ids.otherUser}',false); select set_config('request.jwt.claims','{"is_anonymous":false}',false)`);
    await db.query('insert into public.wing_jury_votes values ($1,$2,1)', [ids.photo, ids.otherUser]);
    assert.deepEqual((await db.query('select like_count,neutral_count,dislike_count from public.wing_jury_photo_vote_counts where submission_id=$1', [ids.photo])).rows[0], { like_count: 1, neutral_count: 1, dislike_count: 0 });
    assert.equal((await db.query('select like_count from public.wing_media_submissions where id=$1', [ids.photo])).rows[0].like_count, 0);
    assert.equal((await db.query('select count(*)::int as n from public.wing_media_photo_votes')).rows[0].n, 0);
    assert.equal((await db.query('select count(*)::int as n from public.destination_ratings')).rows[0].n, 0);
  } finally { await db.close(); }
});

test('concurrent duplicate submissions resolve to one immutable Wing Jury row', async () => {
  const db = await fixture();
  try {
    await asUser(db, ids.user);
    const results = await Promise.allSettled([
      db.query('insert into public.wing_jury_votes values ($1,$2,1)', [ids.photo, ids.user]),
      db.query('insert into public.wing_jury_votes values ($1,$2,1)', [ids.photo, ids.user]),
    ]);
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
    assert.equal((await db.query('select count(*)::int as n from public.wing_jury_votes')).rows[0].n, 1);
    assert.equal((await db.query('select like_count from public.wing_jury_photo_vote_counts where submission_id=$1', [ids.photo])).rows[0].like_count, 1);
  } finally { await db.close(); }
});

test('invalid photo eligibility and vote values fail closed', async () => {
  const db = await fixture();
  try {
    await asUser(db, ids.user);
    await assert.rejects(db.query('insert into public.wing_jury_votes values ($1,$2,2)', [ids.photo, ids.user]), /check constraint|vote/);
    await db.query("update public.wing_media_submissions set status='processing' where id=$1", [ids.photo]);
    await assert.rejects(db.query('insert into public.wing_jury_votes values ($1,$2,1)', [ids.photo, ids.user]), /photo_is_not_eligible/);
  } finally { await db.close(); }
});

test('local contract documents all rating completion entry points and no historical migration registration', async () => {
  assert.match(sql, /after insert on public\.destination_ratings/);
  assert.match(sql, /remove_want_to_try_after_rating/);
  assert.doesNotMatch(sql, /supabase_migrations|migration_integrity|migration repair/i);
  for (const path of ['app/(tabs)/home/index.jsx', 'app/crawl/[id].jsx', 'app/auth/callback.jsx']) {
    const source = await readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
    if (path === 'app/auth/callback.jsx') {
      assert.match(source, /applyOnboardingSeedRatingIfAny/);
      assert.match(source, /submitBuffacoinRatingTransaction/);
    } else {
      assert.match(source, /destination_ratings/);
    }
  }
});
