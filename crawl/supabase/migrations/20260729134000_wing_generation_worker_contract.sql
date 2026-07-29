-- Secure branded-content generation contract for claimed community Wing Shots.
-- The worker can read only the processed asset and presentation context for
-- its active lease. It never receives the original object path or raw identity.

begin;

create or replace function public.begin_wing_generation_job(
  p_job_id uuid,
  p_claim_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, storage
as $$
declare
  v_job public.wing_generation_jobs%rowtype;
  v_submission public.wing_media_submissions%rowtype;
  v_rating public.destination_ratings%rowtype;
  v_destination public.destinations%rowtype;
  v_state_code text;
  v_username text;
  v_social_opt_out boolean := false;
  v_attribution text;
begin
  select * into v_job
  from public.wing_generation_jobs
  where id = p_job_id
  for update;
  if not found
     or v_job.status <> 'claimed'
     or v_job.claim_token <> p_claim_token
     or v_job.lease_expires_at <= now() then
    raise exception 'invalid_or_expired_generation_claim';
  end if;

  select * into v_submission
  from public.wing_media_submissions
  where id = v_job.submission_id
  for update;
  if not found
     or v_submission.status <> 'generation_pending'
     or v_submission.withdrawn_at is not null
     or v_submission.processed_storage_path is distinct from
        'processed/' || v_submission.id::text || '/primary'
     or v_submission.moderation_status not in ('likely_acceptable', 'overridden')
     or v_submission.wing_verification_status not in ('likely_wings', 'overridden')
     or v_submission.approved_at is null
     or v_submission.approved_by is null then
    raise exception 'generation_submission_ineligible';
  end if;
  if not exists (
    select 1 from storage.objects object
    where object.bucket_id = 'wing-submissions'
      and object.name = v_submission.processed_storage_path
  ) then
    raise exception 'processed_community_media_not_found';
  end if;

  select * into v_rating
  from public.destination_ratings
  where id = v_submission.rating_id
    and destination_id = v_submission.destination_id;
  select * into v_destination
  from public.destinations
  where id = v_submission.destination_id;
  if v_rating.id is null or v_destination.id is null then
    raise exception 'generation_rating_context_missing';
  end if;
  select trim(state.state_code::text) into v_state_code
  from public.states state
  where state.state_id = v_destination.state_id;
  select nullif(trim(app_user.username), ''), coalesce(app_user.social_opt_out, false)
    into v_username, v_social_opt_out
  from public.users app_user
  where app_user.user_id = v_submission.user_id;

  v_attribution := case
    when v_submission.attribution_preference = 'anonymous'
      or v_social_opt_out then 'BuffaGo community'
    when v_submission.attribution_preference = 'username'
      and v_username is not null then '@' || v_username
    when v_username is not null then v_username
    else 'BuffaGo creator'
  end;

  return jsonb_build_object(
    'job_id', v_job.id,
    'submission_id', v_submission.id,
    'claim_token', v_job.claim_token,
    'correlation_id', v_job.correlation_id,
    'bucket', 'wing-submissions',
    'media_type', v_submission.media_type,
    'processed_path', v_submission.processed_storage_path,
    'instagram_media_path', v_job.instagram_media_path,
    'facebook_media_path', v_job.facebook_media_path,
    'restaurant_name', v_destination.name,
    'city', v_destination.city,
    'state_code', v_state_code,
    'overall', v_rating.overall,
    'crispiness', v_rating.crispiness,
    'sauce', v_rating.sauce,
    'meat', v_rating.meat,
    'spice_level', v_rating.spice_level,
    'would_order_again', v_rating.would_order_again,
    'attribution', v_attribution,
    'anonymous_attribution',
      v_submission.attribution_preference = 'anonymous' or v_social_opt_out
  );
end;
$$;

create or replace function public.fail_wing_generation_job(
  p_job_id uuid,
  p_claim_token uuid,
  p_retryable boolean,
  p_error_code text,
  p_error_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_job public.wing_generation_jobs%rowtype;
  v_submission public.wing_media_submissions%rowtype;
  v_status text;
begin
  if p_retryable is null
     or nullif(trim(coalesce(p_error_code, '')), '') is null
     or char_length(p_error_code) > 100
     or nullif(trim(coalesce(p_error_reason, '')), '') is null
     or char_length(p_error_reason) > 1000 then
    raise exception 'generation_failure_details_invalid';
  end if;
  select * into v_job
  from public.wing_generation_jobs
  where id = p_job_id
  for update;
  if not found
     or v_job.status <> 'claimed'
     or v_job.claim_token <> p_claim_token
     or v_job.lease_expires_at <= now() then
    raise exception 'invalid_or_expired_generation_claim';
  end if;
  select * into v_submission
  from public.wing_media_submissions
  where id = v_job.submission_id
  for update;

  v_status := case
    when p_retryable and v_job.attempt_count < v_job.max_attempts then 'retry'
    else 'dead'
  end;
  update public.wing_generation_jobs
  set status = v_status,
      available_at = case when v_status = 'retry'
        then now() + least(
          interval '30 minutes',
          interval '30 seconds' * (2 ^ greatest(attempt_count - 1, 0))
        )
        else available_at
      end,
      failure_code = trim(p_error_code),
      failure_reason = trim(p_error_reason),
      claim_token = null,
      claimed_by = null,
      claimed_at = null,
      lease_expires_at = null,
      updated_at = now()
  where id = v_job.id;

  if v_status = 'dead' and v_submission.status = 'generation_pending' then
    perform public.wing_transition_submission(
      v_submission.id, 'failed', 'generation_pending', 'worker', null,
      'branded_generation_dead_lettered',
      'generation-dead:' || v_job.id::text,
      v_job.correlation_id,
      jsonb_build_object('error_code', trim(p_error_code))
    );
  end if;
  return jsonb_build_object(
    'job_id', v_job.id,
    'submission_id', v_job.submission_id,
    'job_status', v_status,
    'submission_status', case
      when v_status = 'dead' and v_submission.status = 'generation_pending'
        then 'failed'
      else v_submission.status
    end
  );
end;
$$;

create or replace function public.complete_wing_generation(
  p_generation_job_id uuid,
  p_claim_token uuid,
  p_instagram_post_type text,
  p_instagram_caption text,
  p_facebook_post_type text,
  p_facebook_caption text,
  p_metadata jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, storage
as $$
declare
  v_job public.wing_generation_jobs%rowtype;
  v_submission public.wing_media_submissions%rowtype;
  v_instagram_alt text;
  v_facebook_alt text;
begin
  select * into v_job
  from public.wing_generation_jobs
  where id = p_generation_job_id
  for update;
  if not found
     or v_job.status <> 'claimed'
     or v_job.claim_token <> p_claim_token
     or v_job.lease_expires_at <= now() then
    raise exception 'generation_job_unavailable';
  end if;
  select * into v_submission
  from public.wing_media_submissions
  where id = v_job.submission_id
  for update;
  if not found
     or v_submission.status <> 'generation_pending'
     or v_submission.withdrawn_at is not null then
    raise exception 'generation_submission_ineligible';
  end if;
  if jsonb_typeof(p_metadata) <> 'object'
     or p_metadata->>'source' <> 'community_submission'
     or p_metadata->>'generator_version' is null
     or p_metadata->>'source_processed_path'
        is distinct from v_submission.processed_storage_path then
    raise exception 'generation_metadata_invalid';
  end if;
  v_instagram_alt := nullif(trim(p_metadata->>'instagram_alt_text'), '');
  v_facebook_alt := nullif(trim(p_metadata->>'facebook_alt_text'), '');
  if v_instagram_alt is null
     or v_facebook_alt is null
     or char_length(v_instagram_alt) > 1000
     or char_length(v_facebook_alt) > 1000 then
    raise exception 'generation_alt_text_invalid';
  end if;
  if p_instagram_post_type not in ('photo', 'reel')
     or p_facebook_post_type not in ('photo', 'video')
     or char_length(coalesce(p_instagram_caption, '')) not between 1 and 2200
     or char_length(coalesce(p_facebook_caption, '')) not between 1 and 2200 then
    raise exception 'generation_platform_copy_invalid';
  end if;
  if not exists (
    select 1 from storage.objects object
    where object.bucket_id = 'wing-submissions'
      and object.name = v_job.instagram_media_path
  ) or not exists (
    select 1 from storage.objects object
    where object.bucket_id = 'wing-submissions'
      and object.name = v_job.facebook_media_path
  ) then
    raise exception 'generated_assets_missing';
  end if;

  insert into public.social_content_jobs(
    id, submission_id, platform, post_type, generated_media_path,
    generated_caption, generated_alt_text, generated_metadata,
    status, dry_run, idempotency_key, correlation_id
  ) values
  (
    v_job.instagram_job_id, v_job.submission_id, 'instagram',
    p_instagram_post_type, v_job.instagram_media_path,
    p_instagram_caption, v_instagram_alt, p_metadata, 'ready', true,
    'social:' || v_job.id::text || ':instagram', v_job.correlation_id
  ),
  (
    v_job.facebook_job_id, v_job.submission_id, 'facebook',
    p_facebook_post_type, v_job.facebook_media_path,
    p_facebook_caption, v_facebook_alt, p_metadata, 'ready', true,
    'social:' || v_job.id::text || ':facebook', v_job.correlation_id
  );

  update public.wing_generation_jobs
  set status = 'succeeded',
      claim_token = null,
      claimed_by = null,
      claimed_at = null,
      lease_expires_at = null,
      failure_code = null,
      failure_reason = null,
      updated_at = now()
  where id = v_job.id;
  perform public.wing_transition_submission(
    v_job.submission_id, 'ready_to_post', 'generation_pending',
    'worker', null, 'generation_completed',
    'generation:' || v_job.id::text, v_job.correlation_id,
    jsonb_build_object(
      'source', 'community_submission',
      'generator_version', p_metadata->>'generator_version'
    )
  );
  return jsonb_build_object(
    'instagram_job_id', v_job.instagram_job_id,
    'facebook_job_id', v_job.facebook_job_id,
    'submission_status', 'ready_to_post'
  );
end;
$$;

revoke all on function public.begin_wing_generation_job(uuid, uuid),
  public.fail_wing_generation_job(uuid, uuid, boolean, text, text),
  public.complete_wing_generation(uuid, uuid, text, text, text, text, jsonb)
from public, anon, authenticated;

grant execute on function public.begin_wing_generation_job(uuid, uuid),
  public.fail_wing_generation_job(uuid, uuid, boolean, text, text),
  public.complete_wing_generation(uuid, uuid, text, text, text, text, jsonb)
to service_role;

comment on function public.begin_wing_generation_job(uuid, uuid) is
  'Returns only claim-bound processed community media and approved display context; never original media or raw identity.';
comment on function public.fail_wing_generation_job(uuid, uuid, boolean, text, text) is
  'Releases a generation lease with bounded backoff or dead-letters it and closes the submission.';

commit;

-- Rollback: stop generation workers, let leases expire, then restore the
-- previous complete_wing_generation definition and drop begin/fail RPCs.
-- Preserve generated objects, jobs, transitions, and social job audit records.
