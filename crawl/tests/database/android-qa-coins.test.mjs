import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const migration = await readFile(new URL('../../supabase/migrations/20261011141411_android_qa_coin_bonuses.sql', import.meta.url), 'utf8');
const credit = await readFile(new URL('../../../docs/android-qa-early-bird-credit-approval.sql', import.meta.url), 'utf8');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;

test('welcome and Early Bird use committed ledger deltas, fixed eligibility, and once-only awards', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth;
      create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create table auth.users(id uuid primary key, created_at timestamptz default now(), deleted_at timestamptz, is_anonymous boolean default false);
      create table public.users(user_id uuid primary key references auth.users(id));
      create table public.buffacoin_wallets(user_id uuid primary key references auth.users(id), balance integer default 0);
      create table public.buffacoin_ledger(id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id), delta integer, reason text, created_at timestamptz default now());
      create function public.buffacoin_apply_ledger_delta() returns trigger language plpgsql security definer as $$begin
        insert into public.buffacoin_wallets(user_id,balance) values(new.user_id,0) on conflict do nothing;
        update public.buffacoin_wallets set balance=balance+new.delta where user_id=new.user_id; return new; end$$;
      create trigger apply_delta after insert on public.buffacoin_ledger for each row execute function public.buffacoin_apply_ledger_delta();
      create function public.give_new_user_starting_coins() returns trigger language plpgsql security definer as $$begin
        insert into public.buffacoin_ledger(user_id,delta,reason) values(new.user_id,3,'new_user_starter_coins'); return new; end$$;
      create trigger starter after insert on public.users for each row execute function public.give_new_user_starting_coins();
      create function public.handle_new_auth_user() returns trigger language plpgsql security definer as $$begin
        insert into public.users values(new.id) on conflict do nothing; return new; end$$;
      create trigger profile after insert on auth.users for each row execute function public.handle_new_auth_user();
      insert into auth.users(id,created_at) values('${id(1)}','2026-10-01'),('${id(2)}','2026-10-01'),('${id(3)}','2026-10-12');
      update public.buffacoin_wallets set balance=17 where user_id='${id(1)}';
      delete from public.buffacoin_wallets where user_id='${id(2)}';
      insert into auth.users(id,created_at,is_anonymous) values('${id(4)}','2026-10-01',true);
      insert into auth.users(id,created_at,deleted_at) values('${id(5)}','2026-10-01','2026-10-02');`);
    await db.exec(migration);
    const balance = async n => (await db.query(`select balance from public.buffacoin_wallets where user_id='${id(n)}'`)).rows[0]?.balance;
    assert.equal(await balance(1),17, 'migration leaves existing balances unchanged');
    assert.equal((await db.query('select count(*)::int as n from public.android_qa_early_bird_eligibility')).rows[0].n,2);
    await db.exec(`insert into auth.users(id) values('${id(6)}');`);
    assert.equal(await balance(6),100);
    await db.exec(`insert into auth.users(id) values('${id(6)}') on conflict do nothing;
      insert into public.users values('${id(6)}') on conflict do nothing;
      delete from public.users where user_id='${id(6)}'; insert into public.users values('${id(6)}');`);
    assert.equal(await balance(6),100, 'signup/profile retries do not award again');
    await db.exec(credit);
    assert.equal(await balance(1),267);
    assert.equal(await balance(2),250, 'uninitialized wallet gets additive bonus');
    assert.equal(await balance(3),3, 'post-cutoff account excluded');
    assert.equal(await balance(6),100, 'new account excluded');
    await db.exec(credit);
    assert.equal(await balance(1),267);
    assert.equal((await db.query("select sum(delta)::int as total from public.buffacoin_ledger where reason='Early Bird Bonus — 250 BuffaCoins'")).rows[0].total,500);
    await db.exec('grant usage on schema public to authenticated; grant insert on public.buffacoin_ledger to authenticated;');
    await assert.rejects(db.exec(`set role authenticated; insert into public.buffacoin_ledger(user_id,delta,reason) values('${id(6)}',100,'Welcome Bonus — 100 BuffaCoins');`), /server-authoritative/);
    await db.exec('reset role;');
    await assert.rejects(db.exec(`insert into public.buffacoin_ledger(user_id,delta,reason) values('${id(6)}',250,'Early Bird Bonus — 250 BuffaCoins');`), /Invalid Early Bird/);
    await db.exec(`insert into public.buffacoin_ledger(user_id,delta,reason) values('${id(6)}',1,'onboarding_seed_bonus');`);
    assert.equal(await balance(6),100, 'legacy seed bonus cannot inflate welcome balance');
    await db.exec(`alter table auth.users add column raw_app_meta_data jsonb;
      insert into auth.users(id,raw_app_meta_data) values
        ('${id(7)}','{"provider":"email"}'), ('${id(8)}','{"provider":"google"}'), ('${id(9)}','{"provider":"facebook"}');
      insert into auth.users(id,is_anonymous) values('${id(10)}',true);`);
    for (const n of [7,8,9]) assert.equal(await balance(n),100, 'signup providers share the auth trigger');
    assert.equal(await balance(10),undefined, 'anonymous auth excluded');
    await db.exec(`grant select on public.buffacoin_ledger to authenticated;
      set request.jwt.claim.sub='${id(6)}'; set role authenticated;
      insert into public.buffacoin_bonus_notice_ack(ledger_id,user_id)
      select id,user_id from public.buffacoin_ledger where user_id='${id(6)}' and reason='Welcome Bonus — 100 BuffaCoins';`);
    assert.equal((await db.query('select count(*)::int as n from public.buffacoin_bonus_notice_ack')).rows[0].n,1);
    await assert.rejects(db.exec(`insert into public.buffacoin_bonus_notice_ack(ledger_id,user_id)
      select id,'${id(6)}'::uuid from public.buffacoin_ledger where user_id='${id(7)}';`), /row-level security/);
    await db.exec(`reset role; set request.jwt.claim.sub='${id(7)}'; set role authenticated;`);
    assert.equal((await db.query('select count(*)::int as n from public.buffacoin_bonus_notice_ack')).rows[0].n,0, 'acknowledgements private to each account');
    await db.exec('reset role;');
    await db.exec(`insert into public.buffacoin_ledger(user_id,delta,reason) values('${id(6)}',-1,'rating');`);
    assert.equal(await balance(6),99, 'welcome coins immediately spendable through ledger');
  } finally { await db.close(); }
});
