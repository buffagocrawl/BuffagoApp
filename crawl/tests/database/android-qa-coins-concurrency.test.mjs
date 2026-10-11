import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { startDisposablePostgres, fixture, query, session, observeBlocked } from '../../scripts/phase7b25-postgres.mjs';
const bootstrap=new URL('./fixtures/android-qa-coins.sql',import.meta.url);
const migration=new URL('../../supabase/migrations/20261011141411_android_qa_coin_bonuses.sql',import.meta.url);
const credit=await readFile(new URL('../../../docs/android-qa-early-bird-credit-approval.sql',import.meta.url),'utf8');
before(startDisposablePostgres);
test('real PostgreSQL concurrent signup and credit retries cannot duplicate bonuses', async () => {
  const db=await fixture({bootstrap,migration});
  const user='00000000-0000-4000-8000-000000000010';
  const signup=`insert into auth.users(id) values('${user}') on conflict do nothing`;
  const holder=session(db,'android-qa-signup-holder');
  try {
    await holder.execute(`begin; ${signup};`);
    const retry=query(db,signup,'android-qa-signup-retry');
    await observeBlocked(db,'android-qa-signup-retry');
    await holder.execute('commit'); await retry;
    assert.equal(await query(db,`select balance from public.buffacoin_wallets where user_id='${user}'`),'100');
    assert.equal(await query(db,`select count(*) from public.buffacoin_ledger where user_id='${user}'`),'1');
  } finally { await holder.close(); }
  await Promise.all([query(db,credit,'android-qa-credit-1'),query(db,credit,'android-qa-credit-2')]);
  assert.equal(await query(db,"select count(*) || ':' || sum(delta) from public.buffacoin_ledger where reason='Early Bird Bonus — 250 BuffaCoins'"),'2:500');
  assert.equal(await query(db,"select balance from public.buffacoin_wallets where user_id='00000000-0000-4000-8000-000000000001'"),'267');
  assert.equal(await query(db,"select balance from public.buffacoin_wallets where user_id='00000000-0000-4000-8000-000000000002'"),'250');
});
