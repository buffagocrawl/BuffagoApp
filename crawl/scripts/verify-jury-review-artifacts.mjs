// Separate read-only verifier: parses archive bytes without executing bundles.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve,dirname,join} from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const manifest=JSON.parse(await readFile(join(root,'docs/buffago-final-jury-release-candidates.json'),'utf8'));
const original=JSON.parse(await readFile(join(root,'docs/buffago-final-edge-candidates.json'),'utf8'));
const hash=b=>createHash('sha256').update(b).digest('hex');
for(const x of [...manifest.source_inventory,...manifest.deployment_inventory,manifest.archive,manifest.packager,manifest.reviewed_runtime_executable,original.retained_immutable_archive]){
 const bytes=await readFile(join(root,x.path));assert.equal(bytes.length,x.bytes,x.path);assert.equal(hash(bytes),x.sha256,x.path);
}
assert.deepEqual(manifest.scope,['wing-jury-feed','wing-jury-vote','wing-jury-reveal']);
const entries=new Map();const tar=await readFile(join(root,manifest.archive.path));let offset=0;
const str=(header,start,length)=>header.subarray(start,start+length).toString('ascii').replace(/\0.*$/s,'');
while(tar.subarray(offset,offset+512).some(b=>b!==0)){
 const header=tar.subarray(offset,offset+512);assert.equal(header.length,512);
 const name=str(header,0,100),size=parseInt(str(header,124,12),8),expectedChecksum=parseInt(str(header,148,8),8);
 const sum=header.reduce((s,b,i)=>s+(i>=148&&i<156?32:b),0);assert.equal(sum,expectedChecksum);
 assert.equal(str(header,156,1),'0');assert.equal(str(header,257,6),'ustar');assert.equal(parseInt(str(header,136,12),8),0);
 assert.ok(Number.isSafeInteger(size)&&size>=0);assert.ok(!entries.has(name));
 entries.set(name,tar.subarray(offset+512,offset+512+size));offset+=512+Math.ceil(size/512)*512;
}
assert.equal(tar.length-offset,1024);assert.ok(tar.subarray(offset).every(b=>b===0));
const expected=['deno.lock','supabase/config.toml',...manifest.scope.map(n=>`supabase/functions/${n}/index.js`)];assert.deepEqual([...entries.keys()].sort(),expected.sort());
for(const x of manifest.deployment_inventory){const name=x.path.split('/jury-only/')[1];assert.equal(hash(entries.get(name)),x.sha256);}
const config=entries.get('supabase/config.toml').toString();assert.equal((config.match(/\[functions\./g)||[]).length,3);assert.ok(!config.includes('delete-account'));
for(const name of manifest.scope){
 assert.ok(config.includes(`[functions.${name}]\nverify_jwt = ${name==='wing-jury-vote'}\nentrypoint = "./functions/${name}/index.js"`));
 const prior=original.deployment_inventory.find(x=>x.path.endsWith(`/functions/${name}/index.js`));assert.equal(hash(entries.get(`supabase/functions/${name}/index.js`)),prior.sha256);
}
const frozen={
 'crawl/supabase/local/phase-7b3a/supabase/migrations/20261010192747_wing_jury_saved_destinations_forward.sql':'f66c4585b7c0295579ca3b188bb4464815c84328f1b2ae71b4abe7354e6cfab3',
 'crawl/supabase/local/phase-7b3a/production-fingerprint-preflight.sql':'66ce48f694c2e458a5622d63fd737676a26380a7aa098e748614b5fb74ef299b'};
for(const [path,digest] of Object.entries(frozen))assert.equal(hash(await readFile(join(root,path))),digest);
console.log(JSON.stringify({status:'PASS',archiveSHA256:manifest.archive.sha256,files:entries.size,functions:3,gatewayChecked:true,identicalRuntimeTestedBundleBytes:true,originalArchivePreserved:true,frozenHashesPreserved:true,reviewBoundary:'mechanical artifact check, not independent behavior approval'}));
