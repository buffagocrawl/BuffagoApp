-- Wing Shots in-app/push-compatible notification events.
-- Publication and progression transactions never depend on provider delivery.

begin;

alter table public.notification_preferences
  add column if not exists creator_updates boolean not null default true;

alter table public.notification_outbox
  drop constraint if exists notification_outbox_event_type_check;
alter table public.notification_outbox
  add constraint notification_outbox_event_type_check check (event_type in (
    'streak_at_risk', 'streak_comeback', 'friend_rating', 'crawl_proximity',
    'wing_shot_approved', 'wing_shot_rejected', 'wing_shot_featured',
    'creator_badge_earned'
  ));

create table if not exists public.wing_notification_receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  owner_pseudonym_id uuid not null default gen_random_uuid(),
  owner_deleted_at timestamptz,
  submission_id uuid references public.wing_media_submissions(id) on delete restrict,
  badge_event_id uuid references public.wing_creator_badge_events(id) on delete restrict,
  event_type text not null check (event_type in (
    'wing_shot_approved', 'wing_shot_rejected', 'wing_shot_featured',
    'creator_badge_earned'
  )),
  outbox_id uuid references public.notification_outbox(id) on delete set null,
  outcome text not null check (outcome in ('queued', 'preference_disabled', 'flag_disabled')),
  deduplication_key text not null unique,
  correlation_id uuid not null,
  created_at timestamptz not null default now(),
  constraint wing_notification_receipt_target_shape check (
    (event_type = 'creator_badge_earned' and badge_event_id is not null)
    or (event_type <> 'creator_badge_earned' and submission_id is not null)
  ),
  constraint wing_notification_receipt_owner_deletion_shape check (
    (user_id is not null and owner_deleted_at is null)
    or (user_id is null and owner_deleted_at is not null)
  )
);

create or replace function public.wing_notification_receipt_append_only()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'UPDATE'
     and old.user_id is not null
     and new.user_id is null
     and new.owner_deleted_at is not null
     and new.owner_pseudonym_id is not null
     and (
       to_jsonb(new) - array['user_id', 'owner_pseudonym_id', 'owner_deleted_at']
     ) = (
       to_jsonb(old) - array['user_id', 'owner_pseudonym_id', 'owner_deleted_at']
     ) then
    return new;
  end if;
  raise exception 'wing_notification_receipt_is_append_only';
end;
$$;

drop trigger if exists wing_notification_receipts_append_only
  on public.wing_notification_receipts;
create trigger wing_notification_receipts_append_only
before update or delete on public.wing_notification_receipts
for each row execute function public.wing_notification_receipt_append_only();

create or replace function public.enqueue_wing_submission_notification()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
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
      'body', 'Your Wing Shot was approved and earned Creator Reputation.',
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
$$;

drop trigger if exists wing_submission_notification_transition
  on public.wing_submission_state_transitions;
create trigger wing_submission_notification_transition
after insert on public.wing_submission_state_transitions
for each row execute function public.enqueue_wing_submission_notification();

create or replace function public.enqueue_wing_creator_badge_notification()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_key text := 'creator_badge_earned:' || new.id::text;
  v_outbox_id uuid;
  v_outcome text;
  v_flag_enabled boolean;
  v_preference_enabled boolean;
begin
  if new.event_kind <> 'awarded' or new.user_id is null then
    return new;
  end if;
  insert into public.notification_preferences (user_id)
  values (new.user_id)
  on conflict (user_id) do nothing;
  select enabled into v_flag_enabled
    from public.engagement_feature_flags
   where flag_key = 'wing_shot_featured_notifications';
  select creator_updates into v_preference_enabled
    from public.notification_preferences where user_id = new.user_id;

  if coalesce(v_flag_enabled, false) and coalesce(v_preference_enabled, true) then
    insert into public.notification_outbox (
      user_id, event_type, source_entity_type, source_entity_id,
      deduplication_key, eligible_at, expires_at, deep_link,
      fallback_route, copy_data, correlation_id
    ) values (
      new.user_id, 'creator_badge_earned', 'wing_creator_badge_event',
      new.id::text, v_key, now(), now() + interval '7 days',
      'buffago://wing-shots/badges',
      '/wing-shots/history',
      jsonb_build_object(
        'title', 'Creator badge earned',
        'body', 'You earned the ' || new.badge_code || ' badge.',
        'badge_code', new.badge_code
      ),
      new.correlation_id
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
    user_id, badge_event_id, event_type, outbox_id, outcome,
    deduplication_key, correlation_id
  ) values (
    new.user_id, new.id, 'creator_badge_earned', v_outbox_id, v_outcome,
    v_key, new.correlation_id
  )
  on conflict (deduplication_key) do nothing;
  return new;
end;
$$;

drop trigger if exists wing_creator_badge_notification
  on public.wing_creator_badge_events;
create trigger wing_creator_badge_notification
after insert on public.wing_creator_badge_events
for each row execute function public.enqueue_wing_creator_badge_notification();

create or replace function public.notification_delivery_eligibility(p_outbox_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_event public.notification_outbox%rowtype;
  v_pref public.notification_preferences%rowtype;
  v_local_time time;
  v_enabled boolean := false;
  v_valid boolean := true;
  v_actor uuid;
begin
  select * into v_event from public.notification_outbox where id = p_outbox_id;
  if not found or v_event.status not in ('queued','retry','processing') then
    return jsonb_build_object('eligible',false,'reason','event_unavailable');
  end if;
  select * into v_pref from public.notification_preferences where user_id = v_event.user_id;
  if not found then return jsonb_build_object('eligible',false,'reason','preference_missing'); end if;
  v_enabled := case v_event.event_type
    when 'streak_at_risk' then v_pref.streak_at_risk
    when 'streak_comeback' then v_pref.comeback
    when 'friend_rating' then v_pref.friend_activity
    when 'crawl_proximity' then v_pref.crawl_proximity
    when 'wing_shot_approved' then v_pref.creator_updates
    when 'wing_shot_rejected' then v_pref.creator_updates
    when 'wing_shot_featured' then v_pref.creator_updates
    when 'creator_badge_earned' then v_pref.creator_updates
    else false end;
  if not v_enabled then return jsonb_build_object('eligible',false,'reason','category_disabled'); end if;

  v_local_time := (now() at time zone public.engagement_safe_timezone(v_pref.timezone))::time;
  if v_pref.quiet_hours_enabled and (
    (v_pref.quiet_start < v_pref.quiet_end and v_local_time >= v_pref.quiet_start and v_local_time < v_pref.quiet_end)
    or (v_pref.quiet_start >= v_pref.quiet_end and (v_local_time >= v_pref.quiet_start or v_local_time < v_pref.quiet_end))
  ) then return jsonb_build_object('eligible',false,'reason','quiet_hours'); end if;

  if v_event.event_type = 'streak_at_risk' then
    v_valid := exists(
      select 1 from public.user_engagement_streaks s
      where s.user_id = v_event.user_id and s.current_streak >= 2
        and s.last_qualified_date < (now() at time zone v_pref.timezone)::date
    );
  elsif v_event.event_type = 'friend_rating' then
    select dr.user_id into v_actor from public.destination_ratings dr
      where dr.id::text = v_event.source_entity_id;
    v_valid := v_actor is not null
      and public.can_user_appear_socially(v_actor)
      and exists(select 1 from public.friendships f
        where f.status = 'accepted'
          and least(f.requester_id,f.addressee_id) = least(v_actor,v_event.user_id)
          and greatest(f.requester_id,f.addressee_id) = greatest(v_actor,v_event.user_id))
      and not public.friend_pair_is_blocked(v_actor,v_event.user_id);
  elsif v_event.event_type = 'crawl_proximity' then
    v_valid := exists(select 1 from public.crawls c
      where c.crawl_id::text = v_event.source_entity_id and c.user_id = v_event.user_id
        and c.status not in ('completed','abandoned','cancelled'));
  elsif v_event.event_type in (
    'wing_shot_approved', 'wing_shot_rejected', 'wing_shot_featured'
  ) then
    v_valid := exists(
      select 1
      from public.wing_media_submissions submission
      where submission.id::text = v_event.source_entity_id
        and submission.user_id = v_event.user_id
        and (
          (v_event.event_type = 'wing_shot_approved'
            and submission.approved_at is not null
            and submission.status not in ('rejected', 'withdrawn'))
          or (v_event.event_type = 'wing_shot_rejected'
            and submission.status = 'rejected')
          or (v_event.event_type = 'wing_shot_featured'
            and submission.status = 'posted'
            and submission.featured_at is not null)
        )
    );
  elsif v_event.event_type = 'creator_badge_earned' then
    v_valid := exists(
      select 1
      from public.wing_creator_badge_events badge_event
      where badge_event.id::text = v_event.source_entity_id
        and badge_event.user_id = v_event.user_id
        and badge_event.event_kind = 'awarded'
        and not exists (
          select 1 from public.wing_creator_badge_events reversal
          where reversal.reverses_badge_event_id = badge_event.id
        )
    );
  end if;
  return jsonb_build_object(
    'eligible', v_valid,
    'reason', case when v_valid then 'eligible' else 'source_ineligible' end
  );
end;
$$;

alter table public.wing_notification_receipts enable row level security;
revoke all on public.wing_notification_receipts from public, anon, authenticated;
grant select, insert on public.wing_notification_receipts to service_role;
revoke all on function public.wing_notification_receipt_append_only()
  from public, anon, authenticated;
revoke all on function public.enqueue_wing_submission_notification()
  from public, anon, authenticated;
revoke all on function public.enqueue_wing_creator_badge_notification()
  from public, anon, authenticated;
revoke all on function public.notification_delivery_eligibility(uuid)
  from public, anon, authenticated;
grant execute on function public.notification_delivery_eligibility(uuid)
  to service_role;

comment on table public.wing_notification_receipts is
  'Append-only queue/suppression receipts. Provider attempts remain independent in notification_delivery_attempts.';

commit;

-- Rollback: disable wing_shot_featured_notifications first, remove the two Wing
-- triggers, and forward-fix delivery eligibility. Preserve outbox, attempts, and
-- Wing notification receipts for audit.
