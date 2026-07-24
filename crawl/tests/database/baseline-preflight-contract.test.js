import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sql = fs.readFileSync(path.join(root, 'supabase/validation/buffago-baseline-preflight.sql'), 'utf8');
const runner = fs.readFileSync(path.join(root, 'scripts/apply-engagement-migrations.ps1'), 'utf8');

test('baseline preflight reports all prerequisite categories before engagement SQL', () => {
  assert.match(sql, /_buffago_baseline_missing/);
  assert.match(sql, /extension/);
  assert.match(sql, /table/);
  assert.match(sql, /column/);
  assert.match(sql, /function/);
  assert.match(sql, /constraint/);
  assert.match(sql, /buffago_baseline_preflight_failed/);
});

test('migration runner stops before applying deltas when preflight fails', () => {
  assert.match(runner, /buffago-baseline-preflight\.sql/);
  assert.match(runner, /no engagement migration was applied/);
  assert.match(runner, /ON_ERROR_STOP=1/);
});
