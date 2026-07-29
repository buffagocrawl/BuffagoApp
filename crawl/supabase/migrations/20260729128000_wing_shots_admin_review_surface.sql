-- Wing Shots internal moderation read boundary and reviewer action contract.
-- The mobile admin surface receives only purpose-limited review data. Original
-- object paths, signed URLs, raw model payloads, and model identity are never
-- returned by these RPCs.

begin;

create or replace function public.wing_moderation_queue_enabled_for_user()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce((
    select flags.enabled_for_user
    from public.get_wing_shots_feature_flags() flags
    where flags.flag_key = 'wing_shot_moderation_queue'
  ), false);
$$;

create or replace function public.get_wing_admin_queue(p_limit integer default 50)
returns setof jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if not (
    public.wing_has_app_role('wing_reviewer')
    or public.wing_has_app_role('wing_admin')
  ) then
    raise exception 'wing_reviewer_role_required' using errcode = '42501';
  end if;
  if not public.wing_moderation_queue_enabled_for_user() then
    raise exception 'wing_moderation_queue_disabled' using errcode = '42501';
  end if;

  return query
  select jsonb_build_object(
    'submission_id', submission.id,
    'media_type', submission.media_type,
    'status', submission.status,
    'created_at', submission.created_at,
    'upload_age_seconds', extract(epoch from now() - submission.created_at)::bigint,
    'moderation_status', submission.moderation_status,
    'wing_verification_status', submission.wing_verification_status,
    'wing_confidence', submission.wing_confidence,
    'quality_score', submission.quality_score,
    'content_score', submission.content_score,
    'priority', submission.priority,
    'consent', jsonb_build_object(
      'version', submission.consent_version,
      'consented_at', submission.consented_at,
      'attribution_preference', submission.attribution_preference
    ),
    'contributor', jsonb_build_object(
      'user_id', submission.user_id,
      'username', app_user.username,
      'prior_features', (
        select count(*)
        from public.wing_media_submissions prior_submission
        where prior_submission.user_id = submission.user_id
          and prior_submission.featured_at is not null
      )
    ),
    'restaurant', jsonb_build_object(
      'destination_id', destination.id,
      'name', destination.name,
      'city', destination.city,
      'state_id', destination.state_id,
      'state_code', restaurant_state.state_code,
      'state_name', restaurant_state.state_name,
      'recent_features', (
        select count(*)
        from public.wing_media_submissions prior_submission
        where prior_submission.destination_id = submission.destination_id
          and prior_submission.featured_at > now() - interval '30 days'
      )
    ),
    'rating', jsonb_build_object(
      'rating_id', rating.id,
      'crispiness', rating.crispiness,
      'sauce', rating.sauce,
      'meat', rating.meat,
      'overall', rating.overall,
      'weighted_score', rating.weight_score,
      'wings_eaten', rating.wings_eaten,
      'sauce_style', rating.sauce_style,
      'spice_level', rating.spice_level,
      'would_order_again', rating.would_order_again,
      'flavor_vibe', to_jsonb(rating.flavor_vibe),
      'rated_at', rating.created_at
    ),
    'moderation_summary', (
      select jsonb_build_object(
        'recommendation', decision.recommendation,
        'explanation', nullif(left(
          regexp_replace(coalesce(decision.explanation, ''), '[[:space:]]+', ' ', 'g'),
          600
        ), ''),
        'flags', to_jsonb(array_remove(array[
          case when decision.nudity_or_sexual_content then 'sexual_content' end,
          case when decision.graphic_content then 'graphic_content' end,
          case when decision.weapons then 'weapons' end,
          case when decision.hate_symbols then 'hate_symbols' end,
          case when decision.illegal_activity then 'illegal_activity' end,
          case when decision.intoxication_concern then 'intoxication_concern' end,
          case when decision.minors_visible then 'minors_visible' end,
          case when decision.personal_information_visible then 'personal_information_visible' end,
          case when decision.faces_visible then 'faces_visible' end,
          case when decision.alcohol_dominant then 'alcohol_dominant' end,
          case when decision.offensive_text then 'offensive_text' end
        ]::text[], null)),
        'spam_risk', case
          when decision.spam_probability is null then null
          when decision.spam_probability >= 0.70 then 'high'
          when decision.spam_probability >= 0.35 then 'medium'
          else 'low'
        end,
        'duplicate_risk', case
          when decision.duplicate_probability is null then null
          when decision.duplicate_probability >= 0.85 then 'high'
          when decision.duplicate_probability >= 0.50 then 'medium'
          else 'low'
        end,
        'evaluated_at', decision.evaluated_at
      )
      from public.wing_moderation_decisions decision
      where decision.submission_id = submission.id
      order by decision.evaluated_at desc, decision.id desc
      limit 1
    ),
    'processing', coalesce((
      select jsonb_agg(jsonb_build_object(
        'kind', processing_job.job_kind,
        'status', processing_job.status,
        'attempt_count', processing_job.attempt_count,
        'max_attempts', processing_job.max_attempts,
        'last_error_code', processing_job.last_error_code,
        'updated_at', processing_job.updated_at
      ) order by processing_job.created_at desc)
      from (
        select distinct on (job.job_kind)
          job.job_kind, job.status, job.attempt_count, job.max_attempts,
          job.last_error_code, job.updated_at, job.created_at
        from public.wing_processing_jobs job
        where job.submission_id = submission.id
        order by job.job_kind, job.generation desc, job.created_at desc
      ) processing_job
    ), '[]'::jsonb),
    'duplicate_signals', coalesce((
      select jsonb_agg(jsonb_build_object(
        'type', signal.signal_type,
        'severity', signal.severity,
        'similarity', signal.score,
        'created_at', signal.created_at
      ) order by signal.created_at desc)
      from (
        select abuse.signal_type, abuse.severity, abuse.score, abuse.created_at
        from public.wing_submission_abuse_signals abuse
        where abuse.submission_id = submission.id
        order by abuse.created_at desc
        limit 10
      ) signal
    ), '[]'::jsonb),
    'status_history', coalesce((
      select jsonb_agg(jsonb_build_object(
        'from', transition.from_status,
        'to', transition.to_status,
        'actor_type', transition.actor_type,
        'source', transition.trigger_source,
        'occurred_at', transition.occurred_at
      ) order by transition.occurred_at desc, transition.id desc)
      from (
        select history.id, history.from_status, history.to_status,
          history.actor_type, history.trigger_source, history.occurred_at
        from public.wing_submission_state_transitions history
        where history.submission_id = submission.id
        order by history.occurred_at desc, history.id desc
        limit 20
      ) transition
    ), '[]'::jsonb),
    'generated_posts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'platform', post.platform,
        'status', post.status,
        'caption', post.generated_caption,
        'alt_text', post.generated_alt_text,
        'human_approved', post.human_approved_at is not null
      ) order by post.created_at desc)
      from (
        select job.platform, job.status, job.generated_caption,
          job.generated_alt_text, job.human_approved_at, job.created_at
        from public.social_content_jobs job
        where job.submission_id = submission.id
        order by job.created_at desc
        limit 4
      ) post
    ), '[]'::jsonb)
  )
  from public.wing_media_submissions submission
  join public.destination_ratings rating on rating.id = submission.rating_id
  join public.destinations destination on destination.id = submission.destination_id
  left join public.states restaurant_state on restaurant_state.state_id = destination.state_id
  left join public.users app_user on app_user.user_id = submission.user_id
  where submission.status = 'in_review'
  order by submission.priority desc, submission.created_at, submission.id
  limit greatest(1, least(coalesce(p_limit, 50), 100));
end;
$$;

create or replace function public.review_wing_submission_v2(
  p_submission_id uuid,
  p_action text,
  p_reason_category text,
  p_notes text,
  p_idempotency_key text,
  p_correlation_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_action_id uuid;
begin
  if v_actor is null or not (
    public.wing_has_app_role('wing_reviewer')
    or public.wing_has_app_role('wing_admin')
  ) then
    raise exception 'wing_reviewer_role_required' using errcode = '42501';
  end if;
  if not public.wing_moderation_queue_enabled_for_user() then
    raise exception 'wing_moderation_queue_disabled' using errcode = '42501';
  end if;
  if nullif(trim(p_notes), '') is null
     or char_length(trim(p_notes)) not between 8 and 1000 then
    raise exception 'review_notes_required';
  end if;
  if nullif(trim(p_reason_category), '') is null then
    raise exception 'review_reason_required';
  end if;
  if not (
    (p_action = 'approve' and p_reason_category in (
      'standard_acceptable', 'documented_override'
    ))
    or (p_action = 'reject' and p_reason_category in (
      'not_wings', 'unsafe_content', 'privacy_concern', 'duplicate',
      'spam_abuse', 'rights_concern', 'quality_unusable', 'other_policy'
    ))
    or (p_action = 'retry_processing' and p_reason_category = 'processing_retry')
    or (p_action = 'prioritize' and p_reason_category = 'editorial_priority')
    or (p_action = 'remove_priority' and p_reason_category = 'editorial_priority_removed')
    or (p_action = 'withdraw_from_queue' and p_reason_category = 'queue_removal')
    or (p_action = 'mark_abuse' and p_reason_category in (
      'spam_abuse', 'duplicate_abuse', 'policy_abuse'
    ))
  ) then
    raise exception 'invalid_review_reason_for_action';
  end if;

  v_action_id := public.review_wing_submission(
    p_submission_id,
    p_action,
    p_reason_category,
    trim(p_notes),
    p_idempotency_key,
    p_correlation_id
  );

  if p_action in ('approve', 'reject') then
    insert into public.wing_moderation_decisions (
      submission_id,
      decision_source,
      recommendation,
      explanation,
      reviewer_id,
      override_reason,
      raw_result,
      idempotency_key,
      correlation_id
    ) values (
      p_submission_id,
      'human',
      case when p_action = 'approve' then 'accept' else 'reject' end,
      left(trim(p_notes), 1000),
      v_actor,
      case when p_reason_category = 'documented_override' then trim(p_notes) else null end,
      '{}'::jsonb,
      'human-review:' || p_idempotency_key,
      p_correlation_id
    )
    on conflict (idempotency_key) do nothing;

    update public.wing_media_submissions
    set reviewer_notes = trim(p_notes),
        moderation_status = case
          when p_reason_category = 'documented_override' then 'overridden'
          else moderation_status
        end,
        wing_verification_status = case
          when p_reason_category = 'documented_override' then 'overridden'
          else wing_verification_status
        end,
        updated_at = now()
    where id = p_submission_id;
  end if;

  return v_action_id;
end;
$$;

create or replace function public.claim_wing_media_access_request_for_user(
  p_request_id uuid,
  p_requester_id uuid
)
returns table (
  request_id uuid,
  bucket_id text,
  object_path text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_request public.wing_media_access_requests%rowtype;
begin
  if p_request_id is null or p_requester_id is null then
    return;
  end if;
  if not exists (
    select 1
    from public.app_user_roles role_assignment
    where role_assignment.user_id = p_requester_id
      and role_assignment.role in ('wing_reviewer', 'wing_admin')
      and role_assignment.active
      and role_assignment.revoked_at is null
  ) or not exists (
    select 1
    from public.engagement_feature_flags feature_flag
    where feature_flag.flag_key = 'wing_shot_moderation_queue'
      and feature_flag.enabled
      and (
        feature_flag.rollout_percent = 100
        or mod(
          mod(hashtextextended(
            p_requester_id::text || ':' || feature_flag.flag_key,
            0
          ), 100) + 100,
          100
        ) < feature_flag.rollout_percent
      )
  ) then
    return;
  end if;

  select *
  into v_request
  from public.wing_media_access_requests access_request
  where access_request.id = p_request_id
    and access_request.requester_id = p_requester_id
    and access_request.purpose = 'admin_review'
    and access_request.variant in ('processed', 'thumbnail', 'publication')
  for update skip locked;

  if not found
     or v_request.status <> 'pending'
     or v_request.expires_at <= now() then
    return;
  end if;

  update public.wing_media_access_requests
  set status = 'consumed', consumed_at = now()
  where id = v_request.id;

  return query
  select
    v_request.id,
    'wing-submissions'::text,
    v_request.requested_path,
    v_request.expires_at;
end;
$$;

revoke all on function public.wing_moderation_queue_enabled_for_user()
  from public, anon, authenticated;
revoke all on function public.get_wing_admin_queue(integer)
  from public, anon, authenticated;
revoke all on function public.review_wing_submission(
  uuid, text, text, text, text, uuid
) from authenticated;
revoke all on function public.review_wing_submission_v2(
  uuid, text, text, text, text, uuid
) from public, anon, authenticated;
revoke all on function public.claim_wing_media_access_request_for_user(uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.wing_moderation_queue_enabled_for_user()
  to authenticated, service_role;
grant execute on function public.get_wing_admin_queue(integer)
  to authenticated, service_role;
grant execute on function public.review_wing_submission_v2(
  uuid, text, text, text, text, uuid
) to authenticated;
grant execute on function public.claim_wing_media_access_request_for_user(uuid, uuid)
  to service_role;

comment on function public.get_wing_admin_queue(integer) is
  'Role- and flag-gated sanitized Wing Shots moderation queue. Never returns storage paths, URLs, or raw classifier payloads.';
comment on function public.review_wing_submission_v2(uuid, text, text, text, text, uuid) is
  'Server-authoritative reviewer action allowlist with mandatory notes, audit receipts, and recorded human overrides.';
comment on function public.claim_wing_media_access_request_for_user(uuid, uuid) is
  'Service-only single-use claim bound to the authenticated requester and admin_review purpose.';

commit;

-- Rollback: disable wing_shot_moderation_queue, revoke V2 RPC execution, and
-- deploy a forward fix. Keep reviewer decisions, state transitions, and admin
-- action receipts as immutable audit evidence.
