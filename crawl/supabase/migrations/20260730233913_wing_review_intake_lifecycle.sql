-- Decouple human review state from private media preparation.
--
-- The upload is already synchronously validated before reservation/finalization,
-- and finalization authoritatively confirms that the private Storage object
-- exists. It can therefore enter the human review queue immediately. The
-- processing job remains mandatory before social publishing so video audio
-- removal, normalization, thumbnails, duplicate checks, and moderation signals
-- are still fail-closed.

begin;

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
  if p_idempotency_key is null
     or char_length(p_idempotency_key) not between 8 and 200 then
    raise exception 'invalid_idempotency_key';
  end if;
  if p_correlation_id is null then
    raise exception 'correlation_id_required';
  end if;
  if p_actor_type not in (
    'user', 'reviewer', 'worker', 'scheduler', 'publisher', 'system'
  ) then
    raise exception 'invalid_actor_type';
  end if;
  if p_trigger_source is null
     or char_length(p_trigger_source) not between 2 and 100 then
    raise exception 'invalid_trigger_source';
  end if;
  if p_metadata is null or jsonb_typeof(p_metadata) <> 'object' then
    raise exception 'invalid_metadata';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('wing-transition:' || p_idempotency_key, 0)
  );
  v_fingerprint := md5(concat_ws(
    '|',
    p_submission_id::text,
    p_to_status,
    coalesce(p_expected_from_status, ''),
    p_actor_type,
    coalesce(p_actor_id::text, ''),
    p_trigger_source,
    p_metadata::text
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
    when 'uploaded' then p_to_status in ('processing', 'in_review', 'withdrawn')
    when 'processing' then p_to_status in ('in_review', 'failed', 'withdrawn')
    when 'failed' then p_to_status in (
      'processing', 'generation_pending', 'ready_to_post', 'withdrawn'
    )
    when 'in_review' then p_to_status in (
      'approved', 'rejected', 'processing', 'failed', 'withdrawn'
    )
    when 'approved' then p_to_status in (
      'generation_pending', 'failed', 'withdrawn'
    )
    when 'generation_pending' then p_to_status in (
      'ready_to_post', 'failed', 'withdrawn'
    )
    when 'ready_to_post' then p_to_status in (
      'scheduled', 'posting', 'withdrawn'
    )
    when 'scheduled' then p_to_status in (
      'posting', 'ready_to_post', 'withdrawn'
    )
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
         withdrawn_at = case
           when p_to_status = 'withdrawn' then now()
           else withdrawn_at
         end,
         rejected_at = case
           when p_to_status = 'rejected' then now()
           else rejected_at
         end,
         rejection_reason = case
           when p_to_status = 'rejected'
             then nullif(trim(p_metadata->>'rejection_reason'), '')
           else rejection_reason
         end,
         approved_at = case
           when p_to_status = 'approved' then now()
           else approved_at
         end,
         approved_by = case
           when p_to_status = 'approved' then p_actor_id
           else approved_by
         end,
         featured_at = case
           when p_to_status = 'posted' then now()
           else featured_at
         end,
         updated_at = now(),
         correlation_id = p_correlation_id
   where id = p_submission_id;

  insert into public.wing_submission_state_transitions (
    submission_id,
    from_status,
    to_status,
    actor_type,
    actor_id,
    trigger_source,
    idempotency_key,
    request_fingerprint,
    correlation_id,
    metadata
  ) values (
    p_submission_id,
    v_submission.status,
    p_to_status,
    p_actor_type,
    p_actor_id,
    p_trigger_source,
    p_idempotency_key,
    v_fingerprint,
    p_correlation_id,
    p_metadata
  )
  returning id into v_transition_id;

  return v_transition_id;
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

  if not found
     or v_intent.status <> 'reserved'
     or v_intent.expires_at <= now() then
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
    id,
    user_id,
    rating_id,
    destination_id,
    submission_source,
    media_type,
    original_storage_path,
    consent_version,
    consented_at,
    attribution_preference,
    user_caption,
    status,
    correlation_id
  ) values (
    v_intent.submission_id,
    v_intent.user_id,
    v_intent.rating_id,
    v_intent.destination_id,
    v_intent.submission_source,
    v_intent.media_type,
    v_intent.expected_storage_path,
    v_intent.consent_version,
    v_intent.consented_at,
    v_intent.attribution_preference,
    v_intent.user_caption,
    'in_review',
    p_correlation_id
  );

  update public.wing_submission_upload_intents
     set status = 'finalized',
         finalized_at = now(),
         updated_at = now()
   where id = v_intent.id;

  insert into public.wing_submission_state_transitions (
    submission_id,
    from_status,
    to_status,
    actor_type,
    actor_id,
    trigger_source,
    idempotency_key,
    request_fingerprint,
    correlation_id,
    metadata
  ) values (
    v_intent.submission_id,
    null,
    'in_review',
    'user',
    v_user_id,
    'upload_finalized_for_review',
    'initial:' || md5(p_idempotency_key),
    md5('initial|in_review|' || v_intent.submission_id::text),
    p_correlation_id,
    jsonb_build_object(
      'storage_verified', true,
      'processing_required_before_publish', true
    )
  );

  v_result := jsonb_build_object(
    'submission_id', v_intent.submission_id,
    'status', 'in_review',
    'display_status', 'In Review'
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
    v_intent.submission_id,
    'finalize_upload',
    p_idempotency_key,
    v_fingerprint,
    v_result,
    p_correlation_id
  );

  return v_result;
end;
$$;

create or replace function public.enqueue_wing_processing_backlog(
  p_limit integer default 100
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_inserted integer;
begin
  if p_limit not between 1 and 500 then
    raise exception 'invalid_backfill_limit';
  end if;

  with candidates as (
    select
      submission.id,
      submission.media_type,
      submission.correlation_id
    from public.wing_media_submissions submission
    where submission.status in (
        'uploaded', 'processing', 'in_review', 'approved'
      )
      and submission.processed_storage_path is null
      and not exists (
        select 1
        from public.wing_processing_jobs job
        where job.submission_id = submission.id
          and job.job_kind = submission.media_type || '_process'
          and job.status in ('pending', 'claimed', 'retry', 'succeeded')
      )
    order by submission.created_at, submission.id
    for update skip locked
    limit p_limit
  )
  insert into public.wing_processing_jobs (
    submission_id,
    job_kind,
    generation,
    status,
    idempotency_key,
    correlation_id
  )
  select
    candidate.id,
    candidate.media_type || '_process',
    coalesce((
      select max(previous.generation) + 1
      from public.wing_processing_jobs previous
      where previous.submission_id = candidate.id
        and previous.job_kind = candidate.media_type || '_process'
    ), 1),
    'pending',
    'process-review:' || candidate.id::text || ':' || md5(now()::text),
    candidate.correlation_id
  from candidates candidate;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

create or replace function public.begin_wing_processing_job(
  p_job_id uuid,
  p_claim_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, storage
as $$
declare
  v_job public.wing_processing_jobs%rowtype;
  v_submission public.wing_media_submissions%rowtype;
begin
  select *
    into v_job
    from public.wing_processing_jobs
   where id = p_job_id
   for update;

  if not found
     or v_job.status <> 'claimed'
     or v_job.claim_token <> p_claim_token
     or v_job.lease_expires_at <= now() then
    raise exception 'invalid_or_expired_job_claim';
  end if;
  if v_job.job_kind not in ('photo_process', 'video_process') then
    raise exception 'unsupported_processing_job_kind';
  end if;

  select *
    into v_submission
    from public.wing_media_submissions
   where id = v_job.submission_id
   for update;

  if not found
     or v_submission.status not in (
       'uploaded', 'processing', 'in_review', 'approved'
     ) then
    raise exception 'submission_not_processable';
  end if;
  if v_job.job_kind <> (v_submission.media_type || '_process') then
    raise exception 'processing_job_media_mismatch';
  end if;
  if not exists (
    select 1
      from storage.objects object
     where object.bucket_id = 'wing-submissions'
       and object.name = v_submission.original_storage_path
  ) then
    raise exception 'original_media_not_found';
  end if;

  -- Legacy uploaded rows still use the old processing transition. New review
  -- rows keep their review state while the private derivative is prepared.
  if v_submission.status = 'uploaded' then
    perform public.wing_transition_submission(
      v_submission.id,
      'processing',
      'uploaded',
      'worker',
      null,
      'media_processing_started',
      'worker-begin:' || v_job.id::text,
      v_job.correlation_id,
      jsonb_build_object(
        'job_id', v_job.id,
        'generation', v_job.generation
      )
    );
  end if;

  return jsonb_build_object(
    'submission_id', v_submission.id,
    'media_type', v_submission.media_type,
    'bucket', 'wing-submissions',
    'original_path', v_submission.original_storage_path,
    'processed_path', 'processed/' || v_submission.id::text || '/primary',
    'thumbnail_path', 'thumbnails/' || v_submission.id::text || '/preview',
    'correlation_id', v_job.correlation_id
  );
end;
$$;

create or replace function public.settle_wing_processing_job(
  p_job_id uuid,
  p_claim_token uuid,
  p_succeeded boolean,
  p_retryable boolean,
  p_processed_path text default null,
  p_thumbnail_path text default null,
  p_perceptual_hash text default null,
  p_error_code text default null,
  p_error_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, storage
as $$
declare
  v_job public.wing_processing_jobs%rowtype;
  v_submission public.wing_media_submissions%rowtype;
  v_expected_processed text;
  v_expected_thumbnail text;
  v_job_status text;
  v_failure_from_status text;
  v_submission_status text;
begin
  select *
    into v_job
    from public.wing_processing_jobs
   where id = p_job_id
   for update;

  if not found
     or v_job.status <> 'claimed'
     or v_job.claim_token <> p_claim_token
     or v_job.lease_expires_at <= now() then
    raise exception 'invalid_or_expired_job_claim';
  end if;

  select *
    into v_submission
    from public.wing_media_submissions
   where id = v_job.submission_id
   for update;

  if not found then
    raise exception 'wing_submission_not_found';
  end if;

  -- A reviewer or owner can reject/withdraw while a worker holds a lease.
  -- End that job cleanly; never resurrect terminal content from a late result.
  if v_submission.status in ('rejected', 'withdrawn', 'posted') then
    update public.wing_processing_jobs
       set status = 'cancelled',
           completed_at = now(),
           claimed_at = null,
           lease_expires_at = null,
           claim_token = null,
           claimed_by = null,
           updated_at = now()
     where id = v_job.id;
    return jsonb_build_object(
      'job_id', v_job.id,
      'submission_id', v_submission.id,
      'job_status', 'cancelled',
      'submission_status', v_submission.status
    );
  end if;

  v_expected_processed :=
    'processed/' || v_submission.id::text || '/primary';
  v_expected_thumbnail :=
    'thumbnails/' || v_submission.id::text || '/preview';

  if p_succeeded then
    if v_submission.status not in ('processing', 'in_review', 'approved') then
      raise exception 'submission_not_processable';
    end if;
    if p_processed_path is distinct from v_expected_processed
       or p_thumbnail_path is distinct from v_expected_thumbnail then
      raise exception 'processed_media_path_mismatch';
    end if;
    if not exists (
      select 1
        from storage.objects object
       where object.bucket_id = 'wing-submissions'
         and object.name = v_expected_processed
    ) or not exists (
      select 1
        from storage.objects object
       where object.bucket_id = 'wing-submissions'
         and object.name = v_expected_thumbnail
    ) then
      raise exception 'processed_media_not_found';
    end if;
    if p_perceptual_hash is not null
       and char_length(p_perceptual_hash) not between 16 and 256 then
      raise exception 'invalid_perceptual_hash';
    end if;

    update public.wing_media_submissions
       set processed_storage_path = v_expected_processed,
           thumbnail_storage_path = v_expected_thumbnail,
           perceptual_hash = p_perceptual_hash,
           original_retain_until = coalesce(
             original_retain_until,
             now() + interval '30 days'
           ),
           updated_at = now()
     where id = v_submission.id;

    if v_submission.status = 'processing' then
      perform public.wing_transition_submission(
        v_submission.id,
        'in_review',
        'processing',
        'worker',
        null,
        'media_processing_completed',
        'worker-complete:' || v_job.id::text,
        v_job.correlation_id,
        jsonb_build_object(
          'job_id', v_job.id,
          'generation', v_job.generation
        )
      );
      v_submission_status := 'in_review';
    else
      v_submission_status := v_submission.status;
    end if;
  end if;

  v_job_status := public.finish_wing_processing_job(
    p_job_id,
    p_claim_token,
    p_succeeded,
    p_retryable,
    case when p_succeeded then null else left(p_error_code, 100) end,
    case when p_succeeded then null else left(p_error_reason, 1000) end
  );

  if not p_succeeded
     and v_job_status = 'dead'
     and v_submission.status in (
       'uploaded', 'processing', 'in_review', 'approved'
     ) then
    if v_submission.status = 'uploaded' then
      perform public.wing_transition_submission(
        v_submission.id,
        'processing',
        'uploaded',
        'worker',
        null,
        'media_processing_failed_validation',
        'worker-failure-begin:' || v_job.id::text,
        v_job.correlation_id,
        jsonb_build_object(
          'job_id', v_job.id,
          'error_code', coalesce(
            left(p_error_code, 100),
            'PROCESSING_FAILED'
          )
        )
      );
      v_failure_from_status := 'processing';
    else
      v_failure_from_status := v_submission.status;
    end if;

    perform public.wing_transition_submission(
      v_submission.id,
      'failed',
      v_failure_from_status,
      'worker',
      null,
      'media_processing_dead_lettered',
      'worker-dead:' || v_job.id::text,
      v_job.correlation_id,
      jsonb_build_object(
        'job_id', v_job.id,
        'error_code', coalesce(
          left(p_error_code, 100),
          'PROCESSING_FAILED'
        ),
        'review_decision_reversed',
          v_failure_from_status = 'approved'
      )
    );
    v_submission_status := 'failed';
  elsif not p_succeeded then
    v_submission_status := v_submission.status;
  end if;

  return jsonb_build_object(
    'job_id', v_job.id,
    'submission_id', v_submission.id,
    'job_status', v_job_status,
    'submission_status', v_submission_status
  );
end;
$$;

create or replace function public.record_wing_ai_moderation(
  p_submission_id uuid,
  p_result jsonb,
  p_idempotency_key text,
  p_correlation_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_config public.wing_moderation_config%rowtype;
  v_existing public.wing_moderation_decisions%rowtype;
  v_decision_id uuid;
  v_wing numeric;
  v_spam numeric;
  v_duplicate numeric;
  v_quality numeric;
  v_recommendation text;
  v_required text[] := array[
    'contains_food','contains_chicken_wings','wing_confidence',
    'nudity_or_sexual_content','graphic_content','weapons','hate_symbols',
    'illegal_activity','intoxication_concern','minors_visible',
    'personal_information_visible','faces_visible','alcohol_dominant',
    'offensive_text','spam_probability','duplicate_probability','quality_score',
    'explanation','model','version','evaluated_at'
  ];
begin
  if p_result is null
     or jsonb_typeof(p_result) <> 'object'
     or not (p_result ?& v_required) then
    raise exception 'invalid_moderation_contract';
  end if;
  if p_idempotency_key is null
     or char_length(p_idempotency_key) not between 8 and 200
     or p_correlation_id is null then
    raise exception 'moderation_identity_required';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('wing-moderation:' || p_idempotency_key, 0)
  );
  select *
    into v_existing
    from public.wing_moderation_decisions
   where idempotency_key = p_idempotency_key;
  if found then
    return v_existing.id;
  end if;

  v_wing := (p_result->>'wing_confidence')::numeric;
  v_spam := (p_result->>'spam_probability')::numeric;
  v_duplicate := (p_result->>'duplicate_probability')::numeric;
  v_quality := (p_result->>'quality_score')::numeric;
  if v_wing not between 0 and 1
     or v_spam not between 0 and 1
     or v_duplicate not between 0 and 1
     or v_quality not between 0 and 100 then
    raise exception 'moderation_score_out_of_range';
  end if;
  if coalesce(p_result->>'model', '') = ''
     or coalesce(p_result->>'version', '') = '' then
    raise exception 'moderation_model_version_required';
  end if;

  select *
    into v_config
    from public.wing_moderation_config
   where singleton;

  v_recommendation := case
    when (p_result->>'nudity_or_sexual_content')::boolean
      or (p_result->>'graphic_content')::boolean
      or (p_result->>'hate_symbols')::boolean
      or (p_result->>'personal_information_visible')::boolean
      or v_wing <= v_config.clear_reject_wing_confidence then 'reject'
    when v_wing < v_config.minimum_wing_confidence
      or v_spam >= v_config.maximum_spam_probability
      or v_duplicate >= v_config.maximum_duplicate_probability
      or (p_result->>'minors_visible')::boolean then 'manual_review'
    else 'accept'
  end;

  insert into public.wing_moderation_decisions (
    submission_id,
    decision_source,
    recommendation,
    contains_food,
    contains_chicken_wings,
    wing_confidence,
    nudity_or_sexual_content,
    graphic_content,
    weapons,
    hate_symbols,
    illegal_activity,
    intoxication_concern,
    minors_visible,
    personal_information_visible,
    faces_visible,
    alcohol_dominant,
    offensive_text,
    spam_probability,
    duplicate_probability,
    quality_score,
    explanation,
    model_name,
    model_version,
    raw_result,
    idempotency_key,
    correlation_id,
    evaluated_at
  ) values (
    p_submission_id,
    'ai',
    v_recommendation,
    (p_result->>'contains_food')::boolean,
    (p_result->>'contains_chicken_wings')::boolean,
    v_wing,
    (p_result->>'nudity_or_sexual_content')::boolean,
    (p_result->>'graphic_content')::boolean,
    (p_result->>'weapons')::boolean,
    (p_result->>'hate_symbols')::boolean,
    (p_result->>'illegal_activity')::boolean,
    (p_result->>'intoxication_concern')::boolean,
    (p_result->>'minors_visible')::boolean,
    (p_result->>'personal_information_visible')::boolean,
    (p_result->>'faces_visible')::boolean,
    (p_result->>'alcohol_dominant')::boolean,
    (p_result->>'offensive_text')::boolean,
    v_spam,
    v_duplicate,
    v_quality,
    left(p_result->>'explanation', 2000),
    p_result->>'model',
    p_result->>'version',
    p_result,
    p_idempotency_key,
    p_correlation_id,
    (p_result->>'evaluated_at')::timestamptz
  )
  returning id into v_decision_id;

  update public.wing_media_submissions
     set moderation_status = case
           when status = 'approved'
             and moderation_status = 'overridden'
             and v_recommendation = 'manual_review'
             then 'overridden'
           when v_recommendation = 'accept' then 'likely_acceptable'
           when v_recommendation = 'reject' then 'clear_rejection'
           else 'manual_review'
         end,
         wing_verification_status = case
           when status = 'approved'
             and wing_verification_status = 'overridden'
             and v_recommendation = 'manual_review'
             then 'overridden'
           when v_wing >= v_config.minimum_wing_confidence
             then 'likely_wings'
           when v_wing <= v_config.clear_reject_wing_confidence
             then 'not_wings'
           else 'uncertain'
         end,
         wing_confidence = v_wing,
         quality_score = v_quality,
         updated_at = now()
   where id = p_submission_id;

  return v_decision_id;
end;
$$;

create or replace function public.mango_list_wing_submissions()
returns setof jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'submission_id', submission.id,
    'status', submission.status,
    'moderation_status', submission.moderation_status,
    'wing_verification_status', submission.wing_verification_status,
    'media_type', submission.media_type,
    'original_storage_path', submission.original_storage_path,
    'processed_storage_path', submission.processed_storage_path,
    'thumbnail_storage_path', submission.thumbnail_storage_path,
    'created_at', submission.created_at,
    'approved_at', submission.approved_at,
    'rejected_at', submission.rejected_at,
    'featured_at', submission.featured_at,
    'reviewed_at', submission.reviewed_at,
    'reviewed_by', submission.reviewed_by,
    'rejection_reason', submission.rejection_reason,
    'reviewer_notes', submission.reviewer_notes,
    'is_publish_priority', submission.is_publish_priority,
    'priority_set_at', submission.priority_set_at,
    'caption', submission.user_caption,
    'attribution_preference', submission.attribution_preference,
    'contributor', jsonb_build_object(
      'user_id', submission.user_id,
      'username', app_user.username,
      'display_name', app_user.display_name
    ),
    'restaurant', jsonb_build_object(
      'id', destination.id,
      'name', destination.name,
      'city', destination.city,
      'state_id', destination.state_id,
      'state_code', state.state_code
    ),
    'rating_id', submission.rating_id,
    'rating', jsonb_build_object(
      'overall', rating.overall,
      'crispiness', rating.crispiness,
      'sauce', rating.sauce,
      'meat', rating.meat,
      'spice_level', rating.spice_level,
      'would_order_again', rating.would_order_again,
      'weighted_score', rating.weight_score
    ),
    'ai_moderation', (
      select jsonb_build_object(
        'recommendation', moderation.recommendation,
        'explanation', left(moderation.explanation, 600),
        'evaluated_at', moderation.evaluated_at
      )
      from public.wing_moderation_decisions moderation
      where moderation.submission_id = submission.id
        and moderation.decision_source = 'ai'
      order by moderation.evaluated_at desc, moderation.id desc
      limit 1
    ),
    'processing', coalesce((
      select jsonb_agg(jsonb_build_object(
        'kind', job.job_kind,
        'status', job.status,
        'attempt_count', job.attempt_count,
        'last_error_code', job.last_error_code,
        'last_error_reason', left(job.last_error_reason, 500),
        'updated_at', job.updated_at
      ) order by job.updated_at desc)
      from public.wing_processing_jobs job
      where job.submission_id = submission.id
    ), '[]'::jsonb),
    'original_object_exists', exists (
      select 1
      from storage.objects object
      where object.bucket_id = 'wing-submissions'
        and object.name = submission.original_storage_path
    ),
    'processed_object_exists', exists (
      select 1
      from storage.objects object
      where object.bucket_id = 'wing-submissions'
        and object.name = submission.processed_storage_path
    ),
    'thumbnail_object_exists', exists (
      select 1
      from storage.objects object
      where object.bucket_id = 'wing-submissions'
        and object.name = submission.thumbnail_storage_path
    ),
    'processing_succeeded', exists (
      select 1
      from public.wing_processing_jobs job
      where job.submission_id = submission.id
        and job.job_kind in ('photo_process', 'video_process')
        and job.status = 'succeeded'
    ),
    'publishing', coalesce((
      select jsonb_agg(jsonb_build_object(
        'platform', publication.platform,
        'status', publication.status,
        'external_post_id', publication.external_post_id,
        'external_permalink', publication.external_permalink,
        'posted_at', publication.posted_at,
        'failure_reason', left(publication.failure_reason, 500)
      ) order by publication.platform)
      from public.social_content_jobs publication
      where publication.submission_id = submission.id
    ), '[]'::jsonb),
    'review_state', case
      when submission.status in ('uploaded', 'processing', 'in_review')
        then 'In Review'
      when submission.status = 'approved'
        and submission.processed_storage_path is not null
        and submission.thumbnail_storage_path is not null
        and exists (
          select 1
          from storage.objects object
          where object.bucket_id = 'wing-submissions'
            and object.name = submission.processed_storage_path
        )
        and exists (
          select 1
          from storage.objects object
          where object.bucket_id = 'wing-submissions'
            and object.name = submission.thumbnail_storage_path
        )
        and exists (
          select 1
          from public.wing_processing_jobs job
          where job.submission_id = submission.id
            and job.job_kind in ('photo_process', 'video_process')
            and job.status = 'succeeded'
        )
        then 'Approved / Ready to Publish'
      when submission.status = 'approved'
        then 'Approved / Preparing Media'
      when submission.status = 'generation_pending'
        then 'Generation Pending'
      when submission.status in ('ready_to_post', 'scheduled')
        then 'Ready to Publish'
      when submission.status = 'posting'
        then 'Posting'
      when submission.status = 'posted'
        or submission.featured_at is not null
        then 'Posted'
      when submission.status = 'failed'
        then 'Media Preparation Failed'
      else initcap(replace(submission.status, '_', ' '))
    end
  )
  from public.wing_media_submissions submission
  left join public.destination_ratings rating
    on rating.id = submission.rating_id
  join public.destinations destination
    on destination.id = submission.destination_id
  left join public.states state
    on state.state_id = destination.state_id
  left join public.users app_user
    on app_user.user_id = submission.user_id
  order by submission.created_at desc, submission.id;
$$;

create or replace function public.mango_review_wing_submission(
  p_submission_id uuid,
  p_action text,
  p_reason_category text,
  p_reviewer_note text,
  p_reviewer_id uuid,
  p_idempotency_key text,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_submission public.wing_media_submissions%rowtype;
  v_transition uuid;
  v_note text;
  v_rejection_reason text;
begin
  if not exists (
    select 1
    from public.app_user_roles role
    where role.user_id = p_reviewer_id
      and role.role in ('wing_reviewer', 'wing_admin')
      and role.active
      and role.revoked_at is null
  ) then
    raise exception 'wing_reviewer_role_required' using errcode = '42501';
  end if;
  if p_action not in ('approve', 'reject')
     or p_submission_id is null
     or char_length(coalesce(p_idempotency_key, '')) not between 8 and 200
     or p_correlation_id is null then
    raise exception 'invalid_review_request';
  end if;
  if p_reason_category not in (
    'standard_acceptable',
    'documented_override',
    'poor_media_quality',
    'inappropriate_content',
    'not_related_to_rating',
    'duplicate_submission',
    'copyright_or_ownership',
    'restaurant_or_attribution',
    'other'
  ) then
    raise exception 'review_reason_required';
  end if;
  if (
    p_action = 'approve'
    and p_reason_category not in (
      'standard_acceptable', 'documented_override'
    )
  ) or (
    p_action = 'reject'
    and p_reason_category not in (
      'poor_media_quality',
      'inappropriate_content',
      'not_related_to_rating',
      'duplicate_submission',
      'copyright_or_ownership',
      'restaurant_or_attribution',
      'other'
    )
  ) then
    raise exception 'invalid_review_reason_for_action';
  end if;

  v_note := nullif(left(trim(coalesce(p_reviewer_note, '')), 2000), '');
  if v_note is null or char_length(v_note) < 8 then
    raise exception 'review_notes_required';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('mango-review:' || p_submission_id::text, 0)
  );

  select *
    into v_submission
    from public.wing_media_submissions
   where id = p_submission_id
   for update;

  if not found then
    raise exception 'wing_submission_not_found';
  end if;
  if v_submission.status <> 'in_review' then
    raise exception 'review_submission_not_ready';
  end if;
  if not exists (
    select 1
    from storage.objects object
    where object.bucket_id = 'wing-submissions'
      and object.name = v_submission.original_storage_path
  ) then
    raise exception 'original_media_required_for_review';
  end if;
  if p_action = 'approve'
     and (
       v_submission.moderation_status in ('clear_rejection', 'failed')
       or v_submission.wing_verification_status in ('not_wings', 'failed')
     ) then
    raise exception 'unsafe_or_failed_media_cannot_be_approved';
  end if;

  v_rejection_reason := case p_reason_category
    when 'inappropriate_content' then 'unsafe_content'
    when 'not_related_to_rating' then 'not_wings'
    when 'duplicate_submission' then 'duplicate'
    else 'other_policy'
  end;

  v_transition := public.wing_transition_submission(
    p_submission_id,
    case when p_action = 'approve' then 'approved' else 'rejected' end,
    'in_review',
    'reviewer',
    p_reviewer_id,
    'mango_habanero_review',
    'mango:' || p_idempotency_key,
    p_correlation_id,
    jsonb_build_object(
      'reason_category', p_reason_category,
      'notes', v_note,
      'rejection_reason', case
        when p_action = 'reject' then v_rejection_reason
        else null
      end,
      'processing_required_before_publish', not exists (
        select 1
        from public.wing_processing_jobs job
        where job.submission_id = v_submission.id
          and job.job_kind in ('photo_process', 'video_process')
          and job.status = 'succeeded'
      )
    )
  );

  update public.wing_media_submissions
     set reviewed_at = now(),
         reviewed_by = p_reviewer_id,
         reviewer_notes = v_note,
         moderation_status = case
           when p_action = 'approve'
             and moderation_status in ('pending', 'manual_review')
             then 'overridden'
           else moderation_status
         end,
         wing_verification_status = case
           when p_action = 'approve'
             and wing_verification_status in ('pending', 'uncertain')
             then 'overridden'
           else wing_verification_status
         end,
         updated_at = now()
   where id = p_submission_id;

  if p_action = 'reject' then
    update public.wing_processing_jobs
       set status = 'cancelled',
           completed_at = now(),
           claimed_at = null,
           lease_expires_at = null,
           claim_token = null,
           claimed_by = null,
           updated_at = now()
     where submission_id = p_submission_id
       and status in ('pending', 'retry');
  end if;

  insert into public.wing_moderation_decisions (
    submission_id,
    decision_source,
    recommendation,
    explanation,
    reviewer_id,
    override_reason,
    raw_result,
    idempotency_key,
    correlation_id
  ) values (
    p_submission_id,
    'human',
    case when p_action = 'approve' then 'accept' else 'reject' end,
    v_note,
    p_reviewer_id,
    case
      when p_action = 'approve'
        and (
          v_submission.moderation_status in ('pending', 'manual_review')
          or v_submission.wing_verification_status in ('pending', 'uncertain')
        )
        then p_reason_category
      else null
    end,
    '{}'::jsonb,
    'human-review:' || p_idempotency_key,
    p_correlation_id
  )
  on conflict (idempotency_key) do nothing;

  insert into public.wing_admin_actions (
    submission_id,
    actor_id,
    action,
    reason_category,
    notes,
    before_state,
    after_state,
    idempotency_key,
    request_fingerprint,
    correlation_id
  ) values (
    p_submission_id,
    p_reviewer_id,
    p_action,
    p_reason_category,
    v_note,
    jsonb_build_object('status', 'in_review'),
    jsonb_build_object(
      'status',
      case when p_action = 'approve' then 'approved' else 'rejected' end
    ),
    'mango:' || p_idempotency_key,
    md5(concat_ws(
      '|',
      p_submission_id,
      p_action,
      p_reason_category,
      v_note
    )),
    p_correlation_id
  )
  on conflict (idempotency_key) do nothing;

  return jsonb_build_object(
    'submission_id', p_submission_id,
    'status', case
      when p_action = 'approve' then 'approved'
      else 'rejected'
    end,
    'transition_id', v_transition,
    'processing_pending', p_action = 'approve' and not exists (
      select 1
      from public.wing_processing_jobs job
      where job.submission_id = p_submission_id
        and job.job_kind in ('photo_process', 'video_process')
        and job.status = 'succeeded'
    ),
    'correlation_id', p_correlation_id
  );
end;
$$;

create or replace function public.wing_creator_reward_on_transition()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.to_status = 'approved' then
    perform public.wing_award_creator_reward_internal(
      new.submission_id,
      'approval',
      new.id,
      'wing-creator-approval:' || new.submission_id::text
    );
  elsif new.to_status = 'posted' then
    perform public.wing_award_creator_reward_internal(
      new.submission_id,
      'featured',
      new.id,
      'wing-creator-featured:' || new.submission_id::text
    );
  elsif new.to_status = 'withdrawn' then
    perform public.wing_reverse_creator_rewards_internal(
      new.submission_id,
      'Submission withdrawn before publication',
      'wing-auto-withdraw:' || new.id::text,
      new.id
    );
  elsif new.to_status = 'failed' and new.from_status = 'approved' then
    perform public.wing_reverse_creator_rewards_internal(
      new.submission_id,
      'Approved Wing Shot failed mandatory media preparation',
      'wing-auto-processing-failure:' || new.id::text,
      new.id
    );
  end if;
  return new;
end;
$$;

-- Repair only non-terminal legacy intake rows whose private original still
-- exists. Failed, rejected, withdrawn, approved, and posted rows are untouched.
do $$
declare
  v_submission record;
  v_key text;
begin
  for v_submission in
    select submission.id,
           submission.status,
           submission.correlation_id
    from public.wing_media_submissions submission
    where submission.status in ('uploaded', 'processing')
      and exists (
        select 1
        from storage.objects object
        where object.bucket_id = 'wing-submissions'
          and object.name = submission.original_storage_path
      )
    order by submission.created_at, submission.id
    for update
  loop
    v_key := 'review-intake-repair:' || v_submission.id::text;
    update public.wing_media_submissions
       set status = 'in_review',
           updated_at = now()
     where id = v_submission.id
       and status = v_submission.status;

    insert into public.wing_submission_state_transitions (
      submission_id,
      from_status,
      to_status,
      actor_type,
      trigger_source,
      idempotency_key,
      request_fingerprint,
      correlation_id,
      metadata
    ) values (
      v_submission.id,
      v_submission.status,
      'in_review',
      'system',
      'review_intake_lifecycle_repair',
      v_key,
      md5(v_key),
      v_submission.correlation_id,
      jsonb_build_object(
        'storage_verified', true,
        'processing_continues_separately', true
      )
    )
    on conflict (idempotency_key) do nothing;
  end loop;
end;
$$;

revoke all on function public.wing_transition_submission(
  uuid, text, text, text, uuid, text, text, uuid, jsonb
) from public, anon, authenticated;
grant execute on function public.wing_transition_submission(
  uuid, text, text, text, uuid, text, text, uuid, jsonb
) to service_role;

revoke all on function public.finalize_wing_submission_upload(
  uuid, text, uuid
) from public, anon;
grant execute on function public.finalize_wing_submission_upload(
  uuid, text, uuid
) to authenticated, service_role;

revoke all on function public.enqueue_wing_processing_backlog(integer)
  from public, anon, authenticated;
revoke all on function public.begin_wing_processing_job(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.settle_wing_processing_job(
  uuid, uuid, boolean, boolean, text, text, text, text, text
) from public, anon, authenticated;
revoke all on function public.record_wing_ai_moderation(
  uuid, jsonb, text, uuid
) from public, anon, authenticated;
revoke all on function public.mango_list_wing_submissions()
  from public, anon, authenticated;
revoke all on function public.mango_review_wing_submission(
  uuid, text, text, text, uuid, text, uuid
) from public, anon, authenticated;

grant execute on function public.enqueue_wing_processing_backlog(integer)
  to service_role;
grant execute on function public.begin_wing_processing_job(uuid, uuid)
  to service_role;
grant execute on function public.settle_wing_processing_job(
  uuid, uuid, boolean, boolean, text, text, text, text, text
) to service_role;
grant execute on function public.record_wing_ai_moderation(
  uuid, jsonb, text, uuid
) to service_role;
grant execute on function public.mango_list_wing_submissions()
  to service_role;
grant execute on function public.mango_review_wing_submission(
  uuid, text, text, text, uuid, text, uuid
) to service_role;

commit;
