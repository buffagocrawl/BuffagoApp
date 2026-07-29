-- Wing Shots authorization, upload reservation, and workflow boundaries.
-- Clients receive no direct access to sensitive tables or private media paths.

begin;

create table if not exists public.wing_submission_upload_intents (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  rating_id uuid not null references public.destination_ratings(id) on delete restrict,
  destination_id uuid not null references public.destinations(id) on delete restrict,
  media_type text not null check (media_type in ('photo', 'video')),
  expected_mime_type text not null check (expected_mime_type in (
    'image/jpeg', 'image/png', 'image/webp', 'image/heic',
    'video/mp4', 'video/quicktime'
  )),
  expected_size_bytes bigint not null check (expected_size_bytes between 1 and 52428800),
  expected_storage_path text not null unique,
  consent_version text not null check (char_length(consent_version) between 1 and 40),
  consented_at timestamptz not null,
  attribution_preference text not null check (
    attribution_preference in ('username', 'display_name', 'anonymous')
  ),
  user_caption text check (user_caption is null or char_length(user_caption) <= 500),
  status text not null default 'reserved'
    check (status in ('reserved', 'finalized', 'expired', 'cancelled')),
  expires_at timestamptz not null,
  finalized_at timestamptz,
  idempotency_key text not null unique check (char_length(idempotency_key) between 8 and 200),
  request_fingerprint text not null check (char_length(request_fingerprint) = 32),
  correlation_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (rating_id),
  constraint wing_upload_intents_path_shape check (
    expected_storage_path =
      'originals/' || user_id::text || '/' || submission_id::text || '/source'
  ),
  constraint wing_upload_intents_expiry_bound check (
    expires_at > created_at and expires_at <= created_at + interval '30 minutes'
  ),
  constraint wing_upload_intents_finalize_shape check (
    (status = 'finalized' and finalized_at is not null)
    or (status <> 'finalized' and finalized_at is null)
  ),
  constraint wing_upload_intents_media_mime_shape check (
    (media_type = 'photo' and expected_mime_type like 'image/%')
    or (media_type = 'video' and expected_mime_type like 'video/%')
  )
);

create index if not exists wing_upload_intents_owner_expiry_idx
  on public.wing_submission_upload_intents (user_id, expires_at)
  where status = 'reserved';

create table if not exists public.wing_media_access_requests (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.wing_media_submissions(id) on delete cascade,
  requester_id uuid not null references auth.users(id) on delete cascade,
  variant text not null check (variant in ('processed', 'thumbnail', 'publication')),
  requested_path text not null,
  purpose text not null check (purpose in ('owner_preview', 'admin_review', 'publication')),
  status text not null default 'pending'
    check (status in ('pending', 'consumed', 'expired', 'denied')),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  correlation_id uuid not null,
  created_at timestamptz not null default now(),
  constraint wing_media_access_expiry_bound check (
    expires_at > created_at and expires_at <= created_at + interval '5 minutes'
  ),
  constraint wing_media_access_consumed_shape check (
    (status = 'consumed' and consumed_at is not null)
    or (status <> 'consumed' and consumed_at is null)
  )
);

create index if not exists wing_media_access_pending_idx
  on public.wing_media_access_requests (expires_at, created_at, id)
  where status = 'pending';

create table if not exists public.wing_submission_mutation_receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  owner_pseudonym_id uuid not null default gen_random_uuid(),
  owner_deleted_at timestamptz,
  submission_id uuid,
  mutation_kind text not null check (
    mutation_kind in ('reserve_upload', 'finalize_upload', 'withdraw', 'request_media_access')
  ),
  idempotency_key text not null unique check (char_length(idempotency_key) between 8 and 200),
  request_fingerprint text not null check (char_length(request_fingerprint) = 32),
  result jsonb not null default '{}'::jsonb check (jsonb_typeof(result) = 'object'),
  correlation_id uuid not null,
  created_at timestamptz not null default now(),
  constraint wing_mutation_receipts_owner_deletion_shape check (
    (user_id is not null and owner_deleted_at is null)
    or (user_id is null and owner_deleted_at is not null)
  )
);

create index if not exists wing_submission_mutation_receipts_owner_time_idx
  on public.wing_submission_mutation_receipts (user_id, created_at desc);

create table if not exists public.wing_account_deletion_manifests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  owner_pseudonym_id uuid not null,
  object_paths text[] not null check (array_position(object_paths, null) is null),
  status text not null default 'pending'
    check (status in ('pending', 'objects_deleted', 'failed')),
  failure_reason text,
  correlation_id uuid not null unique,
  prepared_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint wing_account_deletion_manifest_completion_shape check (
    (status = 'pending' and completed_at is null)
    or (status <> 'pending' and completed_at is not null)
  )
);

create index if not exists wing_account_deletion_manifests_pending_idx
  on public.wing_account_deletion_manifests (prepared_at, id)
  where status = 'pending';

create or replace function public.wing_apply_owner_pseudonymization()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if old.user_id is not null and new.user_id is null then
    new.owner_deleted_at := coalesce(new.owner_deleted_at, now());
  elsif old.user_id is null and new.user_id is not null then
    raise exception 'wing_owner_reidentification_forbidden';
  end if;
  return new;
end;
$$;

create trigger wing_media_submissions_owner_pseudonymization
before update of user_id on public.wing_media_submissions
for each row execute function public.wing_apply_owner_pseudonymization();

create trigger wing_mutation_receipts_owner_pseudonymization
before update of user_id on public.wing_submission_mutation_receipts
for each row execute function public.wing_apply_owner_pseudonymization();

create or replace function public.wing_has_app_role(p_role text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select auth.uid() is not null
    and p_role in ('wing_reviewer', 'wing_admin', 'wing_publisher')
    and exists (
      select 1
      from public.app_user_roles role_assignment
      where role_assignment.user_id = auth.uid()
        and role_assignment.role = p_role
        and role_assignment.active
        and role_assignment.revoked_at is null
    );
$$;

create or replace function public.wing_feature_enabled_for_user(p_flag_key text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select auth.uid() is not null
    and exists (
      select 1
        from public.engagement_feature_flags flag
       where flag.flag_key = p_flag_key
         and flag.enabled
         and (
           flag.rollout_percent = 100
           or mod(
             mod(
               hashtextextended(auth.uid()::text || ':' || flag.flag_key, 0),
               100
             ) + 100,
             100
           ) < flag.rollout_percent
         )
    );
$$;

create or replace function public.wing_can_upload_reserved_original(p_object_name text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.wing_submission_upload_intents intent
      where intent.user_id = auth.uid()
        and intent.expected_storage_path = p_object_name
        and intent.status = 'reserved'
        and intent.expires_at > now()
    );
$$;

create or replace function public.wing_transition_submission(
  p_submission_id uuid,
  p_to_status text,
  p_expected_from_status text,
  p_actor_type text,
  p_actor_id uuid,
  p_trigger_source text,
  p_idempotency_key text,
  p_correlation_id uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_submission public.wing_media_submissions%rowtype;
  v_existing public.wing_submission_state_transitions%rowtype;
  v_transition_id uuid;
  v_fingerprint text;
  v_allowed boolean := false;
begin
  if p_idempotency_key is null or char_length(p_idempotency_key) not between 8 and 200 then
    raise exception 'invalid_idempotency_key';
  end if;
  if p_correlation_id is null then
    raise exception 'correlation_id_required';
  end if;
  if p_actor_type not in ('user', 'reviewer', 'worker', 'scheduler', 'publisher', 'system') then
    raise exception 'invalid_actor_type';
  end if;
  if p_trigger_source is null or char_length(p_trigger_source) not between 2 and 100 then
    raise exception 'invalid_trigger_source';
  end if;
  if p_metadata is null or jsonb_typeof(p_metadata) <> 'object' then
    raise exception 'invalid_metadata';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('wing-transition:' || p_idempotency_key, 0));
  v_fingerprint := md5(concat_ws('|',
    p_submission_id::text, p_to_status, coalesce(p_expected_from_status, ''),
    p_actor_type, coalesce(p_actor_id::text, ''), p_trigger_source, p_metadata::text
  ));

  select *
    into v_existing
    from public.wing_submission_state_transitions
   where idempotency_key = p_idempotency_key;

  if found then
    if v_existing.request_fingerprint <> v_fingerprint then
      raise exception 'idempotency_key_conflict';
    end if;
    return v_existing.id;
  end if;

  select *
    into v_submission
    from public.wing_media_submissions
   where id = p_submission_id
   for update;

  if not found then
    raise exception 'wing_submission_not_found';
  end if;
  if p_expected_from_status is null
     or v_submission.status <> p_expected_from_status then
    raise exception 'wing_submission_state_precondition_failed';
  end if;

  v_allowed := case v_submission.status
    when 'uploaded' then p_to_status in ('processing', 'withdrawn')
    when 'processing' then p_to_status in ('in_review', 'failed', 'withdrawn')
    when 'failed' then p_to_status in (
      'processing', 'generation_pending', 'ready_to_post', 'withdrawn'
    )
    when 'in_review' then p_to_status in ('approved', 'rejected', 'processing', 'withdrawn')
    when 'approved' then p_to_status in ('generation_pending', 'withdrawn')
    when 'generation_pending' then p_to_status in ('ready_to_post', 'failed', 'withdrawn')
    when 'ready_to_post' then p_to_status in ('scheduled', 'posting', 'withdrawn')
    when 'scheduled' then p_to_status in ('posting', 'ready_to_post', 'withdrawn')
    when 'posting' then p_to_status in ('posted', 'failed')
    else false
  end;

  if not v_allowed then
    raise exception 'invalid_wing_submission_transition:%->%',
      v_submission.status, p_to_status;
  end if;
  if p_to_status = 'approved' and p_actor_id is null then
    raise exception 'approval_actor_required';
  end if;
  if p_to_status = 'rejected'
     and nullif(trim(p_metadata->>'rejection_reason'), '') is null then
    raise exception 'rejection_reason_required';
  end if;

  update public.wing_media_submissions
     set status = p_to_status,
         withdrawn_at = case when p_to_status = 'withdrawn' then now() else withdrawn_at end,
         rejected_at = case when p_to_status = 'rejected' then now() else rejected_at end,
         rejection_reason = case
           when p_to_status = 'rejected' then nullif(trim(p_metadata->>'rejection_reason'), '')
           else rejection_reason
         end,
         approved_at = case when p_to_status = 'approved' then now() else approved_at end,
         approved_by = case when p_to_status = 'approved' then p_actor_id else approved_by end,
         featured_at = case when p_to_status = 'posted' then now() else featured_at end,
         updated_at = now(),
         correlation_id = p_correlation_id
   where id = p_submission_id;

  insert into public.wing_submission_state_transitions (
    submission_id, from_status, to_status, actor_type, actor_id,
    trigger_source, idempotency_key, request_fingerprint,
    correlation_id, metadata
  ) values (
    p_submission_id, v_submission.status, p_to_status, p_actor_type, p_actor_id,
    p_trigger_source, p_idempotency_key, v_fingerprint,
    p_correlation_id, p_metadata
  )
  returning id into v_transition_id;

  return v_transition_id;
end;
$$;

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
  v_intent public.wing_submission_upload_intents%rowtype;
  v_submission_id uuid := gen_random_uuid();
  v_path text;
  v_fingerprint text;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_idempotency_key is null or char_length(p_idempotency_key) not between 8 and 200 then
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
  if p_expected_size_bytes is null or p_expected_size_bytes not between 1 and 52428800 then
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

  perform pg_advisory_xact_lock(hashtextextended('wing-mutation:' || p_idempotency_key, 0));
  v_fingerprint := md5(concat_ws('|',
    p_rating_id::text, p_media_type, p_expected_mime_type,
    p_expected_size_bytes::text, p_consent_version,
    p_attribution_preference, coalesce(p_user_caption, '')
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
    return v_existing.result;
  end if;

  select *
    into v_intent
    from public.wing_submission_upload_intents
   where rating_id = p_rating_id;
  if found then
    raise exception 'wing_submission_already_reserved';
  end if;

  v_path := 'originals/' || v_user_id::text || '/' || v_submission_id::text || '/source';
  insert into public.wing_submission_upload_intents (
    submission_id, user_id, rating_id, destination_id, media_type,
    expected_mime_type, expected_size_bytes, expected_storage_path,
    consent_version, consented_at, attribution_preference, user_caption,
    expires_at, idempotency_key, request_fingerprint, correlation_id
  ) values (
    v_submission_id, v_user_id, p_rating_id, v_rating.destination_id, p_media_type,
    p_expected_mime_type, p_expected_size_bytes, v_path,
    p_consent_version, now(), p_attribution_preference, nullif(trim(p_user_caption), ''),
    now() + interval '15 minutes', p_idempotency_key, v_fingerprint, p_correlation_id
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
  v_fingerprint text;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_idempotency_key is null or char_length(p_idempotency_key) not between 8 and 200 then
    raise exception 'invalid_idempotency_key';
  end if;
  if p_correlation_id is null then
    raise exception 'correlation_id_required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('wing-mutation:' || p_idempotency_key, 0));
  v_fingerprint := md5(concat_ws('|', p_submission_id::text, 'finalize'));
  select *
    into v_existing
    from public.wing_submission_mutation_receipts
   where idempotency_key = p_idempotency_key;
  if found then
    if v_existing.user_id is distinct from v_user_id
       or v_existing.request_fingerprint <> v_fingerprint then
      raise exception 'idempotency_key_conflict';
    end if;
    return v_existing.result;
  end if;

  select *
    into v_intent
    from public.wing_submission_upload_intents
   where submission_id = p_submission_id
     and user_id = v_user_id
   for update;
  if not found then
    raise exception 'upload_intent_not_found';
  end if;
  if v_intent.status <> 'reserved' or v_intent.expires_at <= now() then
    raise exception 'upload_intent_unavailable';
  end if;
  if not exists (
    select 1
    from storage.objects object
    where object.bucket_id = 'wing-submissions'
      and object.name = v_intent.expected_storage_path
      and object.owner_id = v_user_id::text
  ) then
    raise exception 'uploaded_object_not_found';
  end if;

  insert into public.wing_media_submissions (
    id, user_id, rating_id, destination_id, media_type, original_storage_path,
    consent_version, consented_at, attribution_preference, user_caption,
    status, correlation_id
  ) values (
    v_intent.submission_id, v_intent.user_id, v_intent.rating_id,
    v_intent.destination_id, v_intent.media_type, v_intent.expected_storage_path,
    v_intent.consent_version, v_intent.consented_at,
    v_intent.attribution_preference, v_intent.user_caption,
    'uploaded', p_correlation_id
  );

  insert into public.wing_submission_state_transitions (
    submission_id, from_status, to_status, actor_type, actor_id,
    trigger_source, idempotency_key, request_fingerprint, correlation_id
  ) values (
    v_intent.submission_id, null, 'uploaded', 'user', v_user_id,
    'upload_finalized', 'initial:' || md5(p_idempotency_key),
    md5('initial|' || v_intent.submission_id::text), p_correlation_id
  );

  update public.wing_submission_upload_intents
     set status = 'finalized', finalized_at = now(), updated_at = now()
   where id = v_intent.id;

  v_result := jsonb_build_object(
    'submission_id', v_intent.submission_id,
    'status', 'uploaded'
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

create or replace function public.withdraw_wing_submission(
  p_submission_id uuid,
  p_expected_status text,
  p_idempotency_key text,
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
  v_existing public.wing_submission_mutation_receipts%rowtype;
  v_fingerprint text;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_idempotency_key is null or char_length(p_idempotency_key) not between 8 and 200 then
    raise exception 'invalid_idempotency_key';
  end if;
  if p_correlation_id is null then
    raise exception 'correlation_id_required';
  end if;

  v_fingerprint := md5(concat_ws('|', p_submission_id::text, p_expected_status, 'withdraw'));
  perform pg_advisory_xact_lock(hashtextextended('wing-mutation:' || p_idempotency_key, 0));
  select *
    into v_existing
    from public.wing_submission_mutation_receipts
   where idempotency_key = p_idempotency_key;
  if found then
    if v_existing.user_id is distinct from v_user_id
       or v_existing.request_fingerprint <> v_fingerprint then
      raise exception 'idempotency_key_conflict';
    end if;
    return v_existing.result;
  end if;

  select *
    into v_submission
    from public.wing_media_submissions
   where id = p_submission_id
     and user_id = v_user_id;
  if not found then
    raise exception 'wing_submission_not_found' using errcode = '42501';
  end if;
  if v_submission.status in ('rejected', 'posted', 'withdrawn') then
    raise exception 'wing_submission_not_withdrawable';
  end if;

  perform public.wing_transition_submission(
    p_submission_id, 'withdrawn', p_expected_status, 'user', v_user_id,
    'owner_withdrawal', 'transition:' || p_idempotency_key,
    p_correlation_id, jsonb_build_object('retention_review_required', true)
  );

  v_result := jsonb_build_object('submission_id', p_submission_id, 'status', 'withdrawn');
  insert into public.wing_submission_mutation_receipts (
    user_id, submission_id, mutation_kind, idempotency_key,
    request_fingerprint, result, correlation_id
  ) values (
    v_user_id, p_submission_id, 'withdraw', p_idempotency_key,
    v_fingerprint, v_result, p_correlation_id
  );
  return v_result;
end;
$$;

create or replace function public.get_my_wing_submission_history(
  p_limit integer default 25,
  p_before timestamptz default null
)
returns table (
  submission_id uuid,
  rating_id uuid,
  destination_id uuid,
  media_type text,
  display_status text,
  attribution_preference text,
  user_caption text,
  rejection_category text,
  approved_at timestamptz,
  featured_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
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
    submission.media_type,
    case
      when submission.status = 'posted' then 'Featured'
      when submission.status = 'approved' then 'Approved'
      when submission.status in ('generation_pending', 'ready_to_post', 'scheduled', 'posting')
        then 'Not Selected Yet'
      when submission.status = 'in_review' then 'In Review'
      when submission.status in ('uploaded', 'processing') then 'Processing'
      when submission.status = 'rejected' then 'Rejected'
      when submission.status = 'failed' then 'Upload Failed'
      when submission.status = 'withdrawn' then 'Withdrawn'
      else 'Processing'
    end,
    submission.attribution_preference,
    submission.user_caption,
    case when submission.status = 'rejected' then submission.rejection_reason else null end,
    submission.approved_at,
    submission.featured_at,
    submission.created_at,
    submission.updated_at
  from public.wing_media_submissions submission
  where submission.user_id = auth.uid()
    and (p_before is null or submission.created_at < p_before)
  order by submission.created_at desc, submission.id
  limit greatest(1, least(coalesce(p_limit, 25), 100));
$$;

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

create or replace function public.claim_wing_media_access_request(p_request_id uuid)
returns table (
  request_id uuid,
  bucket_id text,
  object_path text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_request public.wing_media_access_requests%rowtype;
begin
  select *
    into v_request
    from public.wing_media_access_requests
   where id = p_request_id
   for update skip locked;
  if not found or v_request.status <> 'pending' or v_request.expires_at <= now() then
    return;
  end if;
  update public.wing_media_access_requests
     set status = 'consumed', consumed_at = now()
   where id = v_request.id;
  return query select v_request.id, 'wing-submissions'::text,
    v_request.requested_path, v_request.expires_at;
end;
$$;

create or replace function public.prepare_wing_account_media_cleanup(
  p_user_id uuid,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_existing public.wing_account_deletion_manifests%rowtype;
  v_manifest_id uuid;
  v_pseudonym_id uuid := gen_random_uuid();
  v_paths text[];
  v_submission record;
begin
  if p_user_id is null or p_correlation_id is null then
    raise exception 'user_and_correlation_required';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('wing-account-delete:' || p_user_id::text, 0));

  select *
    into v_existing
    from public.wing_account_deletion_manifests
   where correlation_id = p_correlation_id;
  if found then
    return jsonb_build_object(
      'manifest_id', v_existing.id,
      'object_paths', to_jsonb(v_existing.object_paths),
      'status', v_existing.status
    );
  end if;

  perform 1
    from public.wing_media_submissions submission
   where submission.user_id = p_user_id
   for update;

  select coalesce(array_agg(distinct object_path) filter (where object_path is not null), '{}'::text[])
    into v_paths
    from (
      select submission.original_storage_path as object_path
      from public.wing_media_submissions submission
      where submission.user_id = p_user_id
      union all
      select submission.processed_storage_path
      from public.wing_media_submissions submission
      where submission.user_id = p_user_id
      union all
      select submission.thumbnail_storage_path
      from public.wing_media_submissions submission
      where submission.user_id = p_user_id
      union all
      select job.generated_media_path
      from public.social_content_jobs job
      join public.wing_media_submissions submission on submission.id = job.submission_id
      where submission.user_id = p_user_id
    ) media_paths;

  insert into public.wing_account_deletion_manifests (
    user_id, owner_pseudonym_id, object_paths, correlation_id
  ) values (
    p_user_id, v_pseudonym_id, v_paths, p_correlation_id
  )
  returning id into v_manifest_id;

  for v_submission in
    select id, status
    from public.wing_media_submissions
    where user_id = p_user_id
      and status not in ('rejected', 'posted', 'withdrawn')
  loop
    insert into public.wing_submission_state_transitions (
      submission_id, from_status, to_status, actor_type, actor_id,
      trigger_source, idempotency_key, request_fingerprint,
      correlation_id, metadata
    ) values (
      v_submission.id, v_submission.status, 'withdrawn', 'system', null,
      'account_deletion',
      'account-delete:' || p_correlation_id::text || ':' || v_submission.id::text,
      md5('account-delete|' || p_correlation_id::text || '|' || v_submission.id::text),
      p_correlation_id,
      jsonb_build_object('private_asset_manifest_id', v_manifest_id)
    );
  end loop;

  update public.social_content_jobs job
     set status = 'cancelled',
         updated_at = now(),
         failure_code = 'OWNER_ACCOUNT_DELETION',
         failure_reason = 'Cancelled before publication because the owner requested account deletion'
    from public.wing_media_submissions submission
   where submission.id = job.submission_id
     and submission.user_id = p_user_id
     and job.status not in ('posted', 'dry_run_succeeded', 'cancelled');

  update public.wing_media_submissions
     set status = case
           when status in ('rejected', 'posted', 'withdrawn') then status
           else 'withdrawn'
         end,
         withdrawn_at = case
           when status in ('rejected', 'posted') then withdrawn_at
           else coalesce(withdrawn_at, now())
         end,
         owner_pseudonym_id = v_pseudonym_id,
         owner_deleted_at = now(),
         user_id = null,
         user_caption = null,
         updated_at = now(),
         correlation_id = p_correlation_id
   where user_id = p_user_id;

  update public.wing_submission_mutation_receipts
     set owner_pseudonym_id = v_pseudonym_id,
         owner_deleted_at = now(),
         user_id = null
   where user_id = p_user_id;

  update public.rating_verification_receipts
     set owner_pseudonym_id = v_pseudonym_id,
         owner_deleted_at = now(),
         user_id = null
   where user_id = p_user_id;

  update public.wing_creator_reward_events
     set owner_pseudonym_id = v_pseudonym_id,
         owner_deleted_at = now(),
         user_id = null
   where user_id = p_user_id;

  update public.wing_creator_badge_events
     set owner_pseudonym_id = v_pseudonym_id,
         owner_deleted_at = now(),
         user_id = null
   where user_id = p_user_id;

  update public.social_community_visit_intents
     set status = case when status = 'initiated' then 'cancelled' else status end,
         owner_pseudonym_id = v_pseudonym_id,
         owner_deleted_at = now(),
         user_id = null
   where user_id = p_user_id;

  update public.social_community_reward_events
     set owner_pseudonym_id = v_pseudonym_id,
         owner_deleted_at = now(),
         user_id = null
   where user_id = p_user_id;

  update public.wing_notification_receipts
     set owner_pseudonym_id = v_pseudonym_id,
         owner_deleted_at = now(),
         user_id = null
   where user_id = p_user_id;

  update public.wing_submission_upload_intents
     set status = case when status = 'reserved' then 'cancelled' else status end,
         updated_at = now()
   where user_id = p_user_id;

  return jsonb_build_object(
    'manifest_id', v_manifest_id,
    'object_paths', to_jsonb(v_paths),
    'status', 'pending'
  );
end;
$$;

create or replace function public.complete_wing_account_media_cleanup(
  p_manifest_id uuid,
  p_objects_deleted boolean,
  p_failure_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.wing_account_deletion_manifests
     set status = case when p_objects_deleted then 'objects_deleted' else 'failed' end,
         failure_reason = case when p_objects_deleted then null
           else coalesce(nullif(trim(p_failure_reason), ''), 'unspecified_cleanup_failure') end,
         completed_at = now()
   where id = p_manifest_id
     and status = 'pending';
  return found;
end;
$$;

alter table public.app_user_roles enable row level security;
alter table public.wing_media_submissions enable row level security;
alter table public.wing_submission_state_transitions enable row level security;
alter table public.wing_moderation_decisions enable row level security;
alter table public.wing_processing_jobs enable row level security;
alter table public.wing_media_fingerprints enable row level security;
alter table public.social_content_jobs enable row level security;
alter table public.social_publication_attempts enable row level security;
alter table public.wing_admin_actions enable row level security;
alter table public.wing_nightly_run_receipts enable row level security;
alter table public.wing_submission_upload_intents enable row level security;
alter table public.wing_media_access_requests enable row level security;
alter table public.wing_submission_mutation_receipts enable row level security;
alter table public.wing_account_deletion_manifests enable row level security;

revoke all on
  public.app_user_roles,
  public.wing_media_submissions,
  public.wing_submission_state_transitions,
  public.wing_moderation_decisions,
  public.wing_processing_jobs,
  public.wing_media_fingerprints,
  public.social_content_jobs,
  public.social_publication_attempts,
  public.wing_admin_actions,
  public.wing_nightly_run_receipts,
  public.wing_submission_upload_intents,
  public.wing_media_access_requests,
  public.wing_submission_mutation_receipts,
  public.wing_account_deletion_manifests
from public, anon, authenticated;

grant all on
  public.app_user_roles,
  public.wing_media_submissions,
  public.wing_submission_state_transitions,
  public.wing_moderation_decisions,
  public.wing_processing_jobs,
  public.wing_media_fingerprints,
  public.social_content_jobs,
  public.social_publication_attempts,
  public.wing_admin_actions,
  public.wing_nightly_run_receipts,
  public.wing_submission_upload_intents,
  public.wing_media_access_requests,
  public.wing_submission_mutation_receipts,
  public.wing_account_deletion_manifests
to service_role;

drop policy if exists wing_submissions_original_insert on storage.objects;
create policy wing_submissions_original_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'wing-submissions'
  and owner_id = auth.uid()::text
  and split_part(name, '/', 1) = 'originals'
  and split_part(name, '/', 2) = auth.uid()::text
  and split_part(name, '/', 3) ~ '^[0-9a-f-]{36}$'
  and split_part(name, '/', 4) = 'source'
  and split_part(name, '/', 5) = ''
  and public.wing_can_upload_reserved_original(name)
);

revoke all on function public.wing_has_app_role(text) from public, anon, authenticated;
revoke all on function public.wing_feature_enabled_for_user(text)
from public, anon, authenticated;
revoke all on function public.wing_apply_owner_pseudonymization()
from public, anon, authenticated;
revoke all on function public.wing_can_upload_reserved_original(text)
from public, anon, authenticated;
revoke all on function public.wing_transition_submission(
  uuid, text, text, text, uuid, text, text, uuid, jsonb
) from public, anon, authenticated;
revoke all on function public.reserve_wing_submission_upload(
  uuid, text, text, bigint, text, text, text, text, uuid
) from public, anon, authenticated;
revoke all on function public.finalize_wing_submission_upload(
  uuid, text, uuid
) from public, anon, authenticated;
revoke all on function public.withdraw_wing_submission(
  uuid, text, text, uuid
) from public, anon, authenticated;
revoke all on function public.get_my_wing_submission_history(
  integer, timestamptz
) from public, anon, authenticated;
revoke all on function public.request_wing_media_access(
  uuid, text, text, uuid
) from public, anon, authenticated;
revoke all on function public.claim_wing_media_access_request(uuid)
from public, anon, authenticated;
revoke all on function public.prepare_wing_account_media_cleanup(uuid, uuid)
from public, anon, authenticated;
revoke all on function public.complete_wing_account_media_cleanup(uuid, boolean, text)
from public, anon, authenticated;

grant execute on function public.wing_has_app_role(text) to authenticated;
grant execute on function public.wing_can_upload_reserved_original(text) to authenticated;
grant execute on function public.reserve_wing_submission_upload(
  uuid, text, text, bigint, text, text, text, text, uuid
) to authenticated;
grant execute on function public.finalize_wing_submission_upload(
  uuid, text, uuid
) to authenticated;
grant execute on function public.withdraw_wing_submission(
  uuid, text, text, uuid
) to authenticated;
grant execute on function public.get_my_wing_submission_history(
  integer, timestamptz
) to authenticated;
grant execute on function public.request_wing_media_access(
  uuid, text, text, uuid
) to authenticated;
grant execute on function public.wing_transition_submission(
  uuid, text, text, text, uuid, text, text, uuid, jsonb
) to service_role;
grant execute on function public.claim_wing_media_access_request(uuid)
to service_role;
grant execute on function public.prepare_wing_account_media_cleanup(uuid, uuid)
to service_role;
grant execute on function public.complete_wing_account_media_cleanup(uuid, boolean, text)
to service_role;

commit;

-- Rollback: revoke client RPC execution and remove the storage insert policy
-- first. Preserve transition and mutation receipts. Disable the Wing Shots flags
-- before forward-fixing authorization in a new migration.
