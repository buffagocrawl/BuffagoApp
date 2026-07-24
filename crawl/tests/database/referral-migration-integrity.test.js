import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const testsDir = dirname(fileURLToPath(import.meta.url));
const migrationPath = join(testsDir, '..', '..', 'supabase', 'migrations', '20260724033000_referral_system_v1.sql');
const expectedSha256 = '0880a90853b85d47173bc97535f4bcf18ecfd5a52df7b6831d0c53d569dffc19';

test('authoritative referral-system-v1 migration remains present and checksum-stable', () => {
  assert.equal(existsSync(migrationPath), true, `missing authoritative migration: ${migrationPath}`);
  assert.equal(statSync(migrationPath).isFile(), true);
  const bytes = readFileSync(migrationPath);
  const checksum = createHash('sha256').update(bytes).digest('hex');
  assert.equal(checksum, expectedSha256);
});
