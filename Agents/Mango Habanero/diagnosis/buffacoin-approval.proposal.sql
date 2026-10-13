-- REVIEW PROPOSAL ONLY. Not a migration. Do not apply during diagnosis.
-- Preserve existing creator XP exclusion for Buffacoin, all moderation guards,
-- reviewer authorization, reward idempotency, reversal logic, and function ACLs.
BEGIN;
CREATE OR REPLACE FUNCTION public.wing_creator_reward_on_transition()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
  -- Buffacoin ratings are valid media, but excluded from creator XP.
  -- Match ownership/destination first; malformed ratings still fail closed.
  if new.to_status in ('approved', 'posted') and exists (
    select 1 from public.wing_media_submissions s
    join public.destination_ratings r on r.id = s.rating_id
      and r.user_id = s.user_id and r.destination_id = s.destination_id
    where s.id = new.submission_id and r.is_buffacoin = true
  ) then
    return new;
  end if;
  if new.to_status = 'approved' then
    perform public.wing_award_creator_reward_internal(
      new.submission_id,
      'approval',
      new.id,
      'wing-creator-approval:' || new.submission_id::text
    );
  elsif new.to_status = 'posted' then
    perform public.wing_award_creator_reward_internal(
      new.submission_id,
      'featured',
      new.id,
      'wing-creator-featured:' || new.submission_id::text
    );
  elsif new.to_status = 'withdrawn' then
    perform public.wing_reverse_creator_rewards_internal(
      new.submission_id,
      'Submission withdrawn before publication',
      'wing-auto-withdraw:' || new.id::text,
      new.id
    );
  elsif new.to_status = 'failed' and new.from_status = 'approved' then
    perform public.wing_reverse_creator_rewards_internal(
      new.submission_id,
      'Approved Wing Shot failed mandatory media preparation',
      'wing-auto-processing-failure:' || new.id::text,
      new.id
    );
  end if;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.enqueue_wing_submission_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_submission public.wing_media_submissions%rowtype;
  v_event_type text;
  v_key text;
  v_copy jsonb;
  v_outbox_id uuid;
  v_outcome text;
  v_flag_enabled boolean;
  v_preference_enabled boolean;
begin
  v_event_type := case new.to_status
    when 'approved' then 'wing_shot_approved'
    when 'rejected' then 'wing_shot_rejected'
    when 'posted' then 'wing_shot_featured'
    else null
  end;
  if v_event_type is null then
    return new;
  end if;

  select *
    into v_submission
    from public.wing_media_submissions
   where id = new.submission_id;
  if not found or v_submission.user_id is null then
    return new;
  end if;

  insert into public.notification_preferences (user_id)
  values (v_submission.user_id)
  on conflict (user_id) do nothing;

  select enabled
    into v_flag_enabled
    from public.engagement_feature_flags
   where flag_key = 'wing_shot_featured_notifications';
  select creator_updates
    into v_preference_enabled
    from public.notification_preferences
   where user_id = v_submission.user_id;

  v_key := v_event_type || ':' || v_submission.id::text;
  v_copy := case v_event_type
    when 'wing_shot_approved' then jsonb_build_object(
      'title', 'Wing Shot approved',
      'body', case when exists (
        select 1 from public.destination_ratings r
        where r.id = v_submission.rating_id
          and r.user_id = v_submission.user_id
          and r.destination_id = v_submission.destination_id
          and r.is_buffacoin = true
      ) then 'Your Wing Shot was approved.'
      else 'Your Wing Shot was approved and earned Creator XP.' end,
      'submission_id', v_submission.id
    )
    when 'wing_shot_rejected' then jsonb_build_object(
      'title', 'Wing Shot update',
      'body', 'Your Wing Shot was not approved. Open your history for the next step.',
      'submission_id', v_submission.id,
      'rejection_category', v_submission.rejection_reason
    )
    else jsonb_build_object(
      'title', '🌶️ You''re featured on BuffaGo today!',
      'body', 'Your Wing Shot is live. Open it from your featured history.',
      'submission_id', v_submission.id
    )
  end;

  if coalesce(v_flag_enabled, false) and coalesce(v_preference_enabled, true) then
    insert into public.notification_outbox (
      user_id, event_type, source_entity_type, source_entity_id,
      deduplication_key, eligible_at, expires_at, deep_link,
      fallback_route, copy_data, correlation_id
    ) values (
      v_submission.user_id, v_event_type, 'wing_media_submission',
      v_submission.id::text, v_key, now(), now() + interval '7 days',
      'buffago://wing-shots/' || v_submission.id::text,
      '/wing-shots/' || v_submission.id::text,
      v_copy, new.correlation_id
    )
    on conflict (user_id, event_type, deduplication_key) do update
      set deduplication_key = excluded.deduplication_key
    returning id into v_outbox_id;
    v_outcome := 'queued';
  else
    v_outcome := case
      when not coalesce(v_flag_enabled, false) then 'flag_disabled'
      else 'preference_disabled'
    end;
  end if;

  insert into public.wing_notification_receipts (
    user_id, submission_id, event_type, outbox_id, outcome,
    deduplication_key, correlation_id
  ) values (
    v_submission.user_id, v_submission.id, v_event_type, v_outbox_id,
    v_outcome, v_key, new.correlation_id
  )
  on conflict (deduplication_key) do nothing;

  return new;
end;
$function$
;
COMMIT;

