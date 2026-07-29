-- Honest social-community progression.
--
-- Meta does not provide this app a reliable per-user proof that an arbitrary
-- BuffaGo user follows the business account/Page. These receipts therefore
-- prove only a server-timed external visit journey and never claim a verified
-- follow. The user-facing badges are named accordingly.

begin;

create table if not exists public.social_community_visit_intents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  owner_pseudonym_id uuid not null default gen_random_uuid(),
  owner_deleted_at timestamptz,
  platform text not null check (platform in ('instagram', 'facebook')),
  status text not null default 'initiated'
    check (status in ('initiated', 'completed', 'expired', 'cancelled')),
  verification_method text not null default 'external_visit_return'
    check (verification_method = 'external_visit_return'),
  initiated_at timestamptz not null default now(),
  eligible_after timestamptz not null,
  expires_at timestamptz not null,
  completed_at timestamptz,
  correlation_id uuid not null,
  created_at timestamptz not null default now(),
  constraint social_visit_time_shape check (
    eligible_after >= initiated_at + interval '5 seconds'
    and expires_at <= initiated_at + interval '24 hours'
    and expires_at > eligible_after
  ),
  constraint social_visit_completion_shape check (
    (status = 'completed' and completed_at is not null)
    or (status <> 'completed' and completed_at is null)
  ),
  constraint social_visit_owner_deletion_shape check (
    (user_id is not null and owner_deleted_at is null)
    or (user_id is null and owner_deleted_at is not null)
  )
);

create index if not exists social_visit_owner_time_idx
  on public.social_community_visit_intents (user_id, initiated_at desc);

create table if not exists public.social_community_reward_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  owner_pseudonym_id uuid not null default gen_random_uuid(),
  owner_deleted_at timestamptz,
  platform text not null check (platform in ('instagram', 'facebook')),
  visit_intent_id uuid not null
    references public.social_community_visit_intents(id) on delete restrict,
  badge_id bigint not null references public.badge_catalog(id) on delete restrict,
  xp_ledger_id uuid not null unique references public.xp_ledger(id) on delete restrict,
  xp_amount integer not null check (xp_amount between 1 and 25),
  verification_state text not null
    check (verification_state = 'visited_not_follow_verified'),
  idempotency_key text not null unique
    check (char_length(idempotency_key) between 8 and 200),
  correlation_id uuid not null,
  created_at timestamptz not null default now(),
  unique (user_id, platform),
  constraint social_community_reward_owner_deletion_shape check (
    (user_id is not null and owner_deleted_at is null)
    or (user_id is null and owner_deleted_at is not null)
  )
);

create or replace function public.social_community_reward_append_only()
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
  raise exception 'social_community_reward_is_append_only';
end;
$$;

drop trigger if exists social_community_reward_events_append_only
  on public.social_community_reward_events;
create trigger social_community_reward_events_append_only
before update or delete on public.social_community_reward_events
for each row execute function public.social_community_reward_append_only();

insert into public.badge_catalog (
  code, name, description, icon, xp_reward, category, tier, is_active
) values
  (
    'instagram_community_visit',
    'Instagram Community Visitor',
    'Opened BuffaGo on Instagram. This badge does not claim a verified follow.',
    'instagram', 0, 'community', 1, true
  ),
  (
    'facebook_community_visit',
    'Facebook Community Visitor',
    'Opened BuffaGo on Facebook. This badge does not claim a verified follow.',
    'facebook', 0, 'community', 1, true
  )
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  icon = excluded.icon,
  xp_reward = 0,
  category = 'community',
  tier = 1,
  is_active = true;

create or replace function public.start_social_community_visit(
  p_platform text,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_intent_id uuid;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_platform not in ('instagram', 'facebook') then
    raise exception 'invalid_social_platform';
  end if;
  if p_correlation_id is null then
    raise exception 'correlation_id_required';
  end if;

  update public.social_community_visit_intents
     set status = 'expired'
   where user_id = v_user_id
     and platform = p_platform
     and status = 'initiated'
     and expires_at <= now();

  insert into public.social_community_visit_intents (
    user_id, platform, eligible_after, expires_at, correlation_id
  ) values (
    v_user_id, p_platform, now() + interval '5 seconds',
    now() + interval '24 hours', p_correlation_id
  )
  returning id into v_intent_id;

  return jsonb_build_object(
    'visit_intent_id', v_intent_id,
    'platform', p_platform,
    'verification_state', 'pending_external_visit',
    'follow_verified', false
  );
end;
$$;

create or replace function public.complete_social_community_visit(
  p_visit_intent_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_intent public.social_community_visit_intents%rowtype;
  v_badge public.badge_catalog%rowtype;
  v_existing public.social_community_reward_events%rowtype;
  v_ledger_id uuid;
  v_xp integer := 10;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select *
    into v_intent
    from public.social_community_visit_intents
   where id = p_visit_intent_id
     and user_id = v_user_id
   for update;
  if not found then
    raise exception 'social_visit_not_found' using errcode = '42501';
  end if;

  select *
    into v_existing
    from public.social_community_reward_events
   where user_id = v_user_id
     and platform = v_intent.platform;
  if found then
    return jsonb_build_object(
      'granted', false,
      'reason', 'already_earned',
      'platform', v_intent.platform,
      'verification_state', v_existing.verification_state,
      'follow_verified', false
    );
  end if;

  if v_intent.status <> 'initiated'
     or now() < v_intent.eligible_after
     or now() >= v_intent.expires_at then
    raise exception 'social_visit_not_eligible';
  end if;

  select *
    into v_badge
    from public.badge_catalog
   where code = v_intent.platform || '_community_visit'
     and is_active;
  if not found then
    raise exception 'social_community_badge_missing';
  end if;

  select award.ledger_id
    into v_ledger_id
    from public.award_xp(
      p_amount := v_xp,
      p_source := 'social_community_visit',
      p_reason := 'Visited BuffaGo on ' || initcap(v_intent.platform),
      p_user_id := v_user_id,
      p_idempotency_key :=
        'social-community-visit:' || v_user_id::text || ':' || v_intent.platform,
      p_badge_id := v_badge.id,
      p_metadata := jsonb_build_object(
        'platform', v_intent.platform,
        'verification_state', 'visited_not_follow_verified',
        'follow_verified', false
      )
    ) award
   limit 1;
  if v_ledger_id is null then
    raise exception 'social_community_xp_ledger_missing';
  end if;

  insert into public.user_badges (user_id, badge_id)
  values (v_user_id, v_badge.id)
  on conflict do nothing;

  update public.social_community_visit_intents
     set status = 'completed', completed_at = now()
   where id = v_intent.id;

  insert into public.social_community_reward_events (
    user_id, platform, visit_intent_id, badge_id, xp_ledger_id, xp_amount,
    verification_state, idempotency_key, correlation_id
  ) values (
    v_user_id, v_intent.platform, v_intent.id, v_badge.id, v_ledger_id, v_xp,
    'visited_not_follow_verified',
    'social-community-visit:' || v_user_id::text || ':' || v_intent.platform,
    v_intent.correlation_id
  );

  return jsonb_build_object(
    'granted', true,
    'platform', v_intent.platform,
    'xp', v_xp,
    'badge_code', v_badge.code,
    'verification_state', 'visited_not_follow_verified',
    'follow_verified', false
  );
end;
$$;

alter table public.social_community_visit_intents enable row level security;
alter table public.social_community_reward_events enable row level security;
revoke all on
  public.social_community_visit_intents,
  public.social_community_reward_events
from public, anon, authenticated;
grant all on
  public.social_community_visit_intents,
  public.social_community_reward_events
to service_role;

revoke all on function public.social_community_reward_append_only()
from public, anon, authenticated;
revoke all on function public.start_social_community_visit(text, uuid)
from public, anon;
revoke all on function public.complete_social_community_visit(uuid)
from public, anon;
grant execute on function public.start_social_community_visit(text, uuid)
to authenticated;
grant execute on function public.complete_social_community_visit(uuid)
to authenticated;

comment on table public.social_community_reward_events is
  'Auditable one-time rewards for a timed external social visit; never evidence of a verified follow.';

commit;

-- Rollback: revoke the two client RPCs and disable social CTAs. Preserve reward
-- receipts and XP ledger history. Do not rename these badges to imply a verified
-- follower relationship.
