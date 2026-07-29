-- Jalapeño publishes only approved video submissions from Mango Habanero's
-- queue.  This forward-fix replaces the previous random fallback with a
-- deterministic oldest-first claim and keeps the claim inside one transaction.

begin;

create or replace function public.run_wing_approved_queue_selection(
  p_business_date date,
  p_correlation_id uuid,
  p_submission_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_config public.wing_moderation_config%rowtype;
  v_receipt public.wing_nightly_run_receipts%rowtype;
  v_submission public.wing_media_submissions%rowtype;
  v_receipt_id uuid;
  v_generation_id uuid;
  v_candidate_count integer := 0;
  v_selection_mode text := 'oldest_approved';
  v_components jsonb;
  v_instagram_job uuid := gen_random_uuid();
  v_facebook_job uuid := gen_random_uuid();
  v_had_receipt boolean := false;
begin
  if p_business_date is null or p_correlation_id is null then
    raise exception 'approved_queue_selection_identity_required';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('jalapeno-approved-queue:' || p_business_date::text, 0)
  );

  select * into v_config from public.wing_moderation_config where singleton;
  if not found or not v_config.nightly_enabled then
    raise exception 'wing_nightly_disabled';
  end if;

  select * into v_receipt
    from public.wing_nightly_run_receipts
   where business_date = p_business_date
   for update;
  v_had_receipt := found;
  -- Empty receipts are informational and must not suppress later eligible content.
  if found and v_receipt.status not in ('running', 'skipped_no_approved_content') then
    return jsonb_build_object('receipt_id', v_receipt.id,
      'status', upper(v_receipt.status));
  end if;
  if found and v_receipt.started_at > now() - interval '30 minutes' then
    return jsonb_build_object('receipt_id', v_receipt.id, 'status', 'ALREADY_RUNNING');
  end if;

  select count(*) into v_candidate_count
    from public.wing_media_submissions s
   where s.status = 'approved'
     and s.rejected_at is null
     and s.featured_at is null
     and s.media_type = 'video'
     and s.consent_version is not null
     and s.consented_at is not null
     and s.original_storage_path is not null
     and s.processed_storage_path is not null
     and s.moderation_status in ('likely_acceptable', 'overridden')
     and s.wing_verification_status in ('likely_wings', 'overridden')
     and s.duplicate_group is null
     and not exists (
       select 1 from public.wing_submission_abuse_signals a
        where a.submission_id = s.id and a.severity in ('high', 'critical')
     )
     and exists (
       select 1 from storage.objects o
        where o.bucket_id = 'wing-submissions'
          and o.name = s.original_storage_path
     )
     and exists (
       select 1 from storage.objects o
        where o.bucket_id = 'wing-submissions'
          and o.name = s.thumbnail_storage_path
     )
     and exists (
       select 1 from public.wing_processing_jobs j
        where j.submission_id = s.id
          and j.job_kind in ('photo_process', 'video_process')
          and j.status = 'succeeded'
     )
     and (p_submission_id is null or s.id = p_submission_id)
     and not exists (
       select 1 from public.wing_generation_jobs g
        where g.submission_id = s.id
          and g.status in ('pending', 'claimed', 'retry')
     );

  if v_candidate_count = 0 then
    if v_had_receipt then
      update public.wing_nightly_run_receipts
         set status = 'skipped_no_approved_content', candidate_count = 0,
             completed_at = now(), failure_code = 'SKIPPED_NO_APPROVED_CONTENT',
             correlation_id = p_correlation_id
       where id = v_receipt.id
       returning id into v_receipt_id;
    else
      insert into public.wing_nightly_run_receipts (
        business_date, status, candidate_count, dry_run, completed_at,
        failure_code, correlation_id
      ) values (
        p_business_date, 'skipped_no_approved_content', 0,
        coalesce(v_config.publishing_dry_run, true), now(),
        'SKIPPED_NO_APPROVED_CONTENT', p_correlation_id
      ) returning id into v_receipt_id;
    end if;
    return jsonb_build_object('receipt_id', v_receipt_id,
      'status', 'SKIPPED_NO_APPROVED_CONTENT');
  end if;

  select * into v_submission
    from public.wing_media_submissions s
   where s.status = 'approved'
     and s.rejected_at is null and s.featured_at is null
     and s.media_type = 'video' and s.consented_at is not null
     and s.original_storage_path is not null and s.processed_storage_path is not null
     and s.moderation_status in ('likely_acceptable', 'overridden')
     and s.wing_verification_status in ('likely_wings', 'overridden')
     and s.duplicate_group is null
     and exists (select 1 from storage.objects o
                  where o.bucket_id = 'wing-submissions'
                  and o.name = s.original_storage_path)
     and exists (select 1 from storage.objects o
                  where o.bucket_id = 'wing-submissions'
                  and o.name = s.thumbnail_storage_path)
     and exists (select 1 from public.wing_processing_jobs j
                  where j.submission_id = s.id
                    and j.job_kind in ('photo_process', 'video_process')
                    and j.status = 'succeeded')
     and not exists (select 1 from public.wing_submission_abuse_signals a
                      where a.submission_id = s.id
                        and a.severity in ('high', 'critical'))
     and (p_submission_id is null or s.id = p_submission_id)
     and not exists (select 1 from public.wing_generation_jobs g
                      where g.submission_id = s.id
                        and g.status in ('pending', 'claimed', 'retry'))
   order by s.is_publish_priority desc, s.priority desc,
            s.approved_at asc nulls last, s.created_at asc, s.id
   for update skip locked limit 1;
  if not found then
    return jsonb_build_object('status', 'SKIPPED_NO_APPROVED_CONTENT',
      'reason', 'claim_race');
  end if;

  if v_submission.is_publish_priority then
    v_selection_mode := 'make_next';
  elsif v_submission.priority > 0 then
    v_selection_mode := 'explicit_priority';
  end if;
  v_components := jsonb_build_object(
    'selection_mode', v_selection_mode,
    'make_next', v_submission.is_publish_priority,
    'priority', v_submission.priority,
    'ordering', 'approved_at,created_at,id',
    'source', 'mango_habanero_approved_queue'
  );

  if v_had_receipt then
    update public.wing_nightly_run_receipts
       set status = 'selected', selected_submission_id = v_submission.id,
           candidate_count = v_candidate_count, score_components = v_components,
           dry_run = coalesce(v_config.publishing_dry_run, true), completed_at = now(),
           correlation_id = p_correlation_id
     where id = v_receipt.id returning id into v_receipt_id;
  else
    insert into public.wing_nightly_run_receipts (
      business_date, status, selected_submission_id, candidate_count,
      score_components, dry_run, completed_at, correlation_id
    ) values (
      p_business_date, 'selected', v_submission.id, v_candidate_count,
      v_components, coalesce(v_config.publishing_dry_run, true), now(),
      p_correlation_id
    ) returning id into v_receipt_id;
  end if;

  -- This is the atomic claim boundary.  Make Next is consumed by this claim,
  -- never by a later publisher retry.
  update public.wing_media_submissions
     set is_publish_priority = false, priority_set_at = null,
         priority_set_by = null, updated_at = now()
   where id = v_submission.id;

  perform public.wing_transition_submission(
    v_submission.id, 'generation_pending', 'approved', 'scheduler', null,
    'jalapeno_approved_queue_selection',
    'jalapeno:' || p_correlation_id::text, p_correlation_id, v_components
  );
  insert into public.wing_generation_jobs (
    submission_id, nightly_receipt_id, instagram_job_id, facebook_job_id,
    instagram_media_path, facebook_media_path, correlation_id
  ) values (
    v_submission.id, v_receipt_id, v_instagram_job, v_facebook_job,
    'publication/' || v_submission.id || '/instagram/' || v_instagram_job,
    'publication/' || v_submission.id || '/facebook/' || v_facebook_job,
    p_correlation_id
  ) returning id into v_generation_id;

  return jsonb_build_object(
    'receipt_id', v_receipt_id, 'status', 'SELECTED',
    'submission_id', v_submission.id, 'generation_job_id', v_generation_id,
    'candidate_count', v_candidate_count, 'score_components', v_components
  );
end;
$$;

-- The legacy entrypoint remains available to already-deployed callers, but it
-- is permanently redirected to the Approved Queue contract and cannot select
-- random, hardcoded, or legacy media.
create or replace function public.run_wing_nightly_selection(
  p_business_date date, p_correlation_id uuid
)
returns jsonb
language sql
security definer
set search_path = pg_catalog, public
as $$
  select public.run_wing_approved_queue_selection(
    p_business_date, p_correlation_id, null::uuid
  );
$$;

revoke all on function public.run_wing_approved_queue_selection(date, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.run_wing_approved_queue_selection(date, uuid, uuid)
  to service_role;
revoke all on function public.run_wing_nightly_selection(date, uuid)
  from public, anon, authenticated;
grant execute on function public.run_wing_nightly_selection(date, uuid)
  to service_role;

create or replace function public.prepare_wing_manual_publish(
  p_submission_id uuid,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_submission public.wing_media_submissions%rowtype;
  v_count integer;
begin
  select * into v_submission from public.wing_media_submissions
   where id = p_submission_id for update;
  if not found or v_submission.status <> 'ready_to_post'
     or v_submission.approved_by is null then
    raise exception 'manual_publish_submission_not_ready';
  end if;
  update public.social_content_jobs
     set dry_run = false, human_approved_at = now(),
         human_approved_by = v_submission.approved_by,
         updated_at = now(), correlation_id = p_correlation_id
   where submission_id = p_submission_id and status = 'ready';
  get diagnostics v_count = row_count;
  return jsonb_build_object('submission_id', p_submission_id,
    'publish_ready_jobs', coalesce(v_count, 0));
end;
$$;

revoke all on function public.prepare_wing_manual_publish(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.prepare_wing_manual_publish(uuid, uuid)
  to service_role;

comment on function public.run_wing_approved_queue_selection(date, uuid, uuid) is
  'Atomically claims one consented approved video from Mango Habanero Approved Queue; Make Next, priority, approved_at, created_at, id.';

commit;
