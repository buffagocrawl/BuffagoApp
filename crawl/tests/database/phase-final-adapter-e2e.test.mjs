import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {verifiedAttempt} from '../../scripts/phase-final-adapter-attempt.mjs';
import {identitySQL,verifyIdentity,recoverySQL,classifyRecovery,durableEvidence,hash,implementationHashes} from '../../scripts/phase7b3d-production-adapter.mjs';
import {frozenBytes,transactionKernel,snapshotSQL,snapshotExpression,version,migrationHash,preflightHash} from '../../scripts/phase7b3b-feature-executor.mjs';
import {startDisposablePostgres,fixture,query,session} from '../../scripts/phase7b25-postgres.mjs';
import {adapterTLSFixture} from '../../scripts/phase7b3d-native-postgres.mjs';

let transport,dbs;const approvedFixtureStates=new Map();
const root=fileURLToPath(new URL('../../.expo/',import.meta.url));
const ledger=`create schema supabase_migrations;create table supabase_migrations.schema_migrations(version text primary key,statements text[],name text,created_by text,idempotency_key text unique,rollback text[]);insert into supabase_migrations.schema_migrations values('20261009201342',array['NEVER REPLAY'],'baseline','historic actor','historic key',array['historic rollback']);`;
async function setup(){
 if(transport)return;
 process.env.BUFFAGO_PHASE_FINAL_ADAPTER_FIXTURE='1';
 await mkdir(root,{recursive:true});await startDisposablePostgres();
 await query('buffago_phase7b25','create role supabase_auth_admin nologin;create role supabase_storage_admin nologin;');
 dbs=[];for(let n=0;n<11;n++){
  const db=await fixture({bootstrap:new URL('./fixtures/phase7b3a-production-shaped-bootstrap.sql',import.meta.url),migration:false});
  await query(db,ledger);dbs.push(db);
 }
 transport=await adapterTLSFixture();
 console.log(JSON.stringify({...transport.descriptor,passfile:'REDACTED local credential path',psqlHash:hash(await readFile(transport.descriptor.psql)),caHash:hash(await readFile(transport.descriptor.ca))}));
}
const verifyFixture=db=>value=>{const i=JSON.parse(value);assert.equal(i.database,db);return {...verifyIdentity(JSON.stringify({...i,database:'postgres'})),database:db};};
async function execute(db,sql){const s=transport.connect(db,30000);try{return await s.execute(sql);}finally{await s.close();}}
async function states(db){
 if(approvedFixtureStates.has(db))return approvedFixtureStates.get(db);
 const snapshot=await execute(db,snapshotSQL);
 const kernel=await transactionKernel({snapshot,expectedDatabase:db,strict:false});
 const postSnapshot=await execute(db,kernel.slice(0,kernel.lastIndexOf('commit;'))+`select md5((${snapshotExpression})::text);rollback;`);
 assert.match(postSnapshot,/^[a-f0-9]{32}$/);assert.equal(await execute(db,snapshotSQL),snapshot);
 const state={snapshot,postSnapshot};approvedFixtureStates.set(db,state);return state;
}
async function attempt(db,{action='apply',audit,connect,preflight='begin read only;select 1 where false;rollback;',decisionPatch={},kernelPatch=x=>x,stateOverride}={}){
 const state=stateOverride??await states(db);const {sql}=await frozenBytes();
 const d={action,...state,...decisionPatch,identitySQL,actor:'LOCAL SYNTHETIC DECISION',caHash:hash(await readFile(transport.descriptor.ca)),controlPlaneEvidence:'LOCAL LOOPBACK FIXTURE; NO PRODUCTION PROOF'};
 const sink=audit??await durableEvidence(fileURLToPath(new URL(`../../.expo/final-B-e2e-${db}-${action}-${Date.now()}.jsonl`,import.meta.url)));
 return verifiedAttempt({decision:d,implementation:await implementationHashes(),decisionHash:hash(JSON.stringify(d)),audit:sink,connect:connect??(()=>transport.connect(db)),verifyIdentity:verifyFixture(db),frozenBytes:async()=>({sql,preflight}),snapshotSQL,recoverySQL,classifyRecovery,
  kernel:async()=>kernelPatch(await transactionKernel({snapshot:d.snapshot,expectedDatabase:db,strict:false})),revalidate:()=>{},project:'DISPOSABLE_ONLY',version,migrationHash,preflightHash});
}
async function absent(db){assert.equal(await execute(db,"select to_regclass('public.wing_jury_votes') is null"),'t');assert.equal(await execute(db,`select count(*) from supabase_migrations.schema_migrations where version='${version}'`),'0');}

test('full shared adapter attempt: nonsuper postgres verified TLS/SCRAM, exact frozen feature + singleton ledger and independent confirmation',async()=>{
 await setup();const db=dbs[0],before=await execute(db,"select row_to_json(m) from supabase_migrations.schema_migrations m");
 assert.equal(await attempt(db),'confirmed');
 assert.equal(await execute(db,"select row_to_json(m) from supabase_migrations.schema_migrations m where version='20261009201342'"),before);
 assert.equal(await execute(db,`select count(*)||':'||max(cardinality(statements)) from supabase_migrations.schema_migrations where version='${version}'`),'1:1');
});
test('read-only inspect creates no feature; strict frozen production preflight refuses unmatched real fixture before writes',async()=>{
 await setup();const db=dbs[1];assert.equal(await attempt(db,{action:'inspect'}),'inspection-confirmed');await absent(db);
 const {preflight}=await frozenBytes();await assert.rejects(attempt(db,{preflight}),e=>e.step==='preflight'&&!e.writeStarted);await absent(db);
});
test('failure of durable started/write-started evidence prevents any migration SQL',async()=>{
 await setup();for(const status of ['started','write-started']){const db=dbs[status==='started'?2:3],rows=[];
  const audit={append:async r=>{rows.push(r);if(r.status===status)throw Error('injected fsync failure');},close:async()=>{}};
  await assert.rejects(attempt(db,{audit}),e=>!e.writeStarted&&e.cause.message==='injected fsync failure');await absent(db);
 }
});
test('late statement failure rolls back DDL/new ledger; fsync failure preserves primary SQLSTATE and closes transaction',async()=>{
 await setup();const db=dbs[4];
 const audit={append:async r=>{if(r.status==='failed-or-unknown')throw Error('injected failure evidence unavailable');},close:async()=>{}};
 await assert.rejects(attempt(db,{audit,kernelPatch:k=>k.replace(/commit;\s*$/,"select 1/0;commit;")}),e=>e.sqlstate==='22012'&&e.evidenceError.message.includes('unavailable')&&e.writeStarted&&!e.commitAcknowledged);
 await absent(db);
});
test('wrong authenticated role and baseline drift abort before migration',async()=>{
 await setup();const db=dbs[5];
 await assert.rejects(attempt(db,{connect:()=>transport.connect(db,20000,'fixture_adapter_wrong')}),e=>!e.writeStarted);
 await assert.rejects(attempt(db,{decisionPatch:{snapshot:'0'.repeat(32)}}),e=>e.step==='preflight'&&!e.writeStarted);await absent(db);
});
test('nonforward ledger collision and lock contention fail atomically with frozen 5 second timeout',async()=>{
 await setup();const db=dbs[6],collisionState=await states(db);await transport.admin(db,`insert into supabase_migrations.schema_migrations(version)values('${version}');`);
 await assert.rejects(attempt(db,{stateOverride:collisionState}),e=>e.step==='preflight'&&!e.writeStarted);assert.equal(await execute(db,"select to_regclass('public.wing_jury_votes') is null"),'t');
 const locked=dbs[7],lockState=await states(locked),s=transport.connect(locked);await s.execute('begin;lock table public.destination_ratings in row exclusive mode;');
 const began=Date.now();try{await assert.rejects(attempt(locked,{stateOverride:lockState}),e=>e.sqlstate==='55P03');assert.ok(Date.now()-began>=4900);}finally{await s.close();}await absent(locked);
});
test('lost acknowledgment after COMMIT never replays; common snapshot read-only recovery confirms original singleton',async()=>{
 await setup();const db=dbs[8];let connects=0,applications=0;
 const connect=()=>{connects++;const s=transport.connect(db);return {async execute(sql){if(sql.includes('insert into supabase_migrations.schema_migrations(version,name,statements)'))applications++;return s.execute(sql);},close:()=>s.close()};};
 // Actually terminate the server connection after durable COMMIT and before
 // psql can emit its framing acknowledgment; this is not a mocked EOF.
 await assert.rejects(attempt(db,{connect,kernelPatch:k=>k.replace(/commit;\s*$/,'commit;select pg_terminate_backend(pg_backend_pid());')}),e=>e.writeStarted&&!e.commitAcknowledged&&e.step==='commit-attempt');assert.equal(connects,1);assert.equal(applications,1);
 assert.equal(await attempt(db,{action:'recover',stateOverride:approvedFixtureStates.get(db)}),'committed');
});
test('connection loss before COMMIT rolls back; independent confirmation drift and confirmed-evidence failure remain unknown to caller',async()=>{
 await setup();const before=dbs[9];
 await assert.rejects(attempt(before,{kernelPatch:k=>k.slice(0,k.lastIndexOf('commit;'))+'select pg_terminate_backend(pg_backend_pid());'}),e=>e.writeStarted&&!e.commitAcknowledged);await absent(before);
 const db=dbs[10],audit={append:async r=>{if(r.status==='confirmed'||r.status==='failed-or-unknown')throw Error('injected post-COMMIT evidence failure');},close:async()=>{}};
 await assert.rejects(attempt(db,{audit}),e=>e.writeStarted&&e.commitAcknowledged&&e.evidenceError&&e.step==='independent-confirmation');
 assert.equal(await execute(db,`select count(*) from supabase_migrations.schema_migrations where version='${version}'`),'1');
 const drift=dbs[2];
 await assert.rejects(attempt(drift,{decisionPatch:{postSnapshot:'0'.repeat(32)}}),e=>e.writeStarted&&e.commitAcknowledged&&e.step==='independent-confirmation'&&e.cause.message.includes('COMMIT acknowledgment is insufficient'));
 assert.equal(await execute(drift,`select count(*) from supabase_migrations.schema_migrations where version='${version}'`),'1');
});
test('missing production-shaped Storage privilege is rejected by exact frozen body without permission escalation',async()=>{
 await setup();const db=dbs[3],state=await states(db);
 await transport.admin(db,'revoke select on storage.objects from postgres;');
 try{await assert.rejects(attempt(db,{stateOverride:{...state,snapshot:await execute(db,snapshotSQL)}}),e=>e.writeStarted&&(e.sqlstate==='P0001'||e.sqlstate==='42501'));await absent(db);}
 finally{await transport.admin(db,'grant select on storage.objects to postgres;');}
});
