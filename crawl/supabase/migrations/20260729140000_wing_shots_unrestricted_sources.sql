-- Wing Shots are optional media contributions, not a reward for proximity.
-- Rating provenance remains useful for analytics, but is no longer an upload gate.

begin;

alter table public.wing_media_submissions
  alter column rating_id drop not null;
alter table public.wing_media_submissions
  add column if not exists submission_source text not null default 'rating';
alter table public.wing_media_submissions
  drop constraint if exists wing_media_submissions_submission_source_check;
alter table public.wing_media_submissions
  add constraint wing_media_submissions_submission_source_check
  check (submission_source in ('rating', 'onboarding', 'buffacoin', 'profile', 'home_cta'));

alter table public.wing_submission_upload_intents
  alter column rating_id drop not null;
alter table public.wing_submission_upload_intents
  add column if not exists submission_source text not null default 'rating';
alter table public.wing_submission_upload_intents
  drop constraint if exists wing_submission_upload_intents_submission_source_check;
alter table public.wing_submission_upload_intents
  add constraint wing_submission_upload_intents_submission_source_check
  check (submission_source in ('rating', 'onboarding', 'buffacoin', 'profile', 'home_cta'));
alter table public.wing_submission_upload_intents
  drop constraint if exists wing_submission_upload_intents_rating_id_key;
drop index if exists public.wing_upload_intents_one_active_per_rating;
create unique index if not exists wing_upload_intents_one_active_per_rating
  on public.wing_submission_upload_intents (rating_id)
  where rating_id is not null and status in ('reserved', 'finalized');

drop function if exists public.reserve_wing_submission_upload(uuid, text, text, bigint, text, text, text, text, uuid);
drop function if exists public.reserve_wing_submission_upload(uuid, text, text, bigint, text, text, text, text, uuid, uuid, text);

create or replace function public.reserve_wing_submission_upload(
  p_rating_id uuid,
  p_destination_id uuid,
  p_media_type text,
  p_expected_mime_type text,
  p_expected_size_bytes bigint,
  p_consent_version text,
  p_attribution_preference text,
  p_user_caption text,
  p_idempotency_key text,
  p_correlation_id uuid,
  p_submission_source text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, storage
as $$
declare
  v_user_id uuid := auth.uid();
  v_destination public.destinations%rowtype;
  v_rating public.destination_ratings%rowtype;
  v_existing public.wing_submission_mutation_receipts%rowtype;
  v_active public.wing_submission_upload_intents%rowtype;
  v_submission_id uuid := gen_random_uuid();
  v_path text;
  v_fingerprint text;
  v_result jsonb;
begin
  if v_user_id is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if p_submission_source not in ('rating','onboarding','buffacoin','profile','home_cta') then raise exception 'invalid_submission_source'; end if;
  if p_destination_id is null then raise exception 'restaurant_required'; end if;
  select * into v_destination from public.destinations where id = p_destination_id;
  if not found then raise exception 'restaurant_not_found'; end if;
  if p_rating_id is not null then
    select * into v_rating from public.destination_ratings
      where id = p_rating_id and user_id = v_user_id and destination_id = p_destination_id;
    if not found then raise exception 'rating_not_found' using errcode = '42501'; end if;
  end if;
  if p_media_type not in ('photo','video') then raise exception 'unsupported_media_type'; end if;
  if p_expected_mime_type not in ('image/jpeg','image/png','image/webp','image/heic','video/mp4','video/quicktime') then raise exception 'unsupported_mime_type'; end if;
  if (p_media_type = 'photo' and p_expected_mime_type not like 'image/%') or (p_media_type = 'video' and p_expected_mime_type not like 'video/%') then raise exception 'media_mime_mismatch'; end if;
  if p_expected_size_bytes is null or p_expected_size_bytes not between 1 and 52428800 then raise exception 'invalid_media_size'; end if;
  if p_consent_version is null or char_length(p_consent_version) not between 1 and 40 then raise exception 'affirmative_consent_required'; end if;
  if p_attribution_preference not in ('username','display_name','anonymous') then raise exception 'invalid_attribution_preference'; end if;
  if p_user_caption is not null and char_length(p_user_caption) > 500 then raise exception 'caption_too_long'; end if;
  if p_idempotency_key is null or char_length(p_idempotency_key) not between 8 and 200 then raise exception 'invalid_idempotency_key'; end if;
  if p_correlation_id is null then raise exception 'correlation_id_required'; end if;
  if not public.wing_feature_enabled_for_user('wing_shot_prompt') then raise exception 'wing_shot_prompt_disabled' using errcode = '42501'; end if;
  if p_media_type = 'photo' and not public.wing_feature_enabled_for_user('wing_shot_photo_upload') then raise exception 'wing_shot_photo_upload_disabled' using errcode = '42501'; end if;
  if p_media_type = 'video' and not public.wing_feature_enabled_for_user('wing_shot_video_upload') then raise exception 'wing_shot_video_upload_disabled' using errcode = '42501'; end if;

  perform pg_advisory_xact_lock(hashtextextended('wing-mutation:' || p_idempotency_key, 0));
  v_fingerprint := md5(concat_ws('|', coalesce(p_rating_id::text,''), p_destination_id::text, p_submission_source, p_media_type, p_expected_mime_type, p_expected_size_bytes::text, p_consent_version, p_attribution_preference, coalesce(p_user_caption,'')));
  select * into v_existing from public.wing_submission_mutation_receipts where idempotency_key = p_idempotency_key;
  if found then
    if v_existing.user_id is distinct from v_user_id or v_existing.request_fingerprint <> v_fingerprint then raise exception 'idempotency_key_conflict'; end if;
    return v_existing.result;
  end if;
  if p_rating_id is not null then
    if exists (select 1 from public.wing_media_submissions where rating_id = p_rating_id) then raise exception 'wing_submission_already_finalized'; end if;
    select * into v_active from public.wing_submission_upload_intents where rating_id = p_rating_id and status in ('reserved','finalized') limit 1;
    if found then raise exception 'wing_submission_already_reserved'; end if;
  end if;
  v_path := 'originals/' || v_user_id::text || '/' || v_submission_id::text || '/source';
  insert into public.wing_submission_upload_intents (submission_id,user_id,rating_id,destination_id,media_type,expected_mime_type,expected_size_bytes,expected_storage_path,consent_version,consented_at,attribution_preference,user_caption,submission_source,expires_at,idempotency_key,request_fingerprint,correlation_id)
  values (v_submission_id,v_user_id,p_rating_id,p_destination_id,p_media_type,p_expected_mime_type,p_expected_size_bytes,v_path,p_consent_version,now(),p_attribution_preference,nullif(trim(p_user_caption),''),p_submission_source,now()+interval '15 minutes',p_idempotency_key,v_fingerprint,p_correlation_id);
  v_result := jsonb_build_object('submission_id',v_submission_id,'bucket','wing-submissions','upload_path',v_path,'expires_at',now()+interval '15 minutes');
  insert into public.wing_submission_mutation_receipts (user_id,submission_id,mutation_kind,idempotency_key,request_fingerprint,result,correlation_id) values (v_user_id,v_submission_id,'reserve_upload',p_idempotency_key,v_fingerprint,v_result,p_correlation_id);
  return v_result;
end;
$$;

-- Keep the reservation/finalization boundary client-callable, but never expose tables.
revoke all on function public.reserve_wing_submission_upload(uuid,uuid,text,text,bigint,text,text,text,text,uuid,text) from public, anon;
grant execute on function public.reserve_wing_submission_upload(uuid,uuid,text,text,bigint,text,text,text,text,uuid,text) to authenticated, service_role;

create or replace function public.finalize_wing_submission_upload(
  p_submission_id uuid, p_idempotency_key text, p_correlation_id uuid
)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, storage
as $$
declare
  v_user_id uuid := auth.uid(); v_intent public.wing_submission_upload_intents%rowtype;
  v_existing public.wing_submission_mutation_receipts%rowtype; v_fingerprint text; v_result jsonb;
begin
  if v_user_id is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if p_idempotency_key is null or p_correlation_id is null then raise exception 'invalid_finalize_request'; end if;
  perform pg_advisory_xact_lock(hashtextextended('wing-mutation:' || p_idempotency_key, 0));
  v_fingerprint := md5(concat_ws('|',p_submission_id::text,'finalize'));
  select * into v_existing from public.wing_submission_mutation_receipts where idempotency_key = p_idempotency_key;
  if found then
    if v_existing.user_id is distinct from v_user_id or v_existing.request_fingerprint <> v_fingerprint then raise exception 'idempotency_key_conflict'; end if;
    return v_existing.result;
  end if;
  select * into v_intent from public.wing_submission_upload_intents where submission_id = p_submission_id and user_id = v_user_id for update;
  if not found or v_intent.status <> 'reserved' or v_intent.expires_at <= now() then raise exception 'upload_intent_unavailable'; end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'wing-submissions' and o.name = v_intent.expected_storage_path and o.owner_id = v_user_id::text) then raise exception 'uploaded_object_not_found'; end if;
  insert into public.wing_media_submissions (id,user_id,rating_id,destination_id,submission_source,media_type,original_storage_path,consent_version,consented_at,attribution_preference,user_caption,status,correlation_id)
  values (v_intent.submission_id,v_intent.user_id,v_intent.rating_id,v_intent.destination_id,v_intent.submission_source,v_intent.media_type,v_intent.expected_storage_path,v_intent.consent_version,v_intent.consented_at,v_intent.attribution_preference,v_intent.user_caption,'uploaded',p_correlation_id);
  update public.wing_submission_upload_intents set status='finalized',finalized_at=now(),updated_at=now() where id=v_intent.id;
  insert into public.wing_submission_state_transitions (submission_id,from_status,to_status,actor_type,actor_id,trigger_source,idempotency_key,request_fingerprint,correlation_id) values (v_intent.submission_id,null,'uploaded','user',v_user_id,'upload_finalized','initial:'||md5(p_idempotency_key),md5('initial|'||v_intent.submission_id::text),p_correlation_id);
  v_result := jsonb_build_object('submission_id',v_intent.submission_id,'status','uploaded');
  insert into public.wing_submission_mutation_receipts (user_id,submission_id,mutation_kind,idempotency_key,request_fingerprint,result,correlation_id) values (v_user_id,v_intent.submission_id,'finalize_upload',p_idempotency_key,v_fingerprint,v_result,p_correlation_id);
  return v_result;
end;
$$;

commit;
