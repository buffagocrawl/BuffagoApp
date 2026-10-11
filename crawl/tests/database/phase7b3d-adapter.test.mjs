import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {validateDecision,childEnvironment,verifyIdentity,classifyRecovery,durableEvidence,implementationHashes,attachPsqlProcess,recoverySQL} from '../../scripts/phase7b3d-production-adapter.mjs';
import {project,version,migrationHash,preflightHash,frozenBytes,transactionKernel,snapshotSQL} from '../../scripts/phase7b3b-feature-executor.mjs';
import {startDisposablePostgres,disposableTLS,query,fixture,session} from '../../scripts/phase7b25-postgres.mjs';
import {verifiedAttempt} from '../../scripts/phase-final-adapter-attempt.mjs';
const {publicKey,privateKey}=generateKeyPairSync('ed25519');const trust={publicKey,keyId:'disposable-test-only'};
const signature=d=>{const payload=JSON.stringify(d);return {payload,keyId:trust.keyId,signature:sign(null,Buffer.from(payload),privateKey).toString('base64')};};
const decision=async()=>({status:'APPROVED',action:'apply',authorization:'APPLY_EXACT_FEATURE_AND_NEW_LEDGER_ROW',historyDisposition:'FROZEN_HISTORY_EXCEPTION_APPROVED',ledgerDisposition:'SINGLE_ORIGINAL_SQL_ROW_APPROVED',behaviorDisposition:'ACCEPTED',windowStart:new Date(Date.now()-1000).toISOString(),windowEnd:new Date(Date.now()+60000).toISOString(),project,version,psqlVersion:'17.6',host:`db.${project}.supabase.co`,port:5432,database:'postgres',user:'postgres',migrationHash,preflightHash,...await implementationHashes(),issuedAt:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+60000).toISOString(),snapshot:'a'.repeat(32),postSnapshot:'b'.repeat(32),deadlineMs:60000,...Object.fromEntries(['actor','incidentOwner','incidentBackup','maintenanceWindow','smokeScope','controlPlaneEvidence','historyDecision','ledgerDecision','behaviorEvidence','roleDdlFreezeEvidence'].map(k=>[k,'TEST ONLY'])),...Object.fromEntries(['historyDraftHash','caHash','psqlHash','protectedFilesEvidence'].map(k=>[k,'c'.repeat(64)]))});
test('signed decisions bind hashes, target, mode and expiry; a draft cannot approve itself',async()=>{
 const d=await decision(),impl=await implementationHashes();assert.equal(validateDecision(signature(d),trust,impl).action,'apply');
 for(const [key,value] of Object.entries({status:'DRAFT_NOT_APPROVED',action:'anything',authorization:'READ_ONLY_INSPECTION',historyDisposition:'DRAFT_NOT_APPROVED',ledgerDisposition:'PENDING',behaviorDisposition:'PENDING',windowEnd:'2020-01-01',project:'other',host:'pooler.supabase.com',port:6543,user:'admin',preflightHash:'0'.repeat(64),adapterHash:'0'.repeat(64),expiresAt:'2020-01-01',incidentOwner:''}))assert.throws(()=>validateDecision(signature({...d,[key]:value}),trust,impl));
 const e=signature(d);e.payload=e.payload.replace('TEST ONLY','tampered');assert.throws(()=>validateDecision(e,trust,impl));
});
test('target/environment policy rejects alternate routes and TLS overrides',()=>{
 const c={host:`db.${project}.supabase.co`,port:5432,user:'postgres',database:'postgres',psql:'C:\\reviewed\\psql.exe',ca:'C:\\reviewed\\ca.pem',passfile:'C:\\protected\\pgpass'};
 assert.equal(childEnvironment(c,{}).PGSSLMODE,'verify-full');
 assert.equal(childEnvironment(c,{}).PGREQUIREAUTH,'scram-sha-256');assert.equal(childEnvironment(c,{}).PGGSSENCMODE,'disable');
 for(const key of ['PGHOST','PGHOSTADDR','PGSERVICE','PGSERVICEFILE','PGOPTIONS','PGSSLMODE','PGPASSWORD','pgHost'])assert.throws(()=>childEnvironment(c,{[key]:'override'}));
 for(const patch of [{host:'localhost'},{host:c.host+',other'},{port:6543},{user:'other'},{database:'other'},{hostaddr:'1.2.3.4'},{service:'anything'},{sslmode:'require'}])assert.throws(()=>childEnvironment({...c,...patch},{}));
 assert.throws(()=>childEnvironment({...c,passfile:join(process.cwd(),'..secret','pgpass')},{}),/outside repository/);
});
test('backend proof requires nonsuper postgres, exact runtime and TLS',()=>{
 const i={pid:1,database:'postgres',user:'postgres',session:'postgres',version:'170006',isolation:'read committed',super:false,bypass:true,ssl:true,tls:'TLSv1.3'};
 assert.equal(verifyIdentity(JSON.stringify(i)).pid,1);
 for(const patch of [{super:true},{ssl:false},{session:'other'},{version:'170007'},{bypass:false},{isolation:'serializable'}])assert.throws(()=>verifyIdentity(JSON.stringify({...i,...patch})));
});
test('unknown COMMIT recovery requires exact original SQL, full row and approved catalog',async()=>{
 const d=await decision(),{sql}=await frozenBytes();const r={version,name:'wing_jury_saved_destinations_forward',statements:[sql],created_by:null,idempotency_key:null,rollback:null};
 assert.equal(classifyRecovery(JSON.stringify([r]),sql,d.postSnapshot,d),'committed');
 assert.equal(classifyRecovery('[]',sql,d.snapshot,d),'rolled-back');
 assert.equal(classifyRecovery(JSON.stringify([{...r,created_by:'drift'}]),sql,d.postSnapshot,d),'mixed-or-drifted');
 assert.equal(classifyRecovery(JSON.stringify([r]),sql,d.snapshot,d),'mixed-or-drifted');
 assert.equal(classifyRecovery(JSON.stringify([{...r,statements:undefined,originalMatches:true}]),sql,d.postSnapshot,d),'committed');
 const recovery=recoverySQL(sql);assert.match(recovery,/begin read only/);assert.equal((recovery.match(/select json_build_object\('snapshot'/g)||[]).length,1);assert.ok(recovery.includes('md5(to_jsonb(m)::text)'));assert.ok(recovery.includes('statements=array['));
});
function pipeFixture(){const child=new EventEmitter();child.stdin=new PassThrough();child.stdout=new PassThrough();child.stderr=new PassThrough();let killed=false;child.kill=()=>{if(!killed){killed=true;child.emit('close',1);}};child.stdin.on('end',()=>child.kill());return child;}
test('persistent protocol requires exact acknowledgment and handles split output',async()=>{
 const child=pipeFixture(),s=attachPsqlProcess(child,2000);let input='';child.stdin.on('data',data=>{input+=data;});
 const pending=s.execute('select 1;');const marker=input.match(/\\echo (BUFFAGO_\w+)/)[1];child.stdout.write('1\n'+marker.slice(0,12));child.stdout.write(marker.slice(12)+'\n');assert.equal(await pending,'1');await s.close();
});
test('framing refuses marker substrings and failed sessions remain terminal',async()=>{
 const child=pipeFixture(),s=attachPsqlProcess(child,2000);let input='';child.stdin.on('data',data=>{input+=data;});
 const pending=s.execute('select 1;'),marker=input.match(/\\echo (BUFFAGO_\w+)/)[1];let resolved=false;pending.then(()=>resolved=true);
 child.stdout.write('prefix'+marker+'suffix\n');await new Promise(r=>setImmediate(r));assert.equal(resolved,false);
 child.stdout.write(marker+'\n');assert.equal(await pending,'prefix'+marker+'suffix');
 const broken=s.execute('select 2;'),refused=assert.rejects(broken);child.stderr.write('ERROR:  42501\n');await refused;assert.throws(()=>s.execute('select 3;'));await s.close();
});
test('signed approval rejects invalid intervals, missing backup and identical pre/post digests',async()=>{
 const d=await decision(),impl=await implementationHashes();
 for(const patch of [{incidentBackup:''},{windowStart:d.windowEnd},{issuedAt:d.expiresAt},{postSnapshot:d.snapshot},{deadlineMs:900001}])assert.throws(()=>validateDecision(signature({...d,...patch}),trust,impl));
 const rsa=generateKeyPairSync('rsa',{modulusLength:2048});assert.throws(()=>validateDecision(signature(d),{...trust,publicKey:rsa.publicKey},impl),/Ed25519/);
 assert.throws(()=>validateDecision(signature(d),{...trust,publicKey:privateKey},impl),/public approval key/);
 assert.equal(validateDecision(signature(d),{...trust,publicKey:publicKey.export({format:'pem',type:'spki'})},impl).action,'apply');
});
test('persistent protocol fails closed on SQLSTATE, EOF and whole-attempt timeout without replay',async()=>{
 for(const mode of ['sqlstate','eof','timeout']){
  const child=pipeFixture(),s=attachPsqlProcess(child,mode==='timeout'?20:2000);let sends=0;child.stdin.on('data',()=>sends++);
  const pending=s.execute('begin; select 1; commit;');const rejection=assert.rejects(pending,error=>mode==='sqlstate'?error.sqlstate==='42501':/without acknowledgment/.test(error.message));
  if(mode==='sqlstate'){child.stderr.write('ERROR:  425');child.stderr.write('01\n');}else if(mode==='eof')child.kill();
  await rejection;assert.equal(sends,1);await s.close();
 }
});
test('external evidence is fsynced and exclusive; unavailable sink stops before transport',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'buffago-7b3d-')),path=join(dir,'attempt.jsonl');const sink=await durableEvidence(path);await sink.append({status:'started'});await sink.close();assert.equal(JSON.parse(await readFile(path,'utf8')).status,'started');await assert.rejects(durableEvidence(path));await assert.rejects(durableEvidence(join(dir,'missing','attempt')));
});
test('cleanup/evidence failures retain primary transaction error and unambiguous no-write classification',async()=>{
 const primary=Object.assign(Error('first transport failure'),{sqlstate:'40P01'});
 const audit={append:async r=>{if(r.status==='failed-or-unknown')throw Error('secondary audit failure');},close:async()=>{throw Error('audit close failure');}};
 await assert.rejects(verifiedAttempt({decision:{action:'apply'},audit,connect:()=>({execute:async()=>{throw primary;},close:async()=>{throw Error('transport close failure');}})}),e=>e.cause===primary&&e.sqlstate==='40P01'&&!e.writeStarted&&!e.commitAcknowledged&&e.evidenceError.message==='secondary audit failure'&&e.cleanupError.message==='transport close failure');
});
let localStarted=false;
async function localFixture(){if(!localStarted){await startDisposablePostgres();await query('buffago_phase7b25','create role supabase_auth_admin nologin; create role supabase_storage_admin nologin;');localStarted=true;}}
test('real disposable atomic six-column ledger and common-snapshot recovery preserve all historical metadata',async()=>{
 await localFixture();const db=await fixture({bootstrap:new URL('./fixtures/phase7b3a-production-shaped-bootstrap.sql',import.meta.url),migration:false});
 await query(db,`create schema supabase_migrations;create table supabase_migrations.schema_migrations(version text primary key,statements text[],name text,created_by text,idempotency_key text unique,rollback text[]);insert into supabase_migrations.schema_migrations values('20261009201342',array['NEVER REPLAY'],'baseline','historic actor','historic key',array['historic rollback']);`);
 const historical=await query(db,"select row_to_json(m) from supabase_migrations.schema_migrations m"),snapshot=await query(db,snapshotSQL),{sql}=await frozenBytes();
 // Only the fixture-specific constructor can omit unmatched production bodies.
 const kernel=await transactionKernel({snapshot,expectedDatabase:db,strict:false});await query(db,kernel);
 assert.equal(await query(db,"select row_to_json(m) from supabase_migrations.schema_migrations m where version='20261009201342'"),historical);
 const result=JSON.parse(await query(db,recoverySQL(sql)));assert.equal(result.rows.length,1);assert.equal(result.rows[0].originalMatches,true);
 const fixtureDecision={snapshot,postSnapshot:result.snapshot}; // TEST ONLY, no production digest adopted.
 assert.equal(classifyRecovery(JSON.stringify(result.rows),sql,result.snapshot,fixtureDecision),'committed');
 await query(db,`update supabase_migrations.schema_migrations set created_by='metadata drift' where version='20261009201342';`);
 const drift=JSON.parse(await query(db,recoverySQL(sql)));assert.equal(classifyRecovery(JSON.stringify(drift.rows),sql,drift.snapshot,fixtureDecision),'mixed-or-drifted');
 await query(db,`update supabase_migrations.schema_migrations set created_by='historic actor' where version='20261009201342';grant select(name) on public.destinations to anon;`);
 const columnDrift=JSON.parse(await query(db,recoverySQL(sql)));assert.notEqual(columnDrift.snapshot,fixtureDecision.postSnapshot);assert.equal(classifyRecovery(JSON.stringify(columnDrift.rows),sql,columnDrift.snapshot,fixtureDecision),'mixed-or-drifted');
 const beforeDb=await fixture({bootstrap:new URL('./fixtures/phase7b3a-production-shaped-bootstrap.sql',import.meta.url),migration:false});
 await query(beforeDb,`create schema supabase_migrations;create table supabase_migrations.schema_migrations(version text primary key,statements text[],name text,created_by text,idempotency_key text unique,rollback text[]);`);
 const beforeSnapshot=await query(beforeDb,snapshotSQL),beforeKernel=await transactionKernel({snapshot:beforeSnapshot,expectedDatabase:beforeDb,strict:false});
 const interrupted=session(beforeDb,'7b3d-disconnect-before-commit');
 try{await interrupted.execute(beforeKernel.slice(0,beforeKernel.lastIndexOf('commit;')));}finally{await interrupted.close();}
 const rolledBack=JSON.parse(await query(beforeDb,recoverySQL(sql)));
 assert.equal(classifyRecovery(JSON.stringify(rolledBack.rows),sql,rolledBack.snapshot,{snapshot:beforeSnapshot,postSnapshot:result.snapshot}),'rolled-back');
 assert.equal(await query(beforeDb,"select to_regclass('public.wing_jury_votes') is null"),'t');
});
test('real disposable PostgreSQL 17.6 verified TLS and SCRAM reject hostname, CA, credential and downgrade failures',async()=>{
 await localFixture();const connect=await disposableTLS();
 assert.match(await connect(),/^fixture_tls:true:TLSv1\.[23]$/);
 await assert.rejects(connect({host:'127.0.0.1'}),/certificate|host name/i);
 await assert.rejects(connect({ca:'/tmp/missing-ca'}),/root certificate/i);
 await assert.rejects(connect({ca:'/tmp/untrusted.crt'}),/certificate verify failed/i);
 await assert.rejects(connect({credential:'incorrect'}),/authentication failed/i);
 await assert.rejects(connect({user:'fixture_trust'}),/authentication.*requirement|did not complete authentication/i);
 await assert.rejects(connect({ssl:'disable'}),/no pg_hba.conf entry/i);
 await assert.rejects(connect({user:'missing'}),/authentication failed/i);
 await assert.rejects(connect({db:'missing'}),/does not exist/i);
 await connect.expire();await assert.rejects(connect({ca:'/tmp/expired.crt'}),/certificate verify failed/i);
 await connect.disable();await assert.rejects(connect(),/does not support SSL/i);
});
