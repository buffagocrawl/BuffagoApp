-- Allow an owner to make a fresh Wing Shot reservation after cleanup safely
-- expires an abandoned intent. Expired intent rows and mutation receipts remain
-- immutable audit evidence; they are never revived or overwritten.

begin;

alter table public.wing_submission_upload_intents
  drop constraint if exists wing_submission_upload_intents_rating_id_key;

create unique index if not exists wing_upload_intents_one_active_per_rating
  on public.wing_submission_upload_intents(rating_id)
  where status in ('reserved', 'finalized');

create or replace function public.wing_guard_upload_intent_status()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if old.status in ('finalized', 'expired', 'cancelled')
     and new.status is distinct from old.status then
    raise exception 'wing_upload_intent_terminal_state_is_immutable';
  end if;
  if old.status = 'reserved'
     and new.status not in ('reserved', 'finalized', 'expired', 'cancelled') then
    raise exception 'invalid_wing_upload_intent_transition';
  end if;
  return new;
end;
$$;

drop trigger if exists wing_upload_intent_status_guard
  on public.wing_submission_upload_intents;
create trigger wing_upload_intent_status_guard
before update of status on public.wing_submission_upload_intents
for each row execute function public.wing_guard_upload_intent_status();

create or replace function public.reserve_wing_submission_upload(
  p_rating_id uuid,
  p_media_type text,
  p_expected_mime_type text,
  p_expected_size_bytes bigint,
  p_consent_version text,
  p_attribution_preference text,
  p_user_caption text,
  p_idempotency_key text,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, storage
as $$
declare
  v_user_id uuid := auth.uid();
  v_rating public.destination_ratings%rowtype;
  v_existing public.wing_submission_mutation_receipts%rowtype;
  v_active_intent public.wing_submission_upload_intents%rowtype;
  v_submission_id uuid := gen_random_uuid();
  v_path text;
  v_fingerprint text;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_idempotency_key is null
     or char_length(p_idempotency_key) not between 8 and 200 then
    raise exception 'invalid_idempotency_key';
  end if;
  if p_correlation_id is null then
    raise exception 'correlation_id_required';
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
  if p_expected_size_bytes is null
     or p_expected_size_bytes not between 1 and 52428800 then
    raise exception 'invalid_media_size';
  end if;
  if p_consent_version is null
     or char_length(p_consent_version) not between 1 and 40 then
    raise exception 'affirmative_consent_required';
  end if;
  if p_attribution_preference not in (
    'username', 'display_name', 'anonymous'
  ) then
    raise exception 'invalid_attribution_preference';
  end if;
  if p_user_caption is not null and char_length(p_user_caption) > 500 then
    raise exception 'caption_too_long';
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

  select *
  into v_rating
  from public.destination_ratings
  where id = p_rating_id
    and user_id = v_user_id
    and public.wing_shot_rating_is_eligible(p_rating_id, v_user_id);
  if not found then
    raise exception 'eligible_rating_not_found' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('wing-mutation:' || p_idempotency_key, 0)
  );
  v_fingerprint := md5(concat_ws(
    '|',
    p_rating_id::text,
    p_media_type,
    p_expected_mime_type,
    p_expected_size_bytes::text,
    p_consent_version,
    p_attribution_preference,
    coalesce(p_user_caption, '')
  ));

  select *
  into v_existing
  from public.wing_submission_mutation_receipts
  where idempotency_key = p_idempotency_key;
  if found then
    if v_existing.user_id is distinct from v_user_id
       or v_existing.request_fingerprint <> v_fingerprint then
      raise exception 'idempotency_key_conflict';
    end if;
    -- Replaying an expired reservation returns its historical receipt, but
    -- storage authorization still rejects the terminal intent and old path.
    return v_existing.result;
  end if;

  -- Serialize distinct idempotency keys for the same rating. The partial unique
  -- index remains the final concurrency backstop.
  perform pg_advisory_xact_lock(
    hashtextextended('wing-rating-reservation:' || p_rating_id::text, 0)
  );

  if exists (
    select 1
    from public.wing_media_submissions submission
    where submission.rating_id = p_rating_id
  ) then
    raise exception 'wing_submission_already_finalized';
  end if;

  select *
  into v_active_intent
  from public.wing_submission_upload_intents intent
  where intent.rating_id = p_rating_id
    and intent.status in ('reserved', 'finalized')
  limit 1;
  if found then
    raise exception 'wing_submission_already_reserved';
  end if;

  v_path := 'originals/' || v_user_id::text || '/'
    || v_submission_id::text || '/source';
  insert into public.wing_submission_upload_intents (
    submission_id,
    user_id,
    rating_id,
    destination_id,
    media_type,
    expected_mime_type,
    expected_size_bytes,
    expected_storage_path,
    consent_version,
    consented_at,
    attribution_preference,
    user_caption,
    expires_at,
    idempotency_key,
    request_fingerprint,
    correlation_id
  ) values (
    v_submission_id,
    v_user_id,
    p_rating_id,
    v_rating.destination_id,
    p_media_type,
    p_expected_mime_type,
    p_expected_size_bytes,
    v_path,
    p_consent_version,
    now(),
    p_attribution_preference,
    nullif(trim(p_user_caption), ''),
    now() + interval '15 minutes',
    p_idempotency_key,
    v_fingerprint,
    p_correlation_id
  );

  v_result := jsonb_build_object(
    'submission_id', v_submission_id,
    'bucket', 'wing-submissions',
    'upload_path', v_path,
    'expires_at', now() + interval '15 minutes'
  );
  insert into public.wing_submission_mutation_receipts (
    user_id,
    submission_id,
    mutation_kind,
    idempotency_key,
    request_fingerprint,
    result,
    correlation_id
  ) values (
    v_user_id,
    v_submission_id,
    'reserve_upload',
    p_idempotency_key,
    v_fingerprint,
    v_result,
    p_correlation_id
  );
  return v_result;
end;
$$;

revoke all on function public.reserve_wing_submission_upload(
  uuid, text, text, bigint, text, text, text, text, uuid
) from public, anon;
grant execute on function public.reserve_wing_submission_upload(
  uuid, text, text, bigint, text, text, text, text, uuid
) to authenticated, service_role;

commit;

-- Rollback notes:
-- Restore the original reserve RPC only after proving no rating has multiple
-- historical intent rows. Do not restore the global unique(rating_id)
-- constraint without first removing or archiving expired audit rows. The
-- partial active-intent index is safe to retain during a forward repair.
