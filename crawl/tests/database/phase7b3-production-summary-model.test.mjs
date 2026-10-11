import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { startDisposablePostgres, fixture, query, asUser, ids } from '../../scripts/phase7b25-postgres.mjs';

// Reported RV02/RV04 behavior atop the reduced fixture. This is deliberately
// NOT a production schema pack. Local-source candidates are not deployed bytes.
before(startDisposablePostgres);
const insertRating = `insert into public.destination_ratings(id,user_id,destination_id,crawl_id,weight_score)
  values('${ids.rating}','${ids.user}','${ids.destination}','${ids.crawl}',4)`;
const want = `insert into public.user_want_to_try values('${ids.user}','${ids.destination}',now())`;
const vote = `insert into public.wing_jury_votes(submission_id,user_id,vote) values('${ids.photo}','${ids.user}',1)`;
const n = (db, table) => query(db, `select count(*) from public.${table}`);

async function lifecycleModel() {
  const db = await fixture();
  const source = await readFile(new URL('../../supabase/migrations/20260729121000_wing_shots_security_rpc.sql', import.meta.url), 'utf8');
  const pseudonymization = source.match(/create or replace function public\.wing_apply_owner_pseudonymization\(\)[\s\S]*?\$\$;/)?.[0];
  assert.ok(pseudonymization, 'Use the actual local candidate, never reconstruct a production body');
  await query(db, `alter table public.wing_media_submissions
    add column rating_id uuid references public.destination_ratings(id) on delete restrict,
    add constraint rv02_destination_fk foreign key(destination_id) references public.destinations(id) on delete restrict,
    add constraint rv02_owner_fk foreign key(user_id) references auth.users(id) on delete set null;
    ${pseudonymization}
    create trigger wing_media_submissions_owner_pseudonymization before update of user_id
    on public.wing_media_submissions for each row execute function public.wing_apply_owner_pseudonymization();`);
  return db;
}

test('RV04 public rating reads do not expose the new private collections', async () => {
  const db = await fixture();
  await query(db, `grant select,update,trigger on public.destination_ratings to anon,authenticated;
    create policy "public read ratings" on public.destination_ratings for select to public using(true);
    ${insertRating}; ${asUser()} ${want.replace('user_want_to_try', 'user_destination_favorites')}`);
  assert.equal(await query(db, 'set role anon; select count(*) from public.destination_ratings'), '1');
  await assert.rejects(query(db, 'set role anon; select * from public.user_destination_favorites'), /42501/);
  assert.match(await query(db, `${asUser(ids.other)} select count(*) from public.user_destination_favorites`), /\n0$/);
  assert.equal(await query(db, `select has_table_privilege('authenticated','public.user_destination_favorites','TRIGGER')`), 'f');
});

test('RV02 linked-rating RESTRICT rolls back favorite cleanup; unlink permits final cleanup', async () => {
  const db = await lifecycleModel();
  await query(db, `${insertRating}; update public.wing_media_submissions set rating_id='${ids.rating}';
    ${asUser()} insert into public.user_destination_favorites values('${ids.user}','${ids.destination}',now())`);
  await assert.rejects(query(db, `delete from public.destination_ratings where id='${ids.rating}'`), /23503/);
  assert.equal(await n(db, 'destination_ratings'), '1');
  assert.equal(await n(db, 'user_destination_favorites'), '1');
  await query(db, `update public.wing_media_submissions set rating_id=null; delete from public.destination_ratings where id='${ids.rating}'`);
  assert.equal(await n(db, 'user_destination_favorites'), '0');
});

test('RV02 owner SET NULL with local pseudonymization candidate coexists with Jury account cascade', async () => {
  const db = await lifecycleModel();
  await query(db, `${asUser()} ${vote}; reset role; delete from auth.users where id='${ids.user}';
    delete from auth.users where id='${ids.other}'`);
  assert.equal(await n(db, 'wing_jury_votes'), '0');
  assert.equal(await query(db, `select like_count from public.wing_jury_photo_vote_counts where submission_id='${ids.photo}'`), '0');
  assert.equal(await query(db, `select user_id is null and owner_deleted_at is not null from public.wing_media_submissions where id='${ids.photo}'`), 't');
  assert.equal(await query(db, `select private.is_public_wing_jury_photo('${ids.photo}')`), 'f');
});

test('RV02 linked-media account cascade is blocked atomically; Jury does not repair existing deletion', async () => {
  const db = await lifecycleModel();
  await query(db, `${insertRating}; update public.wing_media_submissions set rating_id='${ids.rating}'; ${asUser()} ${vote}`);
  await assert.rejects(query(db, `delete from auth.users where id='${ids.user}'`), /23503/);
  assert.equal(await query(db, `select count(*) from auth.users where id='${ids.user}'`), '1');
  assert.equal(await n(db, 'destination_ratings'), '1');
  assert.equal(await n(db, 'wing_jury_votes'), '1');
  assert.equal(await query(db, `select like_count from public.wing_jury_photo_vote_counts where submission_id='${ids.photo}'`), '1');
});

test('local Buffacoin guard candidate and AFTER witnesses preserve cleanup atomicity and order', async () => {
  const db = await fixture();
  const source = await readFile(new URL('../../supabase/migrations/20260729153000_serrano_trust_repair.sql', import.meta.url), 'utf8');
  const guard = source.match(/create or replace function public\.guard_buffacoin_rating_writes\(\)[\s\S]*?\$\$;/)?.[0];
  assert.ok(guard);
  // Witnesses exercise event order and rollback, not reward/notification parity.
  await query(db, `alter table public.destination_ratings add column is_buffacoin boolean not null default false;
    ${guard}
    create trigger guard_buffacoin_rating_writes before insert or update of is_buffacoin
    on public.destination_ratings for each row execute function public.guard_buffacoin_rating_writes();
    create table public.rv03_witness(name text, want_count bigint);
    create function public.rv03_witness() returns trigger language plpgsql as $$ begin
      insert into public.rv03_witness select tg_name,count(*) from public.user_want_to_try;
      if current_setting('buffago.test_after_failure',true)='on' then raise exception 'synthetic_after_failure'; end if;
      return new; end $$;
    create trigger destination_rating_friend_notification after insert on public.destination_ratings for each row execute function public.rv03_witness();
    create trigger trg_rating_after_insert after insert on public.destination_ratings for each row execute function public.rv03_witness();
    ${asUser()} ${want}`);
  const buffacoin = insertRating.replace('weight_score)', 'weight_score,is_buffacoin)').replace(',4)', ',4,true)');
  await assert.rejects(query(db, `${asUser()} ${buffacoin}`), /buffacoin_rating_requires_atomic_transaction/);
  assert.equal(await n(db, 'user_want_to_try'), '1');
  await assert.rejects(query(db, `set buffago.test_after_failure='on'; ${asUser()} ${insertRating}`), /synthetic_after_failure/);
  assert.equal(await n(db, 'user_want_to_try'), '1');
  assert.equal(await n(db, 'rv03_witness'), '0');
  await query(db, `set buffago.atomic_buffacoin_write='on'; ${asUser()} ${buffacoin}`);
  assert.equal(await n(db, 'user_want_to_try'), '0');
  assert.equal(await query(db, 'select string_agg(name || chr(58) || want_count,chr(44) order by name) from public.rv03_witness'),
    'destination_rating_friend_notification:1,trg_rating_after_insert:0');
});
