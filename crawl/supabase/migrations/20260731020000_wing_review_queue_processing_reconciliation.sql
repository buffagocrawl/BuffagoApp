-- Keep validated uploads in the human review queue. Processing remains a
-- worker-only state for real asynchronous media jobs, never an intake state.
begin;

drop trigger if exists enqueue_wing_processing_after_submission
  on public.wing_media_submissions;

create or replace function public.reconcile_stuck_wing_processing(
  p_limit integer default 100
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, storage
as $$
declare
  v_row record;
  v_count integer := 0;
  v_key text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
  if p_limit not between 1 and 500 then
    raise exception 'invalid_reconciliation_limit';
  end if;

  for v_row in
    select s.id, s.status, s.correlation_id
      from public.wing_media_submissions s
     where s.status = 'processing'
       and exists (
         select 1 from storage.objects o
          where o.bucket_id = 'wing-submissions'
            and o.name = s.original_storage_path
       )
       and not exists (
         select 1 from public.wing_processing_jobs j
          where j.submission_id = s.id
            and j.job_kind in ('photo_process', 'video_process')
            and j.status in ('pending', 'claimed', 'retry')
       )
     order by s.created_at, s.id
     for update of s skip locked
     limit p_limit
  loop
    v_key := 'system-reconcile:processing-to-review:' || v_row.id::text;
    perform public.wing_transition_submission(
      v_row.id, 'in_review', 'processing', 'system', null,
      'stuck_processing_reconciliation', v_key,
      v_row.correlation_id,
      jsonb_build_object('reason', 'validated_media_without_active_processing_job')
    );
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.reconcile_stuck_wing_processing(integer)
  from public, anon, authenticated;
grant execute on function public.reconcile_stuck_wing_processing(integer)
  to service_role;

commit;
