import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const migration = fs.readFileSync(
  path.resolve(
    process.cwd(),
    'supabase/migrations/20260724141000_buffaverse_phase2_local_geography_fix.sql'
  ),
  'utf8'
);

test('local Legendary creation supplies the Phase 1 geography key', () => {
  assert.match(migration, /geography_key/i);
  assert.match(
    migration,
    /when p_selection_scope = 'local' then btrim\(p_selection_window_key\)/i
  );
  assert.match(migration, /selection_window_key_required/i);
});
test('corrective creator remains service-role only and additive', () => {
  assert.match(migration, /grant execute on function public\.buffaverse_create_legendary_event[\s\S]*to service_role/i);
  assert.match(migration, /from public, anon, authenticated/i);
  assert.doesNotMatch(migration, /\b(drop table|truncate|delete from)\b/i);
  assert.doesNotMatch(migration, /set\s+enabled\s*=\s*true/i);
});
