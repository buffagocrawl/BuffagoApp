-- Mango Habanero forward fix: expose authoritative private-object readiness and
-- keep manual review independent from generated media. The original upload is
-- sufficient for an in_review decision; processed media remains publisher-only.

begin;

create or replace function public.mango_list_wing_submissions()
returns setof jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, storage
as $$
  select jsonb_build_object(
    'submission_id', s.id,
    'status', s.status,
    'moderation_status', s.moderation_status,
    'wing_verification_status', s.wing_verification_status,
    'media_type', s.media_type,
    'original_storage_path', s.original_storage_path,
    'processed_storage_path', s.processed_storage_path,
    'thumbnail_storage_path', s.thumbnail_storage_path,
    'original_object_exists', exists (select 1 from storage.objects o where o.bucket_id = 'wing-submissions' and o.name = s.original_storage_path),
    'processed_object_exists', exists (select 1 from storage.objects o where o.bucket_id = 'wing-submissions' and o.name = s.processed_storage_path),
    'thumbnail_object_exists', exists (select 1 from storage.objects o where o.bucket_id = 'wing-submissions' and o.name = s.thumbnail_storage_path),
    'processing_succeeded', exists (select 1 from public.wing_processing_jobs j where j.submission_id = s.id and j.job_kind in ('photo_process', 'video_process') and j.status = 'succeeded'),
    'active_processing_job', exists (select 1 from public.wing_processing_jobs j where j.submission_id = s.id and j.job_kind in ('photo_process', 'video_process') and j.status in ('pending', 'claimed', 'retry')),
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
    'contributor', jsonb_build_object('user_id', s.user_id, 'username', u.username, 'display_name', u.display_name),
    'restaurant', jsonb_build_object('id', d.id, 'name', d.name, 'city', d.city, 'state_id', d.state_id, 'state_code', st.state_code),
    'rating_id', s.rating_id,
    'rating', jsonb_build_object('overall', r.overall, 'crispiness', r.crispiness, 'sauce', r.sauce, 'meat', r.meat, 'spice_level', r.spice_level, 'would_order_again', r.would_order_again, 'weighted_score', r.weight_score),
    'processing', coalesce((select jsonb_agg(jsonb_build_object('kind', j.job_kind, 'status', j.status, 'attempt_count', j.attempt_count, 'last_error_code', j.last_error_code, 'last_error_reason', left(j.last_error_reason, 500), 'updated_at', j.updated_at) order by j.updated_at desc) from public.wing_processing_jobs j where j.submission_id = s.id), '[]'::jsonb),
    'publishing', coalesce((select jsonb_agg(jsonb_build_object('platform', p.platform, 'status', p.status, 'external_post_id', p.external_post_id, 'external_permalink', p.external_permalink, 'posted_at', p.posted_at, 'failure_reason', left(p.failure_reason, 500)) order by p.platform) from public.social_content_jobs p where p.submission_id = s.id), '[]'::jsonb),
    'review_state', case
      when s.status in ('uploaded', 'processing', 'in_review') then 'In Review'
      when s.status = 'approved' and exists (select 1 from storage.objects o where o.bucket_id = 'wing-submissions' and o.name = s.processed_storage_path) and exists (select 1 from storage.objects o where o.bucket_id = 'wing-submissions' and o.name = s.thumbnail_storage_path) and exists (select 1 from public.wing_processing_jobs j where j.submission_id = s.id and j.job_kind in ('photo_process', 'video_process') and j.status = 'succeeded') then 'Approved / Ready to Publish'
      when s.status = 'approved' and exists (select 1 from public.wing_processing_jobs j where j.submission_id = s.id and j.job_kind in ('photo_process', 'video_process') and j.status in ('pending', 'claimed', 'retry')) then 'Approved / Preparing Media'
      when s.status = 'approved' then 'Approved / Awaiting Media Preparation'
      when s.status = 'generation_pending' then 'Generation Pending'
      when s.status in ('ready_to_post', 'scheduled') then 'Ready to Publish'
      when s.status = 'posting' then 'Posting'
      when s.status = 'posted' or s.featured_at is not null then 'Posted'
      when s.status = 'failed' then 'Media Preparation Failed'
      else initcap(replace(s.status, '_', ' '))
    end
  )
  from public.wing_media_submissions s
  join public.destination_ratings r on r.id = s.rating_id
  join public.destinations d on d.id = s.destination_id
  left join public.states st on st.state_id = d.state_id
  left join public.users u on u.user_id = s.user_id
  order by s.created_at desc, s.id;
$$;

revoke all on function public.mango_list_wing_submissions() from public, anon, authenticated;
grant execute on function public.mango_list_wing_submissions() to service_role;

commit;
