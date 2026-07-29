-- Minimal provider mapping and explicit social-attribution consent fields.
-- Provider IDs are never inferred from raw coordinates at publish time.

begin;

alter table public.users
  add column if not exists display_name text,
  add column if not exists instagram_handle text,
  add column if not exists facebook_profile_or_page text,
  add column if not exists allow_social_tagging boolean not null default false,
  add column if not exists social_attribution_preference text not null default 'username',
  add column if not exists social_attribution_updated_at timestamptz;

create table if not exists public.wing_destination_social_locations (
  id uuid primary key default gen_random_uuid(),
  destination_id uuid not null references public.destinations(id) on delete cascade,
  provider text not null check (provider in ('facebook', 'instagram')),
  provider_place_id text not null,
  lookup_status text not null default 'unverified'
    check (lookup_status in ('unverified', 'matched', 'no_match', 'rejected', 'unsupported')),
  match_confidence numeric(5,4) check (match_confidence is null or match_confidence between 0 and 1),
  manually_verified boolean not null default false,
  last_checked_at timestamptz,
  lookup_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (destination_id, provider)
);

alter table public.wing_destination_social_locations enable row level security;
revoke all on public.wing_destination_social_locations from public, anon, authenticated;
grant select, insert, update on public.wing_destination_social_locations to service_role;

create or replace function public.mango_list_wing_submissions()
returns setof jsonb language sql stable security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'submission_id', s.id, 'status', s.status,
    'moderation_status', s.moderation_status, 'media_type', s.media_type,
    'processed_storage_path', s.processed_storage_path,
    'thumbnail_storage_path', s.thumbnail_storage_path,
    'created_at', s.created_at, 'approved_at', s.approved_at,
    'rejected_at', s.rejected_at, 'featured_at', s.featured_at,
    'reviewed_at', s.reviewed_at, 'reviewed_by', s.reviewed_by,
    'rejection_reason', s.rejection_reason, 'reviewer_notes', s.reviewer_notes,
    'is_publish_priority', s.is_publish_priority, 'priority_set_at', s.priority_set_at,
    'caption', s.user_caption, 'attribution_preference', s.attribution_preference,
    'contributor', jsonb_build_object('user_id', s.user_id, 'username', u.username,
      'display_name', u.display_name),
    'restaurant', jsonb_build_object('id', d.id, 'name', d.name, 'city', d.city,
      'state_id', d.state_id, 'state_code', st.state_code),
    'rating_id', s.rating_id,
    'rating', jsonb_build_object('overall', r.overall, 'crispiness', r.crispiness,
      'sauce', r.sauce, 'meat', r.meat, 'spice_level', r.spice_level,
      'would_order_again', r.would_order_again, 'weighted_score', r.weight_score),
    'publishing', coalesce((select jsonb_agg(jsonb_build_object(
      'platform', j.platform, 'status', j.status, 'external_post_id', j.external_post_id,
      'permalink', j.external_permalink, 'last_error', j.failure_reason,
      'posted_at', j.posted_at) order by j.platform)
      from public.social_content_jobs j where j.submission_id = s.id), '[]'::jsonb),
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

revoke all on function public.mango_list_wing_submissions() from public, anon, authenticated;
grant execute on function public.mango_list_wing_submissions() to service_role;

commit;
