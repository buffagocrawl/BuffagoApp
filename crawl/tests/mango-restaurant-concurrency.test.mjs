import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
const exec = promisify(execFile);
const container = process.env.RESTAURANT_TEST_POSTGRES_CONTAINER || 'supabase_db_crawl';
const database = 'restaurant_review_test_' + randomUUID().replaceAll('-', '');
const reviewer='10000000-0000-4000-8000-000000000001', user='10000000-0000-4000-8000-000000000002';
const sid=n=>`20000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const destination={name:'Wing Place',address:'1 Main St',city:'Hartford',state_id:1,lat:41.76,lng:-72.67};
const sql = async query => (await exec('docker',['exec',container,'psql','-U','postgres','-d',database,'-X','-A','-t','-v','ON_ERROR_STOP=1','-c',query],{maxBuffer:1024*1024})).stdout.trim();
const review=(n,action='approve')=>sql(`set role service_role; select mango_review_restaurant('${sid(n)}','${reviewer}','${action}','Menu checked for wings.','${JSON.stringify(destination)}'::jsonb);`);
test('real PostgreSQL concurrent reviews serialize and preserve one destination', async()=>{
 await exec('docker',['exec',container,'createdb','-U','postgres',database]);
 try {
  const source=readFileSync(new URL('./mango-restaurant-postgres.test.mjs',import.meta.url),'utf8');
  let bootstrap=source.match(/await db\.exec\(`([\s\S]*?)`\);/)[1];
  bootstrap=bootstrap.replace('create role anon; create role authenticated; create role service_role bypassrls;','')
   .replaceAll('${reviewer}',reviewer).replaceAll('${user}',user);
  await sql(bootstrap);
  await sql(readFileSync(new URL('../supabase/migrations/20261013011230_mango_restaurant_review.sql',import.meta.url),'utf8'));
  for(let n=1;n<=4;n++) await sql(`insert into destination_suggestions(id,user_id,state_id,restaurant_name,address) values('${sid(n)}','${user}',1,'Wing Place','1 Main St');`);
  const receipts=await Promise.all([review(1),review(1),review(2)]);
  const parsed=receipts.map(s=>JSON.parse(s.split('\n').at(-1)));
  assert.equal(new Set(parsed.map(r=>r.destination_id)).size,1);
  assert.equal(await sql('select count(*) from destinations;'),'1');
  assert.equal(await sql('select count(*) from restaurant_suggestion_reviews;'),'2');
  const race=await Promise.allSettled([review(3),review(3,'reject')]);
  assert.equal(race.filter(r=>r.status==='fulfilled').length,1);
  assert.match(race.find(r=>r.status==='rejected').reason.stderr,/restaurant_already_reviewed/);
  assert.equal(await sql(`select count(*) from restaurant_suggestion_reviews where suggestion_id='${sid(3)}';`),'1');
  assert.equal(await sql('select mango_restaurant_pending_count();'),'1');
 } finally {
  await exec('docker',['exec',container,'dropdb','-U','postgres',database]);
 }
});
