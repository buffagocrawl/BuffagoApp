// Review-only SQL verified in an isolated database; never applied remotely.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
test('owner-only vote proposal returns authoritative zero and persisted totals without leaking private photos', async () => {
  const db = new PGlite();
  const owner = '00000000-0000-4000-8000-000000000001';
  const other = '00000000-0000-4000-8000-000000000002';
  const photo = '00000000-0000-4000-8000-000000000003';
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('qa.uid',true),'')::uuid $$;
      create function auth.jwt() returns jsonb language sql as $$ select coalesce(nullif(current_setting('qa.jwt',true),''),'{}')::jsonb $$;
      create table wing_media_submissions(id uuid primary key,user_id uuid,media_type text,status text,owner_deleted_at timestamptz,withdrawn_at timestamptz);
      create table wing_jury_photo_vote_counts(submission_id uuid primary key,like_count integer,dislike_count integer,neutral_count integer);`);
    await db.exec(readFileSync(new URL('../docs/android-qa-round-3-owner-vote-counts-proposal.sql',import.meta.url),'utf8'));
    await db.query("insert into wing_media_submissions values($1,$2,'photo','approved',null,null)",[photo,owner]);
    const read = async () => (await db.query('select * from get_my_wing_shot_jury_counts($1::uuid[])',[[photo]])).rows;
    const identity = async (id, anonymous=false) => {
      await db.query("select set_config('qa.uid',$1,false),set_config('qa.jwt',$2,false)",[id,JSON.stringify({is_anonymous:anonymous})]);
    };
    await identity(''); assert.deepEqual(await read(),[]);
    await identity(other); assert.deepEqual(await read(),[]);
    await identity(owner,true); assert.deepEqual(await read(),[]);
    await identity(owner); assert.deepEqual(await read(),[{submission_id:photo,like_count:0,dislike_count:0,neutral_count:0}]);
    await db.query('insert into wing_jury_photo_vote_counts values($1,7,2,3)',[photo]);
    assert.deepEqual(await read(),[{submission_id:photo,like_count:7,dislike_count:2,neutral_count:3}]);
    for(const status of ['uploaded','in_review','rejected','failed','withdrawn']) {
      await db.query('update wing_media_submissions set status=$1',[status]); assert.deepEqual(await read(),[]);
    }
    await db.exec("update wing_media_submissions set status='approved',owner_deleted_at=now()"); assert.deepEqual(await read(),[]);
    const roles = (await db.query("select has_function_privilege('anon','get_my_wing_shot_jury_counts(uuid[])','EXECUTE') as anon, has_function_privilege('authenticated','get_my_wing_shot_jury_counts(uuid[])','EXECUTE') as authenticated")).rows[0];
    assert.deepEqual(roles,{anon:false,authenticated:true});
  } finally { await db.close(); }
});
