import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../../',import.meta.url);
const files=[
 'crawl/supabase/local/phase-7b3a/supabase/migrations/20261010192747_wing_jury_saved_destinations_forward.sql',
 'crawl/supabase/local/phase-7b3a/production-fingerprint-preflight.sql',
 'crawl/supabase/local/phase-7b3a/draft-package.json',
 'crawl/supabase/local/phase-7b3a/verify-package.mjs',
 'crawl/scripts/phase7b3b-feature-executor.mjs',
 'crawl/scripts/phase7b3d-production-adapter.mjs',
 'crawl/scripts/phase7b3d-native-postgres.mjs',
 'crawl/scripts/phase7b25-postgres.mjs',
 'crawl/scripts/phase7b3d-closeout-inventory.mjs',
 'crawl/lib/ratingRpcRetry.js',
 'crawl/lib/buffacoinRatingTransaction.js',
 'crawl/app/(tabs)/home/index.jsx',
 'crawl/app/crawl/[id].jsx',
 'crawl/tests/database/phase7b3d-adapter.test.mjs',
 'crawl/tests/database/phase7b3d-behavior-postgres.test.mjs',
 'crawl/tests/rating-rpc-retry.test.mjs',
 'crawl/tests/rating-mission-tracking.test.mjs',
 'docs/phase-7b3c-history-exception-draft.json',
 'docs/phase-7b3b-catalog-snapshot-readonly.sql',
 'docs/phase-7b3d-approval-packet.md',
];
const artifacts=await Promise.all(files.map(async path=>({path,sha256:createHash('sha256').update(await readFile(new URL(path,root))).digest('hex')})));
assert.equal(artifacts[0].sha256,'f66c4585b7c0295579ca3b188bb4464815c84328f1b2ae71b4abe7354e6cfab3');
assert.equal(artifacts[1].sha256,'66ce48f694c2e458a5622d63fd737676a26380a7aa098e748614b5fb74ef299b');
const record={status:'ENGINEERING_INVENTORY_NOT_APPROVAL',project:'vhfxnizaxdanmvmouuaf',version:'20261010192747',artifacts};
await writeFile(new URL('docs/phase-7b3d-artifact-hashes.json',root),JSON.stringify(record,null,2)+'\n');
console.log('Frozen hashes verified; bounded engineering inventory written (not authorization).');
