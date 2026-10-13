import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { startDisposablePostgres, query } from '../scripts/phase7b25-postgres.mjs';

const enabled = process.env.BUFFAGO_PHASE7B3D_NATIVE17 === '1';
before(async () => { if (enabled) await startDisposablePostgres(); });
const definitions = JSON.parse(readFileSync(new URL('../../artifacts/app-polish/release-qa/deployed-function-definitions.json', import.meta.url), 'utf8'));
const destination = { name: 'Isolated Fixture Wings', address: '1 Fixture St', city: 'Fixture City', state_id: 1, lat: 41, lng: -72 };
const literal = value => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
const user = '11111111-1111-4111-8111-111111111111';

test('real PostgreSQL shared RPC supports null creator, concurrent retries and service-only permissions', { skip: !enabled }, async () => {
  const db = 'buffago_phase7b25_901';
  await query('buffago_phase7b25', `create database ${db}`);
  await query(db, `create schema auth; create table auth.users(id uuid primary key);
    insert into auth.users values('${user}');
    create table public.states(state_id integer primary key); insert into states values(1);
    create table public.destinations(id uuid primary key default gen_random_uuid(),name text,address text,city text,
      state_id integer references states(state_id),lat numeric,lng numeric,created_by uuid references auth.users(id));
    create table public.api_rate_limits(user_id uuid,ip_address text,feature text,created_at timestamptz);
    grant usage on schema public to service_role;
    grant select,insert,update on public.destinations,public.api_rate_limits to service_role;`);
  for (const name of ['wingman_create_destination', 'wingman_consume_rate_limit']) {
    const definition = definitions.find(row => row.proname === name);
    assert.equal(definition.security_definer, false);
    assert.equal(definition.permissions, '{postgres=X/postgres,service_role=X/postgres}');
    await query(db, definition.definition);
  }
  await query(db, `revoke all on function public.wingman_create_destination(jsonb,uuid),public.wingman_consume_rate_limit(uuid,text) from public,anon,authenticated;
    grant execute on function public.wingman_create_destination(jsonb,uuid),public.wingman_consume_rate_limit(uuid,text) to service_role;`);
  const create = (row = destination, creator = null) => query(db, `set role service_role;select wingman_create_destination(${literal(row)},${creator ? `'${creator}'::uuid` : 'null'});`);
  const receipts = await Promise.all(Array.from({ length: 8 }, () => create()));
  const rows = receipts.map(r => JSON.parse(r));
  assert.equal(new Set(rows.map(r => r.id)).size, 1);
  assert.ok(rows.every(r => r.created_by === null));
  assert.equal(await query(db, 'select count(*) from destinations;'), '1');
  assert.equal(JSON.parse(await create(destination, user)).created_by, null, 'signed-in reuse must not claim guest ownership');
  const signed = JSON.parse(await create({ ...destination, name: 'Signed Fixture Wings', address: '2 Fixture St' }, user));
  assert.equal(signed.created_by, user);
  await assert.rejects(create({ ...destination, address: '3 Fixture St' }), /restaurant_match_ambiguous/);
  await assert.rejects(create({ ...destination, lat: null }), /restaurant_location_required/);
  await assert.rejects(create({ ...destination, state_id: 2 }), /foreign key/);
  for (const role of ['anon', 'authenticated']) {
    await assert.rejects(query(db, `set role ${role};select wingman_create_destination(${literal(destination)},null);`), /permission denied/);
    await assert.rejects(query(db, `set role ${role};select wingman_consume_rate_limit(null,'fixture-ip');`), /permission denied/);
  }
  const limits = await Promise.all(Array.from({ length: 8 }, () => query(db, "set role service_role;select wingman_consume_rate_limit(null,'fixture-ip');")));
  assert.equal(limits.filter(r => r === 't').length, 3);
  assert.equal(limits.filter(r => r === 'f').length, 5);
  assert.equal(await query(db, 'select count(*) from destinations;'), '2');
});
