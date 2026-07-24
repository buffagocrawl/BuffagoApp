import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sql = fs.readFileSync(
  path.join(root, 'supabase/migrations/20260723144000_engagement_privacy.sql'),
  'utf8'
);

test('engagement privacy migration is authenticated and avoids exact-location fields', () => {
  assert.match(sql, /auth\.uid\(\)/);
  assert.match(sql, /grant execute[\s\S]*to authenticated/i);
  assert.doesNotMatch(sql, /latitude|longitude|coordinates/i);
});
