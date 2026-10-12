import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync,execFile} from 'node:child_process';
import {promisify} from 'node:util';
const bin='C:/Program Files/PostgreSQL/18/bin';
const run=promisify(execFile);
test('independent PostgreSQL connections serialize concurrent coin retries and roll back trigger debit',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'buffago-coins-'));const port=55439;
 const sync=(name,args)=>execFileSync(join(bin,name+'.exe'),args,{encoding:'utf8',windowsHide:true,stdio:'ignore'});
 const args=['-h','127.0.0.1','-p',String(port),'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-At'];
 const sql=s=>execFileSync(join(bin,'psql.exe'),[...args,'-c',s],{encoding:'utf8',windowsHide:true});let started=false;
 try{
  sync('initdb',['-D',dir,'-U','postgres','-A','trust','--no-locale']);
  sync('pg_ctl',['-D',dir,'-l',join(dir,'server.log'),'-o',`-p ${port} -h 127.0.0.1`,'-w','start']);started=true;
  sql(readFileSync(new URL('./helpers/buffacoin-transaction-fixture.sql',import.meta.url),'utf8'));
  sql(readFileSync(new URL('../supabase/proposals/android-qa-issue14-buffacoin-confirmation.sql',import.meta.url),'utf8'));
  const user='10000000-0000-4000-a000-000000000001',dest='20000000-0000-4000-a000-000000000001',op='30000000-0000-4000-a000-000000000001';
  sql(`insert into states values(1,'NY');insert into destinations values('${dest}',1);insert into buffacoin_wallets(user_id,balance) values('${user}',10);`);
  const submit=(operation=op,cost=1,overall=9)=>`select set_config('request.jwt.claim.sub','${user}',false); select row_to_json(r) from submit_buffacoin_rating_v1('${operation}','${dest}','NY',${cost},'{"sauce":8,"crispiness":8,"meat":8,"overall":${overall}}') r;`;
  // Hold the wallet while eight independent backends race on the operation lock.
  const holder=run(join(bin,'psql.exe'),[...args,'-c',`begin;select 1 from buffacoin_wallets for update;select pg_sleep(1);commit;`],{windowsHide:true});
  const results=await Promise.all(Array.from({length:8},()=>run(join(bin,'psql.exe'),[...args,'-c',submit()],{windowsHide:true})));
  await holder;
  const receipts=results.map(r=>JSON.parse(r.stdout.trim().split('\n').at(-1)));receipts.forEach(r=>assert.deepEqual(r,receipts[0]));assert.equal(receipts[0].new_balance,9);
  const state=()=>sql('select balance,(select count(*) from buffacoin_ledger),(select count(*) from destination_ratings),(select count(*) from buffacoin_rating_operations) from buffacoin_wallets').trim();
  assert.equal(state(),'9|1|1|1');
  await assert.rejects(run(join(bin,'psql.exe'),[...args,'-c',submit('30000000-0000-4000-a000-000000000002',2,99)],{windowsHide:true}),/overall_check/);
  assert.equal(state(),'9|1|1|1');
 }finally{if(started)sync('pg_ctl',['-D',dir,'-m','immediate','-w','stop']);rmSync(dir,{recursive:true,force:true});}
});
