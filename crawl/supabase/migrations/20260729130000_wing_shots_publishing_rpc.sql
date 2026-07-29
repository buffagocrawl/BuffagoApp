-- Wing Shots platform-independent publication leasing and settlement.
-- Selection/generation are owned by 20260729124000. This migration starts only
-- from completed, protected publication assets in social_content_jobs.

begin;

create or replace function public.approve_wing_social_job(
  p_job_id uuid,
  p_live_publish boolean,
  p_scheduled_for timestamptz,
  p_notes text,
  p_idempotency_key text,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_job public.social_content_jobs%rowtype;
  v_existing_action public.wing_admin_actions%rowtype;
  v_flag_enabled boolean := false;
  v_request_fingerprint text;
begin
  if v_actor is null or not (
    public.wing_has_app_role('wing_admin')
    or public.wing_has_app_role('wing_publisher')
  ) then
    raise exception 'wing_publisher_role_required' using errcode = '42501';
  end if;
  if p_live_publish is null
     or p_idempotency_key is null
     or char_length(p_idempotency_key) not between 8 and 160
     or p_correlation_id is null
     or nullif(trim(coalesce(p_notes, '')), '') is null then
    raise exception 'publishing_approval_identity_required';
  end if;
  perform pg_advisory_xact_lock(
    hashtextextended('wing-publish-approval:' || p_idempotency_key, 0)
  );
  v_request_fingerprint := md5(
    concat_ws('|', p_job_id, p_live_publish, p_scheduled_for, p_notes)
  );
  select * into v_existing_action
  from public.wing_admin_actions
  where idempotency_key = 'publish-approval:' || p_idempotency_key;
  if found then
    if v_existing_action.social_job_id is distinct from p_job_id
       or v_existing_action.request_fingerprint <> v_request_fingerprint then
      raise exception 'publishing_approval_idempotency_conflict';
    end if;
    select * into v_job
    from public.social_content_jobs
    where id = v_existing_action.social_job_id;
    return jsonb_build_object(
      'job_id', v_job.id, 'status', v_job.status, 'dry_run', v_job.dry_run
    );
  end if;

  select * into v_job
  from public.social_content_jobs
  where id = p_job_id
  for update;
  if not found or v_job.status not in (
    'ready', 'scheduled', 'retry', 'dry_run_succeeded'
  ) then
    raise exception 'social_job_not_approvable';
  end if;
  if p_live_publish then
    select coalesce(enabled, false) into v_flag_enabled
    from public.engagement_feature_flags
    where flag_key = case v_job.platform
      when 'instagram' then 'wing_shot_instagram_publishing'
      else 'wing_shot_facebook_publishing'
    end;
    if not coalesce(v_flag_enabled, false) then
      raise exception 'wing_platform_publish_flag_disabled';
    end if;
  end if;

  update public.social_content_jobs
  set dry_run = not p_live_publish,
      human_approved_at = case when p_live_publish then now() else human_approved_at end,
      human_approved_by = case when p_live_publish then v_actor else human_approved_by end,
      scheduled_for = p_scheduled_for,
      status = case when p_scheduled_for is null then 'ready' else 'scheduled' end,
      updated_at = now(),
      correlation_id = p_correlation_id
  where id = p_job_id
  returning * into v_job;

  insert into public.wing_admin_actions(
    submission_id, social_job_id, actor_id, action, reason_category, notes,
    before_state, after_state, idempotency_key, request_fingerprint,
    correlation_id
  ) values (
    v_job.submission_id, v_job.id, v_actor, 'approve_generated_post',
    case when p_live_publish then 'live_publish_approved' else 'dry_run_approved' end,
    left(trim(p_notes), 2000),
    jsonb_build_object('dry_run', not p_live_publish),
    jsonb_build_object(
      'dry_run', v_job.dry_run, 'status', v_job.status,
      'scheduled_for', v_job.scheduled_for
    ),
    'publish-approval:' || p_idempotency_key,
    v_request_fingerprint,
    p_correlation_id
  );
  return jsonb_build_object(
    'job_id', v_job.id, 'status', v_job.status, 'dry_run', v_job.dry_run,
    'scheduled_for', v_job.scheduled_for
  );
end;
$$;

create or replace function public.recover_stale_wing_social_jobs(
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_recovered_count integer := 0;
  v_exhausted_count integer := 0;
  v_exhausted record;
begin
  if p_correlation_id is null then
    raise exception 'publisher_recovery_identity_required';
  end if;
  with recovered as (
    update public.social_content_jobs
    set status = case when attempt_count >= max_attempts then 'failed' else 'retry' end,
        scheduled_for = case
          when attempt_count >= max_attempts then scheduled_for
          else now() + least(
            interval '30 minutes',
            interval '30 seconds' * (2 ^ greatest(attempt_count - 1, 0))
          )
        end,
        failure_code = 'STALE_LEASE',
        failure_reason = 'Expired publisher lease recovered',
        claimed_at = null, lease_expires_at = null, claim_token = null,
        claimed_by = null, updated_at = now(),
        correlation_id = p_correlation_id
    where status in ('claimed', 'posting')
      and lease_expires_at <= now()
    returning submission_id
  )
  select count(*) into v_recovered_count from recovered;

  for v_exhausted in
    select submission.id, generation.nightly_receipt_id
    from public.wing_media_submissions submission
    join public.wing_generation_jobs generation
      on generation.submission_id = submission.id
    where submission.status = 'posting'
      and (
        select count(*)
        from public.social_content_jobs job
        where job.submission_id = submission.id
      ) = 2
      and not exists (
        select 1
        from public.social_content_jobs job
        where job.submission_id = submission.id
          and job.status not in ('failed', 'cancelled')
      )
    for update of submission
  loop
    perform public.wing_transition_submission(
      v_exhausted.id, 'failed', 'posting', 'publisher', null,
      'all_platform_publication_failed',
      'publish-failed:' || v_exhausted.id::text,
      p_correlation_id,
      jsonb_build_object('failure_code', 'NO_PLATFORM_PUBLISHED')
    );
    update public.wing_nightly_run_receipts
    set status = 'failed', completed_at = now(),
        failure_code = 'NO_PLATFORM_PUBLISHED',
        failure_reason = 'All independent platform jobs exhausted retries'
    where id = v_exhausted.nightly_receipt_id;
    v_exhausted_count := v_exhausted_count + 1;
  end loop;
  return jsonb_build_object(
    'recovered_count', v_recovered_count,
    'exhausted_submission_count', v_exhausted_count
  );
end;
$$;

create or replace function public.claim_wing_social_job(
  p_platform text,
  p_worker text,
  p_lease_seconds integer default 600
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_job public.social_content_jobs%rowtype;
  v_submission public.wing_media_submissions%rowtype;
  v_token uuid := gen_random_uuid();
begin
  if p_platform not in ('instagram', 'facebook')
     or char_length(coalesce(p_worker, '')) not between 3 and 120
     or p_lease_seconds not between 60 and 1200 then
    raise exception 'invalid_social_job_claim';
  end if;

  perform public.recover_stale_wing_social_jobs(gen_random_uuid());

  select * into v_job
  from public.social_content_jobs
  where platform = p_platform
    and status in ('ready', 'scheduled', 'retry')
    and coalesce(scheduled_for, now()) <= now()
    and attempt_count < max_attempts
    and (
      dry_run
      or (human_approved_at is not null and human_approved_by is not null)
    )
  order by coalesce(scheduled_for, created_at), created_at, id
  for update skip locked
  limit 1;
  if not found then return null; end if;

  select * into v_submission
  from public.wing_media_submissions
  where id = v_job.submission_id
  for update;
  if not found
     or v_submission.status not in ('ready_to_post', 'scheduled', 'posting', 'posted')
     or v_submission.withdrawn_at is not null
     or v_submission.processed_storage_path is null then
    raise exception 'social_job_submission_ineligible';
  end if;

  update public.social_content_jobs
  set status = 'claimed', claimed_at = now(),
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      claim_token = v_token, claimed_by = p_worker,
      attempt_count = attempt_count + 1, updated_at = now()
  where id = v_job.id
  returning * into v_job;

  if not v_job.dry_run and v_submission.status in ('ready_to_post', 'scheduled') then
    perform public.wing_transition_submission(
      v_submission.id, 'posting', v_submission.status, 'publisher', null,
      'platform_publish_claim',
      'publish-claim:' || v_job.id::text || ':' || v_job.attempt_count::text,
      v_job.correlation_id,
      jsonb_build_object('platform', v_job.platform, 'social_job_id', v_job.id)
    );
  end if;

  return jsonb_build_object(
    'job_id', v_job.id, 'submission_id', v_job.submission_id,
    'platform', v_job.platform, 'media_type',
      case when v_job.post_type = 'photo' then 'photo' else 'video' end,
    'generated_media_path', v_job.generated_media_path,
    'generated_caption', v_job.generated_caption,
    'generated_alt_text', v_job.generated_alt_text,
    'idempotency_key', v_job.idempotency_key,
    'dry_run', v_job.dry_run, 'external_post_id', v_job.external_post_id,
    'external_permalink', v_job.external_permalink,
    'attempt_count', v_job.attempt_count, 'claim_token', v_token,
    'container_id', (
      select attempt.response_metadata->>'container_id'
      from public.social_publication_attempts attempt
      where attempt.social_job_id = v_job.id
        and nullif(attempt.response_metadata->>'container_id', '') is not null
      order by attempt.attempt_number desc
      limit 1
    ),
    'lease_expires_at', v_job.lease_expires_at
  );
end;
$$;

create or replace function public.finish_wing_social_job(
  p_job_id uuid,
  p_claim_token uuid,
  p_result jsonb,
  p_idempotency_key text,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_job public.social_content_jobs%rowtype;
  v_submission public.wing_media_submissions%rowtype;
  v_existing public.social_publication_attempts%rowtype;
  v_status text;
  v_attempt_outcome text;
  v_featured_now boolean := false;
  v_transition_id uuid;
  v_external_id text;
  v_external_permalink text;
  v_failure_code text;
  v_failure_reason text;
  v_receipt_id uuid;
  v_posted_count integer;
  v_terminal_count integer;
  v_dry_run_count integer;
begin
  if p_result is null or jsonb_typeof(p_result) <> 'object'
     or p_idempotency_key is null
     or char_length(p_idempotency_key) not between 8 and 200
     or p_correlation_id is null then
    raise exception 'publish_result_identity_required';
  end if;
  if p_result ?| array[
    'access_token', 'authorization', 'ingestion_url', 'signed_url',
    'service_role_key'
  ] then
    raise exception 'sensitive_publish_result_rejected';
  end if;
  perform pg_advisory_xact_lock(
    hashtextextended('wing-publish-result:' || p_idempotency_key, 0)
  );
  select * into v_existing
  from public.social_publication_attempts
  where idempotency_key = p_idempotency_key;
  if found then
    if v_existing.social_job_id is distinct from p_job_id
       or v_existing.claim_token is distinct from p_claim_token then
      raise exception 'publish_result_idempotency_conflict';
    end if;
    select * into v_job from public.social_content_jobs where id = p_job_id;
    return jsonb_build_object(
      'job_id', v_job.id, 'status', v_job.status,
      'featured_now', false, 'duplicate', true
    );
  end if;

  select * into v_job
  from public.social_content_jobs
  where id = p_job_id
  for update;
  if not found or v_job.status <> 'claimed'
     or v_job.claim_token <> p_claim_token
     or v_job.lease_expires_at <= now() then
    raise exception 'invalid_or_expired_social_job_claim';
  end if;
  select * into v_submission
  from public.wing_media_submissions
  where id = v_job.submission_id
  for update;

  v_status := p_result->>'status';
  if v_status not in (
    'posted', 'dry_run_succeeded', 'retryable_failure', 'rate_limited',
    'configuration_error', 'permanent_failure'
  ) then
    raise exception 'invalid_publish_result_status';
  end if;
  v_external_id := nullif(trim(p_result->>'external_post_id'), '');
  v_external_permalink := nullif(trim(p_result->>'external_permalink'), '');
  v_failure_code := nullif(trim(p_result->>'failure_code'), '');
  v_failure_reason := left(nullif(trim(p_result->>'failure_reason'), ''), 1000);

  if v_status = 'posted' then
    if v_job.dry_run or v_job.human_approved_at is null
       or v_external_id is null then
      raise exception 'real_publish_result_invalid';
    end if;
    v_attempt_outcome := 'succeeded';
    update public.social_content_jobs
    set status = 'posted', external_post_id = v_external_id,
        external_permalink = v_external_permalink, posted_at = now(),
        failure_code = null, failure_reason = null,
        claimed_at = null, lease_expires_at = null, claim_token = null,
        claimed_by = null, updated_at = now(), correlation_id = p_correlation_id
    where id = v_job.id;
    if v_submission.status <> 'posted' then
      if v_submission.status <> 'posting' then
        raise exception 'submission_not_in_posting_state';
      end if;
      v_transition_id := public.wing_transition_submission(
        v_submission.id, 'posted', 'posting', 'publisher', null,
        'platform_publish_succeeded',
        'featured:' || v_submission.id::text,
        p_correlation_id,
        jsonb_build_object(
          'platform', v_job.platform, 'social_job_id', v_job.id,
          'external_post_id', v_external_id
        )
      );
      v_featured_now := true;
    end if;
  elsif v_status = 'dry_run_succeeded' then
    if not v_job.dry_run then raise exception 'live_job_cannot_dry_run'; end if;
    v_attempt_outcome := 'dry_run_succeeded';
    update public.social_content_jobs
    set status = 'dry_run_succeeded', claimed_at = null,
        lease_expires_at = null, claim_token = null, claimed_by = null,
        failure_code = null, failure_reason = null, updated_at = now(),
        correlation_id = p_correlation_id
    where id = v_job.id;
  elsif v_status in ('retryable_failure', 'rate_limited') then
    v_attempt_outcome := case
      when v_status = 'rate_limited' then 'rate_limited'
      else 'retryable_failure'
    end;
    update public.social_content_jobs
    set status = case when attempt_count < max_attempts then 'retry' else 'failed' end,
        scheduled_for = case when attempt_count < max_attempts
          then now() + least(
            interval '30 minutes',
            interval '30 seconds' * (2 ^ greatest(attempt_count - 1, 0))
          ) else scheduled_for end,
        failure_code = coalesce(v_failure_code, upper(v_status)),
        failure_reason = coalesce(v_failure_reason, 'Retryable Meta failure'),
        claimed_at = null, lease_expires_at = null, claim_token = null,
        claimed_by = null, updated_at = now(), correlation_id = p_correlation_id
    where id = v_job.id;
  else
    v_attempt_outcome := case
      when v_status = 'configuration_error' then 'configuration_error'
      else 'permanent_failure'
    end;
    update public.social_content_jobs
    set status = 'failed',
        failure_code = coalesce(v_failure_code, 'PERMANENT_FAILURE'),
        failure_reason = coalesce(v_failure_reason, 'Permanent Meta failure'),
        claimed_at = null, lease_expires_at = null, claim_token = null,
        claimed_by = null, updated_at = now(), correlation_id = p_correlation_id
    where id = v_job.id;
  end if;

  insert into public.social_publication_attempts(
    social_job_id, attempt_number, claim_token, provider_request_id,
    outcome, external_post_id, external_permalink, http_status,
    failure_code, failure_reason, response_metadata, idempotency_key,
    correlation_id, completed_at
  ) values (
    v_job.id, v_job.attempt_count, p_claim_token,
    nullif(trim(p_result->>'provider_request_id'), ''),
    v_attempt_outcome, v_external_id, v_external_permalink,
    nullif(p_result->>'http_status', '')::integer,
    v_failure_code, v_failure_reason,
    jsonb_build_object(
      'platform', v_job.platform,
      'container_id', nullif(trim(p_result->>'container_id'), ''),
      'reconciled', coalesce((p_result->>'reconciled')::boolean, false),
      'attempts', coalesce(p_result->'attempts', '[]'::jsonb)
    ),
    p_idempotency_key, p_correlation_id, now()
  );

  select generation.nightly_receipt_id into v_receipt_id
  from public.wing_generation_jobs generation
  where generation.submission_id = v_job.submission_id;
  select
    count(*) filter (where status = 'posted'),
    count(*) filter (where status in ('posted', 'failed', 'cancelled', 'dry_run_succeeded')),
    count(*) filter (where status = 'dry_run_succeeded')
  into v_posted_count, v_terminal_count, v_dry_run_count
  from public.social_content_jobs
  where submission_id = v_job.submission_id;
  if v_terminal_count >= 2
     and v_posted_count = 0
     and v_dry_run_count = 0
     and v_submission.status = 'posting' then
    v_transition_id := public.wing_transition_submission(
      v_submission.id, 'failed', 'posting', 'publisher', null,
      'all_platform_publication_failed',
      'publish-failed:' || v_submission.id::text,
      p_correlation_id,
      jsonb_build_object('failure_code', 'NO_PLATFORM_PUBLISHED')
    );
  end if;
  if v_receipt_id is not null then
    update public.wing_nightly_run_receipts
    set status = case
          when v_posted_count >= 2 then 'completed'
          when v_posted_count >= 1 then 'partially_completed'
          when v_dry_run_count >= 2 then 'completed'
          when v_terminal_count >= 2 then 'failed'
          else status
        end,
        completed_at = case
          when v_posted_count >= 1 or v_terminal_count >= 2 then now()
          else completed_at
        end,
        failure_code = case
          when v_terminal_count >= 2 and v_posted_count = 0 and v_dry_run_count = 0
            then 'NO_PLATFORM_PUBLISHED'
          else failure_code
        end
    where id = v_receipt_id;
  end if;
  return jsonb_build_object(
    'job_id', v_job.id,
    'status', (select status from public.social_content_jobs where id = v_job.id),
    'featured_now', v_featured_now,
    'transition_id', v_transition_id,
    'reward_and_notification_settled_by_transition', v_featured_now,
    'duplicate', false
  );
end;
$$;

revoke all on function public.approve_wing_social_job(
  uuid, boolean, timestamptz, text, text, uuid
) from public, anon;
revoke all on function public.recover_stale_wing_social_jobs(uuid)
  from public, anon, authenticated;
revoke all on function public.claim_wing_social_job(text, text, integer)
  from public, anon, authenticated;
revoke all on function public.finish_wing_social_job(
  uuid, uuid, jsonb, text, uuid
) from public, anon, authenticated;

grant execute on function public.approve_wing_social_job(
  uuid, boolean, timestamptz, text, text, uuid
) to authenticated;
grant execute on function public.recover_stale_wing_social_jobs(uuid)
  to service_role;
grant execute on function public.claim_wing_social_job(text, text, integer)
  to service_role;
grant execute on function public.finish_wing_social_job(
  uuid, uuid, jsonb, text, uuid
) to service_role;

comment on function public.claim_wing_social_job(text, text, integer) is
  'Atomically recovers stale leases and claims one independently retryable platform job.';
comment on function public.recover_stale_wing_social_jobs(uuid) is
  'Expires stale publisher leases and closes submissions whose two independent platform jobs exhausted all attempts.';
comment on function public.finish_wing_social_job(uuid, uuid, jsonb, text, uuid) is
  'Records a safe publication attempt and atomically features once on the first real platform success; transition triggers settle rewards and notifications exactly once.';

commit;

-- Rollback: disable both publishing feature flags and stop publisher workers.
-- Let active leases expire, then revoke these RPCs. Preserve jobs, attempts,
-- external IDs, transitions, rewards, notifications, and run receipts.
