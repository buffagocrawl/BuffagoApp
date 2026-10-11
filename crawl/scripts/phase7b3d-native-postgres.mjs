import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {randomUUID,createHash} from 'node:crypto';
import {mkdir,readFile,writeFile,appendFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {attachPsqlProcess} from './phase7b3d-production-adapter.mjs';

// Explicit local fallback when Docker Desktop is unavailable. Never targets an
// installed cluster/service. Unique directory, exclusively chosen loopback
// port and exact downloaded EDB17.6 binaries; fixtures retained after shutdown.
const root=fileURLToPath(new URL('../.expo/phase7b3d-native17-minimal/',import.meta.url));
const bin=join(root,'pgsql','bin');
const data=join(root,'fixtures',randomUUID());
const database='buffago_phase7b25';
let port,ready=false,ordinal=0;
const environment=()=>Object.fromEntries(Object.entries(process.env).filter(([k])=>!k.toUpperCase().startsWith('PG')));
function command(executable,args,input='',extra={},timeoutMs=30000,controller=false){return new Promise((resolve,reject)=>{
 const child=spawn(executable,args,{env:{...environment(),...extra},windowsHide:true,shell:false,stdio:['pipe','pipe','pipe']});let out='',err='',inputError;
 const timer=setTimeout(()=>{child.kill();reject(new Error(`Native fixture ${executable} exceeded ${timeoutMs}ms; no retry`));},timeoutMs);
 // ON_ERROR_STOP can exit while a large SQL file is still being piped. Preserve
 // PostgreSQL's stderr rather than masking its expected refusal with EPIPE.
 child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>err+=d);child.stdin.on('error',e=>{inputError=e;});child.on('error',e=>{clearTimeout(timer);reject(e);});child.on('close',code=>{clearTimeout(timer);code===0&&!inputError?resolve(out.replaceAll('\r\n','\n').trim()):reject(new Error(`Native fixture failed (${code}): ${err||out||inputError?.message}`));});child.stdin.end(input);
 if(controller)child.on('exit',code=>{clearTimeout(timer);child.stdout.destroy();child.stderr.destroy();code===0?resolve(out.trim()):reject(new Error(`Native fixture controller failed (${code}): ${err||out}`));});
});}
const args=db=>['-X','-q','-A','-t','-w','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-h','127.0.0.1','-p',String(port),'-U','postgres','-d',db];
// Windows psql's text-mode stdin removes CR in CRLF. Encode CR inside dollar
// string bodies explicitly so fixture prosrc matches the exact supplied bytes,
// including the existing raw-matched helpers. Never change the frozen file.
const preserveBodies=sql=>sql.replace(/(\$(?:[a-zA-Z_][a-zA-Z0-9_]*)?\$)([\s\S]*?)\1/g,(all,tag,body)=>body.includes('\r')?"E'"+body.replaceAll('\\','\\\\').replaceAll("'","''").replaceAll('\r','\\r')+"'":all);
export async function start(){
 assert.equal(process.env.BUFFAGO_PHASE7B3D_NATIVE17,'1');assert.equal(process.platform,'win32');
 assert.equal(await command(join(bin,'postgres.exe'),['--version']),'postgres (PostgreSQL) 17.6');
 const archive=await readFile(fileURLToPath(new URL('../.expo/phase7b3d-postgresql-17.6.zip',import.meta.url)));
 // EDB HTTPS response supplies this archive MD5. SHA256 recorded independently.
 assert.equal(createHash('md5').update(archive).digest('hex'),'7b8779539b83ff8f3f5a777448435ee1');
 await mkdir(data,{recursive:true});
 // Initial empty disposable cluster only; server fsync/WAL defaults stay on.
 // PostgreSQL17 correctly forbids demoting the bootstrap role. The adapter
 // fixture creates postgres separately so its nonsuper production identity
 // can be reproduced without bypassing verifyIdentity or using SET ROLE.
 const adapterFixture=process.env.BUFFAGO_PHASE_FINAL_ADAPTER_FIXTURE==='1';
 assert.ok(!process.env.BUFFAGO_PHASE_FINAL_ADAPTER_FIXTURE||adapterFixture);
 const bootstrapUser=adapterFixture?'fixture_bootstrap':'postgres';
 await command(join(bin,'initdb.exe'),['-D',data,'-U',bootstrapUser,'-A','trust','--encoding=UTF8','--locale=C','--no-sync'], '', {},120000);
 port=await new Promise((resolve,reject)=>{const s=createServer();s.on('error',reject);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
 await command(join(bin,'pg_ctl.exe'),['-D',data,'-l',join(data,'server.log'),'-o',`-h 127.0.0.1 -p ${port}`,'-w','start'],'',{},60000,true);ready=true;
 if(adapterFixture)await command(join(bin,'psql.exe'),args('postgres').map((v,i,a)=>a[i-1]==='-U'?bootstrapUser:v),'create role postgres superuser login;');
 const identity=await command(join(bin,'psql.exe'),args('postgres'),"select current_user||':'||current_setting('server_version_num')");assert.equal(identity,'postgres:170006');
 await command(join(bin,'psql.exe'),args('postgres'),`create database ${database}; create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
 console.log(JSON.stringify({disposableNative:true,version:'17.6',data,port,listen:'127.0.0.1',serviceInstalled:false,archiveSHA256:createHash('sha256').update(archive).digest('hex'),psqlSHA256:createHash('sha256').update(await readFile(join(bin,'psql.exe'))).digest('hex'),retained:true}));
}
// Test assertions and COMMIT/recovery checks finish BEFORE teardown. Immediate
// shutdown avoids a many-database Windows checkpoint delaying the next suite;
// fsync/WAL stays enabled during every test. Files/WAL remain for crash recovery.
export async function stop(){if(ready){await command(join(bin,'pg_ctl.exe'),['-D',data,'-m','immediate','-t','30','-w','stop'],'',{},40000,true);ready=false;}}
export function query(db,sql,applicationName='phase7b3d-native'){
 assert.ok(ready);assert.match(db,/^buffago_phase7b25(?:_[0-9]+)?$/);
 return command(join(bin,'psql.exe'),args(db),preserveBodies(sql),{PGAPPNAME:applicationName});
}
export async function fixture(options={}){const db=`${database}_${++ordinal}`;await query(database,`create database ${db}`);await query(db,await readFile(options.bootstrap??new URL('../tests/database/fixtures/phase7b25-postgres-bootstrap.sql',import.meta.url),'utf8'));if(options.migration!==false)await query(db,await readFile(options.migration??new URL('../supabase/local/phase-2b/20261009_local_phase2b_foundation.sql',import.meta.url),'utf8'));return db;}
export function session(db,applicationName){
 assert.ok(ready);assert.match(db,/^buffago_phase7b25_[0-9]+$/);
 const child=spawn(join(bin,'psql.exe'),args(db),{env:{...environment(),PGAPPNAME:applicationName},windowsHide:true,shell:false,stdio:['pipe','pipe','pipe']});
 // Fixture sessions retain PostgreSQL's actual verbose diagnostics, matching
 // the Docker fixture interface. The production adapter remains credential-
 // free and generic; no production session is reachable through this harness.
 let diagnostics='';child.stderr.on('data',data=>diagnostics+=data);
 const protocol=attachPsqlProcess(child,20000);
 return {execute:sql=>protocol.execute(preserveBodies(sql)+';').then(output=>output.replaceAll('\r\n','\n')).catch(error=>{if(diagnostics)error.message=diagnostics;throw error;}),close:()=>protocol.close()};
}
export async function tls(){
 assert.ok(ready);const openssl='C:/Program Files/Git/usr/bin/openssl.exe';
 const key=join(data,'server.key'),cert=join(data,'server.crt'),untrusted=join(data,'untrusted.crt'),expired=join(data,'expired.crt');
 await command(openssl,['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,'-days','1','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost']);
 await command(openssl,['req','-x509','-newkey','rsa:2048','-nodes','-keyout',join(data,'untrusted.key'),'-out',untrusted,'-days','1','-subj','/CN=untrusted']);
 await command(openssl,['req','-new','-key',key,'-out',join(data,'expired.csr'),'-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost']);
 const sqlPath=p=>p.replaceAll('\\','/').replaceAll("'","''");
 await writeFile(join(data,'cert-index'),'');await writeFile(join(data,'cert-serial'),'01\n');await mkdir(join(data,'certs'));
 await writeFile(join(data,'expired-ca.cnf'),`[ca]\ndefault_ca=fixture\n[fixture]\ndatabase=${sqlPath(join(data,'cert-index'))}\nserial=${sqlPath(join(data,'cert-serial'))}\nnew_certs_dir=${sqlPath(join(data,'certs'))}\ndefault_md=sha256\npolicy=subject_policy\ncopy_extensions=copy\n[subject_policy]\ncommonName=supplied\n`);
 await command(openssl,['ca','-config',join(data,'expired-ca.cnf'),'-selfsign','-keyfile',key,'-cert',cert,'-in',join(data,'expired.csr'),'-out',expired,'-startdate','20200101000000Z','-enddate','20200102000000Z','-batch','-notext']);
 await appendFile(join(data,'postgresql.conf'),`\nssl=on\nssl_cert_file='${sqlPath(cert)}'\nssl_key_file='${sqlPath(key)}'\n`);
 await writeFile(join(data,'pg_hba.conf'),'host all postgres 127.0.0.1/32 trust\nhostssl all fixture_trust 127.0.0.1/32 trust\nhostssl all all 127.0.0.1/32 scram-sha-256\n');
 const password=randomUUID();await query(database,`set password_encryption='scram-sha-256'; create role fixture_tls login password '${password}';create role fixture_trust login; select pg_reload_conf();`);
 let tlsReady=false;for(let n=0;n<30;n++){if(await query(database,'show ssl')==='on'){tlsReady=true;break;}await new Promise(r=>setTimeout(r,100));}assert.ok(tlsReady);
 const connect=async({host='localhost',ca='/tmp/buffago.crt',ssl='verify-full',credential=password,user='fixture_tls',db=database}={})=>{
  assert.ok(['localhost','127.0.0.1'].includes(host));
  const certs={'/tmp/buffago.crt':cert,'/tmp/untrusted.crt':untrusted,'/tmp/expired.crt':expired,'/tmp/missing-ca':join(data,'missing-ca')};assert.ok(certs[ca]);
  return command(join(bin,'psql.exe'),['-X','-q','-A','-t','-w','-v','ON_ERROR_STOP=1','-h',host,'-p',String(port),'-U',user,'-d',db],`begin read only;select current_user||':'||ssl||':'||version from pg_stat_ssl where pid=pg_backend_pid();rollback;`,{PGSSLMODE:ssl,PGSSLROOTCERT:certs[ca],PGPASSWORD:credential,PGREQUIREAUTH:'scram-sha-256',PGGSSENCMODE:'disable',PGSSLMINPROTOCOLVERSION:'TLSv1.2'});
 };
 connect.expire=async()=>{await query(database,`alter system set ssl_cert_file='${sqlPath(expired)}';select pg_reload_conf();`);await new Promise(r=>setTimeout(r,300));};
 connect.disable=async()=>{await query(database,"alter system set ssl='off';select pg_reload_conf();");await new Promise(r=>setTimeout(r,300));};return connect;
}

// Separate final adapter fixture. Provision databases before calling: demoting
// postgres is local to this fresh cluster and must never alter another server.
// The returned transport accepts only existing numbered fixture databases,
// fixed loopback routing, verify-full and SCRAM; there is no production route.
export async function adapterTLSFixture(){
 assert.ok(ready);assert.equal(process.env.BUFFAGO_PHASE7B3D_NATIVE17,'1');assert.equal(process.env.BUFFAGO_PHASE_FINAL_ADAPTER_FIXTURE,'1');
 const openssl='C:/Program Files/Git/usr/bin/openssl.exe';
 const key=join(data,'adapter.key'),cert=join(data,'adapter.crt'),passfile=join(data,'adapter.pgpass');
 await command(openssl,['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,'-days','1','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost']);
 const sqlPath=p=>p.replaceAll('\\','/').replaceAll("'","''");
 const hba=await readFile(join(data,'pg_hba.conf'),'utf8');
 const password=randomUUID();
 await query(database,`create role fixture_adapter_admin superuser login;set password_encryption='scram-sha-256';alter role postgres password '${password}';create role fixture_adapter_wrong login password '${password}';`);
 await writeFile(passfile,`localhost:${port}:*:postgres:${password}\nlocalhost:${port}:*:fixture_adapter_wrong:${password}\n`,{mode:0o600});
 await appendFile(join(data,'postgresql.conf'),`\nssl=on\nssl_cert_file='${sqlPath(cert)}'\nssl_key_file='${sqlPath(key)}'\n`);
 await writeFile(join(data,'pg_hba.conf'),`host all fixture_adapter_admin 127.0.0.1/32 trust\nhostssl all postgres 127.0.0.1/32 scram-sha-256\nhostssl all fixture_adapter_wrong 127.0.0.1/32 scram-sha-256\nhostnossl all postgres 127.0.0.1/32 reject\n${hba}`);
 const adminArgs=db=>args(db).map((v,i,a)=>a[i-1]==='-U'?'fixture_adapter_admin':v);
 const admin=(db,sql)=>{assert.match(db,/^buffago_phase7b25(?:_[0-9]+)?$/);return command(join(bin,'psql.exe'),adminArgs(db),preserveBodies(sql));};
 await admin(database,'select pg_reload_conf();');
 for(let n=0;n<30;n++){if(await admin(database,'show ssl')==='on')break;await new Promise(r=>setTimeout(r,100));}
 await admin(database,'alter role postgres nosuperuser bypassrls;');
 const connect=(db,deadlineMs=20000,user='postgres')=>{
  assert.match(db,/^buffago_phase7b25_[0-9]+$/);assert.ok(ready);assert.ok(['postgres','fixture_adapter_wrong'].includes(user));
  const env={...environment(),LC_ALL:'C',LANG:'C',PGHOST:'localhost',PGPORT:String(port),PGDATABASE:db,PGUSER:user,PGSSLMODE:'verify-full',PGSSLROOTCERT:cert,PGPASSFILE:passfile,PGREQUIREAUTH:'scram-sha-256',PGGSSENCMODE:'disable',PGSSLMINPROTOCOLVERSION:'TLSv1.2',PGCONNECT_TIMEOUT:'5'};
  return attachPsqlProcess(spawn(join(bin,'psql.exe'),['-X','-q','-A','-t','-w','-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate'],{env,windowsHide:true,shell:false,stdio:['pipe','pipe','pipe']}),deadlineMs);
 };
 return {connect,admin,descriptor:{fixture:true,host:'localhost',port,psql:join(bin,'psql.exe'),ca:cert,passfile},async restore(){await admin(database,'alter role postgres superuser;');await writeFile(join(data,'pg_hba.conf'),hba);await admin(database,'select pg_reload_conf();');}};
}
