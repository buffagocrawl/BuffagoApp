import {test} from 'node:test';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {startDisposablePostgres,fixture,query,session} from '../../scripts/phase7b25-postgres.mjs';
import {transactionKernel,snapshotSQL,version} from '../../scripts/phase7b3b-feature-executor.mjs';

let db;
async function setup(){
 if(db)return db;
 await startDisposablePostgres();await query('buffago_phase7b25','create role supabase_auth_admin nologin;create role supabase_storage_admin nologin;');
 db=await fixture({bootstrap:new URL('./fixtures/phase7b3a-production-shaped-bootstrap.sql',import.meta.url),migration:false});
 // ONLY fixture bulk loading bypasses unrecovered prerequisite side effects.
 // Acceptance covers cost/locks/atomic ledger, not their production parity.
 await query(db,`create schema supabase_migrations;create table supabase_migrations.schema_migrations(version text primary key,statements text[],name text,created_by text,idempotency_key text unique,rollback text[]);insert into supabase_migrations.schema_migrations select lpad(g::text,14,'0'),array['historical fixture statement '||g],'historical_'||g,'actor_'||g,'key_'||g,array['rollback_'||g] from generate_series(1,25000)g;`);
 // Chunk fixture provisioning to respect the harness30s command deadline.
 // Application rehearsal still uses the original5s/60s SQL limits unchanged.
 for(let first=1;first<=100000;first+=10000){const last=first+9999;
  await query(db,`begin;set local session_replication_role=replica;
   insert into public.crawls(crawl_id) select md5('scale crawl '||g)::uuid from generate_series(${first},${last})g;
   insert into public.destination_ratings(id,user_id,destination_id,crawl_id,weight_score) select md5('scale rating '||g)::uuid,'11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',md5('scale crawl '||g)::uuid,4 from generate_series(${first},${last})g;commit;`);
 }
 for(let first=1;first<=50000;first+=10000){const last=first+9999;
  await query(db,`begin;set local session_replication_role=replica;
   insert into public.wing_media_submissions(id,user_id,media_type,status,destination_id,consent_version,consented_at,attribution_preference,original_storage_path,processed_storage_path)
   select md5('scale media '||g)::uuid,'77777777-7777-4777-8777-777777777777','photo','approved','22222222-2222-4222-8222-222222222222','v1',now(),'anonymous',
   'original/77777777-7777-4777-8777-777777777777/'||(md5('scale media '||g)::uuid)::text||'/upload','processed/'||(md5('scale media '||g)::uuid)::text||'/primary' from generate_series(${first},${last})g;
   insert into storage.objects(bucket_id,name) select 'wing-submissions','processed/'||(md5('scale media '||g)::uuid)::text||'/primary' from generate_series(${first},${last})g;commit;`);
 }
 await query(db,'analyze;');
 return db;
}
test('representative 100k ratings/50k media/25k ledger rehearsal preserves history and completes exact blocking indexes within frozen bounds',async()=>{
 await setup();
 const ledgerDigest=()=>query(db,`select md5(string_agg(to_jsonb(m)::text,E'\n' order by version)) from supabase_migrations.schema_migrations m where version<>'${version}'`);
 const history=await ledgerDigest(),started=Date.now(),snapshot=await query(db,snapshotSQL),snapshotMs=Date.now()-started;
 const kernel=await transactionKernel({snapshot,expectedDatabase:db,strict:false});
 const attempt=Date.now();await query(db,kernel);const applyMs=Date.now()-attempt;
 assert.equal(await ledgerDigest(),history);assert.equal(await query(db,'select count(*) from supabase_migrations.schema_migrations'),'25001');
 assert.equal(await query(db,"select count(*) from pg_index where indexrelid='public.wing_media_submissions_wing_jury_candidate_idx'::regclass and indisvalid and indisready"),'1');
 const indexBytes=Number(await query(db,"select pg_relation_size('public.wing_media_submissions_wing_jury_candidate_idx')"));assert.ok(indexBytes>0);
 const evidence={fixtureOnly:true,strictProductionFingerprint:false,ratings:100000,media:50001,storageObjects:50001,historicalLedgerRows:25000,snapshotMs,applyMs,indexBytes,lockTimeout:'5s',statementTimeout:'60s',historicalRowsUnchanged:true,productionScaleConclusion:'Representative local volume only; actual live relation sizes/workload and maintenance approval remain external.'};
 await writeFile(new URL('../../.expo/final-B-scale-metrics.json',import.meta.url),JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence));
});
test('existing migration-ledger exclusive lock blocks concurrent history mutation and release after failed transaction retains committed feature',async()=>{
 await setup();const lock=session(db,'final-ledger-lock');await lock.execute('begin;lock table supabase_migrations.schema_migrations in exclusive mode;');
 const writer=session(db,'final-ledger-writer');let settled=false;
 const pending=writer.execute("begin;set local lock_timeout='5s';update supabase_migrations.schema_migrations set created_by=created_by where version='00000000000001';rollback;").finally(()=>settled=true);
 try{await new Promise(r=>setTimeout(r,200));assert.equal(settled,false);assert.equal(await query(db,"select wait_event_type='Lock' from pg_stat_activity where application_name='final-ledger-writer'"),'t');await lock.execute('rollback;');await pending;}
 finally{await lock.close();await writer.close();}
 assert.equal(await query(db,`select count(*) from supabase_migrations.schema_migrations where version='${version}'`),'1');
});
