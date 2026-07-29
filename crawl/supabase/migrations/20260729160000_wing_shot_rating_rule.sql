-- Forward-only Wing Shot eligibility rule.
--
-- Wing Shot media is manually reviewed before publication. Rating
-- verification receipts remain audit data, but they are not an upload gate.

begin;

create or replace function public.wing_shot_rating_is_eligible(
  p_rating_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
      from public.destination_ratings rating
     where rating.id = p_rating_id
       and rating.user_id = p_user_id
       and not coalesce(rating.is_buffacoin, false)
       and rating.crispiness between 1 and 10
       and rating.sauce between 1 and 10
       and rating.meat between 1 and 10
       and rating.overall between 1 and 10
       and not exists (
         select 1
           from public.wing_media_submissions submission
          where submission.rating_id = rating.id
       )
       and not exists (
         select 1
           from public.wing_submission_upload_intents intent
          where intent.rating_id = rating.id
            and intent.status in ('reserved', 'finalized')
       )
  );
$$;

create or replace function public.wing_shot_rating_eligibility_reason(
  p_rating_id uuid,
  p_user_id uuid,
  p_destination_id uuid
)
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_rating public.destination_ratings%rowtype;
begin
  select *
    into v_rating
    from public.destination_ratings
   where id = p_rating_id;

  if not found then
    return 'rating_not_found';
  end if;
  if v_rating.user_id is distinct from p_user_id then
    return 'rating_not_owned';
  end if;
  if v_rating.destination_id is distinct from p_destination_id then
    return 'destination_mismatch';
  end if;
  if v_rating.crispiness is null or v_rating.crispiness not between 1 and 10
     or v_rating.sauce is null or v_rating.sauce not between 1 and 10
     or v_rating.meat is null or v_rating.meat not between 1 and 10
     or v_rating.overall is null or v_rating.overall not between 1 and 10 then
    return 'incomplete_rating';
  end if;
  if coalesce(v_rating.is_buffacoin, false) then
    return 'buffacoin_rating';
  end if;

  -- Duplicate active/finalized submissions are enforced by the reservation
  -- RPC, which returns its more specific duplicate error. This function's
  -- reason vocabulary intentionally describes the rating, not the upload
  -- mutation state.
  return 'eligible';
end;
$$;

create or replace function public.get_wing_shot_rating_eligibility(
  p_rating_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_reason text;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  v_reason := public.wing_shot_rating_eligibility_reason(
    p_rating_id,
    v_user_id,
    (select destination_id from public.destination_ratings where id = p_rating_id)
  );

  return jsonb_build_object(
    'rating_id', p_rating_id,
    'eligible', v_reason = 'eligible'
      and public.wing_shot_rating_is_eligible(p_rating_id, v_user_id),
    'reason', v_reason
  );
end;
$$;

-- Reinstall the authoritative reservation boundary without any receipt or
-- proximity dependency. The surrounding upload, storage, moderation, and
-- reward RPCs remain unchanged.
create or replace function public.reserve_wing_submission_upload(
  p_rating_id uuid,
  p_media_type text,
  p_expected_mime_type text,
  p_expected_size_bytes bigint,
  p_consent_version text,
  p_attribution_preference text,
  p_user_caption text,
  p_idempotency_key text,
  p_correlation_id uuid,
  p_destination_id uuid,
  p_submission_source text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, storage
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing public.wing_submission_mutation_receipts%rowtype;
  v_active public.wing_submission_upload_intents%rowtype;
  v_rating public.destination_ratings%rowtype;
  v_submission_id uuid := gen_random_uuid();
  v_destination_exists boolean;
  v_path text;
  v_fingerprint text;
  v_result jsonb;
  v_max_size bigint;
  v_reason text;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_submission_source not in ('rating', 'onboarding', 'buffacoin', 'profile', 'home_cta') then
    raise exception 'invalid_submission_source';
  end if;
  if p_destination_id is null then
    raise exception 'restaurant_required';
  end if;
  select exists (select 1 from public.destinations where id = p_destination_id)
    into v_destination_exists;
  if not v_destination_exists then
    raise exception 'restaurant_not_found';
  end if;
  if p_submission_source = 'rating' and p_rating_id is null then
    raise exception 'rating_required';
  end if;

  if p_rating_id is not null then
    select * into v_rating
      from public.destination_ratings
     where id = p_rating_id;
    if not found then
      raise exception 'rating_not_found' using errcode = '42501';
    end if;
    if v_rating.user_id is distinct from v_user_id then
      raise exception 'rating_not_owned' using errcode = '42501';
    end if;
    if v_rating.destination_id is distinct from p_destination_id then
      raise exception 'destination_mismatch' using errcode = '42501';
    end if;
    v_reason := public.wing_shot_rating_eligibility_reason(
      p_rating_id, v_user_id, p_destination_id
    );
    if v_reason <> 'eligible' then
      raise exception '%', v_reason using errcode = '42501';
    end if;
  end if;

  if p_media_type not in ('photo', 'video') then
    raise exception 'unsupported_media_type';
  end if;
  if p_expected_mime_type not in (
    'image/jpeg', 'image/png', 'image/webp', 'image/heic',
    'video/mp4', 'video/quicktime'
  ) then
    raise exception 'unsupported_mime_type';
  end if;
  if (p_media_type = 'photo' and p_expected_mime_type not like 'image/%')
     or (p_media_type = 'video' and p_expected_mime_type not like 'video/%') then
    raise exception 'media_mime_mismatch';
  end if;
  v_max_size := case when p_media_type = 'photo' then 20971520 else 52428800 end;
  if p_expected_size_bytes is null or p_expected_size_bytes not between 1 and v_max_size then
    raise exception 'invalid_media_size';
  end if;
  if p_consent_version is null or char_length(p_consent_version) not between 1 and 40 then
    raise exception 'affirmative_consent_required';
  end if;
  if p_attribution_preference not in ('username', 'display_name', 'anonymous') then
    raise exception 'invalid_attribution_preference';
  end if;
  if p_user_caption is not null and char_length(p_user_caption) > 500 then
    raise exception 'caption_too_long';
  end if;
  if p_idempotency_key is null or char_length(p_idempotency_key) not between 8 and 200 then
    raise exception 'invalid_idempotency_key';
  end if;
  if p_correlation_id is null then
    raise exception 'correlation_id_required';
  end if;
  if not public.wing_feature_enabled_for_user('wing_shot_prompt') then
    raise exception 'wing_shot_prompt_disabled' using errcode = '42501';
  end if;
  if p_media_type = 'photo' and not public.wing_feature_enabled_for_user('wing_shot_photo_upload') then
    raise exception 'wing_shot_photo_upload_disabled' using errcode = '42501';
  end if;
  if p_media_type = 'video' and not public.wing_feature_enabled_for_user('wing_shot_video_upload') then
    raise exception 'wing_shot_video_upload_disabled' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('wing-mutation:' || p_idempotency_key, 0));
  v_fingerprint := md5(concat_ws('|', coalesce(p_rating_id::text, ''), p_media_type,
    p_expected_mime_type, p_expected_size_bytes::text, p_consent_version,
    p_attribution_preference, coalesce(p_user_caption, ''), p_destination_id::text,
    p_submission_source));
  select * into v_existing from public.wing_submission_mutation_receipts
   where idempotency_key = p_idempotency_key;
  if found then
    if v_existing.user_id is distinct from v_user_id
       or v_existing.request_fingerprint <> v_fingerprint then
      raise exception 'idempotency_key_conflict';
    end if;
    return v_existing.result;
  end if;

  if p_rating_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('wing-rating-reservation:' || p_rating_id::text, 0));
    if exists (select 1 from public.wing_media_submissions where rating_id = p_rating_id) then
      raise exception 'wing_submission_already_finalized';
    end if;
    select * into v_active from public.wing_submission_upload_intents
     where rating_id = p_rating_id and status in ('reserved', 'finalized') limit 1;
    if found then
      raise exception 'wing_submission_already_reserved';
    end if;
  end if;

  v_path := 'originals/' || v_user_id::text || '/' || v_submission_id::text || '/source';
  insert into public.wing_submission_upload_intents (
    submission_id, user_id, rating_id, destination_id, media_type,
    expected_mime_type, expected_size_bytes, expected_storage_path,
    consent_version, consented_at, attribution_preference, user_caption,
    submission_source, expires_at, idempotency_key, request_fingerprint,
    correlation_id
  ) values (
    v_submission_id, v_user_id, p_rating_id, p_destination_id, p_media_type,
    p_expected_mime_type, p_expected_size_bytes, v_path, p_consent_version,
    now(), p_attribution_preference, nullif(trim(p_user_caption), ''),
    p_submission_source, now() + interval '15 minutes', p_idempotency_key,
    v_fingerprint, p_correlation_id
  );
  v_result := jsonb_build_object(
    'submission_id', v_submission_id, 'bucket', 'wing-submissions',
    'upload_path', v_path, 'expires_at', now() + interval '15 minutes'
  );
  insert into public.wing_submission_mutation_receipts (
    user_id, submission_id, mutation_kind, idempotency_key,
    request_fingerprint, result, correlation_id
  ) values (
    v_user_id, v_submission_id, 'reserve_upload', p_idempotency_key,
    v_fingerprint, v_result, p_correlation_id
  );
  return v_result;
end;
$$;

revoke all on function public.wing_shot_rating_is_eligible(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.wing_shot_rating_is_eligible(uuid, uuid)
  to service_role;
revoke all on function public.wing_shot_rating_eligibility_reason(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.wing_shot_rating_eligibility_reason(uuid, uuid, uuid)
  to service_role;
revoke all on function public.get_wing_shot_rating_eligibility(uuid)
  from public, anon;
grant execute on function public.get_wing_shot_rating_eligibility(uuid)
  to authenticated, service_role;
revoke all on function public.reserve_wing_submission_upload(
  uuid, text, text, bigint, text, text, text, text, uuid, uuid, text
) from public, anon;
grant execute on function public.reserve_wing_submission_upload(
  uuid, text, text, bigint, text, text, text, text, uuid, uuid, text
) to authenticated, service_role;

comment on function public.wing_shot_rating_is_eligible(uuid, uuid) is
  'Wing Shot upload predicate: owned completed non-Buffacoin rating with no existing active or finalized Wing Shot; verification receipts are not consulted.';
comment on function public.wing_shot_rating_eligibility_reason(uuid, uuid, uuid) is
  'Returns rating_not_found, rating_not_owned, destination_mismatch, incomplete_rating, buffacoin_rating, or eligible.';

commit;
