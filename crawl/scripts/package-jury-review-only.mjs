// Offline, three-function review packet. Never replaces the retained four-function
// archive, invokes a deployment command, or includes the deletion repair.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,resolve,relative,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const prior=JSON.parse(await readFile(join(root,'docs/buffago-final-edge-candidates.json'),'utf8'));
const names=['wing-jury-feed','wing-jury-vote','wing-jury-reveal'];
const hash=b=>createHash('sha256').update(b).digest('hex');
const item=async path=>{const b=await readFile(path);return {path:relative(root,path).replaceAll('\\','/'),bytes:b.length,sha256:hash(b)};};
for(const entry of [...prior.source_inventory,...prior.deployment_inventory,prior.retained_immutable_archive]){
 const current=await item(join(root,entry.path));assert.deepEqual(current,entry,'Original candidate inventory drift');
}
const directory=join(root,'crawl/.expo/final-engineering/jury-only');
const paths=[];
for(const name of names){
 const original=prior.deployment_inventory.find(x=>x.path.endsWith(`/functions/${name}/index.js`));assert.ok(original);
 const path=join(directory,`supabase/functions/${name}/index.js`);await mkdir(dirname(path),{recursive:true});
 await copyFile(join(root,original.path),path);assert.equal((await item(path)).sha256,original.sha256);paths.push(path);
}
const configPath=join(directory,'supabase/config.toml');
await writeFile(configPath,`project_id = "buffago-jury-review-only"\n\n${names.map(name=>`[functions.${name}]\nverify_jwt = ${name==='wing-jury-vote'}\nentrypoint = "./functions/${name}/index.js"\n`).join('\n')}`);
const lockPath=join(directory,'deno.lock');await copyFile(join(root,'crawl/deno.lock'),lockPath);paths.push(configPath,lockPath);paths.sort();
function archive(entries){const parts=[];for(const {name,bytes} of entries){const header=Buffer.alloc(512);const put=(s,i,n)=>header.write(s,i,n,'ascii');const oct=(n,size)=>n.toString(8).padStart(size-1,'0')+'\0';assert.ok(Buffer.byteLength(name)<100);
 put(name,0,100);put(oct(0o644,8),100,8);put(oct(0,8),108,8);put(oct(0,8),116,8);put(oct(bytes.length,12),124,12);put(oct(0,12),136,12);header.fill(32,148,156);put('0',156,1);put('ustar\0',257,6);put('00',263,2);put(header.reduce((s,b)=>s+b,0).toString(8).padStart(6,'0')+'\0 ',148,8);
 parts.push(header,bytes,Buffer.alloc((512-bytes.length%512)%512));}return Buffer.concat([...parts,Buffer.alloc(1024)]);}
const entries=await Promise.all(paths.map(async path=>({name:relative(directory,path).replaceAll('\\','/'),bytes:await readFile(path)})));
const bytes=archive(entries);assert.equal(hash(bytes),hash(archive(entries)));assert.ok(entries.every(x=>!x.name.includes('delete-account')));
const archivePath=join(root,`crawl/.expo/final-engineering/jury-only-${hash(bytes)}.tar`);
await writeFile(archivePath,bytes);
const manifest={status:'REVIEW_ONLY_NO_DEPLOYMENT_AUTHORIZATION',target:prior.target,scope:names,delete_account:'EXCLUDED; retain v15 decision UNRESOLVED, original repair preserved separately',
 runtime:prior.runtime,reviewed_runtime_executable:prior.reviewed_runtime_executable,packager:await item(fileURLToPath(import.meta.url)),
 source_inventory:prior.source_inventory.filter(x=>!x.path.includes('/delete-account/')),
 deployment_inventory:await Promise.all(paths.map(item)),archive:await item(archivePath),
 gateway:Object.fromEntries(names.map(name=>[name,{verify_jwt:name==='wing-jury-vote',application_auth:'getUser token verification; public feed/guest reveal separately constrained'}])),
 predecessor_inventory:Object.fromEntries(names.map(name=>[name,{status:'ABSENT_IN_SUPPLIED_R3_INVENTORY',previous_version:null,bundle_sha256:null,evidence:'docs/buffago-r3-production-evidence-summary.md; dated report, fresh window inventory still required'}])),
 reproducibility:'Exact previously twice-built and runtime-tested bundle bytes; offline deterministic USTAR, zero metadata timestamps; prior archive preserved',
 limitations:['Packaging exclusion does not authorize retaining delete-account v15','Actual R3 source bytes and delete_account_data contract missing','No production gateway/Storage acceptance or distributed limiter attestation']};
await writeFile(join(root,'docs/buffago-final-jury-release-candidates.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({archive:manifest.archive,functions:names.length,originalArchivePreserved:true}));
