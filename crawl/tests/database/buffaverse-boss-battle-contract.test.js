import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const migration = fs.readFileSync(path.resolve('supabase/migrations/20260724150000_buffaverse_phase3_restaurant_boss_battles.sql'), 'utf8');

test('Boss Battles are additive, default-off, and reward-reference-only', () => {
  assert.match(migration, /insert into public\.buffaverse_feature_flags[\s\S]*false/i);
  assert.match(migration, /alter table public\.buffaverse_restaurant_boss_battles enable row level security/i);
  assert.match(migration, /grant execute on function public\.buffaverse_create_boss_battle[\s\S]*to service_role/i);
  assert.match(migration, /grant execute on function public\.buffaverse_run_boss_battle_scheduler[\s\S]*to service_role/i);
  assert.match(migration, /qualifying_rating_not_verified/i);
  assert.match(migration, /pg_advisory_xact_lock/i);
  assert.match(migration, /unique\(event_instance_id,user_id\)/i);
  assert.doesNotMatch(migration, /\b(drop table|truncate|delete from)\b/i);
  assert.doesNotMatch(migration, /insert into public\.(xp_ledger|buffacoin_ledger)/i);
});
