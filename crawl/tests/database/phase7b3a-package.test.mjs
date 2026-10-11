import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { verifyPackage } from '../../supabase/local/phase-7b3a/verify-package.mjs';

const source = new URL('../../supabase/local/phase-7b3a/', import.meta.url);
async function copy() {
  const base = new URL(`../../.expo/phase7b3a-package-negative-${randomUUID()}/`, import.meta.url);
  await mkdir(new URL('supabase/migrations/',base),{recursive:true});
  const manifest=JSON.parse(await readFile(new URL('draft-package.json',source),'utf8'));
  for(const item of manifest.artifacts) await copyFile(new URL(item.path,source),new URL(item.path,base));
  await writeFile(new URL('draft-package.json',base),JSON.stringify(manifest));
  return {base,manifest};
}

test('offline feature-only package accepts exact pinned artifacts',async()=>{
  assert.equal((await verifyPackage()).version,'20261010192747');
});
test('offline feature-only package refuses changed SQL and extra migration files',async()=>{
  let {base,manifest}=await copy();
  await writeFile(new URL(manifest.artifacts[0].path,base),'select 1;');
  await assert.rejects(verifyPackage(base),/Hash drift/);
  ({base}=await copy());
  await writeFile(new URL('supabase/migrations/20261010192748_unapproved.sql',base),'select 1;');
  await assert.rejects(verifyPackage(base),/Extra migration artifacts/);
});
test('offline feature-only package refuses changed target, allowlist and non-forward versions',async()=>{
  for(const mutate of [
    m=>{m.projectEvidence='different-project';},
    m=>{m.artifacts[0].path='../historical.sql';},
    m=>{m.observedRemoteMaximum='99999999999999';},
  ]) {
    const {base,manifest}=await copy();mutate(manifest);
    await writeFile(new URL('draft-package.json',base),JSON.stringify(manifest));
    await assert.rejects(verifyPackage(base));
  }
});
