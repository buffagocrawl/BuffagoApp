// Production-correspondent functions only. Reduced tables, no surrogate function bodies.
import assert from 'node:assert/strict';
import {writeFile,readFile} from 'node:fs/promises';
import {candidates,results} from './final-readonly-correspondence.mjs';
import {start,stop,query} from './phase7b3d-native-postgres.mjs';
const U='11111111-1111-4111-8111-111111111111',V='77777777-7777-4777-8777-777777777777',A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',P='44444444-4444-4444-8444-444444444444';
let db='buffago_phase7b25';const checks=[];
const q=sql=>query(db,sql);
async function check(name,fn){await fn();checks.push(name);console.log('PASS '+name);}
try{
 await start();
 await q(`create schema auth;create schema storage;
 create table auth.users(id uuid primary key,deleted_at timestamptz,banned_until timestamptz);
 create table public.users(user_id uuid primary key,xp integer,social_opt_out boolean default false);
 create table public.destination_ratings(id uuid,user_id uuid,is_buffacoin boolean,crispiness numeric,sauce numeric,meat numeric,overall numeric,created_at timestamptz);
 create table public.xp_ledger(id uuid primary key default gen_random_uuid(),idempotency_key text unique);
 create table public.badge_catalog(id uuid primary key default gen_random_uuid(),code text unique,name text,description text,icon text,xp_reward integer,category text,tier integer,is_active boolean);
 create table public.user_badges(user_id uuid,badge_id uuid,primary key(user_id,badge_id));
 create table public.user_events(user_id uuid,session_id uuid,event_name text,metadata jsonb);
 create table public.notification_preferences(user_id uuid,friend_activity boolean);
 create table public.notification_outbox(user_id uuid,event_type text,source_entity_type text,source_entity_id text,deduplication_key text,deep_link text,fallback_route text,copy_data jsonb,expires_at timestamptz,unique(user_id,event_type,deduplication_key));`);
 const referral=await readFile(new URL('../supabase/migrations/20260724033000_referral_system_v1.sql',import.meta.url),'utf8');
 // Exact checked-in referral tables/indexes, not a replay of historical migrations.
 await q(referral.slice(referral.indexOf('create table if not exists public.referral_reward_config'),referral.indexOf('alter table public.referral_reward_config enable')));
 await q(`create table public.wing_media_submissions(id uuid primary key,user_id uuid,status text,media_type text,withdrawn_at timestamptz,rejected_at timestamptz,rejection_reason text,approved_at timestamptz,approved_by uuid,featured_at timestamptz,updated_at timestamptz,correlation_id uuid,owner_deleted_at timestamptz,owner_pseudonym_id uuid,user_caption text,consent_version text,consented_at timestamptz,attribution_preference text,original_deleted_at timestamptz,original_retain_until timestamptz,created_at timestamptz default now(),original_storage_path text,processed_storage_path text,thumbnail_storage_path text,moderation_status text,wing_verification_status text);
 create table public.wing_submission_state_transitions(id uuid primary key default gen_random_uuid(),submission_id uuid,from_status text,to_status text,actor_type text,actor_id uuid,trigger_source text,idempotency_key text unique,request_fingerprint text,correlation_id uuid,metadata jsonb);
 create table public.wing_generation_jobs(submission_id uuid);
 create table public.social_content_jobs(submission_id uuid,generated_media_path text,status text,updated_at timestamptz,failure_code text,failure_reason text);
 create table public.wing_processing_jobs(submission_id uuid,job_kind text,status text);
 create table public.wing_moderation_config(singleton boolean,original_retention_days integer);
 create table storage.objects(bucket_id text,name text);
 create table public.wing_account_deletion_manifests(id uuid primary key default gen_random_uuid(),user_id uuid,owner_pseudonym_id uuid,object_paths text[],correlation_id uuid unique,status text default 'pending',failure_reason text,completed_at timestamptz);
 create table public.wing_submission_upload_intents(id uuid primary key default gen_random_uuid(),user_id uuid,status text,updated_at timestamptz,expected_storage_path text);`);
 for(const table of ['wing_submission_mutation_receipts','rating_verification_receipts','wing_creator_reward_events','wing_creator_badge_events','social_community_visit_intents','social_community_reward_events','wing_notification_receipts'])await q(`create table public.${table}(user_id uuid,owner_pseudonym_id uuid,owner_deleted_at timestamptz,status text);`);
 for(const r of results.filter(r=>['EXACT MATCH','NORMALIZED MATCH'].includes(r.status))){
  const c=candidates.find(c=>c.name===r.name&&c.file===r.selected.file);
  const sql=r.status==='NORMALIZED MATCH'?c.sql.replaceAll('\r\n','\n'):c.sql;
  await q(sql);
  assert.equal(await q(`select md5(prosrc)||':'||md5(coalesce(proconfig::text,''))||':'||prosecdef||':'||proowner::regrole from pg_proc where oid='public.${r.name}(${c.signature})'::regprocedure`),r.source+':'+r.config+':'+r.definer+':postgres');
 }
 await q(await readFile(new URL('../../docs/buffago-final-minimal-r3-source-request.sql',import.meta.url),'utf8'));
 console.log('PASS R3 draft syntax in disposable BEGIN READ ONLY / ROLLBACK; source output suppressed (excluded from 13 checks)');
 checks.push('all 11 installed functions have production source/config/definer fingerprints in PG17.6');
 await q(`insert into auth.users(id) values('${U}'),('${V}');insert into public.users values('${U}',100,false),('${V}',100,true);`);
 await check('actual social helper permits visible profile and denies opt-out/missing profile',async()=>assert.equal(await q(`select public.can_user_appear_socially('${U}')||':'||public.can_user_appear_socially('${V}')||':'||public.can_user_appear_socially('${A}')`),'true:false:false'));
 await check('actual referral profile gate rejects banned/deleted/missing accounts',async()=>{
  assert.equal(await q(`select public.referral_profile_eligibility('${U}')`),'t');
  await q(`update auth.users set banned_until=now()+interval '1 day' where id='${U}'`);assert.equal(await q(`select public.referral_profile_eligibility('${U}')`),'f');
  await q(`update auth.users set banned_until=null,deleted_at=now() where id='${U}'`);assert.equal(await q(`select public.referral_profile_eligibility('${U}')`),'f');
  await q(`update auth.users set deleted_at=null where id='${U}'`);
  assert.equal(await q(`select public.referral_profile_eligibility('${A}')`),'f');
 });
 await q(`insert into referral_codes(id,user_id,code) values('${A}','${U}','ABCDEFGH');insert into referral_attributions(id,referral_code_id,inviter_user_id,invitee_user_id,status) values('${A}','${A}','${U}','${V}','pending_qualification');`);
 await check('actual settlement calls matched profile gate before rewards and rejects incomplete ratings',async()=>{
  await q(`delete from users where user_id='${V}'`);assert.equal(JSON.parse(await q(`select settle_referral_for_rating_internal('${V}','${P}')`)).reason,'profile_required');
  await q(`insert into users values('${V}',100,false)`);assert.equal(JSON.parse(await q(`select settle_referral_for_rating_internal('${V}','${P}')`)).reason,'rating_not_eligible');
 });
 await check('actual award helper returns existing ledger ID without double award',async()=>{
  await q(`insert into xp_ledger(id,idempotency_key) values('${P}','referral:${A}:inviter:qualification')`);
  assert.equal(await q(`select award_referral_xp_internal('${U}',250,'${A}','inviter')`),P);assert.equal(await q(`select xp from users where user_id='${U}'`),'100');
 });
 await check('actual push helper respects preferences and deduplicates',async()=>{
  await q(`select enqueue_referral_push_internal('${U}','${A}','referral_friend_qualified','Fixture','Fixture')`);assert.equal(await q('select count(*) from notification_outbox'),'0');
  await q(`insert into notification_preferences values('${U}',true);select enqueue_referral_push_internal('${U}','${A}','referral_friend_qualified','Fixture','Fixture');select enqueue_referral_push_internal('${U}','${A}','referral_friend_qualified','Fixture','Fixture')`);assert.equal(await q('select count(*) from notification_outbox'),'1');
 });
 await q(`insert into xp_ledger(id,idempotency_key) values('${A}','referral:${A}:invitee:qualification');insert into destination_ratings values('${P}','${V}',false,8,8,8,8,now());update referral_attributions set onboarding_completed_at=now();update referral_reward_config set is_enabled=true;insert into notification_preferences values('${V}',true);`);
 await check('actual settlement graph rolls back attribution/rewards/notifications on late push failure',async()=>{
  await q("alter table notification_outbox add constraint fixture_late_push_failure check(event_type <> 'referral_invitee_qualified')");
  await assert.rejects(q(`select settle_referral_for_rating_internal('${V}','${P}')`),/fixture_late_push_failure/);
  assert.equal(await q('select status from referral_attributions'),'pending_qualification');assert.equal(await q('select count(*) from referral_rewards'),'0');assert.equal(await q('select count(*) from referral_in_app_notifications'),'0');
  await q('alter table notification_outbox drop constraint fixture_late_push_failure');
 });
 await check('actual settlement graph recovers existing XP receipts and produces exactly two rewards',async()=>{
  assert.equal(JSON.parse(await q(`select settle_referral_for_rating_internal('${V}','${P}')`)).qualified,true);
  assert.equal(await q('select count(*) from referral_rewards'),'2');assert.equal(await q('select count(*) from xp_ledger'),'2');
  assert.equal(JSON.parse(await q(`select settle_referral_for_rating_internal('${V}','${P}')`)).reason,'no_pending_referral');
 });
 await check('actual badge helper awards once and removes below threshold',async()=>{
  await q(`update referral_attributions set status='rewarded',qualified_at=now()`);
  await q(`select sync_verified_referral_badges_internal('${U}');select sync_verified_referral_badges_internal('${U}')`);assert.equal(await q('select count(*) from user_badges'),'1');
  await q(`update referral_attributions set review_status='rejected';select sync_verified_referral_badges_internal('${U}')`);assert.equal(await q('select count(*) from user_badges'),'0');
 });
 await check('actual Auth deletion signal retains attribution and deduplicates signal',async()=>{
  await q(`create trigger auth_user_referral_deletion_signal before delete on auth.users for each row execute function flag_referral_account_deletion();delete from auth.users where id='${V}';`);
  assert.equal(await q('select count(*) from referral_abuse_signals'),'1');assert.equal(await q('select count(*) from referral_attributions'),'1');
 });
 await q(`insert into wing_media_submissions(id,user_id,status,media_type,consent_version,consented_at,attribution_preference,original_storage_path) values('${P}','${U}','in_review','photo','v1',now(),'anonymous','originals/${U}/${P}/source');insert into storage.objects values('wing-submissions','originals/${U}/${P}/source');`);
 await check('LF-normalized actual photo blocker checks owner, original and processing',async()=>{
  assert.equal(await q(`select coalesce(wing_photo_processing_blocker('${P}'),'eligible')`),'eligible');
  await q(`insert into wing_processing_jobs values('${P}','photo_process','claimed')`);assert.equal(await q(`select wing_photo_processing_blocker('${P}')`),'legacy_processing_active');await q('delete from wing_processing_jobs');
 });
 await check('actual transition validates approval actor and idempotent receipt',async()=>{
  const call=(actor,key)=>`select wing_transition_submission('${P}','approved','in_review','reviewer',${actor},'fixture_review','${key}','${A}','{}')`;
  await assert.rejects(q(call('null','fixture-invalid-actor')),/approval_actor_required/);
  const id=await q(call(`'${U}'`,'fixture-valid-actor'));assert.equal(await q(call(`'${U}'`,'fixture-valid-actor')),id);
 });
 await check('actual cleanup cancels present intents but does not persistently prohibit later intent writes',async()=>{
  await q(`insert into wing_submission_upload_intents(user_id,status,expected_storage_path) values('${U}','reserved','unmanifested-fixture-path')`);
  const manifest=JSON.parse(await q(`select prepare_wing_account_media_cleanup('${U}','${A}')`));
  assert.equal(await q(`select status from wing_submission_upload_intents`),'cancelled');assert.ok(!manifest.object_paths.includes('unmanifested-fixture-path'));
  // A separate transaction/backend after prepare commits, while Auth is present.
  await query(db,`insert into wing_submission_upload_intents(user_id,status,expected_storage_path) values('${U}','reserved','late-fixture-path')`,'late-upload-after-prepare');
  assert.equal(await q(`select count(*) from wing_submission_upload_intents where status='reserved'`),'1');
  assert.equal(await q(`select complete_wing_account_media_cleanup('${manifest.manifest_id}',true,null)`),'t');
  assert.equal(await q(`select count(*) from auth.users where id='${U}'`),'1');
  assert.equal(await q(`select wing_photo_processing_blocker('${P}')`),'not_processable');
 });
 console.log(JSON.stringify({checks:checks.length,passed:checks,limitations:['Reduced tables/indexes; no production RLS/ACL/trigger parity implied','No fresh XP award: xp_level_for(integer) fingerprint not supplied','No unmatched upload/event/Storage/Mango/Badge/social-block body installed','Late intent insert is a cleanup RPC counterexample, not a test of production reserve/finalize or Storage API']}));
 await writeFile(new URL('../../docs/buffago-final-matched-test-results.json',import.meta.url),JSON.stringify({postgres:'17.6',checks,limitations:['Reduced prerequisites; full reward graph and production upload bodies remain gated']},null,2)+'\n');
}finally{await stop();}
