import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migration = readFileSync(new URL('../supabase/migrations/20261008232910_wing_photo_vote_gallery_eligibility.sql', import.meta.url), 'utf8');
const owner = '11111111-1111-4111-8111-111111111111';
const voter = '22222222-2222-4222-8222-222222222222';
const another = '33333333-3333-4333-8333-333333333333';
const photo = '44444444-4444-4444-8444-444444444444';
const otherPhoto = '55555555-5555-4555-8555-555555555555';

test('photo vote trigger enforces gallery eligibility and keeps persisted counters accurate', async (t) => {
  const db = new PGlite();
  try {
    await db.exec(`
      create schema auth; create schema private; create schema storage;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create function auth.jwt() returns jsonb language sql stable as $$
        select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb) $$;
      create table storage.objects(bucket_id text, name text, primary key(bucket_id,name));
      create table public.wing_media_submissions(
        id uuid primary key, user_id uuid, media_type text not null, status text not null,
        owner_deleted_at timestamptz, withdrawn_at timestamptz,
        consent_version text, consented_at timestamptz, attribution_preference text,
        processed_storage_path text, like_count integer not null default 0,
        dislike_count integer not null default 0);
      create table public.wing_media_photo_votes(
        submission_id uuid not null references public.wing_media_submissions(id),
        user_id uuid not null, vote smallint not null check(vote in (-1,1)),
        updated_at timestamptz not null default now(), primary key(submission_id,user_id));
    `);
    await db.exec(migration);
    await db.exec(`
      create trigger trg_validate_wing_media_photo_vote before insert or update
        on public.wing_media_photo_votes for each row execute function private.validate_wing_media_photo_vote();
      create trigger trg_refresh_wing_media_photo_vote_counts after insert or update or delete
        on public.wing_media_photo_votes for each row execute function private.refresh_wing_media_photo_vote_counts();
      insert into public.wing_media_submissions(id,user_id,media_type,status,consent_version,
        consented_at,attribution_preference,processed_storage_path)
      values ('${photo}','${owner}','photo','approved','v1',now(),'anonymous','processed/${photo}/primary'),
             ('${otherPhoto}','${owner}','photo','approved','v1',now(),'anonymous','processed/${otherPhoto}/primary');
      insert into storage.objects values('wing-submissions','processed/${photo}/primary'),
                                       ('wing-submissions','processed/${otherPhoto}/primary');
      select set_config('request.jwt.claim.sub','${voter}',false);
      select set_config('request.jwt.claims','{"is_anonymous":false}',false);
    `);
    const counts = async () => (await db.query(`select like_count,dislike_count from public.wing_media_submissions where id=$1`, [photo])).rows[0];
    const vote = (uid, choice) => db.query(`insert into public.wing_media_photo_votes(submission_id,user_id,vote)
      values($1,$2,$3) on conflict(submission_id,user_id) do update set vote=excluded.vote`, [photo,uid,choice]);
    await t.test('whitespace-only consent versions match the public gallery rejection', async () => {
      // String.trim whitespace includes Unicode characters that SQL btrim alone retains.
      const whitespace = '\u0009\u000a\u000b\u000c\u000d\u0020\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff';
      for (const consent of ['', ...whitespace, whitespace]) {
        assert.equal(consent.trim(), '');
        await db.query('update public.wing_media_submissions set consent_version=$1 where id=$2', [consent, photo]);
        await assert.rejects(vote(voter, 1), /not eligible/, `consent ${JSON.stringify(consent)}`);
        assert.deepEqual(await counts(), { like_count: 0, dislike_count: 0 });
      }
      await db.query('update public.wing_media_submissions set consent_version=$1 where id=$2', ['v1', photo]);
    });
    await vote(voter, 1); assert.deepEqual(await counts(), { like_count: 1, dislike_count: 0 });
    await vote(voter, -1); assert.deepEqual(await counts(), { like_count: 0, dislike_count: 1 });
    await db.query(`delete from public.wing_media_photo_votes where submission_id=$1 and user_id=$2`, [photo,voter]);
    assert.deepEqual(await counts(), { like_count: 0, dislike_count: 0 });
    await db.exec(`select set_config('request.jwt.claim.sub','${another}',false)`);
    await vote(another, 1);
    await assert.rejects(vote(voter, 1), /signed-in user/);
    await assert.rejects(db.query(`update public.wing_media_photo_votes set submission_id=$1 where submission_id=$2`,[otherPhoto,photo]), /identity cannot change/);
    await db.exec(`select set_config('request.jwt.claims','{"is_anonymous":true}',false)`);
    await assert.rejects(vote(another, -1), /signed-in user/);
    await db.exec(`select set_config('request.jwt.claims','{"is_anonymous":false}',false)`);
    for (const change of [
      `update public.wing_media_submissions set status='withdrawn',withdrawn_at=now() where id='${photo}'`,
      `update public.wing_media_submissions set status='approved',withdrawn_at=null,owner_deleted_at=now(),user_id=null where id='${photo}'`,
      `update public.wing_media_submissions set owner_deleted_at=null,user_id='${owner}',consent_version=' ' where id='${photo}'`,
      `update public.wing_media_submissions set consent_version='v1',processed_storage_path=null where id='${photo}'`,
    ]) {
      await db.exec(change);
      await assert.rejects(vote(another, -1), /not eligible/);
    }
    await db.exec(`update public.wing_media_submissions
      set processed_storage_path='processed/${otherPhoto}/primary' where id='${photo}'`);
    await assert.rejects(vote(another, -1), /not eligible/);
    await db.exec(`insert into storage.objects values('wing-submissions','originals/${photo}/upload');
      update public.wing_media_submissions
      set processed_storage_path='originals/${photo}/upload' where id='${photo}'`);
    await assert.rejects(vote(another, -1), /not eligible/);
    await db.exec(`update public.wing_media_submissions set processed_storage_path='processed/${photo}/primary' where id='${photo}';
      delete from storage.objects where name='processed/${photo}/primary';`);
    await assert.rejects(vote(another, -1), /not eligible/);
    await db.query(`delete from public.wing_media_photo_votes where submission_id=$1 and user_id=$2`, [photo,another]);
    assert.deepEqual(await counts(), { like_count: 0, dislike_count: 0 });

    await t.test('own-user RLS contract denies cross-account reads and mutations', async () => {
      // Reproduce the catalog-reviewed production policies in an isolated fixture.
      // This verifies the prepared trigger under RLS; it does not certify live RLS.
      await db.exec(`
        create role authenticated; create role anon;
        grant usage on schema public, auth to authenticated, anon;
        grant select, insert, update, delete on public.wing_media_photo_votes to authenticated;
        alter table public.wing_media_photo_votes enable row level security;
        create policy own_select on public.wing_media_photo_votes for select to authenticated
          using (user_id = (select auth.uid()));
        create policy own_insert on public.wing_media_photo_votes for insert to authenticated
          with check (user_id = (select auth.uid()));
        create policy own_update on public.wing_media_photo_votes for update to authenticated
          using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
        create policy own_delete on public.wing_media_photo_votes for delete to authenticated
          using (user_id = (select auth.uid()));
        insert into storage.objects values('wing-submissions','processed/${photo}/primary');
        select set_config('request.jwt.claim.sub','${voter}',false);
        set role authenticated;
      `);
      await vote(voter, 1);
      await vote(voter, 1); // Retrying the same request retains one active vote.
      assert.equal((await db.query('select * from public.wing_media_photo_votes')).rows.length, 1);
      await db.exec('reset role');
      assert.deepEqual(await counts(), { like_count: 1, dislike_count: 0 });
      await db.exec(`select set_config('request.jwt.claim.sub','${another}',false); set role authenticated`);
      assert.deepEqual((await db.query('select * from public.wing_media_photo_votes')).rows, []);
      assert.equal((await db.query('delete from public.wing_media_photo_votes where user_id=$1 returning *', [voter])).rows.length, 0);
      assert.equal((await db.query('update public.wing_media_photo_votes set vote=-1 where user_id=$1 returning *', [voter])).rows.length, 0);
      await assert.rejects(vote(voter, -1), /signed-in user|row-level security/);
      await vote(another, -1);
      await assert.rejects(db.query('update public.wing_media_photo_votes set user_id=$1 where user_id=$2', [voter,another]), /identity cannot change|row-level security/);
      await db.exec(`select set_config('request.jwt.claims','{"is_anonymous":true}',false)`);
      await assert.rejects(vote(another, 1), /signed-in user/);
      await db.exec(`reset role; set role anon`);
      await assert.rejects(db.query('select * from public.wing_media_photo_votes'), /permission denied/);
      await assert.rejects(vote(another, 1), /permission denied/);
      await db.exec(`reset role; select set_config('request.jwt.claims','{"is_anonymous":false}',false)`);
      assert.deepEqual(await counts(), { like_count: 1, dislike_count: 1 });
      await db.exec(`update public.wing_media_submissions set withdrawn_at=now() where id='${photo}';
        select set_config('request.jwt.claim.sub','${voter}',false); set role authenticated`);
      await assert.rejects(vote(voter, -1), /not eligible/);
      await db.query('delete from public.wing_media_photo_votes where user_id=$1', [voter]);
      await db.exec('reset role');
      assert.deepEqual(await counts(), { like_count: 0, dislike_count: 1 });
    });
  } finally { await db.close(); }
});
