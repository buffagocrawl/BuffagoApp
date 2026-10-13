import {readFileSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {admin,client,check,sql,localPath,saveEvidence} from './app-polish-staging-common.mjs';
const prefix=`polish-${Date.now()}`;
const actors={};
const existingUsers=check(await admin.auth.admin.listUsers()).users;
for(const name of ['voter','owner','reviewer','other']){
 const existing=existingUsers.find(u=>u.email?.startsWith('polish-')&&u.email.endsWith('@example.invalid')&&u.user_metadata?.display_name===`Synthetic ${name}`);
 if(existing){
  const link=check(await admin.auth.admin.generateLink({type:'magiclink',email:existing.email}));
  const signed=check(await client().auth.verifyOtp({token_hash:link.properties.hashed_token,type:'magiclink'}));
  actors[name]={id:existing.id,token:signed.session.access_token};continue;
 }
 const email=`${prefix}-${name}@example.invalid`,password=`Only-local-${randomUUID()}`;
 const created=check(await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{display_name:`Synthetic ${name}`}}));
 const signed=check(await client().auth.signInWithPassword({email,password}));
 actors[name]={id:created.user.id,token:signed.session.access_token};
}
writeFileSync(localPath('.expo/app-polish-staging-fixtures.json'),JSON.stringify({actors,setupIncomplete:true}));
for(const b of JSON.parse(readFileSync(localPath('supabase/local/app-polish-acceptance/baseline/catalog-buckets.json'),'utf8'))){
 if((await admin.storage.getBucket(b.id)).data)continue;
 check(await admin.storage.createBucket(b.id,{public:b.public,fileSizeLimit:b.file_size_limit,allowedMimeTypes:b.allowed_mime_types}));
}
sql(`insert into public.wing_moderation_config(singleton) values(true) on conflict do nothing;
 insert into public.engagement_feature_flags(flag_key,enabled,rollout_percent) values('wing_shots',true,100),('wing_shots_uploads',true,100),('wing_shots_onboarding',true,100),('wing_shots_photos',true,100) on conflict(flag_key) do update set enabled=true,rollout_percent=100;
 insert into public.app_user_roles(user_id,role,reason) values('${actors.reviewer.id}','wing_reviewer','Synthetic local acceptance') on conflict do nothing;`);
const state=(await admin.from('states').select().eq('state_code','ZZ').maybeSingle()).data||check(await admin.from('states').insert({state_code:'ZZ',state_name:'Synthetic QA State'}).select().single());
const destination=(await admin.from('destinations').select().eq('name','Synthetic Framing Wing Cafe').maybeSingle()).data||check(await admin.from('destinations').insert({name:'Synthetic Framing Wing Cafe',address:'1 Fixture Lane',city:'Synthetic City',state_id:state.state_id,lat:42,lng:-78}).select().single());
const image=readFileSync(localPath('../artifacts/app-polish/release-qa/native/pinch-confirmed-upload.jpg'));
const photos=check(await admin.from('wing_media_submissions').select('id,original_storage_path,processed_storage_path,thumbnail_storage_path').eq('destination_id',destination.id).order('created_at')).map(p=>({id:p.id,original:p.original_storage_path,primary:p.processed_storage_path,thumbnail:p.thumbnail_storage_path}));
for(let i=photos.length;i<5;i++){
 const id=randomUUID(),original=`originals/${actors.owner.id}/${id}/source`,primary=`processed/${id}/primary`,thumbnail=`thumbnails/${id}/preview`;
 for(const path of [original,primary,thumbnail])check(await admin.storage.from('wing-submissions').upload(path,image,{contentType:'image/jpeg'}));
 check(await admin.from('wing_media_submissions').insert({id,user_id:actors.owner.id,destination_id:destination.id,media_type:'photo',original_storage_path:original,processed_storage_path:primary,thumbnail_storage_path:thumbnail,status:'approved',approved_at:new Date().toISOString(),approved_by:actors.reviewer.id,consent_version:'synthetic-local-v1',consented_at:new Date().toISOString(),attribution_preference:'anonymous',submission_source:'home_cta'}));
 photos.push({id,original,primary,thumbnail});
}
writeFileSync(localPath('.expo/app-polish-staging-fixtures.json'),JSON.stringify({actors,destination:destination.id,photos,setupIncomplete:true}));
const cases=[[1,-1,'2026-10-11 14:26:26.27651+00','2026-10-11 19:59:23.129031+00'],[1,0,'2026-10-11 14:26:46.559983+00','2026-10-11 19:59:05.979572+00'],[-1,1,'2026-10-11 20:35:35.215217+00','2026-10-11 20:01:07.666547+00']];
for(let i=0;i<cases.length;i++){
 const [legacy,jury,galleryTime,juryTime]=cases[i],id=photos[i].id;
 check(await client(actors.voter.token).from('wing_media_photo_votes').upsert({submission_id:id,user_id:actors.voter.id,vote:legacy},{onConflict:'submission_id,user_id'}));
 if(!(await admin.from('wing_jury_votes').select('submission_id').eq('submission_id',id).eq('user_id',actors.voter.id).maybeSingle()).data)
  check(await client(actors.voter.token).from('wing_jury_votes').insert({submission_id:id,user_id:actors.voter.id,vote:jury}));
 // Historical timestamps are fixture setup only. Restore validator immediately;
 // runtime acceptance always uses the real enabled triggers and RLS.
 sql(`begin;alter table public.wing_media_photo_votes disable trigger trg_validate_wing_media_photo_vote;
  update public.wing_media_photo_votes set created_at='${galleryTime}',updated_at='${galleryTime}' where submission_id='${id}';
  alter table public.wing_media_photo_votes enable trigger trg_validate_wing_media_photo_vote;
  alter table public.wing_jury_votes disable trigger wing_jury_votes_enforce_immutability;
  update public.wing_jury_votes set created_at='${juryTime}' where submission_id='${id}';
  alter table public.wing_jury_votes enable trigger wing_jury_votes_enforce_immutability;commit;`);
}
check(await admin.from('wing_media_submissions').update({status:'failed'}).eq('id',photos[1].id));
if(!(await admin.from('wing_jury_votes').select('submission_id').eq('submission_id',photos[3].id).eq('user_id',actors.voter.id).maybeSingle()).data)
 check(await client(actors.voter.token).from('wing_jury_votes').insert({submission_id:photos[3].id,user_id:actors.voter.id,vote:0}));
const fixture={actors,destination:destination.id,photos,source:'synthetic framed image, real local Auth/REST/Storage; no production records'};
writeFileSync(localPath('.expo/app-polish-staging-fixtures.json'),JSON.stringify(fixture));
saveEvidence('staging-fixtures-summary.json',{actors:Object.fromEntries(Object.entries(actors).map(([k,v])=>[k,v.id])),destination:destination.id,photos:photos.map(p=>p.id),synthetic:true,target:'127.0.0.1:55321'});
console.log('Created four synthetic authenticated actors, restaurant and five photos through real isolated services.');
