import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const migration = read('../supabase/migrations/20260729153000_serrano_trust_repair.sql');
const start = migration.indexOf('create or replace function public.submit_buffacoin_rating_v1(');
const deployedFunction = migration.slice(start, migration.indexOf('\n$$;', start) + 4);
const user = '10000000-0000-4000-a000-000000000001';
const destination = '20000000-0000-4000-a000-000000000001';
const operation = '30000000-0000-4000-a000-000000000001';
const otherOperation = '30000000-0000-4000-a000-000000000002';
const rating = { sauce: 8, crispiness: 8, meat: 8, overall: 9 };

test('actual PostgreSQL transaction reproduces deployed failure and proposed fix commits exactly once', async () => {
  const db = new PGlite();
  try {
    await db.exec(read('./helpers/buffacoin-transaction-fixture.sql'));
    await db.exec(deployedFunction);
    await db.exec(`select set_config('request.jwt.claim.sub','${user}',false); insert into states values(1,'NY'); insert into destinations values('${destination}',1); insert into buffacoin_wallets(user_id,balance) values('${user}',10);`);
    const submit = (id = operation, values = rating, cost = 1) => db.query('select * from submit_buffacoin_rating_v1($1,$2,$3,$4,$5)', [id,destination,'NY',cost,values]);
    await assert.rejects(submit(), (error) => error.code === '42703' && /c.created_at/.test(error.message));
    assert.equal((await db.query('select balance from buffacoin_wallets')).rows[0].balance,10);
    assert.equal((await db.query('select count(*)::int count from destination_ratings')).rows[0].count,0);
    // Proposal is a complete replacement function, never a migration replay.
    await db.exec(read('../supabase/proposals/android-qa-issue14-buffacoin-confirmation.sql'));
    const first = (await submit()).rows[0];
    const retries = await Promise.all(Array.from({length:8}, () => submit()));
    for (const result of retries) assert.deepEqual(result.rows[0],first);
    const retry = retries[0].rows[0];
    assert.deepEqual(retry,first);
    assert.equal(first.operation_id,operation);
    assert.equal(first.new_balance,9);
    const counts = (await db.query('select (select count(*)::int from destination_ratings) ratings,(select count(*)::int from buffacoin_ledger) debits,(select count(*)::int from buffacoin_rating_operations) receipts,(select count(*)::int from crawls) crawls')).rows[0];
    assert.deepEqual(counts,{ratings:1,debits:1,receipts:1,crawls:1});
    const verified=(await db.query(`select o.rating_id=r.id and o.debit_ledger_id=l.id
      and o.user_id=r.user_id and o.user_id=l.user_id and o.destination_id=r.destination_id
      and o.destination_id=l.destination_id and l.delta=-o.coin_cost
      and o.new_balance=w.balance as verified from buffacoin_rating_operations o
      join destination_ratings r on r.buffacoin_operation_id=o.operation_id
      join buffacoin_ledger l on l.id=o.debit_ledger_id
      join buffacoin_wallets w on w.user_id=o.user_id`)).rows[0];
    assert.equal(verified.verified,true);
    await assert.rejects(db.query('select * from submit_buffacoin_rating_v1($1,$2,$3,$4,$5)', [otherOperation,destination,'NY',10,rating]), /coin_cost_mismatch/);
    assert.equal((await db.query('select balance from buffacoin_wallets')).rows[0].balance,9);
    await assert.rejects(submit(otherOperation,{...rating,overall:99},2),error => error.code === '23514');
    assert.equal((await db.query('select balance from buffacoin_wallets')).rows[0].balance,9,'failed rating rolls back debit');
    assert.equal((await db.query('select count(*)::int count from buffacoin_ledger')).rows[0].count,1);
    assert.equal((await db.query('select count(*)::int count from buffacoin_rating_operations')).rows[0].count,1);
    assert.equal((await db.query('select count(*)::int count from destination_ratings')).rows[0].count,1);
    assert.equal((await db.query('select delta from buffacoin_ledger')).rows[0].delta,-1);
    await db.exec('update buffacoin_wallets set balance=1');
    await assert.rejects(submit(otherOperation,rating,2),/insufficient_balance/);
    await db.exec("select set_config('request.jwt.claim.sub','10000000-0000-4000-a000-000000000002',false)");
    await assert.rejects(submit(),/operation_ownership_mismatch/);
  } finally { await db.close(); }
});
