import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

// Offline validation only. No connection URL, subprocess, ledger mutation or
// remote apply capability. This is not a production migration executor.
export async function verifyPackage(base = new URL('./', import.meta.url)) {
  const manifest = JSON.parse(await readFile(new URL('draft-package.json', base), 'utf8'));
  assert.equal(manifest.status, 'quarantined-not-approved');
  assert.equal(manifest.projectEvidence, 'vhfxnizaxdanmvmouuaf');
  assert.equal(manifest.artifacts.length, 2);
  const migrations = await readdir(new URL('supabase/migrations/', base));
  assert.equal(migrations.length, 1, 'Extra migration artifacts refused');
  assert.match(migrations[0], /^\d{14}_wing_jury_saved_destinations_forward\.sql$/);
  assert.deepEqual(manifest.artifacts.map(a => a.path), [
    `supabase/migrations/${migrations[0]}`, 'production-fingerprint-preflight.sql',
  ]);
  const rootNames = await readdir(new URL('../../migrations/', import.meta.url));
  const versions = rootNames.filter(n => /^\d{14}_.*\.sql$/.test(n)).map(n => n.slice(0, 14));
  const version = migrations[0].slice(0, 14);
  assert.ok(versions.every(v => v < version), 'Draft must exceed every historical root version');
  assert.ok(version > manifest.observedRemoteMaximum, 'Draft must exceed dated remote maximum');
  for (const artifact of manifest.artifacts) {
    const bytes = await readFile(new URL(artifact.path, base));
    const actual = createHash('sha256').update(bytes).digest('hex');
    assert.equal(actual, artifact.sha256, `Hash drift: ${artifact.path}`);
    if (artifact.path.startsWith('supabase/migrations/')) {
      assert.doesNotMatch(bytes.toString(), /create\s+or\s+replace|create\s+(?:table|index|schema)\s+if\s+not\s+exists|drop\s+(?:trigger|policy|function|table)/i);
    }
  }
  return { status: manifest.status, version, artifacts: manifest.artifacts,
    currentRemoteMaximum: 'NOT VERIFIED; application gate', historicalIntegrity: 'STILL BLOCKED' };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  console.log(JSON.stringify(await verifyPackage(), null, 2));
}
