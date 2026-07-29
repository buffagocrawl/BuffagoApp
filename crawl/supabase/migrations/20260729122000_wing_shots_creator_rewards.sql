-- Wing Shots Creator progression.
-- Rewards are derived only from server-authoritative submission transitions.
-- This migration also removes direct authenticated access to the generic XP
-- primitive while preserving the one repository client that still uses xp_add:
-- the verified Facebook identity-link reward.

begin;

do $$
begin
  if to_regprocedure(
    'public.award_xp(integer,text,text,uuid,text,uuid,uuid,uuid,bigint,bigint,uuid,uuid,jsonb)'
  ) is null then
    raise exception 'wing_creator_rewards_missing_authoritative_award_xp';
  end if;
  if to_regprocedure('public.xp_add(integer,text,uuid)') is null then
    raise exception 'wing_creator_rewards_missing_legacy_xp_add';
  end if;
  if to_regclass('auth.identities') is null then
    raise exception 'wing_creator_rewards_missing_auth_identities';
  end if;
  if to_regclass('public.wing_media_submissions') is null
     or to_regclass('public.wing_submission_state_transitions') is null
     or to_regclass('public.social_content_jobs') is null then
    raise exception 'wing_creator_rewards_missing_wing_shots_core';
  end if;
end $$;

-- award_xp is an internal accounting primitive. Existing server-authoritative
-- SECURITY DEFINER functions continue to call it as their owner, but clients may
-- no longer select arbitrary amounts, sources, or idempotency keys.
revoke all on function public.award_xp(
  integer, text, text, uuid, text, uuid, uuid, uuid,
  bigint, bigint, uuid, uuid, jsonb
) from public, anon, authenticated;
grant execute on function public.award_xp(
  integer, text, text, uuid, text, uuid, uuid, uuid,
  bigint, bigint, uuid, uuid, jsonb
) to service_role;

-- Compatibility-safe legacy boundary. Repository discovery found one caller:
-- lib/socialAccounts.js grants exactly 50 XP after a Facebook identity link.
-- Preserve that contract while rejecting every arbitrary XP request.
create or replace function public.xp_add(
  amount integer,
  reason text,
  user_id uuid default auth.uid()
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_actor uuid := auth.uid();
  v_result jsonb;
begin
  if v_actor is null or user_id is null or user_id <> v_actor then
    raise exception 'xp_add_self_only';
  end if;
  if amount <> 50 or reason <> 'link_facebook' then
    raise exception 'xp_add_legacy_contract_rejected';
  end if;
  if not exists (
    select 1
    from auth.identities identity
    where identity.user_id = v_actor
      and identity.provider = 'facebook'
  ) then
    raise exception 'facebook_identity_required';
  end if;

  select to_jsonb(result)
    into v_result
    from public.award_xp(
      p_amount := 50,
      p_source := 'link_facebook',
      p_reason := 'link_facebook',
      p_user_id := v_actor,
      p_metadata := jsonb_build_object(
        'legacy_rpc', 'xp_add',
        'verified_identity_provider', 'facebook'
      )
    ) result
   limit 1;

  return v_result;
end;
$$;

revoke all on function public.xp_add(integer, text, uuid)
from public, anon, authenticated;
grant execute on function public.xp_add(integer, text, uuid) to authenticated;

create table if not exists public.wing_creator_reward_config (
  config_key text primary key
    check (config_key ~ '^[a-z0-9_]+$'),
  approval_xp integer not null check (approval_xp between 1 and 500),
  featured_xp integer not null check (featured_xp between 1 and 500),
  enabled boolean not null default true,
  economy_version text not null
    check (char_length(economy_version) between 1 and 40),
  updated_at timestamptz not null default now()
);

insert into public.wing_creator_reward_config (
  config_key, approval_xp, featured_xp, enabled, economy_version
) values (
  'default', 35, 100, true, 'creator-v1'
)
on conflict (config_key) do nothing;

create table if not exists public.wing_creator_reward_events (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null
    references public.wing_media_submissions(id) on delete restrict,
  rating_id uuid not null
    references public.destination_ratings(id) on delete restrict,
  user_id uuid references auth.users(id) on delete set null,
  owner_pseudonym_id uuid not null default gen_random_uuid(),
  owner_deleted_at timestamptz,
  event_kind text not null check (
    event_kind in ('approval_xp', 'featured_xp', 'reward_reversal')
  ),
  amount integer not null check (amount <> 0),
  xp_ledger_id uuid not null unique references public.xp_ledger(id) on delete restrict,
  source_transition_id uuid
    references public.wing_submission_state_transitions(id) on delete restrict,
  reverses_reward_event_id uuid unique
    references public.wing_creator_reward_events(id) on delete restrict,
  idempotency_key text not null unique
    check (char_length(idempotency_key) between 8 and 200),
  reason text not null check (char_length(reason) between 3 and 500),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  correlation_id uuid not null,
  created_at timestamptz not null default now(),
  constraint wing_creator_reward_event_amount_shape check (
    (event_kind in ('approval_xp', 'featured_xp')
      and amount > 0 and reverses_reward_event_id is null)
    or
    (event_kind = 'reward_reversal'
      and amount < 0 and reverses_reward_event_id is not null)
  ),
  constraint wing_creator_reward_owner_deletion_shape check (
    (user_id is not null and owner_deleted_at is null)
    or (user_id is null and owner_deleted_at is not null)
  )
);

create unique index if not exists wing_creator_reward_once_per_submission_kind
  on public.wing_creator_reward_events (submission_id, event_kind)
  where event_kind in ('approval_xp', 'featured_xp');

create unique index if not exists wing_creator_approval_once_per_rating
  on public.wing_creator_reward_events (rating_id)
  where event_kind = 'approval_xp';

create index if not exists wing_creator_reward_user_time_idx
  on public.wing_creator_reward_events (user_id, created_at desc, id);

create index if not exists wing_creator_reward_submission_time_idx
  on public.wing_creator_reward_events (submission_id, created_at, id);

create table if not exists public.wing_creator_badge_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  owner_pseudonym_id uuid not null default gen_random_uuid(),
  owner_deleted_at timestamptz,
  badge_id bigint not null
    references public.badge_catalog(id) on delete restrict,
  badge_code text not null,
  event_kind text not null check (event_kind in ('awarded', 'revoked')),
  trigger_submission_id uuid
    references public.wing_media_submissions(id) on delete restrict,
  reverses_badge_event_id uuid unique
    references public.wing_creator_badge_events(id) on delete restrict,
  idempotency_key text not null unique
    check (char_length(idempotency_key) between 8 and 200),
  reason text not null check (char_length(reason) between 3 and 500),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  correlation_id uuid not null,
  created_at timestamptz not null default now(),
  constraint wing_creator_badge_event_reversal_shape check (
    (event_kind = 'awarded' and reverses_badge_event_id is null)
    or (event_kind = 'revoked' and reverses_badge_event_id is not null)
  ),
  constraint wing_creator_badge_owner_deletion_shape check (
    (user_id is not null and owner_deleted_at is null)
    or (user_id is null and owner_deleted_at is not null)
  )
);

create index if not exists wing_creator_badge_user_time_idx
  on public.wing_creator_badge_events (user_id, created_at desc, id);

-- Catalog definitions are centralized here. Badge XP is zero because Creator XP
-- is issued exclusively through reward receipts, never as a second badge side
-- effect.
insert into public.badge_catalog (
  code, name, description, icon, xp_reward, category, tier, is_active
) values
  (
    'wing_shot_first', 'First Wing Shot',
    'Earned when your first Wing Shot is approved.',
    'camera-check', 0, 'creator', 1, true
  ),
  (
    'wing_photographer', 'Wing Photographer',
    'Earned after five approved Wing Shot photos.',
    'camera', 0, 'creator', 2, true
  ),
  (
    'wing_videographer', 'Wing Videographer',
    'Earned after three approved Wing Shot videos.',
    'video', 0, 'creator', 2, true
  ),
  (
    'jalapenos_pick', 'Jalapeño''s Pick',
    'Earned when a Wing Shot is featured by BuffaGo.',
    'chili-hot', 0, 'creator', 2, true
  ),
  (
    'wing_creator', 'Wing Creator',
    'Earned after ten approved Wing Shots.',
    'creation', 0, 'creator', 3, true
  ),
  (
    'crawl_cameraperson', 'Crawl Cameraperson',
    'Earned from approved Wing Shots across five crawl ratings.',
    'camera-marker', 0, 'creator', 3, true
  ),
  (
    'state_correspondent', 'State Correspondent',
    'Earned from approved Wing Shots in three states.',
    'map-marker-star', 0, 'creator', 3, true
  )
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  icon = excluded.icon,
  xp_reward = 0,
  category = 'creator',
  tier = excluded.tier,
  is_active = true;

create or replace function public.wing_creator_audit_append_only()
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
  raise exception 'wing_creator_audit_is_append_only';
end;
$$;

drop trigger if exists wing_creator_reward_events_append_only
  on public.wing_creator_reward_events;
create trigger wing_creator_reward_events_append_only
before update or delete on public.wing_creator_reward_events
for each row execute function public.wing_creator_audit_append_only();

drop trigger if exists wing_creator_badge_events_append_only
  on public.wing_creator_badge_events;
create trigger wing_creator_badge_events_append_only
before update or delete on public.wing_creator_badge_events
for each row execute function public.wing_creator_audit_append_only();

create or replace function public.wing_sync_creator_badges_internal(
  p_user_id uuid,
  p_trigger_submission_id uuid,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_approved_count integer;
  v_photo_count integer;
  v_video_count integer;
  v_featured_count integer;
  v_crawl_count integer;
  v_state_count integer;
  v_rule record;
  v_badge public.badge_catalog%rowtype;
  v_active_award_id uuid;
  v_cycle integer;
  v_awarded text[] := array[]::text[];
  v_revoked text[] := array[]::text[];
begin
  if p_user_id is null or p_correlation_id is null then
    raise exception 'creator_badge_sync_identity_required';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('wing-creator-badges:' || p_user_id::text, 0)
  );

  with active_rewards as (
    select reward.*
    from public.wing_creator_reward_events reward
    where reward.user_id = p_user_id
      and reward.event_kind in ('approval_xp', 'featured_xp')
      and not exists (
        select 1
        from public.wing_creator_reward_events reversal
        where reversal.reverses_reward_event_id = reward.id
      )
  )
  select
    count(*) filter (where active.event_kind = 'approval_xp')::integer,
    count(*) filter (
      where active.event_kind = 'approval_xp' and submission.media_type = 'photo'
    )::integer,
    count(*) filter (
      where active.event_kind = 'approval_xp' and submission.media_type = 'video'
    )::integer,
    count(*) filter (where active.event_kind = 'featured_xp')::integer,
    count(distinct rating.crawl_id) filter (
      where active.event_kind = 'approval_xp'
    )::integer,
    count(distinct destination.state_id) filter (
      where active.event_kind = 'approval_xp' and destination.state_id is not null
    )::integer
  into
    v_approved_count, v_photo_count, v_video_count, v_featured_count,
    v_crawl_count, v_state_count
  from active_rewards active
  join public.wing_media_submissions submission
    on submission.id = active.submission_id
  join public.destination_ratings rating
    on rating.id = active.rating_id
  join public.destinations destination
    on destination.id = submission.destination_id;

  for v_rule in
    select *
    from (values
      ('wing_shot_first', v_approved_count >= 1),
      ('wing_photographer', v_photo_count >= 5),
      ('wing_videographer', v_video_count >= 3),
      ('jalapenos_pick', v_featured_count >= 1),
      ('wing_creator', v_approved_count >= 10),
      ('crawl_cameraperson', v_crawl_count >= 5),
      ('state_correspondent', v_state_count >= 3)
    ) rules(code, qualifies)
  loop
    select *
      into v_badge
      from public.badge_catalog
     where code = v_rule.code
       and category = 'creator'
       and is_active;

    if not found then
      raise exception 'creator_badge_catalog_missing:%', v_rule.code;
    end if;

    select badge_event.id
      into v_active_award_id
      from public.wing_creator_badge_events badge_event
     where badge_event.user_id = p_user_id
       and badge_event.badge_id = v_badge.id
       and badge_event.event_kind = 'awarded'
       and not exists (
         select 1
         from public.wing_creator_badge_events reversal
         where reversal.reverses_badge_event_id = badge_event.id
       )
     order by badge_event.created_at desc, badge_event.id desc
     limit 1;

    if v_rule.qualifies and v_active_award_id is null then
      select count(*)::integer + 1
        into v_cycle
        from public.wing_creator_badge_events
       where user_id = p_user_id
         and badge_id = v_badge.id
         and event_kind = 'awarded';

      insert into public.user_badges (user_id, badge_id)
      values (p_user_id, v_badge.id)
      on conflict do nothing;

      insert into public.wing_creator_badge_events (
        user_id, badge_id, badge_code, event_kind, trigger_submission_id,
        idempotency_key, reason, metadata, correlation_id
      ) values (
        p_user_id, v_badge.id, v_badge.code, 'awarded',
        p_trigger_submission_id,
        format('wing-badge:%s:%s:award:%s', p_user_id, v_badge.code, v_cycle),
        'Creator badge threshold reached',
        jsonb_build_object(
          'approved_count', v_approved_count,
          'photo_count', v_photo_count,
          'video_count', v_video_count,
          'featured_count', v_featured_count,
          'crawl_count', v_crawl_count,
          'state_count', v_state_count
        ),
        p_correlation_id
      );
      v_awarded := array_append(v_awarded, v_badge.code);
    elsif not v_rule.qualifies and v_active_award_id is not null then
      delete from public.user_badges
       where user_id = p_user_id
         and badge_id = v_badge.id;

      insert into public.wing_creator_badge_events (
        user_id, badge_id, badge_code, event_kind, trigger_submission_id,
        reverses_badge_event_id, idempotency_key, reason, metadata,
        correlation_id
      ) values (
        p_user_id, v_badge.id, v_badge.code, 'revoked',
        p_trigger_submission_id, v_active_award_id,
        'wing-badge-revoke:' || v_active_award_id::text,
        'Creator badge threshold no longer satisfied',
        jsonb_build_object(
          'approved_count', v_approved_count,
          'photo_count', v_photo_count,
          'video_count', v_video_count,
          'featured_count', v_featured_count,
          'crawl_count', v_crawl_count,
          'state_count', v_state_count
        ),
        p_correlation_id
      );
      v_revoked := array_append(v_revoked, v_badge.code);
    end if;
  end loop;

  return jsonb_build_object(
    'awarded', to_jsonb(v_awarded),
    'revoked', to_jsonb(v_revoked),
    'approved_count', v_approved_count,
    'featured_count', v_featured_count
  );
end;
$$;

create or replace function public.wing_award_creator_reward_internal(
  p_submission_id uuid,
  p_reward_kind text,
  p_transition_id uuid,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
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
      when p_reward_kind = 'approval' then 'Approved Wing Shot Creator Reputation'
      else 'Featured Wing Shot Creator Reputation'
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
$$;

create or replace function public.wing_reverse_creator_rewards_internal(
  p_submission_id uuid,
  p_reason text,
  p_idempotency_key text,
  p_transition_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_submission public.wing_media_submissions%rowtype;
  v_reward public.wing_creator_reward_events%rowtype;
  v_ledger_id uuid;
  v_reversed integer := 0;
  v_correlation_id uuid := gen_random_uuid();
begin
  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'creator_reward_reversal_reason_required';
  end if;
  if p_idempotency_key is null
     or char_length(p_idempotency_key) not between 8 and 120 then
    raise exception 'invalid_idempotency_key';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('wing-creator-reversal:' || p_idempotency_key, 0)
  );

  select *
    into v_submission
    from public.wing_media_submissions
   where id = p_submission_id
   for update;
  if not found then
    raise exception 'wing_submission_not_found';
  end if;

  if p_transition_id is not null then
    select transition.correlation_id
      into v_correlation_id
      from public.wing_submission_state_transitions transition
     where transition.id = p_transition_id
       and transition.submission_id = p_submission_id;
    if not found then
      raise exception 'creator_reward_reversal_transition_not_found';
    end if;
  end if;

  for v_reward in
    select reward.*
    from public.wing_creator_reward_events reward
    where reward.submission_id = p_submission_id
      and reward.event_kind in ('approval_xp', 'featured_xp')
      and not exists (
        select 1
        from public.wing_creator_reward_events reversal
        where reversal.reverses_reward_event_id = reward.id
      )
    order by reward.created_at, reward.id
    for update
  loop
    select award.ledger_id
      into v_ledger_id
      from public.award_xp(
        p_amount := -abs(v_reward.amount),
        p_source := 'wing_creator_reversal',
        p_reason := left(trim(p_reason), 500),
        p_user_id := v_reward.user_id,
        p_idempotency_key := 'wing-creator-reversal:' || v_reward.id::text,
        p_metadata := jsonb_build_object(
          'submission_id', v_reward.submission_id,
          'reversed_reward_event_id', v_reward.id,
          'reversal_request_key', p_idempotency_key
        )
      ) award
     limit 1;

    insert into public.wing_creator_reward_events (
      submission_id, rating_id, user_id, event_kind, amount, xp_ledger_id,
      source_transition_id, reverses_reward_event_id, idempotency_key,
      reason, metadata, correlation_id
    ) values (
      v_reward.submission_id, v_reward.rating_id, v_reward.user_id,
      'reward_reversal', -abs(v_reward.amount), v_ledger_id,
      p_transition_id, v_reward.id,
      'wing-creator-reversal:' || v_reward.id::text,
      left(trim(p_reason), 500),
      jsonb_build_object('reversal_request_key', p_idempotency_key),
      v_correlation_id
    )
    on conflict (reverses_reward_event_id) do nothing;

    if found then
      v_reversed := v_reversed + 1;
    end if;
  end loop;

  perform public.wing_sync_creator_badges_internal(
    v_submission.user_id,
    v_submission.id,
    v_correlation_id
  );

  return v_reversed;
end;
$$;

create or replace function public.wing_creator_reward_on_transition()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
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
  end if;
  return new;
end;
$$;

drop trigger if exists wing_submission_creator_reward_transition
  on public.wing_submission_state_transitions;
create trigger wing_submission_creator_reward_transition
after insert on public.wing_submission_state_transitions
for each row execute function public.wing_creator_reward_on_transition();

create or replace function public.get_wing_creator_leaderboard(
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
  v_week_start timestamptz;
begin
  if p_period not in ('week', 'all_time') then
    raise exception 'invalid_creator_leaderboard_period';
  end if;

  v_week_start := date_trunc(
    'week',
    now() at time zone coalesce(
      (
        select preference.timezone
        from public.user_engagement_preferences preference
        where preference.user_id = auth.uid()
      ),
      'UTC'
    )
  ) at time zone coalesce(
    (
      select preference.timezone
      from public.user_engagement_preferences preference
      where preference.user_id = auth.uid()
    ),
    'UTC'
  );

  return query
  with active_rewards as (
    select reward.*
    from public.wing_creator_reward_events reward
    where reward.event_kind in ('approval_xp', 'featured_xp')
      and (p_period = 'all_time' or reward.created_at >= v_week_start)
      and not exists (
        select 1
        from public.wing_creator_reward_events reversal
        where reversal.reverses_reward_event_id = reward.id
      )
  ),
  totals as (
    select
      reward.user_id,
      count(*) filter (where reward.event_kind = 'approval_xp')::bigint
        as approved_submissions,
      count(*) filter (where reward.event_kind = 'featured_xp')::bigint
        as featured_submissions,
      coalesce(sum(reward.amount), 0)::bigint as creator_xp,
      min(reward.created_at) as reached_at
    from active_rewards reward
    group by reward.user_id
  ),
  ranked as (
    select
      dense_rank() over (
        order by
          total.creator_xp desc,
          total.featured_submissions desc,
          total.approved_submissions desc,
          total.reached_at,
          total.user_id
      ) as rank,
      total.*
    from totals total
    where public.can_user_appear_socially(total.user_id)
       or total.user_id = auth.uid()
  )
  select
    ranked.rank,
    ranked.user_id,
    app_user.username,
    app_user.username as display_name,
    app_user.avatar_url,
    ranked.approved_submissions,
    ranked.featured_submissions,
    ranked.creator_xp,
    ranked.user_id = auth.uid() as is_current_user
  from ranked
  join public.users app_user on app_user.user_id = ranked.user_id
  where ranked.rank <= greatest(1, least(coalesce(p_limit, 25), 100))
     or ranked.user_id = auth.uid()
  order by ranked.rank, ranked.user_id;
end;
$$;

create or replace function public.get_wing_creator_stats(
  p_target_user_id uuid default auth.uid()
)
returns table (
  approved_submissions bigint,
  featured_submissions bigint,
  creator_xp bigint,
  weekly_approved_submissions bigint,
  weekly_featured_submissions bigint,
  weekly_creator_xp bigint
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_week_start timestamptz;
begin
  if auth.uid() is null or p_target_user_id is null then
    raise exception 'authentication_required';
  end if;
  if p_target_user_id <> auth.uid()
     and (
       not public.can_user_appear_socially(auth.uid())
       or not public.can_user_appear_socially(p_target_user_id)
       or public.friend_pair_is_blocked(auth.uid(), p_target_user_id)
     ) then
    raise exception 'creator_stats_not_visible';
  end if;

  v_week_start := date_trunc(
    'week',
    now() at time zone coalesce(
      (
        select preference.timezone
        from public.user_engagement_preferences preference
        where preference.user_id = auth.uid()
      ),
      'UTC'
    )
  ) at time zone coalesce(
    (
      select preference.timezone
      from public.user_engagement_preferences preference
      where preference.user_id = auth.uid()
    ),
    'UTC'
  );

  return query
  with active_rewards as (
    select reward.*
    from public.wing_creator_reward_events reward
    where reward.user_id = p_target_user_id
      and reward.event_kind in ('approval_xp', 'featured_xp')
      and not exists (
        select 1
        from public.wing_creator_reward_events reversal
        where reversal.reverses_reward_event_id = reward.id
      )
  )
  select
    count(*) filter (where reward.event_kind = 'approval_xp')::bigint,
    count(*) filter (where reward.event_kind = 'featured_xp')::bigint,
    coalesce(sum(reward.amount), 0)::bigint,
    count(*) filter (
      where reward.event_kind = 'approval_xp'
        and reward.created_at >= v_week_start
    )::bigint,
    count(*) filter (
      where reward.event_kind = 'featured_xp'
        and reward.created_at >= v_week_start
    )::bigint,
    coalesce(sum(reward.amount) filter (
      where reward.created_at >= v_week_start
    ), 0)::bigint
  from active_rewards reward;
end;
$$;

alter table public.wing_creator_reward_config enable row level security;
alter table public.wing_creator_reward_events enable row level security;
alter table public.wing_creator_badge_events enable row level security;

revoke all on
  public.wing_creator_reward_config,
  public.wing_creator_reward_events,
  public.wing_creator_badge_events
from public, anon, authenticated;

grant all on public.wing_creator_reward_config to service_role;
grant select, insert on
  public.wing_creator_reward_events,
  public.wing_creator_badge_events
to service_role;

revoke all on function public.wing_creator_audit_append_only()
from public, anon, authenticated;
revoke all on function public.wing_sync_creator_badges_internal(uuid, uuid, uuid)
from public, anon, authenticated;
revoke all on function public.wing_award_creator_reward_internal(uuid, text, uuid, text)
from public, anon, authenticated;
revoke all on function public.wing_reverse_creator_rewards_internal(
  uuid, text, text, uuid
) from public, anon, authenticated;
revoke all on function public.wing_creator_reward_on_transition()
from public, anon, authenticated;
revoke all on function public.get_wing_creator_leaderboard(text, integer)
from public, anon;
revoke all on function public.get_wing_creator_stats(uuid)
from public, anon;

grant execute on function public.wing_sync_creator_badges_internal(uuid, uuid, uuid)
to service_role;
grant execute on function public.wing_award_creator_reward_internal(uuid, text, uuid, text)
to service_role;
grant execute on function public.wing_reverse_creator_rewards_internal(
  uuid, text, text, uuid
) to service_role;
grant execute on function public.get_wing_creator_leaderboard(text, integer)
to authenticated;
grant execute on function public.get_wing_creator_stats(uuid)
to authenticated;

comment on table public.wing_creator_reward_events is
  'Append-only Creator XP receipts. Positive approval/feature awards and negative counterbalances are each idempotent and auditable.';
comment on table public.wing_creator_badge_events is
  'Append-only Creator badge award/revocation audit. user_badges remains the centralized current-state registry.';
comment on function public.wing_reverse_creator_rewards_internal(uuid, text, text, uuid) is
  'Service-only auditable counterbalance for withdrawal, fraud, abuse, or revoked approval. Never deletes XP history.';
comment on function public.xp_add(integer, text, uuid) is
  'Compatibility-only verified Facebook identity reward. Arbitrary authenticated XP mutation is rejected.';

commit;

-- Rollback: disable Wing Shots transition processing before removing the trigger.
-- Do not delete reward, reversal, or badge audit rows. Revoke leaderboard RPCs and
-- forward-fix reward policy. Restoring generic authenticated award_xp access is
-- explicitly unsafe and is not part of rollback.
