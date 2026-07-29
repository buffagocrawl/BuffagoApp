-- Owner-safe Wing Creator history/detail and rollout-gated leaderboard surfaces.
-- Raw storage paths, reviewer notes, moderation explanations, and private media
-- never leave these RPCs.

begin;

create or replace function public.wing_safe_rejection_category(p_reason text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select case
    when p_reason is null then null
    when lower(p_reason) similar to '%(not[_ -]?wings|wrong[_ -]?content|unrelated)%'
      then 'Does not clearly show wings'
    when lower(p_reason) similar to '%(quality|blurry|dark|unusable|malformed)%'
      then 'Media quality'
    when lower(p_reason) similar to '%(duplicate|reused|spam)%'
      then 'Duplicate or repeated submission'
    when lower(p_reason) similar to '%(privacy|personal[_ -]?information|face|minor)%'
      then 'Privacy concern'
    when lower(p_reason) similar to '%(unsafe|nudity|graphic|weapon|hate|illegal|offensive)%'
      then 'Content safety'
    when lower(p_reason) similar to '%(copyright|permission|ownership)%'
      then 'Sharing rights'
    else 'Not eligible for featuring'
  end
$$;

revoke all on function public.wing_safe_rejection_category(text)
from public, anon, authenticated;
grant execute on function public.wing_safe_rejection_category(text)
to service_role;

create or replace function public.get_my_wing_submission_detail(
  p_submission_id uuid
)
returns table (
  submission_id uuid,
  rating_id uuid,
  destination_id uuid,
  destination_name text,
  destination_city text,
  media_type text,
  internal_status text,
  display_status text,
  attribution_preference text,
  user_caption text,
  rejection_category text,
  approved_at timestamptz,
  featured_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  featured_platform text,
  external_permalink text,
  can_withdraw boolean,
  preview_available boolean
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    submission.id,
    submission.rating_id,
    submission.destination_id,
    destination.name,
    destination.city,
    submission.media_type,
    submission.status,
    case
      when submission.status = 'posted' then 'Featured'
      when submission.status = 'approved' then 'Approved'
      when submission.status in (
        'generation_pending', 'ready_to_post', 'scheduled', 'posting'
      ) then 'Not Selected Yet'
      when submission.status = 'in_review' then 'In Review'
      when submission.status in ('uploaded', 'processing') then 'Processing'
      when submission.status = 'rejected' then 'Rejected'
      when submission.status = 'failed' then 'Upload Failed'
      when submission.status = 'withdrawn' then 'Withdrawn'
      else 'Processing'
    end,
    submission.attribution_preference,
    submission.user_caption,
    case
      when submission.status = 'rejected'
        then public.wing_safe_rejection_category(submission.rejection_reason)
      else null
    end,
    submission.approved_at,
    submission.featured_at,
    submission.created_at,
    submission.updated_at,
    featured_job.platform,
    featured_job.external_permalink,
    submission.status not in ('rejected', 'posted', 'withdrawn'),
    submission.thumbnail_storage_path is not null
  from public.wing_media_submissions submission
  join public.destinations destination
    on destination.id = submission.destination_id
  left join lateral (
    select job.platform, job.external_permalink
    from public.social_content_jobs job
    where job.submission_id = submission.id
      and job.status = 'posted'
      and not job.dry_run
      and job.external_post_id is not null
      and job.posted_at is not null
      and (
        (
          job.platform = 'instagram'
          and job.external_permalink ~* '^https://([a-z0-9-]+\.)?instagram\.com/'
        )
        or (
          job.platform = 'facebook'
          and job.external_permalink ~* '^https://([a-z0-9-]+\.)?(facebook\.com|fb\.com)/'
        )
      )
    order by
      case job.platform when 'instagram' then 0 else 1 end,
      job.posted_at,
      job.id
    limit 1
  ) featured_job on true
  where submission.id = p_submission_id
    and submission.user_id = auth.uid()
$$;

revoke all on function public.get_my_wing_submission_detail(uuid)
from public, anon;
grant execute on function public.get_my_wing_submission_detail(uuid)
to authenticated, service_role;

create or replace function public.get_my_wing_creator_badges()
returns table (
  badge_code text,
  badge_name text,
  badge_description text,
  badge_icon text,
  earned_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    catalog.code,
    catalog.name,
    catalog.description,
    catalog.icon,
    (
      select max(badge_event.created_at)
      from public.wing_creator_badge_events badge_event
      where badge_event.user_id = user_badge.user_id
        and badge_event.badge_id = user_badge.badge_id
        and badge_event.event_kind = 'awarded'
        and not exists (
          select 1
          from public.wing_creator_badge_events reversal
          where reversal.reverses_badge_event_id = badge_event.id
        )
    )
  from public.user_badges user_badge
  join public.badge_catalog catalog
    on catalog.id = user_badge.badge_id
  where user_badge.user_id = auth.uid()
    and catalog.category = 'creator'
    and catalog.is_active
  order by 5 desc nulls last, catalog.id
$$;

revoke all on function public.get_my_wing_creator_badges()
from public, anon;
grant execute on function public.get_my_wing_creator_badges()
to authenticated, service_role;

create table if not exists public.wing_content_review_requests (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null
    references public.wing_media_submissions(id) on delete restrict,
  user_id uuid references auth.users(id) on delete set null,
  requester_pseudonym_id uuid not null default gen_random_uuid(),
  reason_category text not null check (
    reason_category in (
      'withdrawal_after_publication', 'privacy', 'sharing_rights', 'other'
    )
  ),
  details text check (details is null or char_length(details) <= 1000),
  status text not null default 'open'
    check (status in ('open', 'in_review', 'resolved', 'declined')),
  idempotency_key text not null unique
    check (char_length(idempotency_key) between 8 and 200),
  correlation_id uuid not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  resolution_notes text check (
    resolution_notes is null or char_length(resolution_notes) <= 2000
  )
);

create unique index if not exists wing_content_review_one_open_per_submission
  on public.wing_content_review_requests (submission_id, user_id)
  where status in ('open', 'in_review') and user_id is not null;

alter table public.wing_content_review_requests enable row level security;
revoke all on public.wing_content_review_requests
from public, anon, authenticated;
grant select, insert, update on public.wing_content_review_requests
to service_role;

create or replace function public.request_wing_published_content_review(
  p_submission_id uuid,
  p_reason_category text,
  p_details text,
  p_idempotency_key text,
  p_correlation_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_request_id uuid;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_reason_category not in (
    'withdrawal_after_publication', 'privacy', 'sharing_rights', 'other'
  ) then
    raise exception 'invalid_review_reason';
  end if;
  if p_idempotency_key is null
     or char_length(p_idempotency_key) not between 8 and 200
     or p_correlation_id is null then
    raise exception 'review_request_identity_required';
  end if;
  if p_details is not null and char_length(p_details) > 1000 then
    raise exception 'review_request_details_too_long';
  end if;
  if not exists (
    select 1
    from public.wing_media_submissions submission
    where submission.id = p_submission_id
      and submission.user_id = v_user_id
      and submission.status = 'posted'
  ) then
    raise exception 'posted_wing_submission_not_found' using errcode = '42501';
  end if;

  select request.id
    into v_request_id
    from public.wing_content_review_requests request
   where request.idempotency_key = p_idempotency_key
     and request.user_id = v_user_id;
  if found then
    return v_request_id;
  end if;

  insert into public.wing_content_review_requests (
    submission_id, user_id, reason_category, details,
    idempotency_key, correlation_id
  ) values (
    p_submission_id, v_user_id, p_reason_category, nullif(trim(p_details), ''),
    p_idempotency_key, p_correlation_id
  )
  on conflict (submission_id, user_id)
    where status in ('open', 'in_review') and user_id is not null
  do update set submission_id = excluded.submission_id
  returning id into v_request_id;

  return v_request_id;
end;
$$;

revoke all on function public.request_wing_published_content_review(
  uuid, text, text, text, uuid
) from public, anon;
grant execute on function public.request_wing_published_content_review(
  uuid, text, text, text, uuid
) to authenticated, service_role;

create or replace function public.get_wing_creator_leaderboard_surface(
  p_period text default 'week',
  p_limit integer default 25
)
returns table (
  rank bigint,
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  approved_submissions bigint,
  featured_submissions bigint,
  creator_xp bigint,
  is_current_user boolean
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_enabled boolean := false;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_period not in ('week', 'all_time') then
    raise exception 'invalid_creator_leaderboard_period';
  end if;

  select
    flag.enabled
    and (
      flag.rollout_percent = 100
      or mod(
        mod(
          hashtextextended(
            auth.uid()::text || ':wing_shot_creator_leaderboard',
            0
          ),
          100
        ) + 100,
        100
      ) < flag.rollout_percent
    )
  into v_enabled
  from public.engagement_feature_flags flag
  where flag.flag_key = 'wing_shot_creator_leaderboard';

  if not coalesce(v_enabled, false) then
    return;
  end if;

  return query
  select leaderboard.*
  from public.get_wing_creator_leaderboard(
    p_period,
    greatest(1, least(coalesce(p_limit, 25), 100))
  ) leaderboard;
end;
$$;

-- Prevent clients from bypassing the rollout gate via the lower-level RPC.
revoke execute on function public.get_wing_creator_leaderboard(text, integer)
from authenticated;
revoke all on function public.get_wing_creator_leaderboard_surface(text, integer)
from public, anon;
grant execute on function public.get_wing_creator_leaderboard_surface(text, integer)
to authenticated, service_role;

comment on function public.get_my_wing_submission_detail(uuid) is
  'Owner-only Wing Shot detail. Returns safe categories and only valid posted HTTPS permalinks; never storage paths or reviewer detail.';
comment on function public.get_my_wing_creator_badges() is
  'Current signed-in user Creator badges from the centralized badge registry.';
comment on table public.wing_content_review_requests is
  'Auditable owner requests to review already-published Wing Shots. Private and service-managed.';
comment on function public.request_wing_published_content_review(
  uuid, text, text, text, uuid
) is
  'Owner-only, idempotent request for human review of a posted Wing Shot.';
comment on function public.get_wing_creator_leaderboard_surface(text, integer) is
  'Server-authoritative weekly/all-time Creator leaderboard with privacy filtering and staged-rollout enforcement.';

commit;

-- Rollback:
-- 1. Re-grant authenticated execution on get_wing_creator_leaderboard if the
--    legacy direct surface must be restored.
-- 2. Drop the three surface RPCs and wing_safe_rejection_category.
-- No user data is created or destroyed by this migration.
