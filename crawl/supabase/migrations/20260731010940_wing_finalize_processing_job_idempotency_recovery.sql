-- Make processing-job creation a single, idempotent database contract.
-- Submission insertion triggers this helper; finalization and recovery may
-- reuse it defensively, but generation one can never be duplicated.

begin;

create or replace function public.ensure_wing_processing_job(
  p_submission_id uuid,
  p_media_type text,
  p_correlation_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_job_id uuid;
  v_job_kind text;
begin
  if p_submission_id is null
     or p_media_type not in ('photo', 'video')
     or p_correlation_id is null then
    raise exception 'processing_job_identity_required';
  end if;

  v_job_kind := p_media_type || '_process';
  insert into public.wing_processing_jobs (
    submission_id, job_kind, generation, status, idempotency_key,
    correlation_id
  ) values (
    p_submission_id, v_job_kind, 1, 'pending',
    'process:' || p_submission_id::text || ':1', p_correlation_id
  ) on conflict (submission_id, job_kind, generation) do nothing;

  select id into v_job_id
    from public.wing_processing_jobs
   where submission_id = p_submission_id
     and job_kind = v_job_kind
     and generation = 1;
  if v_job_id is null then
    raise exception 'processing_job_unavailable';
  end if;
  return v_job_id;
end;
$$;

create or replace function public.enqueue_wing_processing_job()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.wing_media_submissions
     set original_retain_until = now() + make_interval(days => (
       select config.original_retention_days
         from public.wing_moderation_config config
        where config.singleton
     )),
         updated_at = now()
   where id = new.id
     and original_retain_until is null;

  perform public.ensure_wing_processing_job(
    new.id, new.media_type, new.correlation_id
  );
  return new;
end;
$$;

drop trigger if exists enqueue_wing_processing_after_submission
  on public.wing_media_submissions;
create trigger enqueue_wing_processing_after_submission
after insert on public.wing_media_submissions
for each row execute function public.enqueue_wing_processing_job();

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
  v_job_id uuid;
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

  -- The authenticated reservation owns the submission and the immutable path.
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

  select * into v_submission
    from public.wing_media_submissions
   where id = v_intent.submission_id
   for update;
  if found then
    if v_submission.user_id is distinct from v_user_id
       or v_submission.status in ('withdrawn', 'rejected') then
      raise exception 'upload_intent_unavailable';
    end if;
    v_job_id := public.ensure_wing_processing_job(
      v_submission.id, v_submission.media_type, v_submission.correlation_id
    );
    v_result := jsonb_build_object(
      'submission_id', v_submission.id,
      'status', case when v_submission.status = 'in_review'
        then 'in_review' else v_submission.status end,
      'review_status', 'pending_review',
      'display_status', 'In Review',
      'processing_job_id', v_job_id
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

  -- The AFTER INSERT trigger is authoritative for new jobs; this returns the
  -- existing row and is safe if a recovery path already created it.
  v_job_id := public.ensure_wing_processing_job(
    v_intent.submission_id, v_intent.media_type, p_correlation_id
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
    p_correlation_id,
    jsonb_build_object(
      'storage_verified', true,
      'processing_continues_separately', true,
      'processing_job_id', v_job_id
    )
  ) on conflict (idempotency_key) do nothing;

  v_result := jsonb_build_object(
    'submission_id', v_intent.submission_id,
    'status', 'in_review',
    'review_status', 'pending_review',
    'display_status', 'In Review',
    'processing_job_id', v_job_id
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

-- Repair service-only stranded approved rows without ever creating a second
-- generation-one job.
create or replace function public.repair_stranded_wing_submission(
  p_submission_id uuid,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, storage
as $$
declare
  v_submission public.wing_media_submissions%rowtype;
  v_job_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
  select * into v_submission from public.wing_media_submissions
   where id = p_submission_id for update;
  if not found or v_submission.status <> 'approved'
     or v_submission.processed_storage_path is not null
     or v_submission.featured_at is not null then
    raise exception 'submission_not_stranded';
  end if;
  if not exists (select 1 from storage.objects object
    where object.bucket_id = 'wing-submissions'
      and object.name = v_submission.original_storage_path) then
    raise exception 'original_media_missing';
  end if;
  update public.wing_media_submissions
     set status = 'processing', approved_at = null, approved_by = null,
         is_publish_priority = false, priority_set_at = null,
         priority_set_by = null, updated_at = now()
   where id = v_submission.id;
  v_job_id := public.ensure_wing_processing_job(
    v_submission.id, v_submission.media_type, p_correlation_id
  );
  return jsonb_build_object(
    'submission_id', v_submission.id,
    'status', 'processing',
    'processing_job_id', v_job_id,
    'correlation_id', p_correlation_id
  );
end;
$$;

-- Keep the service-only backlog safe under concurrent callers.
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
    select submission.id, submission.media_type, submission.correlation_id
      from public.wing_media_submissions submission
     where submission.status in ('uploaded', 'processing', 'in_review', 'approved')
       and submission.processed_storage_path is null
       and not exists (
         select 1 from public.wing_processing_jobs job
          where job.submission_id = submission.id
            and job.job_kind = submission.media_type || '_process'
            and job.status in ('pending', 'claimed', 'retry', 'succeeded')
       )
     order by submission.created_at, submission.id
     for update skip locked
     limit p_limit
  )
  insert into public.wing_processing_jobs (
    submission_id, job_kind, generation, status, idempotency_key, correlation_id
  )
  select candidate.id, candidate.media_type || '_process', 1, 'pending',
         'process-review:' || candidate.id::text || ':' || md5(now()::text),
         candidate.correlation_id
    from candidates candidate
  on conflict (submission_id, job_kind, generation) do nothing;
  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

-- Recover only reserved intents whose exact private promoted object exists.
-- Rows with only a job but no object remain untouched and fail closed.
do $$
declare
  v_intent record;
  v_job_id uuid;
  v_key text;
begin
  for v_intent in
    select intent.*
      from public.wing_submission_upload_intents intent
     where intent.status = 'reserved'
       and exists (
         select 1 from storage.objects object
          where object.bucket_id = 'wing-submissions'
            and object.name = intent.expected_storage_path
       )
     for update
  loop
    insert into public.wing_media_submissions (
      id, user_id, rating_id, destination_id, submission_source, media_type,
      original_storage_path, consent_version, consented_at,
      attribution_preference, user_caption, status, correlation_id
    ) values (
      v_intent.submission_id, v_intent.user_id, v_intent.rating_id,
      v_intent.destination_id, v_intent.submission_source, v_intent.media_type,
      v_intent.expected_storage_path, v_intent.consent_version,
      v_intent.consented_at, v_intent.attribution_preference,
      v_intent.user_caption, 'in_review', v_intent.correlation_id
    ) on conflict (id) do nothing;

    v_job_id := public.ensure_wing_processing_job(
      v_intent.submission_id, v_intent.media_type, v_intent.correlation_id
    );
    update public.wing_submission_upload_intents
       set status = 'finalized', finalized_at = coalesce(finalized_at, now()),
           updated_at = now()
     where id = v_intent.id and status = 'reserved';

    v_key := 'recovery-finalize:' || v_intent.submission_id::text;
    insert into public.wing_submission_state_transitions (
      submission_id, from_status, to_status, actor_type, trigger_source,
      idempotency_key, request_fingerprint, correlation_id, metadata
    ) values (
      v_intent.submission_id, null, 'in_review', 'system',
      'reserved_upload_recovery', v_key, md5(v_key), v_intent.correlation_id,
      jsonb_build_object('processing_job_id', v_job_id, 'storage_verified', true)
    ) on conflict (idempotency_key) do nothing;
  end loop;
end;
$$;

revoke all on function public.ensure_wing_processing_job(uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.ensure_wing_processing_job(uuid, text, uuid)
  to service_role;

commit;
