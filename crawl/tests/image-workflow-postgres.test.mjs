import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { PGlite as BundledPGlite } from '@electric-sql/pglite';
import { edgeRuntime } from './helpers/edge-runtime.mjs';
import { normalizeWingdexGalleryResponse } from '../lib/wingdexGallery.js';

const modulePath = process.env.BUFFAGO_QA_PGLITE_MODULE;
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const user = '10000000-0000-4000-a000-000000000001';
const otherUser = '10000000-0000-4000-a000-000000000002';
const rating = '20000000-0000-4000-a000-000000000001';
const destination = '30000000-0000-4000-a000-000000000001';
const otherDestination = '30000000-0000-4000-a000-000000000002';
const submission = '40000000-0000-4000-a000-000000000001';
const correlation = '50000000-0000-4000-a000-000000000001';
const path = `originals/${user}/${submission}/source`;
function sqlFunction(file,name) {
  const source=read(`../supabase/migrations/${file}`);
  const start=source.indexOf(`create or replace function public.${name}(`);
  return source.slice(start,source.indexOf('\n$$;',start)+4);
}

test('real PostgreSQL image lifecycle boundaries', async (t) => {
  const PGlite = modulePath ? (await import(pathToFileURL(modulePath).href)).PGlite : BundledPGlite;
  const db = new PGlite();
  try {
    await db.exec(read('./helpers/image-db-fixture.sql'));
    await db.exec(sqlFunction('20260729121000_wing_shots_security_rpc.sql','wing_feature_enabled_for_user'));
    await db.exec(sqlFunction('20260729121000_wing_shots_security_rpc.sql','wing_transition_submission'));
    await db.exec(sqlFunction('20260730233913_wing_review_intake_lifecycle.sql','mango_review_wing_submission'));
    await db.exec('revoke all on function mango_review_wing_submission(uuid,text,text,text,uuid,text,uuid) from public,anon,authenticated; grant execute on function mango_review_wing_submission(uuid,text,text,text,uuid,text,uuid) to service_role; revoke all on function wing_transition_submission(uuid,text,text,text,uuid,text,text,uuid,jsonb) from public,anon,authenticated;');
    await db.exec(read('../supabase/migrations/20261007000241_image_workflow_rc_regression.sql'));
    const seed = async () => {
      await db.exec(`reset role; truncate wing_admin_actions,wing_moderation_decisions,wing_processing_jobs,app_user_roles,wing_media_access_requests,wing_submission_state_transitions,wing_submission_mutation_receipts,wing_media_validation_receipts,wing_submission_upload_intents,wing_user_moderation_state,wing_media_submissions,destination_ratings,storage.objects,auth.users cascade;
        update engagement_feature_flags set enabled=true,rollout_percent=100;
        select set_config('request.jwt.claim.sub','${user}',false);
        insert into auth.users values('${user}'),('${otherUser}');
        insert into destination_ratings values('${rating}','${user}','${destination}');
        insert into wing_submission_upload_intents(submission_id,user_id,rating_id,destination_id,media_type,expected_storage_path,expected_mime_type,expected_size_bytes,consent_version,attribution_preference,submission_source,correlation_id,expires_at)
        values('${submission}','${user}','${rating}','${destination}','photo','${path}','image/jpeg',100,'v1','anonymous','rating','${correlation}',now()+interval '15 minutes');
        insert into wing_media_validation_receipts(user_id,correlation_id,staging_bucket,staging_path,sha256,size_bytes,mime_type,width,height,expires_at,submission_id,promoted_at)
        values('${user}','${correlation}','wing-shot-staging','${user}/${correlation}/photo.jpg',repeat('a',64),100,'image/jpeg',100,100,now()+interval '15 minutes','${submission}',now());
        insert into storage.objects values('wing-submissions','${path}',null,'{"size":100,"mimetype":"image/jpeg"}');`);
      await db.query("insert into app_user_roles values($1,'wing_reviewer',true,null)",[otherUser]);
    };
    const finalize = (key = 'finalize-operation') => db.query('select finalize_wing_submission_upload($1,$2,$3) result', [submission,key,correlation]);
    const reserve = (overrides = {}) => {
      const input = { rating, kind: 'photo', mime: 'image/jpeg', size: 100, consent: 'v1', attribution: 'anonymous', caption: '', key: 'reserve-operation', correlation, destination, source: 'rating', ...overrides };
      return db.query('select reserve_wing_submission_upload($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) result', Object.values(input));
    };
    const check = async (name, fn) => t.test(name, async () => { await seed(); await fn(); });
    await check('zero rollout and disabled flag block new reservations and reservation resumes', async () => {
      for (const settings of ['enabled=true,rollout_percent=0','enabled=false,rollout_percent=100']) {
        await db.exec(`update engagement_feature_flags set ${settings} where flag_key='wing_shot_photo_upload'`);
        await assert.rejects(reserve(), /wing_shot_photo_upload_disabled/);
        await db.exec('delete from wing_submission_upload_intents');
        await assert.rejects(reserve(), /wing_shot_photo_upload_disabled/);
      }
    });
    await check('partial rollout is deterministic per authenticated user and monotonically expands', async () => {
      const cohorts=[];
      for (const percent of [0,25,50,100]) {
        await db.exec(`update engagement_feature_flags set rollout_percent=${percent} where flag_key='wing_shot_photo_upload'`);
        const sample = async () => (await db.query(`select id, set_config('request.jwt.claim.sub',id::text,true), wing_feature_enabled_for_user('wing_shot_photo_upload') enabled from (select ('10000000-0000-4000-a000-' || lpad(n::text,12,'0'))::uuid id from generate_series(1,200) n) sample`)).rows.filter(row=>row.enabled).map(row=>row.id);
        const first=await sample(); assert.deepEqual(await sample(),first); cohorts.push(first);
      }
      assert.equal(cohorts[0].length,0); assert.equal(cohorts[3].length,200);
      assert.ok(cohorts[1].length>0 && cohorts[1].length<200);
      assert.ok(cohorts[1].every(id=>cohorts[2].includes(id)));
      await db.exec("select set_config('request.jwt.claim.sub','',false)");
      assert.equal((await db.query("select wing_feature_enabled_for_user('wing_shot_photo_upload') enabled")).rows[0].enabled,false);
    });
    await check('disabling uploads leaves an existing validated promoted reservation safe to finalize once', async () => {
      await db.exec("update engagement_feature_flags set enabled=false,rollout_percent=0 where flag_key='wing_shot_photo_upload'");
      await finalize(); await finalize();
      assert.equal((await db.query('select count(*)::int n from wing_media_submissions')).rows[0].n,1);
    });
    await check('service-promoted object with null owner finalizes into review and links exact rating', async () => {
      assert.equal((await finalize()).rows[0].result.status,'in_review');
      const row = (await db.query('select * from wing_media_submissions')).rows[0];
      assert.equal(row.rating_id,rating); assert.equal(row.destination_id,destination); assert.equal(row.user_id,user);
      assert.equal((await db.query('select status from wing_submission_upload_intents')).rows[0].status,'finalized');
    });
    await check('normal review-first upload and approval reproduces original-only gallery compatibility gap', async () => {
      await finalize();
      await db.exec('set role service_role');
      const approved=(await db.query('select mango_review_wing_submission($1,$2,$3,$4,$5,$6,$7) result',
        [submission,'approve','standard_acceptable','Controlled upload pipeline fixture',otherUser,'gallery-fixture-approval',correlation])).rows[0].result;
      assert.equal(approved.status,'approved');
      await db.exec('reset role');
      assert.equal((await db.query('select count(*)::int n from wing_processing_jobs')).rows[0].n,0);
      const legacy=(await db.query('select get_wing_public_gallery($1,true) result',[[destination]])).rows[0].result[0];
      assert.equal(legacy.picture_count,1); assert.equal(legacy.images[0].storage_path,path);
      // Real SQL-produced fixture, passed through the actual proposed Edge handler.
      const rows=(await db.query("select *,0 as like_count,0 as dislike_count, null as owner_deleted_at,'v1' as consent_version,now() as consented_at from wing_media_submissions")).rows;
      const client={from:()=>{
        let selected=rows;
        return {select(){return this;},in(k,v){selected=selected.filter(row=>v.includes(row[k]));return this;},
          eq(k,v){selected=selected.filter(row=>row[k]===v);return this;},order(){return this;},
          is(k,v){selected=selected.filter(row=>row[k]==v);return this;},not(k,_op,v){selected=selected.filter(row=>row[k]!=v);return this;},
          async range(start,end){return {data:selected.slice(start,end+1),error:null};}};
      },storage:{from(){throw new Error('Original-only fixture must never be signed');}}};
      const result=await edgeRuntime('wing-public-gallery',client)({destination_ids:[destination],include_covers:true});
      assert.equal(result.status,200);
      const normalized=normalizeWingdexGalleryResponse(result.body)[destination];
      assert.equal(normalized.count,0); assert.equal(normalized.approvedSubmissionCount,1); assert.deepEqual(normalized.images,[]);
    });
    await check('duplicate finalization keys produce one media row and one transition', async () => {
      await finalize(); await finalize(); await finalize('different-retry-key');
      assert.equal((await db.query('select count(*)::int n from wing_media_submissions')).rows[0].n,1);
      assert.equal((await db.query('select count(*)::int n from wing_submission_state_transitions')).rows[0].n,1);
    });
    await check('missing object produces no permanent media row', async () => {
      await db.exec('delete from storage.objects');
      await assert.rejects(finalize(), /uploaded_object_not_found/);
      assert.equal((await db.query('select count(*)::int n from wing_media_submissions')).rows[0].n,0);
    });
    await check('finalization rejects an object without a bound validated promotion', async () => {
      await db.exec('delete from wing_media_validation_receipts');
      await assert.rejects(finalize(), /validated_promotion_required/);
      assert.equal((await db.query('select count(*)::int n from wing_media_submissions')).rows[0].n,0);
    });
    await check('MIME and size mismatch fail finalization', async () => {
      await db.exec("update storage.objects set metadata='{}'");
      await assert.rejects(finalize(),/uploaded_object_invalid/);
    });
    await check('foreign user cannot finalize another user intent', async () => {
      await db.exec(`select set_config('request.jwt.claim.sub','${otherUser}',false)`);
      await assert.rejects(finalize(),/upload_intent_unavailable/);
    });
    await check('changed restaurant after reservation cannot acquire the image', async () => {
      await db.exec(`update destination_ratings set destination_id='${otherDestination}'`);
      await assert.rejects(finalize(),/rating_association_changed/);
    });
    await check('resume rejects video before updating a photo intent', async () => {
      await assert.rejects(reserve({kind:'video',mime:'video/mp4'}),/unsupported_media_type/);
      assert.equal((await db.query('select media_type from wing_submission_upload_intents')).rows[0].media_type,'photo');
    });
    await check('resume rejects wrong restaurant', async () => {
      await assert.rejects(reserve({destination:otherDestination}),/destination_mismatch/);
    });
    await check('resume rejects invalid size and missing consent', async () => {
      await assert.rejects(reserve({size:0}),/invalid_upload_request/);
      await assert.rejects(reserve({consent:null}),/invalid_upload_request/);
    });
    await check('replacement cannot reuse an already-promoted different correlation', async () => {
      await assert.rejects(reserve({correlation:'50000000-0000-4000-a000-000000000002'}),/upload_reservation_media_changed/);
    });
    await check('owner lookup works through RPC while direct RLS read is forbidden', async () => {
      await finalize(); await db.exec('set role authenticated');
      assert.equal((await db.query('select * from get_my_rating_wing_shots($1)',[[rating]])).rows.length,1);
      await assert.rejects(db.query('select * from wing_media_submissions'), /permission denied/);
      await db.exec(`select set_config('request.jwt.claim.sub','${otherUser}',false)`);
      assert.equal((await db.query('select * from get_my_rating_wing_shots($1)',[[rating]])).rows.length,0);
    });
    await check('public count excludes pending, rejected, videos and missing objects; counts original-only approved photo', async () => {
      await finalize();
      const gallery = async () => (await db.query('select get_wing_public_gallery($1,true) result',[[destination]])).rows[0].result[0];
      assert.equal((await gallery()).picture_count,0);
      await db.exec("update wing_media_submissions set status='approved'");
      assert.equal((await gallery()).picture_count,1);
      assert.equal((await gallery()).images[0].storage_path,path);
      for (const status of ['generation_pending','ready_to_post','scheduled','posting','posted']) {
        await db.query('update wing_media_submissions set status=$1',[status]);
        assert.equal((await gallery()).picture_count,1,`${status} remains public after approval`);
      }
      for (const status of ['processing','in_review','rejected','failed']) {
        await db.query('update wing_media_submissions set status=$1',[status]);
        assert.equal((await gallery()).picture_count,0,`${status} stays private`);
      }
      await db.exec("update wing_media_submissions set status='rejected'"); assert.equal((await gallery()).picture_count,0);
      await db.exec("update wing_media_submissions set status='approved',media_type='video'"); assert.equal((await gallery()).picture_count,0);
      await db.exec("update wing_media_submissions set media_type='photo'; delete from storage.objects"); assert.equal((await gallery()).picture_count,0);
    });
    await check('gallery RPC is service-only', async () => {
      await db.exec('set role authenticated');
      await assert.rejects(db.query('select get_wing_public_gallery($1,true)',[[destination]]),/permission denied/);
    });
    await check('multi-user restaurant counts remain isolated: ten ratings, three approved, one pending and one rejected',async()=>{
      const third='30000000-0000-4000-a000-000000000003';
      await db.exec(`insert into destination_ratings(id,user_id,destination_id)
        select ('70000000-0000-4000-a000-'||lpad(i::text,12,'0'))::uuid,
          case when i%2=0 then '${user}'::uuid else '${otherUser}'::uuid end,'${otherDestination}'::uuid from generate_series(1,10)i;
        insert into wing_media_submissions(id,user_id,rating_id,destination_id,media_type,status,original_storage_path)
        select ('80000000-0000-4000-a000-'||lpad(i::text,12,'0'))::uuid,
          case when i%2=0 then '${user}'::uuid else '${otherUser}'::uuid end,
          ('70000000-0000-4000-a000-'||lpad(i::text,12,'0'))::uuid,'${otherDestination}','photo',
          case when i<=3 then 'approved' when i=4 then 'in_review' else 'rejected' end,'isolated/'||i from generate_series(1,5)i;
        insert into wing_media_submissions(id,user_id,destination_id,media_type,status,original_storage_path)
          values('80000000-0000-4000-a000-000000000006','${otherUser}','${third}','photo','approved','isolated/6');
        insert into storage.objects(bucket_id,name) select 'wing-submissions','isolated/'||i from generate_series(1,6)i;`);
      const rows=(await db.query('select get_wing_public_gallery($1,true) result',[[destination,otherDestination,third]])).rows[0].result;
      assert.equal(rows.find(row=>row.destination_id===destination).picture_count,0);
      const restaurant=rows.find(row=>row.destination_id===otherDestination);
      assert.equal(restaurant.picture_count,3);assert.equal(restaurant.images.length,3);
      assert.ok(restaurant.images.every(image=>image.storage_path!=='isolated/6'));
      assert.equal(rows.find(row=>row.destination_id===third).picture_count,1);
      assert.equal((await db.query('select count(*)::int n from destination_ratings where destination_id=$1',[otherDestination])).rows[0].n,10);
    });
    await check('private owner preview can use original before processing; foreign user denied', async () => {
      await finalize();
      const args=[submission,'thumbnail','owner_preview',correlation];
      await db.query('select request_wing_media_access($1,$2,$3,$4)',args);
      assert.equal((await db.query('select requested_path from wing_media_access_requests')).rows[0].requested_path,path);
      await db.exec(`select set_config('request.jwt.claim.sub','${otherUser}',false)`);
      await assert.rejects(db.query('select request_wing_media_access($1,$2,$3,$4)',args),/wing_submission_not_found/);
    });
    await check('count remains 65 while first gallery page has 60 and each submission is counted once', async () => {
      await db.exec(`insert into wing_media_submissions(id,user_id,destination_id,media_type,status,original_storage_path,thumbnail_storage_path)
        select ('60000000-0000-4000-a000-'||lpad(i::text,12,'0'))::uuid,'${user}','${destination}','photo','approved','test/'||i,'thumb/'||i from generate_series(1,65)i;
        insert into storage.objects(bucket_id,name) select 'wing-submissions','test/'||i from generate_series(1,65)i;
        insert into storage.objects(bucket_id,name) select 'wing-submissions','thumb/'||i from generate_series(1,65)i;`);
      const result=(await db.query('select get_wing_public_gallery($1,true) result',[[destination]])).rows[0].result[0];
      assert.equal(result.picture_count,65); assert.equal(result.images.length,60);
      const second=(await db.query('select get_wing_public_gallery($1,true,60) result',[[destination]])).rows[0].result[0];
      assert.equal(second.picture_count,65); assert.equal(second.images.length,5);
      assert.ok(second.images.every((image)=>!result.images.some((prior)=>prior.submission_id===image.submission_id)));
    });
    await check('cleanup retires only abandoned intents and retains committed media; retries return the same path', async () => {
      await db.exec("update wing_submission_upload_intents set created_at=now()-interval '3 days',expires_at=now()-interval '2 days'");
      const cleanup=async()=> (await db.query('select * from get_expired_wing_original_cleanup()')).rows;
      assert.equal((await cleanup())[0].storage_path,path);
      assert.equal((await cleanup())[0].storage_path,path);
      await assert.rejects(finalize(),/upload_intent_unavailable/);
      await db.exec("delete from storage.objects");assert.equal((await cleanup()).length,0);
    });
    await check('reservation renewal respects its 30-minute database lifetime constraint', async () => {
      await db.exec("update wing_submission_upload_intents set created_at=now()-interval '20 minutes'; alter table wing_submission_upload_intents add constraint fixture_lifetime check(expires_at<=created_at+interval '30 minutes') not valid");
      await reserve();
      const row=(await db.query("select expires_at<=created_at+interval '30 minutes' as bounded from wing_submission_upload_intents")).rows[0];
      assert.equal(row.bounded,true);
      await db.exec('alter table wing_submission_upload_intents drop constraint fixture_lifetime');
    });
    for(const action of ['approve','reject']) {
      await check(`Mango ${action} changes real status, audits once and rejects stale repeated decisions`,async()=>{
        await finalize();
        const args=[submission,action,action==='approve'?'standard_acceptable':'poor_media_quality','Reviewed image carefully',otherUser,`review-${action}-operation`,correlation];
        const result=(await db.query('select mango_review_wing_submission($1,$2,$3,$4,$5,$6,$7) result',args)).rows[0].result;
        assert.equal(result.status,action==='approve'?'approved':'rejected');
        assert.equal((await db.query('select count(*)::int n from wing_admin_actions')).rows[0].n,1);
        await assert.rejects(db.query('select mango_review_wing_submission($1,$2,$3,$4,$5,$6,$7)',args),/review_submission_not_ready/);
        assert.equal((await db.query('select count(*)::int n from wing_admin_actions')).rows[0].n,1);
      });
    }
    await check('regular owner cannot call service moderation or internal status transition',async()=>{
      await finalize();await db.exec('set role authenticated');
      await assert.rejects(db.query('select mango_review_wing_submission($1,$2,$3,$4,$5,$6,$7)',[submission,'approve','standard_acceptable','Pretending to be reviewer',otherUser,'forged-approval-key',correlation]),/permission denied/);
      await assert.rejects(db.query('select wing_transition_submission($1,$2,$3,$4,$5,$6,$7,$8,$9)',[submission,'approved','in_review','reviewer',otherUser,'forged','forged-transition-key',correlation,{}]),/permission denied/);
    });
  } finally { await db.close(); }
});
