import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash, verify, randomUUID,createPublicKey,KeyObject} from 'node:crypto';
import {readFile, open, realpath, stat} from 'node:fs/promises';
import {isAbsolute,relative,sep,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {verifiedAttempt} from './phase-final-adapter-attempt.mjs';
import {project,version,migrationHash,preflightHash,frozenBytes,transactionKernel,snapshotSQL,snapshotExpression} from './phase7b3b-feature-executor.mjs';

// Library only: no CLI, environment credentials, automatic retry or production
// connection on import. Trust configuration must be provisioned out of band.
export const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const ownURL = new URL(import.meta.url);
const kernelURL = new URL('./phase7b3b-feature-executor.mjs',import.meta.url);
const outsideRepository=path=>{const r=relative(fileURLToPath(new URL('../../',import.meta.url)),path);return r==='..'||r.startsWith('..'+sep)||isAbsolute(r);};
export async function implementationHashes(){return {adapterHash:hash(await readFile(ownURL)),executorHash:hash(await readFile(kernelURL)),attemptHash:hash(await readFile(new URL('./phase-final-adapter-attempt.mjs',import.meta.url)))};}

export function validateDecision(envelope,trust,implementation,now=Date.now()){
 assert.ok(trust.publicKey && trust.keyId,'Trusted approval key required');
 const approvalKey=trust.publicKey instanceof KeyObject?trust.publicKey:createPublicKey(trust.publicKey);
 assert.equal(approvalKey.type,'public','Trusted public approval key required');
 assert.equal(approvalKey.asymmetricKeyType,'ed25519','Ed25519 approval key required');
 assert.equal(envelope.keyId,trust.keyId);
 assert.equal(typeof envelope.payload,'string');
 assert.ok(verify(null,Buffer.from(envelope.payload),approvalKey,Buffer.from(envelope.signature,'base64')),'Invalid approval signature');
 const d=JSON.parse(envelope.payload);
 assert.equal(d.status,'APPROVED');
 assert.ok(['inspect','apply','recover'].includes(d.action));
 assert.equal(d.project,project);assert.equal(d.host,`db.${project}.supabase.co`);
 assert.equal(d.port,5432);assert.equal(d.database,'postgres');assert.equal(d.user,'postgres');
 assert.equal(d.migrationHash,migrationHash);assert.equal(d.preflightHash,preflightHash);assert.equal(d.version,version);
 for(const [key,value] of Object.entries(implementation)) assert.equal(d[key],value,`${key} drift`);
 assert.ok(Number.isFinite(Date.parse(d.issuedAt)) && Date.parse(d.issuedAt)<=now);
 assert.ok(Number.isFinite(Date.parse(d.expiresAt)) && now<Date.parse(d.expiresAt),'Expired approval');
 assert.ok(Number.isFinite(Date.parse(d.windowStart)) && Date.parse(d.windowStart)<=now);
 assert.ok(Number.isFinite(Date.parse(d.windowEnd)) && now<Date.parse(d.windowEnd),'Outside approved window');
 assert.equal(d.historyDisposition,'FROZEN_HISTORY_EXCEPTION_APPROVED');
 assert.equal(d.ledgerDisposition,'SINGLE_ORIGINAL_SQL_ROW_APPROVED');
 assert.equal(d.behaviorDisposition,'ACCEPTED');
 assert.equal(d.authorization,{inspect:'READ_ONLY_INSPECTION',recover:'READ_ONLY_RECOVERY',apply:'APPLY_EXACT_FEATURE_AND_NEW_LEDGER_ROW'}[d.action]);
 for(const key of ['actor','incidentOwner','incidentBackup','maintenanceWindow','smokeScope','controlPlaneEvidence','historyDecision','ledgerDecision','behaviorEvidence','roleDdlFreezeEvidence']) assert.ok(typeof d[key]==='string' && d[key].trim(),`Missing ${key}`);
 for(const key of ['snapshot','postSnapshot']) assert.match(d[key],/^[a-f0-9]{32}$/);
 for(const key of ['historyDraftHash','caHash','psqlHash','protectedFilesEvidence']) assert.match(d[key],/^[a-f0-9]{64}$/);
 assert.equal(d.psqlVersion,'17.6');
 assert.ok(Number.isInteger(d.deadlineMs) && d.deadlineMs>=1000 && d.deadlineMs<=900000);
 assert.ok(Date.parse(d.issuedAt)<Date.parse(d.expiresAt),'Invalid approval interval');
 assert.ok(Date.parse(d.windowStart)<Date.parse(d.windowEnd),'Invalid maintenance interval');
 assert.notEqual(d.snapshot,d.postSnapshot,'Distinct reviewed pre/post state required');
 return Object.freeze(d);
}

export function childEnvironment(config,ambient=process.env){
 for(const key of Object.keys(ambient)) if(key.toUpperCase().startsWith('PG')) throw new Error(`Ambient ${key} refused`);
 assert.equal(config.host,`db.${project}.supabase.co`);assert.equal(config.port,5432);
 assert.equal(config.database,'postgres');assert.equal(config.user,'postgres');
 assert.deepEqual(Object.keys(config).sort(),['ca','database','host','passfile','port','psql','user'].sort());
 for(const key of ['psql','ca','passfile']) assert.ok(isAbsolute(config[key]) && !/[\r\n\0]/.test(config[key]));
 assert.ok(outsideRepository(config.passfile),'Credentials must be outside repository');
 return {SystemRoot:ambient.SystemRoot,PATH:ambient.PATH,TEMP:ambient.TEMP,TMP:ambient.TMP,
  PGHOST:config.host,PGPORT:'5432',PGDATABASE:'postgres',PGUSER:'postgres',
  PGSSLMODE:'verify-full',PGSSLROOTCERT:config.ca,PGPASSFILE:config.passfile,
  PGREQUIREAUTH:'scram-sha-256',PGGSSENCMODE:'disable',PGSSLMINPROTOCOLVERSION:'TLSv1.2',
  LC_ALL:'C',LANG:'C',PGCONNECT_TIMEOUT:'10',PGAPPNAME:'buffago-phase7b3d',PGCLIENTENCODING:'UTF8'};
}

export async function verifyPsqlVersion(executable,env){
 const output=await new Promise((resolve,reject)=>{
  const child=spawn(executable,['--version'],{env,windowsHide:true,shell:false,stdio:['ignore','pipe','pipe']});let text='';
  const timer=setTimeout(()=>{child.kill();reject(new Error('psql version deadline exceeded'));},10000);
  child.stdout.on('data',data=>text+=data);child.on('error',error=>{clearTimeout(timer);reject(error);});
  child.on('close',code=>{clearTimeout(timer);code===0?resolve(text.trim()):reject(new Error('Pinned psql version command failed'));});
 });
 assert.match(output,/^psql \(PostgreSQL\) 17\.6(?:\s|$)/,'Pinned PostgreSQL17.6 psql required');return output;
}

export async function durableEvidence(path){
 assert.ok(isAbsolute(path));
 // Exclusive new attempt file: refuses existing/symlink paths. Caller supplies
 // an externally protected directory; a local file is evidence, not approval.
 const handle=await open(path,'wx',0o600);
 return {async append(row){await handle.writeFile(JSON.stringify({...row,time:new Date().toISOString()})+'\n');await handle.sync();},async close(){await handle.close();}};
}

export function psqlSession(executable,env,deadlineMs){
 const child=spawn(executable,['-X','-q','-A','-t','-w','-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate'],{env,windowsHide:true,stdio:['pipe','pipe','pipe'],shell:false});
 return attachPsqlProcess(child,deadlineMs);
}

// Shared framing exercised with a pipe fixture; production never accepts a
// caller-supplied child or SQL and always constructs the pinned psql process.
export function attachPsqlProcess(child,deadlineMs){
 let output='',pending,ended=false,terminalError;let sqlstate;
 const deadline=setTimeout(()=>child.kill(),deadlineMs);
 let errors='';
 const fail=error=>{terminalError??=error;if(pending){pending.reject(error);pending=null;}child.kill();};
 child.stdin.on('error',()=>fail(new Error('Transport input failed')));
 child.stderr.on('data',data=>{errors+=data;const match=errors.match(/(?:ERROR|FATAL):\s+([A-Z0-9]{5})/);if(match){sqlstate=match[1];fail(Object.assign(new Error('PostgreSQL refused command'),{sqlstate}));}});
 child.stdout.on('data',data=>{output+=data;if(output.length>16*1024*1024){fail(new Error('Transport output exceeded limit'));return;}
  const match=pending&&output.match(new RegExp('(^|\\n)'+pending.marker+'\\r?\\n'));
  if(match){
  const p=pending;pending=null;const result=output.slice(0,match.index+match[1].length).trim();output=output.slice(match.index+match[0].length).trimStart();p.resolve(result);
 }});
 const closed=new Promise(resolve=>{child.on('error',()=>{if(pending){pending.reject(new Error('Transport start failed'));pending=null;}});child.on('close',()=>{ended=true;clearTimeout(deadline);if(pending){pending.reject(Object.assign(new Error('Transport ended without acknowledgment'),{sqlstate}));pending=null;}resolve();});});
 return {execute(sql){assert.ok(!ended && !pending && !terminalError,'Transport is closed or failed');return new Promise((resolve,reject)=>{const marker=`BUFFAGO_${randomUUID().replaceAll('-','')}`;pending={marker,resolve,reject};child.stdin.write(sql+'\n;\n\\echo '+marker+'\n');});},async close(){if(!ended)child.stdin.end();await closed;}};
}

export const identitySQL=`begin read only; set local search_path=pg_catalog;
select json_build_object('pid',pg_backend_pid(),'database',current_database(),'user',current_user,'session',session_user,'version',current_setting('server_version_num'),'isolation',current_setting('transaction_isolation'),'super',r.rolsuper,'bypass',r.rolbypassrls,'ssl',s.ssl,'tls',s.version) from pg_roles r join pg_stat_ssl s on s.pid=pg_backend_pid() where r.rolname=current_user; rollback;`;
export function verifyIdentity(value){const i=JSON.parse(value);assert.equal(i.database,'postgres');assert.equal(i.user,'postgres');assert.equal(i.session,'postgres');assert.equal(i.version,'170006');assert.equal(i.isolation,'read committed');assert.equal(i.super,false);assert.equal(i.bypass,true);assert.equal(i.ssl,true);assert.ok(['TLSv1.2','TLSv1.3'].includes(i.tls));assert.ok(Number.isInteger(i.pid));return i;}

// One statement/common MVCC snapshot for ledger AND complete catalog. Returning
// only equality avoids logging/storing the original SQL in recovery evidence.
export function recoverySQL(sql){
 const literal="E'"+sql.replaceAll('\\','\\\\').replaceAll("'","''")+"'";
 return `begin read only; set local search_path=pg_catalog,public;
select json_build_object('snapshot',md5((${snapshotExpression})::text),'rows',(select coalesce(json_agg(json_build_object('version',version,'name',name,'originalMatches',statements=array[${literal}]::text[],'created_by',created_by,'idempotency_key',idempotency_key,'rollback',rollback)),'[]') from supabase_migrations.schema_migrations where version='${version}')); rollback;`;
}
export function classifyRecovery(rows,sql,snapshot,d){
 const r=JSON.parse(rows);
 if(r.length===0 && snapshot===d.snapshot)return 'rolled-back';
 const originalMatches=r.length===1 && (Object.hasOwn(r[0],'originalMatches')?r[0].originalMatches===true:JSON.stringify(r[0].statements)===JSON.stringify([sql]));
 if(originalMatches && r[0].version===version && r[0].name==='wing_jury_saved_destinations_forward' && r[0].created_by===null && r[0].idempotency_key===null && r[0].rollback===null && snapshot===d.postSnapshot)return 'committed';
 return 'mixed-or-drifted';
}

export async function runApproved({envelope,trust,config,evidencePath}){
 const implementation=await implementationHashes();const d=validateDecision(envelope,trust,implementation);
 const env=childEnvironment(config);await frozenBytes();
 for(const key of ['psql','ca','passfile']){assert.equal(await realpath(config[key]),config[key]);assert.ok((await stat(config[key])).isFile());}
 assert.equal(hash(await readFile(config.psql)),d.psqlHash);assert.equal(hash(await readFile(config.ca)),d.caHash);
 await verifyPsqlVersion(config.psql,env);
 assert.equal(hash(await readFile(new URL('../../docs/phase-7b3c-history-exception-draft.json',import.meta.url))),d.historyDraftHash);
 // Protected ACL attestation is signed; provisioning/OS ACL review is a human
 // gate. Never print/read credentials into JS or accept arbitrary libpq options.
 assert.ok(isAbsolute(evidencePath) && outsideRepository(evidencePath),'Production evidence must be outside repository');
 assert.equal(await realpath(dirname(evidencePath)),dirname(evidencePath),'Evidence directory must be canonical and not redirected by a symlink/junction');
 const audit=await durableEvidence(evidencePath);
 const deadline=Math.min(Date.now()+d.deadlineMs,Date.parse(d.expiresAt),Date.parse(d.windowEnd));
 const connect=()=>{const remaining=deadline-Date.now();assert.ok(remaining>0,'Whole attempt deadline expired');return psqlSession(config.psql,env,remaining);};
 return verifiedAttempt({decision:{...d,identitySQL},implementation,decisionHash:hash(envelope.payload),audit,connect,verifyIdentity,
  frozenBytes,snapshotSQL,recoverySQL,classifyRecovery,
  kernel:()=>transactionKernel({snapshot:d.snapshot,expectedDatabase:'postgres',strict:true}),
  revalidate:()=>validateDecision(envelope,trust,implementation),project,version,migrationHash,preflightHash});
}
