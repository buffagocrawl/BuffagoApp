-- Wing Shots processing worker contract.
-- Keeps private object paths and submission state server-authoritative while
-- leaving AI moderation advisory and human approval authoritative.

begin;

alter table public.wing_moderation_config
  add column if not exists original_retention_days integer not null default 30
    check (original_retention_days between 1 and 90);

alter table public.wing_media_submissions
  add column if not exists original_deleted_at timestamptz;

create table public.wing_media_cleanup_jobs (
  id uuid primary key default gen_random_uuid(),
  cleanup_kind text not null check (
    cleanup_kind in ('expired_original', 'abandoned_upload')
  ),
  submission_id uuid
    references public.wing_media_submissions(id) on delete restrict,
  upload_intent_id uuid
    references public.wing_submission_upload_intents(id) on delete set null,
  bucket text not null default 'wing-submissions'
    check (bucket = 'wing-submissions'),
  object_path text not null check (
    object_path ~ '^originals/[0-9a-f-]{36}/[0-9a-f-]{36}/source$'
  ),
  status text not null default 'pending' check (
    status in ('pending', 'claimed', 'retry', 'succeeded', 'dead')
  ),
  available_at timestamptz not null default now(),
  claimed_at timestamptz,
  lease_expires_at timestamptz,
  claim_token uuid,
  claimed_by text,
  attempt_count integer not null default 0 check (attempt_count between 0 and 8),
  max_attempts integer not null default 4 check (max_attempts between 1 and 8),
  last_error_code text,
  correlation_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (cleanup_kind, object_path),
  constraint wing_media_cleanup_target_shape check (
    (cleanup_kind = 'expired_original' and submission_id is not null)
    or (cleanup_kind = 'abandoned_upload' and submission_id is null
      and upload_intent_id is not null)
  ),
  constraint wing_media_cleanup_claim_shape check (
    (status = 'claimed' and claimed_at is not null
      and lease_expires_at is not null and claim_token is not null
      and claimed_by is not null)
    or status <> 'claimed'
  )
);

create index wing_media_cleanup_jobs_claim_idx
  on public.wing_media_cleanup_jobs(available_at, created_at, id)
  where status in ('pending', 'retry');

create table public.wing_media_cleanup_receipts (
  id uuid primary key default gen_random_uuid(),
  cleanup_job_id uuid not null
    references public.wing_media_cleanup_jobs(id) on delete restrict,
  attempt_number integer not null check (attempt_number between 1 and 8),
  cleanup_kind text not null check (
    cleanup_kind in ('expired_original', 'abandoned_upload')
  ),
  object_path_hash text not null check (char_length(object_path_hash) = 32),
  outcome text not null check (
    outcome in ('deleted', 'missing', 'retry', 'dead')
  ),
  error_code text,
  correlation_id uuid not null,
  occurred_at timestamptz not null default now(),
  unique (cleanup_job_id, attempt_number)
);

create or replace function public.wing_reject_cleanup_receipt_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception 'wing_cleanup_receipts_are_append_only';
end;
$$;

create trigger wing_media_cleanup_receipts_append_only
before update or delete on public.wing_media_cleanup_receipts
for each row execute function public.wing_reject_cleanup_receipt_mutation();

alter table public.wing_media_cleanup_jobs enable row level security;
alter table public.wing_media_cleanup_receipts enable row level security;
revoke all on public.wing_media_cleanup_jobs,
  public.wing_media_cleanup_receipts
from public, anon, authenticated;
grant all on public.wing_media_cleanup_jobs to service_role;
grant select, insert on public.wing_media_cleanup_receipts to service_role;

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

  insert into public.wing_processing_jobs (
    submission_id,
    job_kind,
    generation,
    status,
    idempotency_key,
    correlation_id
  ) values (
    new.id,
    new.media_type || '_process',
    1,
    'pending',
    'process:' || new.id::text || ':1',
    new.correlation_id
  )
  on conflict (submission_id, job_kind, generation) do nothing;
  return new;
end;
$$;

drop trigger if exists enqueue_wing_processing_after_submission
  on public.wing_media_submissions;
create trigger enqueue_wing_processing_after_submission
after insert on public.wing_media_submissions
for each row execute function public.enqueue_wing_processing_job();

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
    where submission.status in ('uploaded', 'processing')
      and submission.processed_storage_path is null
      and not exists (
        select 1
        from public.wing_processing_jobs job
        where job.submission_id = submission.id
          and job.job_kind = submission.media_type || '_process'
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
    1,
    'pending',
    'process:' || candidate.id::text || ':1',
    candidate.correlation_id
  from candidates candidate
  on conflict (submission_id, job_kind, generation) do nothing;

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

  if not found or v_submission.status not in ('uploaded', 'processing') then
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
      jsonb_build_object('job_id', v_job.id, 'generation', v_job.generation)
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

create or replace function public.get_wing_fingerprint_candidates(
  p_submission_id uuid,
  p_media_type text,
  p_algorithm text,
  p_algorithm_version text,
  p_limit integer default 500
)
returns table (
  submission_id uuid,
  fingerprint text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_media_type not in ('photo', 'video')
     or char_length(coalesce(p_algorithm, '')) not between 2 and 80
     or char_length(coalesce(p_algorithm_version, '')) not between 1 and 40
     or p_limit not between 1 and 500 then
    raise exception 'invalid_fingerprint_candidate_request';
  end if;

  return query
  select fingerprint_row.submission_id, fingerprint_row.fingerprint
  from public.wing_media_fingerprints fingerprint_row
  join public.wing_media_submissions submission
    on submission.id = fingerprint_row.submission_id
  where fingerprint_row.submission_id <> p_submission_id
    and fingerprint_row.media_type = p_media_type
    and fingerprint_row.algorithm = p_algorithm
    and fingerprint_row.algorithm_version = p_algorithm_version
    and submission.status not in ('withdrawn', 'rejected', 'failed')
  order by fingerprint_row.created_at desc, fingerprint_row.id desc
  limit p_limit;
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

  v_expected_processed := 'processed/' || v_submission.id::text || '/primary';
  v_expected_thumbnail := 'thumbnails/' || v_submission.id::text || '/preview';

  if p_succeeded then
    if v_submission.status <> 'processing' then
      raise exception 'submission_not_processing';
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

    perform public.wing_transition_submission(
      v_submission.id,
      'in_review',
      'processing',
      'worker',
      null,
      'media_processing_completed',
      'worker-complete:' || v_job.id::text,
      v_job.correlation_id,
      jsonb_build_object('job_id', v_job.id, 'generation', v_job.generation)
    );
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
     and v_submission.status in ('uploaded', 'processing') then
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
          'error_code', coalesce(left(p_error_code, 100), 'PROCESSING_FAILED')
        )
      );
    end if;
    perform public.wing_transition_submission(
      v_submission.id,
      'failed',
      'processing',
      'worker',
      null,
      'media_processing_dead_lettered',
      'worker-dead:' || v_job.id::text,
      v_job.correlation_id,
      jsonb_build_object(
        'job_id', v_job.id,
        'error_code', coalesce(left(p_error_code, 100), 'PROCESSING_FAILED')
      )
    );
  end if;

  return jsonb_build_object(
    'job_id', v_job.id,
    'submission_id', v_submission.id,
    'job_status', v_job_status,
    'submission_status', case
      when p_succeeded then 'in_review'
      when v_job_status = 'dead'
        and v_submission.status in ('uploaded', 'processing') then 'failed'
      else v_submission.status
    end
  );
end;
$$;

create or replace function public.enqueue_wing_media_cleanup(
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
    raise exception 'invalid_cleanup_enqueue_limit';
  end if;

  -- Progressively cover pre-migration rows without a large deployment lock.
  with missing_retention as (
    select submission.id
    from public.wing_media_submissions submission
    where submission.original_retain_until is null
      and submission.original_deleted_at is null
    order by submission.created_at, submission.id
    for update skip locked
    limit 500
  )
  update public.wing_media_submissions submission
  set original_retain_until = submission.created_at + make_interval(days => (
        select config.original_retention_days
        from public.wing_moderation_config config
        where config.singleton
      )),
      updated_at = now()
  from missing_retention
  where submission.id = missing_retention.id;

  with cleanup_candidates as (
    select
      'expired_original'::text as cleanup_kind,
      submission.id as submission_id,
      null::uuid as upload_intent_id,
      submission.original_storage_path as object_path,
      submission.correlation_id,
      submission.original_retain_until as due_at
    from public.wing_media_submissions submission
    where submission.original_retain_until <= now()
      and submission.original_deleted_at is null
      and (
        submission.processed_storage_path is not null
        or submission.status in ('failed', 'rejected', 'withdrawn')
      )
      and not exists (
        select 1
        from public.wing_media_cleanup_jobs cleanup
        where cleanup.cleanup_kind = 'expired_original'
          and cleanup.object_path = submission.original_storage_path
      )
    union all
    select
      'abandoned_upload'::text,
      null::uuid,
      intent.id,
      intent.expected_storage_path,
      intent.correlation_id,
      intent.expires_at + interval '1 hour'
    from public.wing_submission_upload_intents intent
    where intent.status = 'reserved'
      and intent.expires_at <= now() - interval '1 hour'
      and not exists (
        select 1
        from public.wing_media_cleanup_jobs cleanup
        where cleanup.cleanup_kind = 'abandoned_upload'
          and cleanup.object_path = intent.expected_storage_path
      )
    order by due_at, object_path
    limit p_limit
  )
  insert into public.wing_media_cleanup_jobs (
    cleanup_kind,
    submission_id,
    upload_intent_id,
    object_path,
    correlation_id
  )
  select
    candidate.cleanup_kind,
    candidate.submission_id,
    candidate.upload_intent_id,
    candidate.object_path,
    candidate.correlation_id
  from cleanup_candidates candidate
  on conflict (cleanup_kind, object_path) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

create or replace function public.claim_wing_media_cleanup_job(
  p_worker text,
  p_lease_seconds integer default 120
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_job public.wing_media_cleanup_jobs%rowtype;
  v_token uuid := gen_random_uuid();
begin
  if char_length(coalesce(p_worker, '')) not between 3 and 120
     or p_lease_seconds not between 30 and 300 then
    raise exception 'invalid_cleanup_worker_lease';
  end if;

  update public.wing_media_cleanup_jobs
  set status = case when attempt_count >= max_attempts then 'dead' else 'retry' end,
      available_at = case
        when attempt_count >= max_attempts then available_at
        else now() + least(
          interval '30 minutes',
          interval '30 seconds' * (2 ^ greatest(attempt_count - 1, 0))
        )
      end,
      claim_token = null,
      claimed_by = null,
      claimed_at = null,
      lease_expires_at = null,
      last_error_code = 'STALE_LEASE',
      completed_at = case
        when attempt_count >= max_attempts then now()
        else completed_at
      end,
      updated_at = now()
  where status = 'claimed'
    and lease_expires_at <= now();

  select *
  into v_job
  from public.wing_media_cleanup_jobs
  where status in ('pending', 'retry')
    and available_at <= now()
    and attempt_count < max_attempts
  order by available_at, created_at, id
  for update skip locked
  limit 1;

  if not found then
    return null;
  end if;

  update public.wing_media_cleanup_jobs
  set status = 'claimed',
      claimed_at = now(),
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      claim_token = v_token,
      claimed_by = p_worker,
      attempt_count = attempt_count + 1,
      updated_at = now()
  where id = v_job.id;

  return jsonb_build_object(
    'job_id', v_job.id,
    'cleanup_kind', v_job.cleanup_kind,
    'bucket', v_job.bucket,
    'object_path', v_job.object_path,
    'claim_token', v_token,
    'correlation_id', v_job.correlation_id
  );
end;
$$;

create or replace function public.finish_wing_media_cleanup_job(
  p_job_id uuid,
  p_claim_token uuid,
  p_object_outcome text,
  p_retryable boolean default false,
  p_error_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_job public.wing_media_cleanup_jobs%rowtype;
  v_status text;
  v_audit_outcome text;
begin
  if p_object_outcome not in ('deleted', 'missing', 'failed') then
    raise exception 'invalid_cleanup_outcome';
  end if;

  select *
  into v_job
  from public.wing_media_cleanup_jobs
  where id = p_job_id
  for update;

  if not found
     or v_job.status <> 'claimed'
     or v_job.claim_token <> p_claim_token
     or v_job.lease_expires_at <= now() then
    raise exception 'invalid_or_expired_cleanup_claim';
  end if;

  v_status := case
    when p_object_outcome in ('deleted', 'missing') then 'succeeded'
    when p_retryable and v_job.attempt_count < v_job.max_attempts then 'retry'
    else 'dead'
  end;
  v_audit_outcome := case
    when p_object_outcome in ('deleted', 'missing') then p_object_outcome
    when v_status = 'retry' then 'retry'
    else 'dead'
  end;

  update public.wing_media_cleanup_jobs
  set status = v_status,
      available_at = case
        when v_status = 'retry' then now() + least(
          interval '30 minutes',
          interval '30 seconds' * (2 ^ greatest(attempt_count - 1, 0))
        )
        else available_at
      end,
      claim_token = null,
      claimed_by = null,
      claimed_at = null,
      lease_expires_at = null,
      last_error_code = case
        when v_status = 'succeeded' then null
        else coalesce(left(p_error_code, 100), 'STORAGE_DELETE_FAILED')
      end,
      completed_at = case when v_status in ('succeeded', 'dead') then now() end,
      updated_at = now()
  where id = v_job.id;

  if v_status = 'succeeded' and v_job.cleanup_kind = 'expired_original' then
    update public.wing_media_submissions
    set original_deleted_at = coalesce(original_deleted_at, now()),
        updated_at = now()
    where id = v_job.submission_id;
  elsif v_status = 'succeeded'
        and v_job.cleanup_kind = 'abandoned_upload' then
    update public.wing_submission_upload_intents
    set status = 'expired',
        updated_at = now()
    where id = v_job.upload_intent_id
      and status = 'reserved';
  end if;

  insert into public.wing_media_cleanup_receipts (
    cleanup_job_id,
    attempt_number,
    cleanup_kind,
    object_path_hash,
    outcome,
    error_code,
    correlation_id
  ) values (
    v_job.id,
    v_job.attempt_count,
    v_job.cleanup_kind,
    md5(v_job.object_path),
    v_audit_outcome,
    case
      when v_audit_outcome in ('deleted', 'missing') then null
      else coalesce(left(p_error_code, 100), 'STORAGE_DELETE_FAILED')
    end,
    v_job.correlation_id
  )
  on conflict (cleanup_job_id, attempt_number) do nothing;

  return jsonb_build_object(
    'job_id', v_job.id,
    'status', v_status,
    'outcome', v_audit_outcome
  );
end;
$$;

-- Bounded compatibility backfill. Operators can call the same RPC repeatedly
-- until it returns zero; every insert is protected by the existing unique key.
select public.enqueue_wing_processing_backlog(100);

revoke all on function public.enqueue_wing_processing_backlog(integer),
  public.begin_wing_processing_job(uuid, uuid),
  public.get_wing_fingerprint_candidates(uuid, text, text, text, integer),
  public.settle_wing_processing_job(
    uuid, uuid, boolean, boolean, text, text, text, text, text
  ),
  public.enqueue_wing_media_cleanup(integer),
  public.claim_wing_media_cleanup_job(text, integer),
  public.finish_wing_media_cleanup_job(uuid, uuid, text, boolean, text)
from public, anon, authenticated;

grant execute on function public.enqueue_wing_processing_backlog(integer),
  public.begin_wing_processing_job(uuid, uuid),
  public.get_wing_fingerprint_candidates(uuid, text, text, text, integer),
  public.settle_wing_processing_job(
    uuid, uuid, boolean, boolean, text, text, text, text, text
  ),
  public.enqueue_wing_media_cleanup(integer),
  public.claim_wing_media_cleanup_job(text, integer),
  public.finish_wing_media_cleanup_job(uuid, uuid, text, boolean, text)
to service_role;

commit;

-- Rollback notes:
-- Drop enqueue_wing_processing_after_submission, service-only processing and
-- cleanup RPCs, and the cleanup job table. Preserve cleanup receipts,
-- moderation/admin receipts, and state transitions for audit. Do not roll back
-- while jobs are claimed; wait for leases to expire and deploy a forward repair.
