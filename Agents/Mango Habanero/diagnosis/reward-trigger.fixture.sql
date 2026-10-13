\set ON_ERROR_STOP on
-- Isolated fixture only: no production credentials, storage or network.
CREATE ROLE service_role;
CREATE TABLE wing_media_submissions(id uuid primary key, rating_id uuid, user_id uuid, destination_id uuid, status text, approved_at timestamptz, approved_by uuid, featured_at timestamptz, duplicate_group uuid, media_type text, rejection_reason text);
CREATE TABLE destination_ratings(id uuid primary key, user_id uuid, destination_id uuid, is_buffacoin boolean, crawl_id uuid);
CREATE TABLE wing_submission_state_transitions(id uuid primary key default gen_random_uuid(),submission_id uuid,from_status text,to_status text,correlation_id uuid);
CREATE TABLE wing_creator_reward_config(config_key text, enabled boolean,approval_xp integer,featured_xp integer,economy_version text);
INSERT INTO wing_creator_reward_config VALUES('default',true,10,20,'fixture');
CREATE TABLE wing_creator_reward_events(id uuid primary key default gen_random_uuid(),submission_id uuid,rating_id uuid,user_id uuid,event_kind text,amount integer,xp_ledger_id uuid,source_transition_id uuid,idempotency_key text unique,reason text,metadata jsonb,correlation_id uuid,reverses_reward_event_id uuid);
CREATE TABLE social_content_jobs(submission_id uuid,status text,dry_run boolean,external_post_id text,posted_at timestamptz);
CREATE TABLE fixture_xp_calls(id uuid default gen_random_uuid());
CREATE FUNCTION award_xp(p_amount integer,p_source text,p_reason text,p_user_id uuid,p_idempotency_key text,p_destination_id uuid,p_crawl_id uuid,p_metadata jsonb) RETURNS TABLE(ledger_id uuid) LANGUAGE plpgsql AS $$ BEGIN INSERT INTO fixture_xp_calls DEFAULT VALUES RETURNING id INTO ledger_id; RETURN NEXT; END $$;
CREATE FUNCTION wing_sync_creator_badges_internal(uuid,uuid,uuid) RETURNS void LANGUAGE sql AS $$ SELECT $$;
CREATE FUNCTION wing_reverse_creator_rewards_internal(uuid,text,text,uuid) RETURNS void LANGUAGE sql AS $$ SELECT $$;
CREATE TABLE notification_preferences(user_id uuid primary key,creator_updates boolean default true);
CREATE TABLE engagement_feature_flags(flag_key text,enabled boolean);
INSERT INTO engagement_feature_flags VALUES('wing_shot_featured_notifications',true);
CREATE TABLE notification_outbox(id uuid primary key default gen_random_uuid(),user_id uuid,event_type text,source_entity_type text,source_entity_id text,deduplication_key text,eligible_at timestamptz,expires_at timestamptz,deep_link text,fallback_route text,copy_data jsonb,correlation_id uuid,UNIQUE(user_id,event_type,deduplication_key));
CREATE TABLE wing_notification_receipts(user_id uuid,submission_id uuid,event_type text,outbox_id uuid,outcome text,deduplication_key text unique,correlation_id uuid);
CREATE OR REPLACE FUNCTION public.wing_award_creator_reward_internal(p_submission_id uuid, p_reward_kind text, p_transition_id uuid, p_idempotency_key text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_submission public.wing_media_submissions%rowtype;
  v_transition public.wing_submission_state_transitions%rowtype;
  v_rating public.destination_ratings%rowtype;
  v_config public.wing_creator_reward_config%rowtype;
  v_existing uuid;
  v_amount integer;
  v_source text;
  v_event_kind text;
  v_ledger_id uuid;
  v_event_id uuid;
begin
  if p_reward_kind not in ('approval', 'featured') then
    raise exception 'invalid_creator_reward_kind';
  end if;
  if p_idempotency_key is null
     or char_length(p_idempotency_key) not between 8 and 200 then
    raise exception 'invalid_idempotency_key';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('wing-creator-reward:' || p_idempotency_key, 0)
  );

  select id
    into v_existing
    from public.wing_creator_reward_events
   where idempotency_key = p_idempotency_key;
  if found then
    return v_existing;
  end if;

  select *
    into v_submission
    from public.wing_media_submissions
   where id = p_submission_id
   for update;
  if not found then
    raise exception 'wing_submission_not_found';
  end if;

  select *
    into v_transition
    from public.wing_submission_state_transitions
   where id = p_transition_id
     and submission_id = p_submission_id;
  if not found then
    raise exception 'creator_reward_transition_not_found';
  end if;

  select *
    into v_rating
    from public.destination_ratings
   where id = v_submission.rating_id
     and user_id = v_submission.user_id
     and destination_id = v_submission.destination_id
     and is_buffacoin = false;
  if not found then
    raise exception 'creator_reward_rating_ineligible';
  end if;

  if v_submission.duplicate_group is not null then
    raise exception 'creator_reward_duplicate_ineligible';
  end if;

  select *
    into v_config
    from public.wing_creator_reward_config
   where config_key = 'default'
     and enabled;
  if not found then
    raise exception 'creator_rewards_disabled';
  end if;

  if p_reward_kind = 'approval' then
    if v_transition.to_status <> 'approved'
       or v_submission.status <> 'approved'
       or v_submission.approved_at is null
       or v_submission.approved_by is null then
      raise exception 'creator_approval_reward_requires_approved_transition';
    end if;
    v_amount := v_config.approval_xp;
    v_source := 'wing_creator_approval';
    v_event_kind := 'approval_xp';
  else
    if v_transition.to_status <> 'posted'
       or v_submission.status <> 'posted'
       or v_submission.featured_at is null
       or not exists (
         select 1
         from public.social_content_jobs job
         where job.submission_id = v_submission.id
           and job.status = 'posted'
           and not job.dry_run
           and job.external_post_id is not null
           and job.posted_at is not null
       )
       or not exists (
         select 1
         from public.wing_creator_reward_events approval
         where approval.submission_id = v_submission.id
           and approval.event_kind = 'approval_xp'
           and not exists (
             select 1
             from public.wing_creator_reward_events reversal
             where reversal.reverses_reward_event_id = approval.id
           )
       ) then
      raise exception 'creator_feature_reward_requires_real_feature';
    end if;
    v_amount := v_config.featured_xp;
    v_source := 'wing_creator_featured';
    v_event_kind := 'featured_xp';
  end if;

  select award.ledger_id
    into v_ledger_id
    from public.award_xp(
      p_amount := v_amount,
      p_source := v_source,
      p_reason := case
        when p_reward_kind = 'approval' then 'Wing Shot approved'
        else 'Wing Shot featured'
      end,
      p_user_id := v_submission.user_id,
      p_idempotency_key := p_idempotency_key,
      p_destination_id := v_submission.destination_id,
      p_crawl_id := v_rating.crawl_id,
      p_metadata := jsonb_build_object(
        'submission_id', v_submission.id,
        'rating_id', v_submission.rating_id,
        'reward_kind', p_reward_kind,
        'economy_version', v_config.economy_version,
        'transition_id', v_transition.id
      )
    ) award
   limit 1;

  if v_ledger_id is null then
    raise exception 'creator_reward_ledger_missing';
  end if;

  insert into public.wing_creator_reward_events (
    submission_id, rating_id, user_id, event_kind, amount, xp_ledger_id,
    source_transition_id, idempotency_key, reason, metadata, correlation_id
  ) values (
    v_submission.id, v_submission.rating_id, v_submission.user_id,
    v_event_kind, v_amount, v_ledger_id, v_transition.id,
    p_idempotency_key,
    case
      when p_reward_kind = 'approval' then 'Approved Wing Shot Creator XP'
      else 'Featured Wing Shot Creator XP'
    end,
    jsonb_build_object(
      'economy_version', v_config.economy_version,
      'media_type', v_submission.media_type
    ),
    v_transition.correlation_id
  )
  returning id into v_event_id;

  perform public.wing_sync_creator_badges_internal(
    v_submission.user_id,
    v_submission.id,
    v_transition.correlation_id
  );

  return v_event_id;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.wing_creator_reward_on_transition()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
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
      'body', 'Your Wing Shot was approved and earned Creator XP.',
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
CREATE TRIGGER fixture_reward AFTER INSERT ON wing_submission_state_transitions FOR EACH ROW EXECUTE FUNCTION wing_creator_reward_on_transition();
CREATE TRIGGER fixture_notification AFTER INSERT ON wing_submission_state_transitions FOR EACH ROW EXECUTE FUNCTION enqueue_wing_submission_notification();
INSERT INTO destination_ratings VALUES
('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',true,null),
('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001',false,null);
INSERT INTO wing_media_submissions(id,rating_id,user_id,destination_id,status,media_type)
SELECT ('40000000-0000-4000-8000-00000000000'||n)::uuid,('10000000-0000-4000-8000-00000000000'||n)::uuid,('20000000-0000-4000-8000-00000000000'||n)::uuid,'30000000-0000-4000-8000-000000000001','in_review','photo' FROM generate_series(1,2) n;
CREATE FUNCTION fixture_approve(target uuid) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
-- Models Mango's preflight reconciliation; retries never repeat the transition.
IF (SELECT status FROM wing_media_submissions WHERE id=target)='approved' THEN RETURN; END IF;
UPDATE wing_media_submissions SET status='approved',approved_at=now(),approved_by='50000000-0000-4000-8000-000000000001' WHERE id=target;
INSERT INTO wing_submission_state_transitions(submission_id,from_status,to_status,correlation_id) VALUES(target,'in_review','approved',gen_random_uuid());
END $$;
DO $$ BEGIN
  BEGIN
    PERFORM fixture_approve('40000000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'expected original reward failure';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'creator_reward_rating_ineligible' THEN RAISE; END IF;
  END;
  IF (SELECT status FROM wing_media_submissions WHERE id='40000000-0000-4000-8000-000000000001') <> 'in_review' OR EXISTS(SELECT 1 FROM wing_submission_state_transitions) OR EXISTS(SELECT 1 FROM fixture_xp_calls) THEN RAISE EXCEPTION 'rollback failed'; END IF;
END $$;
\echo Original failure and atomic rollback reproduced.
\i /tmp/buffacoin-approval.proposal.sql
SELECT fixture_approve('40000000-0000-4000-8000-000000000001');
SELECT fixture_approve('40000000-0000-4000-8000-000000000001');
DO $$ BEGIN
IF (SELECT status FROM wing_media_submissions WHERE id='40000000-0000-4000-8000-000000000001') <> 'approved' OR EXISTS(SELECT 1 FROM fixture_xp_calls) OR EXISTS(SELECT 1 FROM wing_creator_reward_events) OR (SELECT count(*) FROM wing_submission_state_transitions)<>1 THEN RAISE EXCEPTION 'Buffacoin approval/retry failed'; END IF;
IF (SELECT copy_data->>'body' FROM notification_outbox LIMIT 1) <> 'Your Wing Shot was approved.' THEN RAISE EXCEPTION 'misleading reward notification'; END IF;
END $$;
SELECT fixture_approve('40000000-0000-4000-8000-000000000002');
SELECT fixture_approve('40000000-0000-4000-8000-000000000002');
DO $$ BEGIN
IF (SELECT count(*) FROM fixture_xp_calls)<>1 OR (SELECT count(*) FROM wing_creator_reward_events)<>1 OR (SELECT count(*) FROM wing_submission_state_transitions)<>2 THEN RAISE EXCEPTION 'ordinary rewards/retry failed'; END IF;
IF NOT EXISTS(SELECT 1 FROM notification_outbox WHERE copy_data->>'body'='Your Wing Shot was approved and earned Creator XP.') THEN RAISE EXCEPTION 'ordinary notification changed'; END IF;
END $$;
-- Buffacoin featuring must also skip XP; otherwise approval fix only moves failure.
UPDATE wing_media_submissions SET status='posted',featured_at=now() WHERE id='40000000-0000-4000-8000-000000000001';
INSERT INTO wing_submission_state_transitions(submission_id,from_status,to_status,correlation_id) VALUES('40000000-0000-4000-8000-000000000001','posting','posted',gen_random_uuid());
DO $$ BEGIN IF (SELECT count(*) FROM fixture_xp_calls)<>1 THEN RAISE EXCEPTION 'Buffacoin featured XP awarded'; END IF; END $$;
\echo Proposed Buffacoin approval/feature, ordinary XP and retry assertions passed.
\i /tmp/buffacoin-approval.rollback.sql
\echo Rollback definitions restored successfully.

