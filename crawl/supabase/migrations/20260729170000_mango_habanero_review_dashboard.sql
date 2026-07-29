-- Mango Habanero: service-only moderation dashboard and atomic publish priority.
-- Extends the existing Wing Shots tables/state machine. No bucket is made public.

begin;

alter table public.wing_media_submissions
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists is_publish_priority boolean not null default false,
  add column if not exists priority_set_at timestamptz,
  add column if not exists priority_set_by uuid references auth.users(id) on delete set null;

create index if not exists wing_media_submissions_mango_queue_idx
  on public.wing_media_submissions (status, created_at desc, id)
  where status in ('in_review', 'approved', 'rejected', 'posted', 'failed');

create unique index if not exists wing_media_submissions_one_active_priority_idx
  on public.wing_media_submissions (is_publish_priority)
  where is_publish_priority and status = 'approved' and featured_at is null;

create or replace function public.mango_clear_ineligible_priority()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.status <> 'approved' or new.featured_at is not null then
    new.is_publish_priority := false;
    new.priority_set_at := null;
    new.priority_set_by := null;
  end if;
  return new;
end;
$$;

drop trigger if exists mango_clear_ineligible_priority on public.wing_media_submissions;
create trigger mango_clear_ineligible_priority
before update of status, featured_at, is_publish_priority on public.wing_media_submissions
for each row execute function public.mango_clear_ineligible_priority();

create or replace function public.mango_list_wing_submissions()
returns setof jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'submission_id', s.id,
    'status', s.status,
    'moderation_status', s.moderation_status,
    'media_type', s.media_type,
    'original_storage_path', s.original_storage_path,
    'processed_storage_path', s.processed_storage_path,
    'thumbnail_storage_path', s.thumbnail_storage_path,
    'created_at', s.created_at,
    'approved_at', s.approved_at,
    'rejected_at', s.rejected_at,
    'featured_at', s.featured_at,
    'reviewed_at', s.reviewed_at,
    'reviewed_by', s.reviewed_by,
    'rejection_reason', s.rejection_reason,
    'reviewer_notes', s.reviewer_notes,
    'is_publish_priority', s.is_publish_priority,
    'priority_set_at', s.priority_set_at,
    'caption', s.user_caption,
    'attribution_preference', s.attribution_preference,
    'contributor', jsonb_build_object('user_id', s.user_id, 'username', u.username),
    'restaurant', jsonb_build_object('id', d.id, 'name', d.name, 'city', d.city,
      'state_id', d.state_id, 'state_code', st.state_code),
    'rating_id', s.rating_id,
    'rating', jsonb_build_object('overall', r.overall, 'weighted_score', r.weight_score),
    'ai_moderation', (
      select jsonb_build_object('recommendation', m.recommendation,
        'explanation', left(m.explanation, 600), 'quality_score', m.quality_score,
        'evaluated_at', m.evaluated_at)
      from public.wing_moderation_decisions m
      where m.submission_id = s.id
      order by m.evaluated_at desc, m.id desc limit 1
    ),
    'processing', coalesce((select jsonb_agg(jsonb_build_object(
      'kind', j.job_kind, 'status', j.status, 'attempt_count', j.attempt_count,
      'last_error_code', j.last_error_code, 'last_error_reason', left(j.last_error_reason, 500),
      'updated_at', j.updated_at) order by j.updated_at desc)
      from public.wing_processing_jobs j where j.submission_id = s.id), '[]'::jsonb)
  )
  from public.wing_media_submissions s
  join public.destination_ratings r on r.id = s.rating_id
  join public.destinations d on d.id = s.destination_id
  left join public.states st on st.state_id = d.state_id
  left join public.users u on u.user_id = s.user_id
  order by s.created_at desc, s.id;
$$;

create or replace function public.mango_review_wing_submission(
  p_submission_id uuid, p_action text, p_reason_category text, p_reviewer_note text,
  p_reviewer_id uuid, p_idempotency_key text, p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare s public.wing_media_submissions%rowtype; v_transition uuid;
  v_reason text := case p_reason_category
    when 'poor_media_quality' then 'quality_unusable'
    when 'inappropriate_content' then 'unsafe_content'
    when 'not_related_to_rating' then 'not_wings'
    when 'duplicate_submission' then 'duplicate'
    when 'copyright_or_ownership' then 'rights_concern'
    when 'restaurant_or_attribution' then 'other_policy'
    else 'other_policy' end;
begin
  if not exists (select 1 from public.app_user_roles where user_id=p_reviewer_id
    and role in ('wing_reviewer','wing_admin') and active and revoked_at is null)
    then raise exception 'wing_reviewer_role_required' using errcode='42501'; end if;
  if p_action not in ('approve','reject') or p_submission_id is null
    or char_length(coalesce(p_idempotency_key,'')) not between 8 and 200
    or p_correlation_id is null then raise exception 'invalid_review_request'; end if;
  if p_action='reject' and nullif(trim(coalesce(p_reason_category,'')), '') is null
    then raise exception 'rejection_reason_required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('mango-review:'||p_idempotency_key,0));
  select * into s from public.wing_media_submissions where id=p_submission_id for update;
  if not found then raise exception 'wing_submission_not_found'; end if;
  -- Mango reviews the original upload. Move an upload/processing submission
  -- into the review state as part of the same transaction; the processing job
  -- remains an independent downstream record and does not gate moderation.
  if s.status = 'uploaded' then
    perform public.wing_transition_submission(
      p_submission_id, 'processing', 'uploaded', 'reviewer', p_reviewer_id,
      'mango_habanero_review_queue', 'mango:'||p_idempotency_key||':processing',
      p_correlation_id, '{}'::jsonb);
  end if;
  if s.status in ('uploaded', 'processing') then
    perform public.wing_transition_submission(
      p_submission_id, 'in_review', 'processing', 'reviewer', p_reviewer_id,
      'mango_habanero_review_queue', 'mango:'||p_idempotency_key||':in_review',
      p_correlation_id, '{}'::jsonb);
  end if;
  v_transition := public.wing_transition_submission(
    p_submission_id, case when p_action='approve' then 'approved' else 'rejected' end,
    'in_review', 'reviewer', p_reviewer_id, 'mango_habanero_review',
    'mango:'||p_idempotency_key, p_correlation_id,
    jsonb_build_object('rejection_reason', case when p_action='reject' then v_reason end,
      'reviewer_note', left(trim(coalesce(p_reviewer_note,'')),2000),
      'mango_reason_category', p_reason_category));
  update public.wing_media_submissions set reviewed_at=now(), reviewed_by=p_reviewer_id,
    reviewer_notes=nullif(left(trim(coalesce(p_reviewer_note,'')),2000),''), updated_at=now()
    where id=p_submission_id;
  insert into public.wing_admin_actions(submission_id,actor_id,action,reason_category,notes,
    before_state,after_state,idempotency_key,request_fingerprint,correlation_id)
    values(p_submission_id,p_reviewer_id,p_action,p_reason_category,
      nullif(left(trim(coalesce(p_reviewer_note,'')),2000),''),
      jsonb_build_object('status','in_review'), jsonb_build_object('status',case when p_action='approve' then 'approved' else 'rejected' end),
      'mango:'||p_idempotency_key, md5(concat_ws('|',p_submission_id,p_action,p_reason_category,p_reviewer_note)), p_correlation_id)
    on conflict (idempotency_key) do nothing;
  return jsonb_build_object('submission_id',p_submission_id,'status',case when p_action='approve' then 'approved' else 'rejected' end,'transition_id',v_transition);
end;
$$;

create or replace function public.mango_set_wing_priority(
  p_submission_id uuid, p_reviewer_id uuid, p_idempotency_key text, p_correlation_id uuid
)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare s public.wing_media_submissions%rowtype; old_id uuid;
begin
  if p_reviewer_id is null or char_length(coalesce(p_idempotency_key,'')) not between 8 and 200 or p_correlation_id is null then raise exception 'invalid_priority_request'; end if;
  if not exists (select 1 from public.app_user_roles where user_id=p_reviewer_id and role in ('wing_reviewer','wing_admin') and active and revoked_at is null) then raise exception 'wing_reviewer_role_required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('mango-priority',0));
  select * into s from public.wing_media_submissions where id=p_submission_id for update;
  if not found or s.status <> 'approved' or s.featured_at is not null then raise exception 'priority_submission_ineligible'; end if;
  select id into old_id from public.wing_media_submissions where is_publish_priority and status='approved' and featured_at is null for update;
  update public.wing_media_submissions set is_publish_priority=false,priority_set_at=null,priority_set_by=null,updated_at=now() where is_publish_priority;
  update public.wing_media_submissions set is_publish_priority=true,priority_set_at=now(),priority_set_by=p_reviewer_id,updated_at=now() where id=p_submission_id;
  insert into public.wing_admin_actions(submission_id,actor_id,action,reason_category,notes,before_state,after_state,idempotency_key,request_fingerprint,correlation_id)
    values(p_submission_id,p_reviewer_id,'prioritize','editorial_priority',null,jsonb_build_object('previous_priority',old_id),jsonb_build_object('priority',true),'mango:'||p_idempotency_key,md5(concat_ws('|',p_submission_id,old_id)),p_correlation_id) on conflict (idempotency_key) do nothing;
  return jsonb_build_object('submission_id',p_submission_id,'previous_submission_id',old_id,'is_publish_priority',true);
end;
$$;

create or replace function public.mango_clear_wing_priority(
  p_submission_id uuid, p_reviewer_id uuid, p_idempotency_key text, p_correlation_id uuid
)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_actor uuid := p_reviewer_id;
begin
  if p_reviewer_id is null or char_length(coalesce(p_idempotency_key,'')) not between 8 and 200 or p_correlation_id is null then raise exception 'invalid_priority_request'; end if;
  if not exists (select 1 from public.app_user_roles where user_id=p_reviewer_id and role in ('wing_reviewer','wing_admin') and active and revoked_at is null) then raise exception 'wing_reviewer_role_required' using errcode='42501'; end if;
  update public.wing_media_submissions set is_publish_priority=false,priority_set_at=null,priority_set_by=null,updated_at=now() where id=p_submission_id and is_publish_priority;
  insert into public.wing_admin_actions(submission_id,actor_id,action,reason_category,notes,before_state,after_state,idempotency_key,request_fingerprint,correlation_id)
    values(p_submission_id,v_actor,'remove_priority','editorial_priority_removed',null,jsonb_build_object('priority',true),jsonb_build_object('priority',false),'mango:'||p_idempotency_key,md5(p_submission_id::text||':clear'),p_correlation_id) on conflict (idempotency_key) do nothing;
  return jsonb_build_object('submission_id',p_submission_id,'is_publish_priority',false);
end;
$$;

-- Keep normal mobile users out; the local backend uses the service-role key.
revoke all on function public.mango_list_wing_submissions() from public, anon, authenticated;
revoke all on function public.mango_review_wing_submission(uuid,text,text,text,uuid,text,uuid) from public, anon, authenticated;
revoke all on function public.mango_set_wing_priority(uuid,uuid,text,uuid) from public, anon, authenticated;
revoke all on function public.mango_clear_wing_priority(uuid,uuid,text,uuid) from public, anon, authenticated;
grant execute on function public.mango_list_wing_submissions() to service_role;
grant execute on function public.mango_review_wing_submission(uuid,text,text,text,uuid,text,uuid) to service_role;
grant execute on function public.mango_set_wing_priority(uuid,uuid,text,uuid) to service_role;
grant execute on function public.mango_clear_wing_priority(uuid,uuid,text,uuid) to service_role;

commit;
