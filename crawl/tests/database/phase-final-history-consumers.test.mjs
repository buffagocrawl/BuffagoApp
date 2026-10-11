import {before,test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile,appendFile} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {startDisposablePostgres,fixture,query,disposableTLS} from '../../scripts/phase7b25-postgres.mjs';
import {frozenBytes,version} from '../../scripts/phase7b3b-feature-executor.mjs';
const bootstrap=new URL('./fixtures/phase7b3a-production-shaped-bootstrap.sql',import.meta.url);
before(async()=>{await startDisposablePostgres();await query('buffago_phase7b25','create role supabase_auth_admin nologin;create role supabase_storage_admin nologin;');});
const cli='C:/Users/Brand/AppData/Roaming/npm/supabase.ps1';
const quote=s=>"'"+s.replaceAll("'","''")+"'";
async function command(args){
 const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.toUpperCase().startsWith('PG')&&!key.toUpperCase().startsWith('SUPABASE_')));
 env.DO_NOT_TRACK='1';env.SUPABASE_TELEMETRY_DISABLED='true';
 return new Promise((resolve,reject)=>{
  const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command',`& ${quote(cli)} ${args.map(quote).join(' ')}; exit $LASTEXITCODE`],{env,windowsHide:true,shell:false,stdio:['ignore','pipe','pipe']});let out='',err='';
  const deadline=setTimeout(()=>{child.kill();reject(new Error('Disposable CLI history read deadline'));},60000);
  child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>err+=d);child.on('error',reject);child.on('close',code=>{clearTimeout(deadline);code===0?resolve({out,err}):reject(new Error(`CLI read failed ${code}: ${err||out}`));});
 });
}
test('installed CLI2.107.0 lists singleton original SQL against six-column ledger with database-enforced read-only role',async()=>{
 assert.equal((await command(['--version'])).out.trim(),'2.107.0');
 const db=await fixture({bootstrap,migration:false}),{sql}=await frozenBytes();
 await disposableTLS();
 const literal="E'"+sql.replaceAll('\\','\\\\').replaceAll("'","''")+"'";
 await query(db,`create schema supabase_migrations;create table supabase_migrations.schema_migrations(version text primary key,statements text[],name text,created_by text,idempotency_key text unique,rollback text[]);insert into supabase_migrations.schema_migrations values('${version}',array[${literal}],'wing_jury_saved_destinations_forward',null,null,null);alter role fixture_trust set default_transaction_read_only=on;grant usage on schema supabase_migrations to fixture_trust;grant select on supabase_migrations.schema_migrations to fixture_trust;`);
 const port=await query(db,'select inet_server_port()');assert.match(port,/^\d+$/);
 const url=`postgresql://fixture_trust@127.0.0.1:${port}/${db}?sslmode=require`;
 const work=new URL(`../../.expo/final-release/history-cli-${randomUUID()}/`,import.meta.url);
 await mkdir(new URL('supabase/migrations/',work),{recursive:true});
 await writeFile(new URL('supabase/config.toml',work),'project_id = "buffago-disposable-history-read"\n');
 await writeFile(new URL(`supabase/migrations/${version}_wing_jury_saved_destinations_forward.sql`,work),sql);
 const before=await query(db,'select md5(to_jsonb(m)::text) from supabase_migrations.schema_migrations m');
 const result=await command(['migration','list','--db-url',url,'--workdir',fileURLToPath(work)]);
 assert.match(result.out,new RegExp(version));
 assert.equal(await query(db,'select md5(to_jsonb(m)::text) from supabase_migrations.schema_migrations m'),before);
 await appendFile(new URL('../../.expo/final-release/history-consumer-evidence.jsonl',import.meta.url),JSON.stringify({cli:'2.107.0',operation:'migration list',role:'fixture_trust',transport:'disposable TLS, trust auth; consumer test only, not production adapter',readOnly:true,output:result.out,stderr:result.err,sixColumns:true,statements:1,originalHash:createHash('sha256').update(sql).digest('hex')})+'\n');
});

test('pinned CLI fetch source adds a terminator and cannot reproduce frozen original bytes',async()=>{
 const source=await readFile(new URL('../../.expo/final-release/cli-source/apps_cli-go_internal_migration_fetch_fetch.go',import.meta.url),'utf8');
 assert.ok(source.includes('strings.Join(r.Statements, ";\\n") + ";\\n"'));
 const {sql}=await frozenBytes(),fetched=[sql].join(';\n')+';\n';
 assert.notEqual(createHash('sha256').update(fetched).digest('hex'),createHash('sha256').update(sql).digest('hex'));
 // Source proof, not execution of a replay. Reconstitution is deliberately
 // unapproved: fetch must never overwrite the reviewed deployment package.
});
