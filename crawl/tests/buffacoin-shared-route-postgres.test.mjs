import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';

const read = p => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const proposal = read('../supabase/proposals/android-qa-round-3-buffacoin-shared-route.sql');
const prior = read('../supabase/proposals/android-qa-issue14-buffacoin-confirmation.sql');
const functionOf = s => s.slice(s.toLowerCase().indexOf('create or replace function public.submit'), s.indexOf('\n$$;') + 4);

test('only route/crawl resolution changes; signature, payment and rating code remain identical', () => {
  const outsideResolution = s => functionOf(s).replace(/  (?:-- Token routes are shared by state[^]*?|select c.crawl_id into v_crawl_id[^]*?)\n  insert into public.buffacoin_ledger/, '\n  insert into public.buffacoin_ledger');
  assert.equal(outsideResolution(proposal), outsideResolution(prior));
  assert.equal((proposal.match(/create or replace function/gi) || []).length, 1);
  assert.doesNotMatch(proposal, /(?:alter table|create index|grant |revoke |update public.routes)/i);
});

test('production constraints: shared routes, history, retries, concurrency and atomic rollback', async t => {
  const bin = 'C:/Program Files/PostgreSQL/18/bin';
  const dir = mkdtempSync(join(tmpdir(), 'buffago-shared-route-'));
  const port = 55441;
  const run = promisify(execFile);
  const sync = (name, args) => execFileSync(join(bin, name + '.exe'), args, { encoding: 'utf8', windowsHide: true, ...(name==='psql' ? {} : {stdio:'ignore'}) });
  const args = ['-h','127.0.0.1','-p',String(port),'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-At'];
  const sql = s => sync('psql', [...args,'-c',s]).trim();
  const asyncSql = s => run(join(bin,'psql.exe'), [...args,'-c',s], { windowsHide:true });
  const user = n => `10000000-0000-4000-a000-${String(n).padStart(12,'0')}`;
  const op = n => `30000000-0000-4000-a000-${String(n).padStart(12,'0')}`;
  const dest = n => `20000000-0000-4000-a000-${String(n).padStart(12,'0')}`;
  const route = '40000000-0000-4000-a000-000000000001';
  const crawl = '50000000-0000-4000-a000-000000000001';
  const payload = overall => JSON.stringify({sauce:8,crispiness:8,meat:8,overall,wings_eaten:6,flavor_vibe:[1,2],would_order_again:true});
  const submit = (u,o,state='CT',cost=1,overall=9) => `set role authenticated; select set_config('request.jwt.claim.sub','${user(u)}',false); select row_to_json(r) from public.submit_buffacoin_rating_v1('${op(o)}','${dest(state==='CT'?1:2)}','${state}',${cost},'${payload(overall)}') r;`;
  const receipt = s => JSON.parse(s.trim().split('\n').at(-1));
  const snapshot = () => sql("select json_build_object('wallets',(select json_agg(w order by user_id) from buffacoin_wallets w),'routes',(select json_agg(r order by id) from routes r),'crawls',(select json_agg(c order by crawl_id) from crawls c),'ratings',(select json_agg(r order by id) from destination_ratings r),'ledger',(select json_agg(l order by id) from buffacoin_ledger l),'receipts',(select json_agg(o order by operation_id) from buffacoin_rating_operations o))");
  let started = false;
  try {
    sync('initdb',['-D',dir,'-U','postgres','-A','trust','--no-locale']);
    sync('pg_ctl',['-D',dir,'-l',join(dir,'server.log'),'-o',`-p ${port} -h 127.0.0.1`,'-w','start']); started=true;
    sql(read('./helpers/buffacoin-transaction-fixture.sql'));
    const guardMigration=read('../supabase/migrations/20260729153000_serrano_trust_repair.sql');
    sql(guardMigration.slice(guardMigration.indexOf('create or replace function public.guard_buffacoin_rating_writes()'),guardMigration.indexOf('create or replace function public.submit_buffacoin_rating_v1(')));
    // Exact production definitions independently read from pg_constraint/pg_indexes.
    sql(`alter table routes add constraint routes_title_city_key unique(title,city);
      create unique index routes_token_route_unique on routes(city) where is_token_route=true;
      alter table crawls add constraint crawls_route_id_required_for_route check (((is_solo=true) and (route_id is null)) or ((is_solo=false) and (route_id is not null)));
      alter table destination_ratings add column created_at timestamptz default now();
      alter table destination_ratings enable row level security;
      create policy "user can read own ratings" on destination_ratings for select using (auth.uid()=user_id);
      grant usage on schema public,auth to authenticated;
      grant select on destination_ratings,crawls,routes to authenticated;
      insert into states values(1,'CT'),(2,'NY');
      insert into destinations values('${dest(1)}',1),('${dest(2)}',2);
      ${Array.from({length:12},(_,i)=>`insert into buffacoin_wallets(user_id,balance) values('${user(i+1)}',30);`).join('\n')}
      insert into routes values('${route}','Wingdex Token Crawl (CT)','CT','${user(12)}',false,true);
      insert into crawls(crawl_id,route_id,user_id,status,crawl_type,is_solo) values('${crawl}','${route}','${user(2)}','active','route',false);`);
    sql(functionOf(prior));
    sql('revoke all on function submit_buffacoin_rating_v1(uuid,uuid,text,integer,jsonb) from public,anon; grant execute on function submit_buffacoin_rating_v1(uuid,uuid,text,integer,jsonb) to authenticated;');
    const acl = sql("select proacl::text from pg_proc where proname='submit_buffacoin_rating_v1'");
    await t.test('deployed code reproduces unique violation without charging', async () => {
      const before=snapshot();
      await assert.rejects(asyncSql(submit(1,1)), /routes_token_route_unique/);
      assert.equal(snapshot(),before);
    });
    sql(proposal);
    assert.equal(sql("select proacl::text from pg_proc where proname='submit_buffacoin_rating_v1'"),acl);
    await t.test('first-time and existing users share canonical route and keep rating history', () => {
      const first=receipt(sql(submit(1,1)));
      const existing=receipt(sql(submit(2,2)));
      assert.equal(existing.crawl_id,crawl);
      assert.equal(sql('select count(*) from routes'),'1');
      assert.equal(sql(`select created_by from routes where id='${route}'`),user(12));
      assert.equal(sql(`select status||'|'||crawl_type||'|'||is_solo from crawls where crawl_id='${first.crawl_id}'`),'active|route|false');
      // Same owner predicate/order as app/profile/history/index.jsx, under authenticated RLS.
      const history=sql(`set role authenticated; select set_config('request.jwt.claim.sub','${user(1)}',false); select id from destination_ratings where user_id='${user(1)}' order by created_at desc;`).split('\n').at(-1);
      assert.equal(history,first.rating_id);
      assert.equal(sql(`select wings_eaten||'|'||flavor_vibe::text||'|'||would_order_again from destination_ratings where id='${first.rating_id}'`),'6|{1,2}|true');
    });
    await t.test('repeat ratings reuse crawl and price exactly; same-operation retries return one receipt', async () => {
      const first=receipt(sql(submit(1,1)));
      const repeated=receipt(sql(submit(1,3,'CT',2)));
      assert.equal(first.crawl_id,repeated.crawl_id); assert.equal(repeated.new_balance,27);
      const results=await Promise.all(Array.from({length:8},()=>asyncSql(submit(1,3,'CT',2))));
      results.forEach(r=>assert.deepEqual(receipt(r.stdout),repeated));
      const before=snapshot();
      await assert.rejects(asyncSql(submit(1,4,'CT',1)),/coin_cost_mismatch/);
      await assert.rejects(asyncSql(submit(3,3,'CT',2)),/operation_ownership_mismatch/);
      assert.equal(snapshot(),before);
    });
    await t.test('inactive crawl is retained and an active user-owned crawl is created', () => {
      sql(`insert into crawls(route_id,user_id,status,crawl_type,is_solo) values('${route}','${user(3)}','completed','route',false);`);
      sql(submit(3,5));
      assert.equal(sql(`select count(*) from crawls where user_id='${user(3)}'`),'2');
      assert.equal(sql(`select count(*) from crawls where user_id='${user(3)}' and status='completed'`),'1');
    });
    await t.test('different users concurrently create one missing-state route with separate crawls', async () => {
      // A separate writer inserts but holds the route uncommitted. All RPCs
      // initially see no route and must take ON CONFLICT + subsequent SELECT.
      const holder=asyncSql("begin; insert into routes(title,city,created_by,is_public,is_token_route) values('Wingdex Token Crawl (NY)','NY','"+user(12)+"',false,true); select pg_sleep(2); commit;");
      let sleeping=false;
      for(let i=0;i<50;i++) {
        if(sql("select count(*) from pg_stat_activity where wait_event='PgSleep'")==='1') { sleeping=true; break; }
        await new Promise(r=>setTimeout(r,20));
      }
      assert.equal(sleeping,true,'route writer must overlap RPC route creation');
      const results=await Promise.all([4,5,6,7].map(u=>asyncSql(submit(u,10+u,'NY'))));
      await holder;
      assert.equal(new Set(results.map(r=>receipt(r.stdout).crawl_id)).size,4);
      assert.equal(sql("select count(*) from routes where city='NY' and is_token_route"),'1');
      assert.equal(sql("select title from routes where city='NY'"),'Wingdex Token Crawl (NY)');
    });
    await t.test('competing operations for one first-time user create one crawl and one debit at quoted price', async () => {
      const results=await Promise.allSettled([asyncSql(submit(8,28)),asyncSql(submit(8,29))]);
      assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
      assert.match(results.find(r=>r.status==='rejected').reason.message,/coin_cost_mismatch/);
      assert.equal(sql(`select count(*) from crawls where user_id='${user(8)}'`),'1');
      assert.equal(sql(`select balance from buffacoin_wallets where user_id='${user(8)}'`),'29');
    });
    await t.test('invalid rating rolls back new crawl, ledger, wallet and receipt', async () => {
      const before=snapshot();
      await assert.rejects(asyncSql(submit(9,30,'CT',1,99)),/overall_check/);
      assert.equal(snapshot(),before);
      // Also rollback a newly created canonical route.
      sql("delete from destination_ratings where destination_id='"+dest(2)+"'; delete from buffacoin_rating_operations where destination_id='"+dest(2)+"'; delete from buffacoin_ledger where destination_id='"+dest(2)+"'; delete from crawls where route_id in (select id from routes where city='NY'); delete from routes where city='NY';");
      const fresh=snapshot();
      await assert.rejects(asyncSql(submit(9,31,'NY',1,99)),/overall_check/);
      assert.equal(snapshot(),fresh);
    });
    await t.test('non-token title collision fails safely without modifying existing route', async () => {
      sql(`insert into routes(title,city,created_by,is_public,is_token_route) values('Wingdex Token Crawl (NY)','NY','${user(12)}',false,false);`);
      const before=snapshot();
      await assert.rejects(asyncSql(submit(10,32,'NY')),/token_route_unavailable/);
      assert.equal(snapshot(),before);
    });
    await t.test('authentication, insufficient funds and ledger mismatch safeguards remain enforced', async () => {
      sql(`update buffacoin_wallets set balance=0 where user_id='${user(10)}';`);
      const before=snapshot();
      await assert.rejects(asyncSql(submit(10,33)),/insufficient_balance/);
      await assert.rejects(asyncSql("select * from submit_buffacoin_rating_v1(null,null,null,null,null)"),/unauthorized/);
      await assert.rejects(asyncSql(`insert into destination_ratings(id,user_id,is_buffacoin) values(gen_random_uuid(),'${user(11)}',true)`),/buffacoin_rating_requires_atomic_transaction/);
      sql('alter table buffacoin_ledger disable trigger apply_delta;');
      await assert.rejects(asyncSql(submit(11,34)),/ledger_balance_mismatch/);
      assert.equal(snapshot(),before);
    });
  } finally {
    if(started) sync('pg_ctl',['-D',dir,'-m','immediate','-w','stop']);
    // mkdtemp's verified child only; never delete an external database directory.
    assert.ok(resolve(dir).startsWith(resolve(tmpdir()) + '\\'));
    rmSync(dir,{recursive:true,force:true});
  }
});
