-- Reconcile the Wing Shot reservation RPC with the client contract.
-- The 20260729136000 migration recreated the legacy 9-argument overload after
-- the source-expansion migration. PostgreSQL identifies functions by argument
-- types, so remove every known obsolete identity before installing one
-- authoritative 11-argument function.

begin;

drop function if exists public.reserve_wing_submission_upload(
  uuid,
  text,
  text,
  bigint,
  text,
  text,
  text,
  text,
  uuid
);

-- Obsolete source-expansion overload whose destination argument was inserted
-- in the wrong position.
drop function if exists public.reserve_wing_submission_upload(
  uuid,
  uuid,
  text,
  text,
  bigint,
  text,
  text,
  text,
  text,
  uuid,
  text
);

-- Remove any other accidental overloads of this RPC. The function is a
-- security boundary and must have exactly one public signature.
do $$
declare
  v_function record;
begin
  for v_function in
    select p.oid, pg_get_function_identity_arguments(p.oid) as identity_args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'reserve_wing_submission_upload'
  loop
    execute format(
      'drop function if exists public.reserve_wing_submission_upload(%s)',
      v_function.identity_args
    );
  end loop;
end;
$$;

create function public.reserve_wing_submission_upload(
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
  v_destination public.destinations%rowtype;
  v_rating public.destination_ratings%rowtype;
  v_existing public.wing_submission_mutation_receipts%rowtype;
  v_active public.wing_submission_upload_intents%rowtype;
  v_submission_id uuid := gen_random_uuid();
  v_path text;
  v_fingerprint text;
  v_result jsonb;
  v_max_size bigint;
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
  select * into v_destination
  from public.destinations
  where id = p_destination_id;
  if not found then
    raise exception 'restaurant_not_found';
  end if;

  -- Rating is required for the rating source. Other already-supported entry
  -- points may omit it, but any supplied rating is still owner and eligibility
  -- checked and must belong to the supplied destination.
  if p_submission_source = 'rating' and p_rating_id is null then
    raise exception 'rating_required';
  end if;
  if p_rating_id is not null then
    select * into v_rating
    from public.destination_ratings
    where id = p_rating_id
      and user_id = v_user_id;
    if not found then
      raise exception 'rating_not_found' using errcode = '42501';
    end if;
    if v_rating.destination_id is distinct from p_destination_id then
      raise exception 'rating_destination_mismatch' using errcode = '42501';
    end if;
    if not public.wing_shot_rating_is_eligible(p_rating_id, v_user_id) then
      raise exception 'ineligible_rating' using errcode = '42501';
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

  -- Keep these values aligned with the private bucket's 50 MiB ceiling and
  -- the client constants. Photos intentionally have the smaller limit.
  v_max_size := case when p_media_type = 'photo'
    then 20971520 -- 20 MiB
    else 52428800 -- 50 MiB
  end;
  if p_expected_size_bytes is null
     or p_expected_size_bytes not between 1 and v_max_size then
    raise exception 'invalid_media_size';
  end if;
  if p_consent_version is null
     or char_length(p_consent_version) not between 1 and 40 then
    raise exception 'affirmative_consent_required';
  end if;
  if p_attribution_preference not in ('username', 'display_name', 'anonymous') then
    raise exception 'invalid_attribution_preference';
  end if;
  if p_user_caption is not null and char_length(p_user_caption) > 500 then
    raise exception 'caption_too_long';
  end if;
  if p_idempotency_key is null
     or char_length(p_idempotency_key) not between 8 and 200 then
    raise exception 'invalid_idempotency_key';
  end if;
  if p_correlation_id is null then
    raise exception 'correlation_id_required';
  end if;
  if not public.wing_feature_enabled_for_user('wing_shot_prompt') then
    raise exception 'wing_shot_prompt_disabled' using errcode = '42501';
  end if;
  if p_media_type = 'photo'
     and not public.wing_feature_enabled_for_user('wing_shot_photo_upload') then
    raise exception 'wing_shot_photo_upload_disabled' using errcode = '42501';
  end if;
  if p_media_type = 'video'
     and not public.wing_feature_enabled_for_user('wing_shot_video_upload') then
    raise exception 'wing_shot_video_upload_disabled' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('wing-mutation:' || p_idempotency_key, 0)
  );
  v_fingerprint := md5(concat_ws(
    '|',
    coalesce(p_rating_id::text, ''),
    p_media_type,
    p_expected_mime_type,
    p_expected_size_bytes::text,
    p_consent_version,
    p_attribution_preference,
    coalesce(p_user_caption, ''),
    p_destination_id::text,
    p_submission_source
  ));

  select * into v_existing
  from public.wing_submission_mutation_receipts
  where idempotency_key = p_idempotency_key;
  if found then
    if v_existing.user_id is distinct from v_user_id
       or v_existing.request_fingerprint <> v_fingerprint then
      raise exception 'idempotency_key_conflict';
    end if;
    return v_existing.result;
  end if;

  if p_rating_id is not null then
    perform pg_advisory_xact_lock(
      hashtextextended('wing-rating-reservation:' || p_rating_id::text, 0)
    );
    if exists (
      select 1 from public.wing_media_submissions submission
      where submission.rating_id = p_rating_id
    ) then
      raise exception 'wing_submission_already_finalized';
    end if;
    select * into v_active
    from public.wing_submission_upload_intents intent
    where intent.rating_id = p_rating_id
      and intent.status in ('reserved', 'finalized')
    limit 1;
    if found then
      raise exception 'wing_submission_already_reserved';
    end if;
  end if;

  v_path := 'originals/' || v_user_id::text || '/'
    || v_submission_id::text || '/source';
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
    'submission_id', v_submission_id,
    'bucket', 'wing-submissions',
    'upload_path', v_path,
    'expires_at', now() + interval '15 minutes'
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

revoke all on function public.reserve_wing_submission_upload(
  uuid, text, text, bigint, text, text, text, text, uuid, uuid, text
) from public, anon;
grant execute on function public.reserve_wing_submission_upload(
  uuid, text, text, bigint, text, text, text, text, uuid, uuid, text
) to authenticated, service_role;

commit;
