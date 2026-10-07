begin;

-- Server-owned proof that exact staged bytes were decoded successfully. The
-- client cannot write this table; promotion binds one receipt to one upload.
create table if not exists public.wing_media_validation_receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  correlation_id uuid not null,
  staging_bucket text not null check (staging_bucket = 'wing-shot-staging'),
  staging_path text not null,
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  size_bytes bigint not null check (size_bytes between 1 and 20971520),
  mime_type text not null check (mime_type in ('image/jpeg','image/png')),
  width integer not null check (width between 1 and 2048),
  height integer not null check (height between 1 and 2048),
  validated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  submission_id uuid unique references public.wing_submission_upload_intents(submission_id) on delete cascade,
  promoted_at timestamptz,
  unique(user_id, correlation_id, staging_path)
);
alter table public.wing_media_validation_receipts enable row level security;
revoke all on public.wing_media_validation_receipts from public, anon, authenticated;
grant all on public.wing_media_validation_receipts to service_role;
create index if not exists wing_media_validation_receipts_expiry_idx
  on public.wing_media_validation_receipts(expires_at) where promoted_at is null;

-- Journey uses an owner-scoped RPC rather than reading the private table.
create or replace function public.get_my_rating_wing_shots(p_rating_ids uuid[])
returns table(submission_id uuid, rating_id uuid, media_type text, status text)
language sql stable security definer
set search_path = pg_catalog, public
as $$
  select s.id, s.rating_id, s.media_type, s.status
  from public.wing_media_submissions s
  where s.user_id = auth.uid() and s.rating_id = any(p_rating_ids);
$$;
revoke all on function public.get_my_rating_wing_shots(uuid[]) from public, anon;
grant execute on function public.get_my_rating_wing_shots(uuid[]) to authenticated;

-- Approval no longer depends on generated/processed variants. Count only
-- approved photos with an existing object, preferring the thumbnail when present.
-- Storage paths are returned only to the service role, never to public clients.
create or replace function public.wing_media_is_public_status(p_status text)
returns boolean language sql immutable parallel safe
set search_path = pg_catalog
as $$ select p_status in ('approved','generation_pending','ready_to_post','scheduled','posting','posted') $$;
revoke all on function public.wing_media_is_public_status(text) from public, anon, authenticated;
grant execute on function public.wing_media_is_public_status(text) to service_role;

create or replace function public.get_wing_public_gallery(p_destination_ids uuid[], p_include_images boolean default false, p_offset integer default 0)
returns jsonb
language sql stable security definer
set search_path = pg_catalog, public, storage
as $$
  with eligible as (
    select s.id, s.destination_id, s.created_at, object.name as storage_path
    from public.wing_media_submissions s
    cross join lateral (
      select o.name from storage.objects o
      where o.bucket_id = 'wing-submissions'
        and o.name in (s.thumbnail_storage_path, s.processed_storage_path, s.original_storage_path)
      order by case o.name when s.thumbnail_storage_path then 0 when s.processed_storage_path then 1 else 2 end
      limit 1
    ) object
    where s.destination_id = any(p_destination_ids)
      and public.wing_media_is_public_status(s.status) and s.media_type = 'photo'
  ), ranked as (
    select *, row_number() over(partition by destination_id order by created_at desc, id) as position
    from eligible
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'destination_id', destination.id,
    'picture_count', (select count(*) from eligible e where e.destination_id = destination.id),
    'images', case when p_include_images then coalesce((
      select jsonb_agg(jsonb_build_object('submission_id', r.id, 'storage_path', r.storage_path) order by r.position)
      from ranked r where r.destination_id = destination.id
        and r.position > greatest(0, coalesce(p_offset, 0)) and r.position <= greatest(0, coalesce(p_offset, 0)) + 60
    ), '[]'::jsonb) else '[]'::jsonb end
  )), '[]'::jsonb)
  from (select distinct unnest(p_destination_ids) as id) destination;
$$;
revoke all on function public.get_wing_public_gallery(uuid[], boolean, integer) from public, anon, authenticated;
grant execute on function public.get_wing_public_gallery(uuid[], boolean, integer) to service_role;

create index if not exists wing_media_public_photo_destination_idx
  on public.wing_media_submissions(destination_id, created_at desc, id)
  where public.wing_media_is_public_status(status) and media_type = 'photo';



-- Reassert the service-promotion finalizer; the deployed body drifted from the recorded migration.
drop trigger if exists enqueue_wing_processing_after_submission on public.wing_media_submissions;
create or replace function public.finalize_wing_submission_upload(
  p_submission_id uuid,
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
  v_intent public.wing_submission_upload_intents%rowtype;
  v_existing public.wing_submission_mutation_receipts%rowtype;
  v_submission public.wing_media_submissions%rowtype;
  v_object storage.objects%rowtype;
  v_fingerprint text;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_submission_id is null
     or p_idempotency_key is null
     or char_length(p_idempotency_key) not between 8 and 200
     or p_correlation_id is null then
    raise exception 'invalid_finalize_request';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('wing-mutation:' || p_idempotency_key, 0)
  );
  v_fingerprint := md5(concat_ws('|', p_submission_id::text, 'finalize'));

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

  select * into v_intent
    from public.wing_submission_upload_intents
   where submission_id = p_submission_id
     and user_id = v_user_id
   for update;
  if not found
     or v_intent.submission_id is distinct from p_submission_id
     or v_intent.status not in ('reserved', 'finalized')
     or (v_intent.status = 'reserved' and v_intent.expires_at <= now()) then
    raise exception 'upload_intent_unavailable';
  end if;
  if not exists (
    select 1 from public.wing_media_validation_receipts receipt
    where receipt.submission_id = v_intent.submission_id
      and receipt.user_id = v_user_id
      and receipt.size_bytes = v_intent.expected_size_bytes
      and receipt.mime_type = v_intent.expected_mime_type
      and receipt.promoted_at is not null
      and receipt.expires_at > receipt.promoted_at
  ) then
    raise exception 'validated_promotion_required';
  end if;

  select * into v_submission
    from public.wing_media_submissions
   where id = v_intent.submission_id
   for update;
  if found then
    if v_submission.user_id is distinct from v_user_id
       or v_submission.status in ('withdrawn', 'rejected') then
      raise exception 'upload_intent_unavailable';
    end if;
    v_result := jsonb_build_object(
      'submission_id', v_submission.id,
      'status', v_submission.status,
      'review_status', case when v_submission.status = 'in_review'
        then 'pending_review' else null end,
      'display_status', case when v_submission.status = 'in_review'
        then 'In Review' else v_submission.status end,
      'processing_job_id', null
    );
    insert into public.wing_submission_mutation_receipts (
      user_id, submission_id, mutation_kind, idempotency_key,
      request_fingerprint, result, correlation_id
    ) values (
      v_user_id, v_submission.id, 'finalize_upload', p_idempotency_key,
      v_fingerprint, v_result, p_correlation_id
    ) on conflict (idempotency_key) do nothing;
    return v_result;
  end if;

  -- The object must exist at the immutable reservation location. Ownership
  -- metadata is intentionally not consulted because promotion is service-role.
  select * into v_object
    from storage.objects
   where bucket_id = 'wing-submissions'
     and name = v_intent.expected_storage_path;
  if not found then
    raise exception 'uploaded_object_not_found';
  end if;
  if coalesce(nullif(v_object.metadata->>'size', '')::bigint, -1)
       <> v_intent.expected_size_bytes
     or lower(coalesce(v_object.metadata->>'mimetype', v_object.metadata->>'contentType', ''))
       <> lower(v_intent.expected_mime_type) then
    raise exception 'uploaded_object_invalid';
  end if;

  if v_intent.rating_id is not null and not exists (
    select 1 from public.destination_ratings r where r.id = v_intent.rating_id
      and r.user_id = v_user_id and r.destination_id = v_intent.destination_id
  ) then
    raise exception 'rating_association_changed' using errcode = '42501';
  end if;

  insert into public.wing_media_submissions (
    id, user_id, rating_id, destination_id, submission_source, media_type,
    original_storage_path, consent_version, consented_at,
    attribution_preference, user_caption, status, correlation_id
  ) values (
    v_intent.submission_id, v_intent.user_id, v_intent.rating_id,
    v_intent.destination_id, v_intent.submission_source, v_intent.media_type,
    v_intent.expected_storage_path, v_intent.consent_version,
    v_intent.consented_at, v_intent.attribution_preference,
    v_intent.user_caption, 'in_review', p_correlation_id
  );

  update public.wing_submission_upload_intents
     set status = 'finalized', finalized_at = now(), updated_at = now()
   where id = v_intent.id;

  insert into public.wing_submission_state_transitions (
    submission_id, from_status, to_status, actor_type, actor_id,
    trigger_source, idempotency_key, request_fingerprint, correlation_id,
    metadata
  ) values (
    v_intent.submission_id, null, 'in_review', 'user', v_user_id,
    'upload_finalized_for_review', 'initial:' || md5(p_idempotency_key),
    md5('initial|in_review|' || v_intent.submission_id::text),
    p_correlation_id, jsonb_build_object('storage_verified', true)
  ) on conflict (idempotency_key) do nothing;

  v_result := jsonb_build_object(
    'submission_id', v_intent.submission_id,
    'status', 'in_review',
    'review_status', 'pending_review',
    'display_status', 'In Review',
    'processing_job_id', null
  );
  insert into public.wing_submission_mutation_receipts (
    user_id, submission_id, mutation_kind, idempotency_key,
    request_fingerprint, result, correlation_id
  ) values (
    v_user_id, v_intent.submission_id, 'finalize_upload', p_idempotency_key,
    v_fingerprint, v_result, p_correlation_id
  );
  return v_result;
end;
$$;
revoke all on function public.finalize_wing_submission_upload(uuid,text,uuid) from public, anon;
grant execute on function public.finalize_wing_submission_upload(uuid,text,uuid) to authenticated, service_role;

-- Resume must enforce the same ownership, image-only and consent rules as a fresh reservation.
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
  v_intent public.wing_submission_upload_intents%rowtype;
  v_config public.wing_moderation_config%rowtype;
  v_state public.wing_user_moderation_state%rowtype;
  v_completed_count integer;
  v_oldest_completed timestamptz;
  v_retry_after integer;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  if p_media_type is distinct from 'photo' or p_expected_mime_type is null
     or p_expected_mime_type not in ('image/jpeg','image/png') then
    raise exception 'unsupported_media_type';
  end if;
  if p_expected_size_bytes is null or p_expected_size_bytes not between 1 and 20971520
     or p_consent_version is null or char_length(p_consent_version) not between 1 and 40
     or p_attribution_preference is null or p_attribution_preference not in ('username','display_name','anonymous')
     or (p_user_caption is not null and char_length(p_user_caption) > 500)
     or p_idempotency_key is null or char_length(p_idempotency_key) not between 8 and 200
     or p_correlation_id is null then
    raise exception 'invalid_upload_request';
  end if;
  if p_destination_id is null or p_submission_source is null
     or p_submission_source not in ('rating','onboarding','buffacoin','profile','home_cta') then
    raise exception 'invalid_submission_source';
  end if;
  if p_rating_id is not null then
    if not exists(select 1 from public.destination_ratings r where r.id = p_rating_id and r.user_id = v_user_id) then
      raise exception 'rating_not_owned' using errcode = '42501';
    end if;
    if not exists(select 1 from public.destination_ratings r where r.id = p_rating_id and r.destination_id = p_destination_id) then
      raise exception 'destination_mismatch' using errcode = '42501';
    end if;
    if public.wing_shot_rating_eligibility_reason(p_rating_id,v_user_id,p_destination_id) <> 'eligible' then
      raise exception 'rating_not_eligible' using errcode = '42501';
    end if;
  end if;
  if not public.wing_feature_enabled_for_user('wing_shot_prompt') or not public.wing_feature_enabled_for_user('wing_shot_photo_upload') then
    raise exception 'wing_shot_photo_upload_disabled' using errcode = '42501';
  end if;
  select * into v_state from public.wing_user_moderation_state where user_id = v_user_id;
  if found and v_state.status = 'suspended' and (v_state.expires_at is null or v_state.expires_at > now()) then
    raise exception 'wing_uploads_suspended' using errcode = '42501';
  end if;

  -- Idempotent retries resume the existing reservation before quota is read.
  if p_rating_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('wing-rating-reservation:' || p_rating_id::text, 0));
    if exists (select 1 from public.wing_media_submissions where rating_id = p_rating_id) then
      raise exception 'wing_submission_already_finalized';
    end if;
    select * into v_intent from public.wing_submission_upload_intents
      where rating_id = p_rating_id and user_id = v_user_id
        and status in ('reserved', 'finalized')
      order by created_at desc limit 1 for update;
    if found then
      if v_intent.created_at + interval '30 minutes' <= now() then
        update public.wing_submission_upload_intents set status = 'expired', updated_at = now() where id = v_intent.id;
      else
      if v_intent.destination_id is distinct from p_destination_id
         or v_intent.submission_source is distinct from p_submission_source then
        raise exception 'destination_mismatch' using errcode = '42501';
      end if;
      if exists(select 1 from storage.objects o where o.bucket_id = 'wing-submissions' and o.name = v_intent.expected_storage_path)
         and (v_intent.expected_mime_type is distinct from p_expected_mime_type
           or v_intent.expected_size_bytes is distinct from p_expected_size_bytes
           or v_intent.correlation_id is distinct from p_correlation_id) then
        raise exception 'upload_reservation_media_changed';
      end if;
      update public.wing_submission_upload_intents
         set media_type = p_media_type, expected_mime_type = p_expected_mime_type,
             expected_size_bytes = p_expected_size_bytes, consent_version = p_consent_version,
             consented_at = now(), attribution_preference = p_attribution_preference,
             user_caption = nullif(trim(p_user_caption), ''), expires_at = least(now() + interval '15 minutes', created_at + interval '30 minutes'),
             updated_at = now(), correlation_id = coalesce(p_correlation_id, correlation_id)
       where id = v_intent.id;
      return jsonb_build_object('submission_id', v_intent.submission_id,
        'bucket', 'wing-submissions', 'upload_path', v_intent.expected_storage_path,
        'expires_at', least(now() + interval '15 minutes', v_intent.created_at + interval '30 minutes'), 'resumed', true,
        'existing_record_found', true, 'existing_record_id', v_intent.submission_id,
        'existing_record_status', v_intent.status);
      end if;
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('wing-user-upload-quota:' || v_user_id::text, 0));
  select * into v_config from public.wing_moderation_config where singleton;
  select * into v_state from public.wing_user_moderation_state where user_id = v_user_id;
  if found and v_state.status = 'suspended'
     and (v_state.expires_at is null or v_state.expires_at > now()) then
    raise exception 'wing_uploads_suspended' using errcode = '42501';
  end if;

  select count(*), min(created_at) into v_completed_count, v_oldest_completed
    from public.wing_media_submissions
   where user_id = v_user_id
     and status not in ('failed', 'withdrawn')
     and created_at >= now() - make_interval(secs => coalesce(v_config.rolling_upload_window_seconds, 900));
  if v_completed_count >= greatest(1, floor(coalesce(v_config.rolling_upload_limit, 5)
      * coalesce(v_state.limit_multiplier, 1)))::integer then
    v_retry_after := greatest(1, ceil(extract(epoch from
      ((v_oldest_completed + make_interval(secs => coalesce(v_config.rolling_upload_window_seconds, 900))) - now())))::integer);
    return jsonb_build_object('error_code', 'WING_SHOT_RATE_LIMITED',
      'retry_after_seconds', v_retry_after);
  end if;

  return public.reserve_wing_submission_upload_legacy(
    p_rating_id, p_media_type, p_expected_mime_type, p_expected_size_bytes,
    p_consent_version, p_attribution_preference, p_user_caption, p_idempotency_key,
    p_correlation_id, p_destination_id, p_submission_source);
end;
$$;
revoke all on function public.reserve_wing_submission_upload(uuid,text,text,bigint,text,text,text,text,uuid,uuid,text) from public, anon;
grant execute on function public.reserve_wing_submission_upload(uuid,text,text,bigint,text,text,text,text,uuid,uuid,text) to authenticated, service_role;
revoke all on function public.reserve_wing_submission_upload_legacy(uuid,text,text,bigint,text,text,text,text,uuid,uuid,text) from public, anon, authenticated;
drop trigger if exists wing_photo_only_upload_intent on public.wing_submission_upload_intents;
create trigger wing_photo_only_upload_intent before insert or update of media_type on public.wing_submission_upload_intents
for each row execute function public.reject_new_wing_video_upload_intent();

create or replace function public.request_wing_media_access(
  p_submission_id uuid,
  p_variant text,
  p_purpose text,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_submission public.wing_media_submissions%rowtype;
  v_path text;
  v_request_id uuid;
  v_is_admin boolean;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_correlation_id is null then
    raise exception 'correlation_id_required';
  end if;
  if p_variant not in ('processed', 'thumbnail', 'publication') then
    raise exception 'invalid_media_variant';
  end if;
  if p_purpose not in ('owner_preview', 'admin_review', 'publication') then
    raise exception 'invalid_media_access_purpose';
  end if;

  v_is_admin := public.wing_has_app_role('wing_reviewer')
    or public.wing_has_app_role('wing_admin')
    or public.wing_has_app_role('wing_publisher');
  select *
    into v_submission
    from public.wing_media_submissions
   where id = p_submission_id
     and (user_id = v_user_id or v_is_admin);
  if not found then
    raise exception 'wing_submission_not_found' using errcode = '42501';
  end if;
  if p_purpose <> 'owner_preview' and not v_is_admin then
    raise exception 'wing_admin_role_required' using errcode = '42501';
  end if;

  v_path := case p_variant
    when 'processed' then v_submission.processed_storage_path
    when 'thumbnail' then v_submission.thumbnail_storage_path
    else null
  end;
  -- Private owner/reviewer previews may use the original photo while variants
  -- do not exist. Publication access keeps its original contract.
  if v_path is null and v_submission.media_type = 'photo'
     and p_purpose in ('owner_preview','admin_review') and p_variant in ('thumbnail','processed') then
    v_path := v_submission.original_storage_path;
  end if;
  if p_variant = 'publication' and v_is_admin then
    select job.generated_media_path
      into v_path
      from public.social_content_jobs job
     where job.submission_id = p_submission_id
       and job.status not in ('cancelled', 'failed')
     order by job.created_at desc, job.id
     limit 1;
  end if;
  if v_path is null then
    raise exception 'media_variant_unavailable';
  end if;

  insert into public.wing_media_access_requests (
    submission_id, requester_id, variant, requested_path, purpose,
    expires_at, correlation_id
  ) values (
    p_submission_id, v_user_id, p_variant, v_path, p_purpose,
    now() + interval '5 minutes', p_correlation_id
  )
  returning id into v_request_id;

  -- Paths and signed URLs are deliberately absent from this client result.
  return jsonb_build_object(
    'request_id', v_request_id,
    'expires_at', now() + interval '5 minutes',
    'variant', p_variant
  );
end;
$$;
revoke all on function public.request_wing_media_access(uuid,text,text,uuid) from public, anon;
grant execute on function public.request_wing_media_access(uuid,text,text,uuid) to authenticated;


create or replace function public.get_my_wing_submission_detail(
  p_submission_id uuid
)
returns table (
  submission_id uuid,
  rating_id uuid,
  destination_id uuid,
  destination_name text,
  destination_city text,
  media_type text,
  internal_status text,
  display_status text,
  attribution_preference text,
  user_caption text,
  rejection_category text,
  approved_at timestamptz,
  featured_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  featured_platform text,
  external_permalink text,
  can_withdraw boolean,
  preview_available boolean
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    submission.id,
    submission.rating_id,
    submission.destination_id,
    destination.name,
    destination.city,
    submission.media_type,
    submission.status,
    case
      when submission.status = 'posted' then 'Featured'
      when submission.status = 'approved' then 'Approved'
      when submission.status in (
        'generation_pending', 'ready_to_post', 'scheduled', 'posting'
      ) then 'Not Selected Yet'
      when submission.status = 'in_review' then 'In Review'
      when submission.status in ('uploaded', 'processing') then 'Processing'
      when submission.status = 'rejected' then 'Rejected'
      when submission.status = 'failed' then 'Upload Failed'
      when submission.status = 'withdrawn' then 'Withdrawn'
      else 'Processing'
    end,
    submission.attribution_preference,
    submission.user_caption,
    case
      when submission.status = 'rejected'
        then public.wing_safe_rejection_category(submission.rejection_reason)
      else null
    end,
    submission.approved_at,
    submission.featured_at,
    submission.created_at,
    submission.updated_at,
    featured_job.platform,
    featured_job.external_permalink,
    submission.status not in ('rejected', 'posted', 'withdrawn'),
    (submission.thumbnail_storage_path is not null or (submission.media_type = 'photo' and submission.original_storage_path is not null))
  from public.wing_media_submissions submission
  join public.destinations destination
    on destination.id = submission.destination_id
  left join lateral (
    select job.platform, job.external_permalink
    from public.social_content_jobs job
    where job.submission_id = submission.id
      and job.status = 'posted'
      and not job.dry_run
      and job.external_post_id is not null
      and job.posted_at is not null
      and (
        (
          job.platform = 'instagram'
          and job.external_permalink ~* '^https://([a-z0-9-]+\.)?instagram\.com/'
        )
        or (
          job.platform = 'facebook'
          and job.external_permalink ~* '^https://([a-z0-9-]+\.)?(facebook\.com|fb\.com)/'
        )
      )
    order by
      case job.platform when 'instagram' then 0 else 1 end,
      job.posted_at,
      job.id
    limit 1
  ) featured_job on true
  where submission.id = p_submission_id
    and submission.user_id = auth.uid()
$$;
revoke all on function public.get_my_wing_submission_detail(uuid) from public, anon;
grant execute on function public.get_my_wing_submission_detail(uuid) to authenticated, service_role;

-- Claim expired intents before removing their objects. Finalization/reservation
-- take the same row lock, so an active handoff cannot race with this cleanup.
create or replace function public.get_expired_wing_original_cleanup()
returns table(submission_id uuid, storage_path text)
language plpgsql security definer
set search_path = pg_catalog, public, storage
as $$
begin
  update public.wing_submission_upload_intents i set status = 'expired', updated_at = now()
    where i.status = 'reserved' and i.expires_at < now() - interval '24 hours'
      and not exists(select 1 from public.wing_media_submissions s where s.id = i.submission_id);
  return query select i.submission_id, i.expected_storage_path
    from public.wing_submission_upload_intents i
    where i.status in ('expired','cancelled') and i.expires_at < now() - interval '24 hours'
      and not exists(select 1 from public.wing_media_submissions s where s.id = i.submission_id)
      and exists(select 1 from storage.objects o where o.bucket_id = 'wing-submissions' and o.name = i.expected_storage_path)
    order by i.expires_at, i.id limit 250;
end;
$$;
revoke all on function public.get_expired_wing_original_cleanup() from public, anon, authenticated;
grant execute on function public.get_expired_wing_original_cleanup() to service_role;

commit;
