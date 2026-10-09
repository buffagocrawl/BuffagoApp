import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { edgeRuntime } from './helpers/edge-runtime.mjs';
import { normalizeWingdexGalleryResponse } from '../lib/wingdexGallery.js';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import jpeg from 'jpeg-js';

const user='10000000-0000-4000-a000-000000000001',reviewer='10000000-0000-4000-a000-000000000002';
const destination='30000000-0000-4000-a000-000000000001',correlation='50000000-0000-4000-a000-000000000001';
const sid=n=>`40000000-0000-4000-a000-${String(n).padStart(12,'0')}`;
const original=id=>`originals/${user}/${id}/source`,primary=id=>`processed/${id}/primary`,thumb=id=>`thumbnails/${id}/preview`;
const read=name=>readFileSync(new URL(name,import.meta.url),'utf8');
function sqlFunction(file,name) {
  const source=read(`../supabase/migrations/${file}`), start=source.indexOf(`create or replace function public.${name}(`);
  return source.slice(start,source.indexOf('\n$$;',start)+4);
}

test('photo derivative PostgreSQL recovery and upload boundaries',async t=>{
  const db=new PGlite();
  try {
    await db.exec(read('./helpers/image-db-fixture.sql'));
    await db.exec(sqlFunction('20260729121000_wing_shots_security_rpc.sql','wing_transition_submission'));
    await db.exec(sqlFunction('20260730233913_wing_review_intake_lifecycle.sql','mango_review_wing_submission'));
    await db.exec(read('../supabase/migrations/20261007000241_image_workflow_rc_regression.sql'));
    await db.exec(`create function auth.role() returns text language sql stable as $$ select current_setting('request.jwt.claim.role',true) $$;
      alter role service_role bypassrls;
      alter table wing_media_submissions add column owner_deleted_at timestamptz,add column original_deleted_at timestamptz,
        add column original_retain_until timestamptz,add column like_count integer default 0,add column dislike_count integer default 0,
        add column perceptual_hash text;
      alter table wing_media_submissions add constraint fixture_photo_owner_fk foreign key(user_id) references auth.users(id) on delete set null;
      alter table wing_processing_jobs add column generation integer,add column idempotency_key text,add column correlation_id uuid,
        add column created_at timestamptz default now();
      alter table wing_moderation_config add column original_retention_days integer default 30;
      create table wing_generation_jobs(id uuid,submission_id uuid,status text);
      grant usage on schema storage to service_role;
      select set_config('request.jwt.claim.role','service_role',false);`);
    await db.exec(read('../supabase/migrations/20261008171906_wing_photo_derivative_recovery.sql'));
    const seed=async(status='approved',id=sid(1))=>{
      await db.exec(`reset role; select set_config('request.jwt.claim.role','service_role',false);
        truncate wing_generation_jobs,social_content_jobs,wing_photo_derivative_receipts,wing_photo_derivative_jobs,wing_admin_actions,wing_moderation_decisions,
        wing_processing_jobs,app_user_roles,wing_submission_state_transitions,wing_submission_mutation_receipts,
        wing_media_validation_receipts,wing_submission_upload_intents,wing_media_submissions,destination_ratings,storage.objects,auth.users cascade;
        insert into auth.users values('${user}'),('${reviewer}');
        insert into app_user_roles values('${reviewer}','wing_reviewer',true,null);
        select set_config('request.jwt.claim.sub','${user}',false);`);
      await add(id,status);
    };
    const add=async(id,status='approved')=>{
      await db.query(`insert into wing_media_submissions(id,user_id,destination_id,media_type,status,original_storage_path,
        consent_version,consented_at,attribution_preference,approved_at,approved_by,correlation_id)
        values($1,$2,$3,'photo',$4,$5,'v1',now(),'anonymous',case when $4='approved' then now() else null end,
        case when $4='approved' then $6::uuid else null end,$7)`,[id,user,destination,status,original(id),reviewer,correlation]);
      await object(original(id));
    };
    const object=async path=>db.query(`insert into storage.objects(bucket_id,name,metadata) values('wing-submissions',$1,'{"size":100,"mimetype":"image/jpeg"}') on conflict(bucket_id,name) do nothing`,[path]);
    const request=async(ids=[sid(1)],dry=true,retry=false)=> (await db.query('select request_wing_photo_derivatives($1,$2,$3,$4) result',[ids,dry,retry,correlation])).rows[0].result;
    const claim=async()=> (await db.query("select claim_wing_photo_derivative_job('test-worker',300) result")).rows[0].result;
    const claimTarget=async id=> (await db.query("select claim_wing_photo_derivative_job('test-worker',300,$1) result",[id])).rows[0].result;
    const begin=async c=>(await db.query('select begin_wing_photo_derivative_job($1,$2) result',[c.job_id,c.claim_token])).rows[0].result;
    const settle=async(c,success=true,retry=false)=> (await db.query('select settle_wing_photo_derivative_job($1,$2,$3,$4,$5,$6,$7,$8,$9) result',
      [c.job_id,c.claim_token,success,retry,success?primary(c.submission_id):null,success?thumb(c.submission_id):null,null,'FIXTURE_FAILURE','safe fixture reason'])).rows[0].result;
    const gallery=async(body={include_covers:true})=>{
      const client={from:()=>{
        const filters=[]; const orders=[];
        return {select(){return this;},in(k,v){filters.push(row=>v.includes(row[k]));return this;},
          eq(k,v){filters.push(row=>row[k]===v);return this;},is(k,v){filters.push(row=>row[k]===v);return this;},
          not(k,_op,v){filters.push(row=>row[k]!==v);return this;},order(k,{ascending}){orders.push([k,ascending]);return this;},
          async range(start,end){let rows=(await db.query('select * from wing_media_submissions')).rows.filter(row=>filters.every(fn=>fn(row)));
            rows.sort((a,b)=>{for(const [k,asc] of orders){if(a[k]!==b[k])return (a[k]<b[k]?-1:1)*(asc?1:-1);}return 0;});
            return {data:rows.slice(start,end+1),error:null};}};
      },storage:{from:()=>({async createSignedUrls(paths,seconds){assert.equal(seconds,300);
        const objects=(await db.query('select name from storage.objects')).rows.map(row=>row.name);
        return {data:paths.map(path=>objects.includes(path)?{path,signedUrl:`https://signed.test/${path}`}:{path,error:'missing'}),error:null};}})}};
      const r=await edgeRuntime('wing-public-gallery',client)({destination_ids:[destination],...body});
      assert.equal(r.status,200);return normalizeWingdexGalleryResponse(r.body)[destination];
    };
    const check=async(name,fn)=>t.test(name,async()=>{await seed();await fn();});
    await check('dry run writes no jobs, receipts or paths',async()=>{
      assert.equal((await db.query('select list_wing_photo_derivative_candidates() result')).rows[0].result[0].submission_id,sid(1));
      assert.equal((await request())[0].outcome,'eligible');
      assert.equal((await db.query('select count(*)::int n from wing_photo_derivative_jobs')).rows[0].n,0);
      assert.equal((await db.query('select count(*)::int n from wing_photo_derivative_receipts')).rows[0].n,0);
    });
    await check('submission-scoped canary claim cannot take an unrelated queued photo',async()=>{
      await add(sid(2));
      await request([sid(1),sid(2)],false);
      assert.equal((await claimTarget(sid(3))),null);
      const canary=await claimTarget(sid(2));
      assert.equal(canary.submission_id,sid(2));
      assert.equal((await begin(canary)).preserve_approval,true);
      const other=await claim();
      assert.equal(other.submission_id,sid(1));
    });
    await check('duplicate requests share one job and recovery preserves approval and attribution',async()=>{
      const before=(await db.query('select status,approved_at,approved_by,attribution_preference,consent_version from wing_media_submissions')).rows[0];
      const first=await request(undefined,false),second=await request(undefined,false);
      assert.equal(first[0].job_id,second[0].job_id); const c=await claim();assert.equal((await begin(c)).preserve_approval,true);
      await object(primary(sid(1))); await object(thumb(sid(1)));assert.equal((await settle(c)).job_status,'succeeded');
      await settle(c);assert.deepEqual((await db.query('select status,approved_at,approved_by,attribution_preference,consent_version from wing_media_submissions')).rows[0],before);
      assert.equal((await db.query("select count(*)::int n from wing_photo_derivative_receipts where event='succeeded'")).rows[0].n,1);
      assert.equal((await gallery()).count,1);assert.equal((await request(undefined,false))[0].outcome,'already_ready');
      assert.equal((await db.query('select count(*)::int n from social_content_jobs')).rows[0].n,0);
      assert.deepEqual((await db.query('select list_wing_photo_derivative_candidates() result')).rows[0].result,[]);
    });
    await check('missing original, consent, retention and deletion block recovery',async()=>{
      for(const [change,reason] of [
        ["update wing_media_submissions set consent_version=''",'consent_required'],
        ['update wing_media_submissions set consented_at=null','consent_required'],
        ["update wing_media_submissions set consented_at=now()+interval '1 day'",'consent_required'],
        ["update wing_media_submissions set original_retain_until=now()-interval '1 minute'",'retention_expired'],
        ["update wing_media_submissions set created_at=now()-interval '31 days'",'retention_expired'],
        ['update wing_media_submissions set original_deleted_at=now()','original_deleted'],
        ['update wing_media_submissions set owner_deleted_at=now(),user_id=null','owner_deleted'],
        ['update wing_media_submissions set withdrawn_at=now()','withdrawn'],
        ['update wing_media_submissions set approved_at=null,approved_by=null','approval_missing'],
        ["insert into wing_generation_jobs values(gen_random_uuid(),'"+sid(1)+"','pending')",'publication_started'],
        ['delete from storage.objects','original_missing'],
        ["update wing_media_submissions set original_storage_path='originals/forged/source'",'original_path_invalid'],
      ]) {await seed();await db.exec(change);assert.equal((await request(undefined,false))[0].blocker,reason);
        assert.equal((await db.query('select count(*)::int n from wing_photo_derivative_jobs')).rows[0].n,0);}
    });
    await check('failure retries safely; permanent failure never reverses approval',async()=>{
      await request(undefined,false);let c=await claim();await begin(c);assert.equal((await settle(c,false,true)).job_status,'retry');
      await db.exec('update wing_photo_derivative_jobs set available_at=now()'); c=await claim();await begin(c);
      assert.equal((await settle(c,false,false)).job_status,'dead');
      assert.equal((await db.query('select status from wing_media_submissions')).rows[0].status,'approved');
      assert.equal((await gallery()).count,0);assert.equal((await request(undefined,false,true))[0].outcome,'requeued');
      assert.equal((await db.query('select count(*)::int n from wing_photo_derivative_jobs')).rows[0].n,1);
    });
    await check('legacy workers cannot enqueue competing photo jobs or automatically select approvals',async()=>{
      assert.equal((await db.query('select enqueue_wing_processing_backlog() n')).rows[0].n,0);
      await request(undefined,false);
      await assert.rejects(db.query("insert into wing_processing_jobs(id,submission_id,job_kind,status) values(gen_random_uuid(),$1,'photo_process','pending')",[sid(1)]),/photo_uses_derivative_queue/);
      assert.equal((await db.query('select count(*)::int n from wing_photo_derivative_jobs')).rows[0].n,1);
    });
    await check('partial objects are not attached; interruption resumes with a fresh fenced lease',async()=>{
      await request(undefined,false);const old=await claim();await begin(old);await object(primary(sid(1)));
      await assert.rejects(settle(old),/processed_media_not_found/);
      assert.equal((await gallery()).count,0);
      await db.exec("update wing_photo_derivative_jobs set lease_expires_at=now()-interval '1 second'");
      const fresh=await claim();assert.notEqual(fresh.claim_token,old.claim_token);
      await assert.rejects(settle(old),/invalid_or_expired_job_claim/);await begin(fresh);await object(thumb(sid(1)));await settle(fresh);
      assert.equal((await gallery()).count,1);
      assert.equal((await db.query("select count(*)::int n from wing_photo_derivative_receipts where event='lease_expired'")).rows[0].n,1);
    });
    for(const [name,change] of [
      ['withdrawal',"update wing_media_submissions set status='withdrawn',withdrawn_at=now()"],
      ['account deletion','update wing_media_submissions set owner_deleted_at=now(),user_id=null'],
      ['auth account deletion',`delete from auth.users where id='${user}'`],
      ['consent removal','update wing_media_submissions set consented_at=null'],
      ['original removed','delete from storage.objects'],
      ['rejection',"update wing_media_submissions set status='rejected'"],
      ['publication started',"insert into wing_generation_jobs values(gen_random_uuid(),'"+sid(1)+"','pending')"],
    ]) await check(`${name} during processing cancels late results`,async()=>{
      await request(undefined,false);const c=await claim();await begin(c);await db.exec(change);
      await object(primary(sid(1)));await object(thumb(sid(1)));assert.equal((await settle(c)).job_status,'cancelled');
      assert.equal((await db.query('select processed_storage_path from wing_media_submissions')).rows[0].processed_storage_path,null);
      assert.equal((await gallery()).count,0);
    });
    await check('partial batch isolates missing originals and available winners become covers',async()=>{
      await add(sid(2));await add(sid(3));await db.query('delete from storage.objects where name=$1',[original(sid(2))]);
      const result=await request([sid(1),sid(2),sid(3)],false);
      assert.equal(result.find(r=>r.submission_id===sid(2)).blocker,'original_missing');
      for(let n=0;n<2;n++){const c=await claim();await begin(c);await object(primary(c.submission_id));await object(thumb(c.submission_id));await settle(c);}
      await db.query('update wing_media_submissions set like_count=100 where id=$1',[sid(3)]);
      assert.equal((await gallery()).images[0].submission_id,sid(3));
      await db.query('delete from storage.objects where name=any($1)',[[primary(sid(3)),thumb(sid(3))]]);
      assert.equal((await gallery()).images[0].submission_id,sid(1));assert.equal((await gallery()).count,1);
      assert.equal((await gallery()).approvedSubmissionCount,3);
    });
    await check('service-only RPCs and tables deny guests and authenticated users',async()=>{
      for(const role of ['anon','authenticated']) {
        await db.exec(`set role ${role}`);
        await assert.rejects(request(),/permission denied/);await assert.rejects(claim(),/permission denied/);
        await assert.rejects(db.query('select * from wing_photo_derivative_jobs'),/permission denied/);
        await assert.rejects(db.query('select * from wing_photo_derivative_receipts'),/permission denied/);
        await db.exec('reset role');
      }
    });
    await check('no fabricated paths or metadata can settle; receipts are append-only',async()=>{
      await request(undefined,false);const c=await claim();await begin(c);
      await assert.rejects(db.query('select settle_wing_photo_derivative_job($1,$2,true,false,$3,$4)',[c.job_id,c.claim_token,'forged',thumb(sid(1))]),/path_mismatch/);
      await object(primary(sid(1)));await object(thumb(sid(1)));await db.query("update storage.objects set metadata='{}' where name=$1",[primary(sid(1))]);
      await assert.rejects(settle(c),/processed_media_not_found/);
      await assert.rejects(db.exec("update wing_photo_derivative_receipts set event='succeeded'"),/append_only/);
    });
    await check('normal finalize queues one job; approval requires derivatives and remains human-only',async()=>{
      await seed('in_review');await db.exec('truncate wing_photo_derivative_receipts,wing_photo_derivative_jobs; delete from wing_media_submissions');
      await db.query(`insert into wing_submission_upload_intents(submission_id,user_id,destination_id,media_type,expected_storage_path,
        expected_mime_type,expected_size_bytes,consent_version,consented_at,attribution_preference,submission_source,correlation_id,expires_at)
        values($1,$2,$3,'photo',$4,'image/jpeg',100,'v1',now(),'anonymous','profile',$5,now()+interval '15 minutes')`,[sid(1),user,destination,original(sid(1)),correlation]);
      await db.query(`insert into wing_media_validation_receipts(user_id,correlation_id,staging_bucket,staging_path,sha256,size_bytes,mime_type,width,height,expires_at,submission_id,promoted_at)
        values($1,$2,'wing-shot-staging','fixture',repeat('a',64),100,'image/jpeg',100,100,now()+interval '15 minutes',$3,now())`,[user,correlation,sid(1)]);
      for(let n=0;n<2;n++) await db.query('select finalize_wing_submission_upload($1,$2,$3)',[sid(1),'new-upload-finalize',correlation]);
      assert.equal((await db.query('select count(*)::int n from wing_photo_derivative_jobs')).rows[0].n,1);
      const approve=()=>db.query('select mango_review_wing_submission($1,$2,$3,$4,$5,$6,$7)',[sid(1),'approve','standard_acceptable','Controlled normal upload',reviewer,'new-upload-approval',correlation]);
      await assert.rejects(approve(),/processed_photo_required/);const c=await claim();assert.equal((await begin(c)).preserve_approval,false);
      await object(primary(sid(1)));await object(thumb(sid(1)));await settle(c);assert.equal((await gallery()).count,0);
      await approve();assert.equal((await gallery()).count,1);
    });
    await check('trusted Python processor uploads real derivatives and settles against PostgreSQL',async()=>{
      const python=process.env.WINGDEX_PYTHON;
      assert.ok(python && existsSync(python),'Set WINGDEX_PYTHON to a Python environment with Pillow/requests');
      const bytes=new Map([[original(sid(1)),Buffer.from(jpeg.encode({width:8,height:8,data:Buffer.alloc(256,255)},90).data)]]);
      const rpc={claim_wing_photo_derivative_job:['p_worker','p_lease_seconds','p_submission_id'],begin_wing_photo_derivative_job:['p_job_id','p_claim_token'],
        settle_wing_photo_derivative_job:['p_job_id','p_claim_token','p_succeeded','p_retryable','p_processed_path','p_thumbnail_path','p_perceptual_hash','p_error_code','p_error_reason']};
      await request(undefined,false);
      const http=createServer(async(req,res)=>{
        try {
          const chunks=[];for await(const chunk of req)chunks.push(chunk);const data=Buffer.concat(chunks);
          const url=new URL(req.url,'http://localhost');
          if(url.pathname.startsWith('/rest/v1/rpc/')) {
            const name=url.pathname.split('/').at(-1), fields=rpc[name];assert.ok(fields,`Unexpected recovery RPC ${name}`);
            const payload=JSON.parse(data.toString());const args=fields.map(k=>payload[k]??null);
            const result=(await db.query(`select ${name}(${args.map((_,n)=>'$'+(n+1)).join(',')}) result`,args)).rows[0].result;
            res.setHeader('content-type','application/json');res.end(JSON.stringify(result));return;
          }
          const signing=url.pathname.startsWith('/storage/v1/object/sign/');
          const path=decodeURIComponent(url.pathname.replace(/^\/storage\/v1\/object\/(?:sign\/)?wing-submissions\//,''));
          if(signing && req.method==='POST') {res.setHeader('content-type','application/json');res.end(JSON.stringify({signedURL:`/object/sign/wing-submissions/${path}?token=fixture`}));return;}
          if(req.method==='GET') {assert.ok(bytes.has(path));res.setHeader('content-type','image/jpeg');res.end(bytes.get(path));return;}
          assert.equal(req.method,'PUT');bytes.set(path,data);
          await db.query(`insert into storage.objects(bucket_id,name,metadata) values('wing-submissions',$1,$2)
            on conflict(bucket_id,name) do update set metadata=excluded.metadata`,[path,JSON.stringify({size:data.length,mimetype:req.headers['content-type']})]);
          res.setHeader('content-type','application/json');res.end('{}');
        } catch(e){res.statusCode=400;res.end(JSON.stringify({error:e.message}));}
      });
      await new Promise(resolve=>http.listen(0,'127.0.0.1',resolve));
      try {
        const code=`from supabase_client import SupabaseClient\nfrom wing_processing_worker.photo_derivatives import PhotoDerivativeRepository\nfrom wing_processing_worker.worker import WingProcessingWorker\nfrom wing_media_processing import WingMediaProcessor\nclass NoAdvisory:\n def evaluate(self,*a,**k): raise AssertionError('Recovery cannot remoderate approved content')\nw=WingProcessingWorker(repository=PhotoDerivativeRepository(SupabaseClient.from_env()),processor=WingMediaProcessor(),moderation_provider=NoAdvisory(),worker_id='integration-photo-worker')\nassert w.run_once().status=='APPROVED'\nassert w.run_once().status=='NO_JOB'`;
        const child=spawn(python,['-c',code],{cwd:fileURLToPath(new URL('../../Agents/Jalapeno',import.meta.url)),
          env:{...process.env,SUPABASE_URL:`http://127.0.0.1:${http.address().port}`,SUPABASE_SERVICE_ROLE_KEY:'local-fixture-only'}});
        let output='';child.stdout.on('data',x=>output+=x);child.stderr.on('data',x=>output+=x);
        const exit=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve);});assert.equal(exit,0,output);
        assert.ok(bytes.get(primary(sid(1))).length>100);assert.ok(bytes.get(thumb(sid(1))).length>100);
        assert.equal((await gallery()).count,1);
      } finally {await new Promise(resolve=>http.close(resolve));}
    });
  } finally {await db.close();}
});
