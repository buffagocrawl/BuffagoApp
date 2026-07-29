-- Wing Shot lifecycle fix: processing is a prerequisite for review approval.
begin;

create or replace function public.mango_list_wing_submissions()
returns setof jsonb language sql stable security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'submission_id', s.id, 'status', s.status,
    'moderation_status', s.moderation_status, 'wing_verification_status', s.wing_verification_status,
    'media_type', s.media_type, 'processed_storage_path', s.processed_storage_path,
    'thumbnail_storage_path', s.thumbnail_storage_path, 'created_at', s.created_at,
    'approved_at', s.approved_at, 'rejected_at', s.rejected_at, 'featured_at', s.featured_at,
    'reviewed_at', s.reviewed_at, 'reviewed_by', s.reviewed_by, 'rejection_reason', s.rejection_reason,
    'reviewer_notes', s.reviewer_notes, 'is_publish_priority', s.is_publish_priority,
    'priority_set_at', s.priority_set_at, 'caption', s.user_caption,
    'attribution_preference', s.attribution_preference,
    'contributor', jsonb_build_object('user_id', s.user_id, 'username', u.username),
    'restaurant', jsonb_build_object('id', d.id, 'name', d.name, 'city', d.city, 'state_id', d.state_id, 'state_code', st.state_code),
    'rating_id', s.rating_id, 'rating', jsonb_build_object('overall', r.overall, 'weighted_score', r.weight_score),
    'ai_moderation', (select jsonb_build_object('recommendation', m.recommendation, 'explanation', left(m.explanation, 600), 'evaluated_at', m.evaluated_at)
      from public.wing_moderation_decisions m where m.submission_id=s.id order by m.evaluated_at desc, m.id desc limit 1),
    'processing', coalesce((select jsonb_agg(jsonb_build_object('kind', j.job_kind, 'status', j.status,
      'attempt_count', j.attempt_count, 'last_error_code', j.last_error_code,
      'last_error_reason', left(j.last_error_reason, 500), 'updated_at', j.updated_at)
      order by j.updated_at desc) from public.wing_processing_jobs j where j.submission_id = s.id), '[]'::jsonb),
    'processed_object_exists', exists(select 1 from storage.objects o where o.bucket_id='wing-submissions' and o.name=s.processed_storage_path),
    'thumbnail_object_exists', exists(select 1 from storage.objects o where o.bucket_id='wing-submissions' and o.name=s.thumbnail_storage_path),
    'processing_succeeded', exists(select 1 from public.wing_processing_jobs j where j.submission_id=s.id and j.job_kind in ('photo_process','video_process') and j.status='succeeded'),
    'publishing', coalesce((select jsonb_agg(jsonb_build_object('platform', c.platform, 'status', c.status,
      'external_post_id', c.external_post_id, 'external_permalink', c.external_permalink,
      'posted_at', c.posted_at, 'failure_reason', left(c.failure_reason, 500)) order by c.platform)
      from public.social_content_jobs c where c.submission_id=s.id), '[]'::jsonb),
    'review_state', case when s.status in ('uploaded','processing') then 'Processing media'
      when s.status='in_review' and s.processed_storage_path is not null and s.thumbnail_storage_path is not null
        and exists(select 1 from storage.objects o where o.bucket_id='wing-submissions' and o.name=s.processed_storage_path)
        and exists(select 1 from storage.objects o where o.bucket_id='wing-submissions' and o.name=s.thumbnail_storage_path)
        and exists(select 1 from public.wing_processing_jobs j where j.submission_id=s.id and j.job_kind in ('photo_process','video_process') and j.status='succeeded') then 'Ready for Review'
      when s.status='approved' and s.featured_at is null
        and s.processed_storage_path is not null and s.thumbnail_storage_path is not null
        and exists(select 1 from storage.objects o where o.bucket_id='wing-submissions' and o.name=s.processed_storage_path)
        and exists(select 1 from storage.objects o where o.bucket_id='wing-submissions' and o.name=s.thumbnail_storage_path)
        and exists(select 1 from public.wing_processing_jobs j where j.submission_id=s.id and j.job_kind in ('photo_process','video_process') and j.status='succeeded') then 'Approved / Ready to Publish'
      when s.status='approved' and s.featured_at is null then 'Processing media'
      when s.status='generation_pending' then 'Generation Pending'
      when s.status in ('ready_to_post','scheduled') then 'Ready to Publish'
      when s.status='posting' then 'Posting'
      when s.status='posted' or s.featured_at is not null then 'Posted'
      when s.status='failed' then 'Failed' else initcap(replace(s.status, '_', ' ')) end
  )
  from public.wing_media_submissions s
  join public.destination_ratings r on r.id=s.rating_id
  join public.destinations d on d.id=s.destination_id
  left join public.states st on st.state_id=d.state_id
  left join public.users u on u.user_id=s.user_id
  order by s.created_at desc, s.id;
$$;

create or replace function public.mango_review_wing_submission(
  p_submission_id uuid, p_action text, p_reason_category text, p_reviewer_note text,
  p_reviewer_id uuid, p_idempotency_key text, p_correlation_id uuid
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare s public.wing_media_submissions%rowtype; v_transition uuid; v_note text;
begin
  if not exists (select 1 from public.app_user_roles where user_id=p_reviewer_id and role in ('wing_reviewer','wing_admin') and active and revoked_at is null) then raise exception 'wing_reviewer_role_required' using errcode='42501'; end if;
  if p_action not in ('approve','reject') or p_submission_id is null or char_length(coalesce(p_idempotency_key,'')) not between 8 and 200 or p_correlation_id is null then raise exception 'invalid_review_request'; end if;
  if p_reason_category not in ('standard_acceptable','documented_override','poor_media_quality','inappropriate_content','not_related_to_rating','duplicate_submission','copyright_or_ownership','restaurant_or_attribution','other') then raise exception 'review_reason_required'; end if;
  if (p_action='approve' and p_reason_category not in ('standard_acceptable','documented_override'))
     or (p_action='reject' and p_reason_category not in ('poor_media_quality','inappropriate_content','not_related_to_rating','duplicate_submission','copyright_or_ownership','restaurant_or_attribution','other')) then raise exception 'invalid_review_reason_for_action'; end if;
  v_note := nullif(left(trim(coalesce(p_reviewer_note,'')),2000),'');
  if v_note is null or char_length(v_note) < 8 then raise exception 'review_notes_required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('mango-review:'||p_submission_id::text,0));
  select * into s from public.wing_media_submissions where id=p_submission_id for update;
  if not found then raise exception 'wing_submission_not_found'; end if;
  if s.status <> 'in_review' then raise exception 'review_submission_not_ready'; end if;
  if p_action='approve' then
    if s.processed_storage_path is null or s.thumbnail_storage_path is null
       or not exists(select 1 from storage.objects o where o.bucket_id='wing-submissions' and o.name=s.processed_storage_path)
       or not exists(select 1 from storage.objects o where o.bucket_id='wing-submissions' and o.name=s.thumbnail_storage_path)
       or not exists(select 1 from public.wing_processing_jobs j where j.submission_id=s.id and j.job_kind in ('photo_process','video_process') and j.status='succeeded') then raise exception 'processed_media_required_for_approval'; end if;
    if s.moderation_status in ('clear_rejection','failed') or s.wing_verification_status in ('not_wings','failed') then raise exception 'unsafe_or_failed_media_cannot_be_approved'; end if;
  end if;
  v_transition := public.wing_transition_submission(p_submission_id, case when p_action='approve' then 'approved' else 'rejected' end, 'in_review', 'reviewer', p_reviewer_id, 'mango_habanero_review', 'mango:'||p_idempotency_key, p_correlation_id, jsonb_build_object('reason_category',p_reason_category,'notes',v_note));
  update public.wing_media_submissions set reviewed_at=now(), reviewed_by=p_reviewer_id, reviewer_notes=v_note,
    moderation_status=case when p_action='approve' and moderation_status in ('pending','manual_review') then 'overridden' else moderation_status end,
    wing_verification_status=case when p_action='approve' and wing_verification_status in ('pending','uncertain') then 'overridden' else wing_verification_status end,
    rejected_at=case when p_action='reject' then now() else rejected_at end,
    rejection_reason=case when p_action='reject' then case p_reason_category when 'inappropriate_content' then 'unsafe_content' when 'not_related_to_rating' then 'not_wings' when 'duplicate_submission' then 'duplicate' else 'other_policy' end else rejection_reason end,
    updated_at=now() where id=p_submission_id;
  insert into public.wing_moderation_decisions(submission_id,decision_source,recommendation,explanation,reviewer_id,override_reason,raw_result,idempotency_key,correlation_id)
    values(p_submission_id,'human',case when p_action='approve' then 'accept' else 'reject' end,v_note,p_reviewer_id,case when p_action='approve' and (s.moderation_status in ('pending','manual_review') or s.wing_verification_status in ('pending','uncertain')) then p_reason_category end,'{}'::jsonb,'human-review:'||p_idempotency_key,p_correlation_id) on conflict(idempotency_key) do nothing;
  insert into public.wing_admin_actions(submission_id,actor_id,action,reason_category,notes,before_state,after_state,idempotency_key,request_fingerprint,correlation_id)
    values(p_submission_id,p_reviewer_id,case when p_action='approve' then 'approve' else 'reject' end,p_reason_category,v_note,jsonb_build_object('status','in_review'),jsonb_build_object('status',case when p_action='approve' then 'approved' else 'rejected' end),'mango:'||p_idempotency_key,md5(concat_ws('|',p_submission_id,p_action,p_reason_category,v_note)),p_correlation_id) on conflict(idempotency_key) do nothing;
  return jsonb_build_object('submission_id',p_submission_id,'status',case when p_action='approve' then 'approved' else 'rejected' end,'transition_id',v_transition,'correlation_id',p_correlation_id);
end; $$;

create or replace function public.repair_stranded_wing_submission(p_submission_id uuid, p_correlation_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare s public.wing_media_submissions%rowtype; j public.wing_processing_jobs%rowtype; v_job uuid; v_key text := 'system-repair:stranded-approved:'||p_submission_id::text;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;
  if p_submission_id is null or p_correlation_id is null then raise exception 'repair_identity_required'; end if;
  select * into s from public.wing_media_submissions where id=p_submission_id for update;
  if not found or s.status<>'approved' or s.processed_storage_path is not null or s.featured_at is not null then raise exception 'submission_not_stranded'; end if;
  if not exists(select 1 from storage.objects o where o.bucket_id='wing-submissions' and o.name=s.original_storage_path) then raise exception 'original_media_missing'; end if;
  if exists(select 1 from public.wing_generation_jobs g where g.submission_id=s.id and g.status not in ('pending','cancelled')) then raise exception 'publishing_has_started'; end if;
  if exists(select 1 from public.social_content_jobs c where c.submission_id=s.id) then raise exception 'publishing_has_started'; end if;
  -- The normal state machine intentionally does not permit approved -> processing.
  -- This narrowly-scoped repair records the exceptional forward transition while
  -- clearing the approval shape in the same transaction.
  update public.wing_media_submissions set status='processing', approved_at=null,approved_by=null,is_publish_priority=false,priority_set_at=null,priority_set_by=null,updated_at=now() where id=s.id;
  insert into public.wing_submission_state_transitions(submission_id,from_status,to_status,actor_type,trigger_source,idempotency_key,request_fingerprint,correlation_id,metadata)
    values(s.id,'approved','processing','system','stranded_approval_repair',v_key||':transition',md5(v_key||':transition'),p_correlation_id,jsonb_build_object('repair','premature_approval')) on conflict(idempotency_key) do nothing;
  update public.wing_generation_jobs set status='cancelled',updated_at=now() where submission_id=s.id and status='pending';
  select * into j from public.wing_processing_jobs where submission_id=s.id and job_kind=case when s.media_type='video' then 'video_process' else 'photo_process' end and status in ('pending','retry') order by created_at for update limit 1;
  if found then v_job:=j.id; else insert into public.wing_processing_jobs(submission_id,job_kind,generation,status,idempotency_key,correlation_id) values(s.id,case when s.media_type='video' then 'video_process' else 'photo_process' end,1,'pending',v_key,p_correlation_id) on conflict(idempotency_key) do update set updated_at=now() returning id into v_job; end if;
  insert into public.wing_admin_actions(submission_id,action,reason_category,notes,before_state,after_state,idempotency_key,request_fingerprint,correlation_id) values(s.id,'retry_processing','system_repair','Restored a prematurely approved, unprocessed submission to the private processing queue.',jsonb_build_object('status','approved','approved_at',s.approved_at),jsonb_build_object('status','processing','processing_job_id',v_job),v_key,md5(v_key),p_correlation_id) on conflict(idempotency_key) do nothing;
  return jsonb_build_object('submission_id',s.id,'status','processing','processing_job_id',v_job,'correlation_id',p_correlation_id);
end; $$;

revoke all on function public.repair_stranded_wing_submission(uuid,uuid) from public,anon,authenticated;
grant execute on function public.repair_stranded_wing_submission(uuid,uuid) to service_role;
revoke all on function public.mango_review_wing_submission(uuid,text,text,text,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.mango_review_wing_submission(uuid,text,text,text,uuid,text,uuid) to service_role;
commit;
