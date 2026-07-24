import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const contract = JSON.parse(fs.readFileSync(path.join(root, 'supabase/contracts/current-supported-schema-v1.json'), 'utf8'));
const preflight = fs.readFileSync(path.join(root, 'supabase/validation/current-supported-schema-preflight.sql'), 'utf8');
const reconciliation = fs.readFileSync(path.join(root, 'supabase/migrations/20260724120000_current_schema_reconciliation.sql'), 'utf8');

test('current supported contract is release-scoped and not historical baseline', () => {
  assert.equal(contract.contract_version, '1.0.0');
  assert.equal(contract.contract_type, 'release_compatibility');
  assert.equal(contract.historical_baseline_claim, false);
  assert.equal(contract.checks.length, 29);
  assert.match(preflight, /generated_check_count=29/);
  assert.doesNotMatch(preflight, /buffago_baseline_preflight_failed/);
});

test('generated preflight distinguishes missing and incompatible definitions and is read-only', () => {
  assert.match(preflight, /result='missing'/);
  assert.match(preflight, /result='incompatible'/);
  assert.match(preflight, /rollback;/i);
  assert.doesNotMatch(preflight, /create table|alter table|insert into public\./i);
});

test('limited_time_events is fail-closed when incompatible and compatibility-created only when absent', () => {
  assert.match(reconciliation, /current_schema_incompatible public\.limited_time_events/);
  assert.match(reconciliation, /app\.environment=development\|staging/);
  assert.match(reconciliation, /create table public\.limited_time_events/);
  assert.match(reconciliation, /does not mark historical migrations applied/i);
  assert.doesNotMatch(reconciliation, /drop table|drop column|truncate|delete from public\.limited_time_events/i);
});

test('reconciliation preserves flags, preferences, history, and safe RLS posture', () => {
  assert.match(reconciliation, /on conflict \(flag_key\) do nothing/);
  assert.match(reconciliation, /alter table public\.engagement_feature_flags enable row level security/);
  assert.match(reconciliation, /default false/);
  assert.match(reconciliation, /Do not drop[\s\S]*shared tables, delete preferences\/history/i);
});
