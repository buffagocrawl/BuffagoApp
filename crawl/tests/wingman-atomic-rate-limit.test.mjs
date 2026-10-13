import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { startDisposablePostgres, fixture, query } from '../scripts/phase7b25-postgres.mjs';
const enabled=process.env.BUFFAGO_PHASE7B3D_NATIVE17==='1';
before(async()=>{if(enabled)await startDisposablePostgres();});
const definitions=JSON.parse(readFileSync(new URL('../../artifacts/app-polish/release-qa/deployed-function-definitions.json',import.meta.url),'utf8'));
test('version 17 limiter allows exactly ten simultaneous signed-in requests and denies client execution',{skip:!enabled},async()=>{
  const db=await fixture({migration:false});
  await query(db,`create table public.api_rate_limits(user_id uuid,ip_address text,feature text,created_at timestamptz);`+definitions.find(row=>row.proname==='wingman_consume_rate_limit').definition);
  await query(db,`revoke all on function public.wingman_consume_rate_limit(uuid,text) from public,anon,authenticated;grant execute on function public.wingman_consume_rate_limit(uuid,text) to service_role;grant select,insert on public.api_rate_limits to service_role;`);
  const user='11111111-1111-4111-8111-111111111111';
  const results=await Promise.all(Array.from({length:20},(_,i)=>query(db,`set role service_role;select public.wingman_consume_rate_limit('${user}','synthetic-ip');`,`rate-fixture-${i}`)));
  assert.equal(results.filter(value=>value==='t').length,10);assert.equal(results.filter(value=>value==='f').length,10);
  assert.equal(await query(db,'select count(*) from public.api_rate_limits'),'10');
  await assert.rejects(query(db,`set role authenticated;select public.wingman_consume_rate_limit('${user}','synthetic-ip');`),/permission denied/);
  const anonymous=await Promise.all(Array.from({length:8},(_,i)=>query(db,`set role service_role;select public.wingman_consume_rate_limit(null,'synthetic-anonymous-ip');`,`rate-anon-${i}`)));
  assert.equal(anonymous.filter(value=>value==='t').length,3);assert.equal(anonymous.filter(value=>value==='f').length,5);
});
