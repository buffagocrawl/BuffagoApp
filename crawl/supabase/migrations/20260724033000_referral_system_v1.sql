-- Buffago referral-system-v1 (repository-schema contract; DO NOT DEPLOY before
-- executing docs/referrals/staging-verification.sql against staging).
--
-- Product contract: people are told to rate within 100 yards. The canonical server
-- validator intentionally accepts GPS fixes up to 0.5 mile (804.67m) to accommodate
-- parking locations, restaurant footprints, poor signal, and delayed fixes. This
-- operational tolerance is deliberately not returned in user-facing errors or copy.
--
-- STAGING ASSUMPTIONS (verified by the handoff script before production):
--   auth.users/public.users, crawls(route_id,user_id), routes stop1_id..stop5_id,
--   route_ordered_destinations, destinations(lat,lng), destination_ratings and its
--   (destination_id,crawl_id,user_id) unique key, xp_ledger/award_xp/xp_level_for,
--   badge_catalog/user_badges, user_events, and the notification foundation from
--   20260724012000 exist with the repository shapes.

begin;

create table if not exists public.referral_reward_config (
  config_key text primary key check (config_key ~ '^[a-z0-9_]+$'),
  inviter_reward_xp integer not null check (inviter_reward_xp >= 0),
  invitee_reward_xp integer not null check (invitee_reward_xp >= 0),
  milestone_bonus_enabled boolean not null default false,
  claim_window interval not null default interval '7 days',
  attribution_ttl interval not null default interval '30 days',
  is_enabled boolean not null default false,
  campaign text,
  starts_at timestamptz,
  ends_at timestamptz,
  updated_at timestamptz not null default now()
);

insert into public.referral_reward_config(
  config_key, inviter_reward_xp, invitee_reward_xp, milestone_bonus_enabled
) values ('default', 250, 250, false)
on conflict (config_key) do nothing;

create table if not exists public.referral_codes (
  id uuid primary key default gen_random_uuid(),
  -- Deliberately not an auth.users FK: account deletion must not erase or block the
  -- referral audit chain. Eligibility RPCs verify live auth users before settlement.
  user_id uuid not null,
  code text not null check (code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);
create unique index if not exists referral_codes_code_ci_unique
  on public.referral_codes(lower(code));

create table if not exists public.referral_attributions (
  id uuid primary key default gen_random_uuid(),
  referral_code_id uuid not null references public.referral_codes(id),
  inviter_user_id uuid not null,
  invitee_user_id uuid,
  anonymous_install_hash text,
  source text not null default 'direct' check (char_length(source) between 1 and 64),
  campaign text,
  placement text,
  status text not null default 'clicked' check (status in (
    'clicked','claimed','signed_up','pending_qualification','qualified','rewarded',
    'rejected','expired','reversed'
  )),
  review_status text not null default 'clear' check (review_status in (
    'clear','flagged','under_review','approved','rejected'
  )),
  clicked_at timestamptz,
  claimed_at timestamptz,
  signed_up_at timestamptz,
  onboarding_completed_at timestamptz,
  qualified_at timestamptz,
  rewarded_at timestamptz,
  rejected_at timestamptz,
  expired_at timestamptz,
  reversed_at timestamptz,
  rejection_reason text,
  qualifying_rating_id uuid,
  correlation_id uuid not null default gen_random_uuid(),
  metadata jsonb not null default '{}'::jsonb,
  internal_review_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (invitee_user_id is null or invitee_user_id <> inviter_user_id)
);
create unique index if not exists referral_attributions_invitee_unique
  on public.referral_attributions(invitee_user_id)
  where invitee_user_id is not null;
create unique index if not exists referral_attributions_rating_unique
  on public.referral_attributions(qualifying_rating_id)
  where qualifying_rating_id is not null;
create unique index if not exists referral_click_dedupe_unique
  on public.referral_attributions(referral_code_id, anonymous_install_hash)
  where invitee_user_id is null and anonymous_install_hash is not null
    and status = 'clicked';
create index if not exists referral_attributions_inviter_status_idx
  on public.referral_attributions(inviter_user_id,status,created_at desc);

create table if not exists public.referral_rewards (
  id uuid primary key default gen_random_uuid(),
  referral_attribution_id uuid not null references public.referral_attributions(id),
  recipient_user_id uuid not null,
  recipient_role text not null check (recipient_role in ('inviter','invitee')),
  reward_type text not null default 'qualification_xp',
  reward_amount integer not null check (reward_amount <> 0),
  ledger_entry_id uuid not null references public.xp_ledger(id),
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  unique (referral_attribution_id,recipient_role,reward_type),
  unique (idempotency_key),
  unique (ledger_entry_id)
);

create table if not exists public.referral_abuse_signals (
  id uuid primary key default gen_random_uuid(),
  referral_attribution_id uuid not null references public.referral_attributions(id),
  signal_type text not null check (signal_type in (
    'self_referral','installation_reuse','rapid_qualification','inviter_velocity',
    'invitee_deleted','rating_reversed','ledger_inconsistency'
  )),
  severity text not null default 'review' check (severity in ('info','review','high')),
  deduplication_key text not null unique,
  details jsonb not null default '{}'::jsonb,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.referral_in_app_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  referral_attribution_id uuid not null references public.referral_attributions(id),
  event_type text not null check (event_type in (
    'friend_joined','friend_qualified','invitee_qualified','referral_badge_unlocked',
    'referral_reward_reversed'
  )),
  title text not null,
  body text not null,
  deep_link text not null default 'buffago://referrals',
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id,referral_attribution_id,event_type)
);

alter table public.referral_reward_config enable row level security;
alter table public.referral_codes enable row level security;
alter table public.referral_attributions enable row level security;
alter table public.referral_rewards enable row level security;
alter table public.referral_abuse_signals enable row level security;
alter table public.referral_in_app_notifications enable row level security;

revoke all on public.referral_reward_config, public.referral_codes,
  public.referral_attributions, public.referral_rewards, public.referral_abuse_signals,
  public.referral_in_app_notifications from anon, authenticated;
grant select on public.referral_codes, public.referral_in_app_notifications to authenticated;

drop policy if exists referral_codes_owner_read on public.referral_codes;
create policy referral_codes_owner_read on public.referral_codes
  for select to authenticated using (user_id = auth.uid());
drop policy if exists referral_in_app_notification_owner_read
  on public.referral_in_app_notifications;
create policy referral_in_app_notification_owner_read
  on public.referral_in_app_notifications for select to authenticated
  using (user_id = auth.uid());

create or replace function public.generate_referral_code()
returns text language plpgsql volatile set search_path = public as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text;
begin
  for v_attempt in 1..40 loop
    select string_agg(substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1), '')
      into v_code from generate_series(1,8);
    exit when not exists (
      select 1 from public.referral_codes where lower(code)=lower(v_code)
    );
  end loop;
  if v_code is null or exists (
    select 1 from public.referral_codes where lower(code)=lower(v_code)
  ) then raise exception 'referral_code_generation_exhausted'; end if;
  return v_code;
end;
$$;

create or replace function public.ensure_referral_code(p_user_id uuid default auth.uid())
returns table(code text, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare v_user uuid := coalesce(p_user_id,auth.uid());
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if auth.uid() is not null and v_user <> auth.uid() then
    raise exception 'cannot_read_another_referral_code';
  end if;
  if not exists(select 1 from auth.users where id=v_user) then
    raise exception 'user_not_found';
  end if;
  perform public.provision_referral_code_internal(v_user);
  return query select c.code,c.created_at from public.referral_codes c
    where c.user_id=v_user and c.is_active;
end;
$$;

create or replace function public.provision_referral_code_internal(p_user_id uuid)
returns text language plpgsql security definer set search_path=public as $$
declare v_code text;
begin
  select code into v_code from public.referral_codes where user_id=p_user_id;
  if found then return v_code; end if;
  for v_attempt in 1..20 loop
    begin
      v_code:=public.generate_referral_code();
      insert into public.referral_codes(user_id,code) values(p_user_id,v_code)
      on conflict(user_id) do update set updated_at=referral_codes.updated_at
      returning code into v_code;
      return v_code;
    exception when unique_violation then
      v_code:=null;
    end;
  end loop;
  raise exception 'referral_code_generation_exhausted';
end;
$$;

create or replace function public.ensure_new_user_referral_code()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  perform public.provision_referral_code_internal(new.id);
  return new;
end;
$$;
drop trigger if exists auth_user_referral_code on auth.users;
create trigger auth_user_referral_code after insert on auth.users
  for each row execute function public.ensure_new_user_referral_code();

do $$
declare v_user uuid;
begin
  for v_user in
    select u.id from auth.users u left join public.referral_codes c on c.user_id=u.id
    where c.user_id is null order by u.created_at,u.id
  loop
    perform public.provision_referral_code_internal(v_user);
  end loop;
end $$;

create or replace function public.get_referral_public_config()
returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object(
    'enabled',is_enabled,
    'inviter_reward_xp',inviter_reward_xp,
    'invitee_reward_xp',invitee_reward_xp,
    'campaign',campaign
  ) from public.referral_reward_config
  where config_key='default'
    and (starts_at is null or starts_at<=now())
    and (ends_at is null or ends_at>now());
$$;

create or replace function public.validate_referral_code(p_code text)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_code public.referral_codes%rowtype; v_cfg public.referral_reward_config%rowtype;
begin
  select * into v_cfg from public.referral_reward_config where config_key='default';
  select * into v_code from public.referral_codes
   where lower(code)=lower(btrim(coalesce(p_code,''))) and is_active
     and exists(select 1 from auth.users u where u.id=referral_codes.user_id
       and u.deleted_at is null and (u.banned_until is null or u.banned_until<now()));
  return jsonb_build_object(
    'valid',found and coalesce(v_cfg.is_enabled,false)
      and (v_cfg.starts_at is null or v_cfg.starts_at<=now())
      and (v_cfg.ends_at is null or v_cfg.ends_at>now()),
    'code',case when found then v_code.code else null end,
    'reason',case
      when not found then 'invalid_or_disabled'
      when not coalesce(v_cfg.is_enabled,false) then 'program_disabled'
      when v_cfg.starts_at is not null and v_cfg.starts_at>now() then 'campaign_not_started'
      when v_cfg.ends_at is not null and v_cfg.ends_at<=now() then 'campaign_expired'
      else null end
  );
end;
$$;

create or replace function public.record_referral_click(
  p_code text, p_anonymous_install_id text, p_source text default 'shared_link',
  p_campaign text default null, p_placement text default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_code public.referral_codes%rowtype; v_id uuid; v_hash text;
begin
  if char_length(coalesce(p_anonymous_install_id,'')) not between 16 and 160 then
    return jsonb_build_object('recognized',false,'reason','invalid_installation_id');
  end if;
  select * into v_code from public.referral_codes
   where lower(code)=lower(btrim(coalesce(p_code,''))) and is_active
     and exists(select 1 from auth.users u where u.id=referral_codes.user_id
       and u.deleted_at is null and (u.banned_until is null or u.banned_until<now()));
  if not found then return jsonb_build_object('recognized',false,'reason','invalid_or_disabled'); end if;
  v_hash := encode(extensions.digest(convert_to(p_anonymous_install_id,'UTF8'),'sha256'),'hex');
  insert into public.referral_attributions(
    referral_code_id,inviter_user_id,anonymous_install_hash,source,campaign,placement,
    status,clicked_at,expired_at
  ) values (
    v_code.id,v_code.user_id,v_hash,left(coalesce(nullif(p_source,''),'shared_link'),64),
    nullif(left(coalesce(p_campaign,''),80),''),
    nullif(left(coalesce(p_placement,''),80),''),
    'clicked',now(),now()+interval '30 days'
  )
  on conflict (referral_code_id,anonymous_install_hash)
    where invitee_user_id is null and anonymous_install_hash is not null and status='clicked'
  do update set clicked_at=least(referral_attributions.clicked_at,excluded.clicked_at),
    updated_at=now()
  returning id into v_id;
  return jsonb_build_object('recognized',true,'attribution_id',v_id,'code',v_code.code);
end;
$$;

-- Integrate with the existing push outbox when the repository notification migration
-- is present. This is intentionally guarded so a referral migration can still be
-- reviewed against environments where that additive foundation has not shipped.
do $$
declare v_constraint text;
begin
  if to_regclass('public.notification_outbox') is not null then
    select c.conname into v_constraint
    from pg_constraint c
    where c.conrelid='public.notification_outbox'::regclass
      and c.contype='c' and pg_get_constraintdef(c.oid) like '%event_type%'
    limit 1;
    if v_constraint is not null then
      execute format('alter table public.notification_outbox drop constraint %I',v_constraint);
    end if;
    alter table public.notification_outbox add constraint notification_outbox_event_type_check
      check(event_type in(
        'streak_at_risk','streak_comeback','friend_rating','crawl_proximity',
        'referral_friend_joined','referral_friend_qualified',
        'referral_invitee_qualified','referral_badge_unlocked'
      ));
  end if;
end $$;

create or replace function public.enqueue_referral_push_internal(
  p_user_id uuid,p_attribution_id uuid,p_event_type text,p_title text,p_body text
) returns void language plpgsql security definer set search_path=public as $$
begin
  if to_regclass('public.notification_outbox') is null
    or to_regclass('public.notification_preferences') is null then return; end if;
  execute $sql$
    insert into public.notification_outbox(
      user_id,event_type,source_entity_type,source_entity_id,deduplication_key,
      deep_link,fallback_route,copy_data,expires_at
    )
    select $1,$3,'referral_attribution',$2::text,
      $3||':'||$2::text,'buffago://referrals','/referrals',
      jsonb_build_object('title',$4,'body',$5,'referral_attribution_id',$2),
      now()+interval '7 days'
    from public.notification_preferences p
    where p.user_id=$1 and p.friend_activity
    on conflict(user_id,event_type,deduplication_key) do nothing
  $sql$ using p_user_id,p_attribution_id,p_event_type,p_title,p_body;
end;
$$;

create or replace function public.claim_referral(
  p_code text, p_anonymous_install_id text default null,
  p_source text default 'manual', p_campaign text default null,
  p_placement text default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_user uuid:=auth.uid(); v_auth_created timestamptz; v_code public.referral_codes%rowtype;
  v_cfg public.referral_reward_config%rowtype; v_attr public.referral_attributions%rowtype;
  v_hash text;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  select created_at into v_auth_created from auth.users where id=v_user;
  if not found then raise exception 'account_unavailable'; end if;
  if exists(select 1 from auth.users where id=v_user and
    (deleted_at is not null or (banned_until is not null and banned_until>=now()))) then
    return jsonb_build_object('claimed',false,'reason','account_unavailable');
  end if;
  select * into v_cfg from public.referral_reward_config where config_key='default' and is_enabled;
  if not found then return jsonb_build_object('claimed',false,'reason','program_disabled'); end if;
  if now()-v_auth_created > v_cfg.claim_window then
    return jsonb_build_object('claimed',false,'reason','existing_account');
  end if;
  if exists(select 1 from public.destination_ratings where user_id=v_user) then
    return jsonb_build_object('claimed',false,'reason','existing_activity');
  end if;
  select * into v_code from public.referral_codes
   where lower(code)=lower(btrim(coalesce(p_code,''))) and is_active
     and exists(select 1 from auth.users u where u.id=referral_codes.user_id
       and u.deleted_at is null and (u.banned_until is null or u.banned_until<now()));
  if not found then return jsonb_build_object('claimed',false,'reason','invalid_or_disabled'); end if;
  if v_code.user_id=v_user then
    return jsonb_build_object('claimed',false,'reason','self_referral');
  end if;
  if exists(select 1 from public.referral_attributions where invitee_user_id=v_user) then
    select * into v_attr from public.referral_attributions where invitee_user_id=v_user;
    return jsonb_build_object('claimed',v_attr.inviter_user_id=v_code.user_id,
      'reason','already_claimed','status',v_attr.status,'attribution_id',v_attr.id);
  end if;
  if nullif(p_anonymous_install_id,'') is not null then
    v_hash:=encode(extensions.digest(convert_to(p_anonymous_install_id,'UTF8'),'sha256'),'hex');
    select * into v_attr from public.referral_attributions
     where referral_code_id=v_code.id and anonymous_install_hash=v_hash
       and invitee_user_id is null and status='clicked'
     order by clicked_at desc limit 1 for update;
  end if;
  if v_attr.id is null then
    insert into public.referral_attributions(
      referral_code_id,inviter_user_id,invitee_user_id,anonymous_install_hash,
      source,campaign,placement,status,clicked_at,claimed_at,signed_up_at,expired_at
    ) values(
      v_code.id,v_code.user_id,v_user,v_hash,left(coalesce(nullif(p_source,''),'manual'),64),
      nullif(left(coalesce(p_campaign,''),80),''),
      nullif(left(coalesce(p_placement,''),80),''),
      'pending_qualification',now(),now(),v_auth_created,now()+v_cfg.attribution_ttl
    ) returning * into v_attr;
  else
    update public.referral_attributions set invitee_user_id=v_user,
      status='pending_qualification',claimed_at=now(),signed_up_at=v_auth_created,
      source=left(coalesce(nullif(p_source,''),source),64),
      campaign=coalesce(nullif(left(coalesce(p_campaign,''),80),''),campaign),
      placement=coalesce(nullif(left(coalesce(p_placement,''),80),''),placement),
      updated_at=now()
    where id=v_attr.id returning * into v_attr;
  end if;
  insert into public.referral_in_app_notifications(
    user_id,referral_attribution_id,event_type,title,body
  ) values(v_attr.inviter_user_id,v_attr.id,'friend_joined',
    'Your wing buddy joined Buffago','Their first wing rating is still pending.')
  on conflict do nothing;
  perform public.enqueue_referral_push_internal(
    v_attr.inviter_user_id,v_attr.id,'referral_friend_joined',
    'Your wing buddy joined Buffago','Their first wing rating is still pending.');
  if v_hash is not null and (
    select count(distinct invitee_user_id) from public.referral_attributions
    where anonymous_install_hash=v_hash and invitee_user_id is not null
  )>1 then
    insert into public.referral_abuse_signals(
      referral_attribution_id,signal_type,severity,deduplication_key,details
    ) values(v_attr.id,'installation_reuse','review',
      'installation_reuse:'||v_attr.id,
      jsonb_build_object('signal','multiple_accounts_same_installation'))
    on conflict(deduplication_key) do nothing;
    update public.referral_attributions set review_status='flagged'
      where id=v_attr.id and review_status='clear';
  end if;
  insert into public.user_events(user_id,session_id,event_name,metadata)
  values(v_attr.inviter_user_id,gen_random_uuid(),'referred_user_signed_up',
    jsonb_build_object('referral_attribution_id',v_attr.id,'source',v_attr.source,
      'campaign',v_attr.campaign,'placement',v_attr.placement))
  on conflict do nothing;
  return jsonb_build_object('claimed',true,'status',v_attr.status,
    'attribution_id',v_attr.id);
end;
$$;

create or replace function public.mark_referral_onboarding_complete()
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_attr public.referral_attributions%rowtype;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  update public.referral_attributions
    set onboarding_completed_at=coalesce(onboarding_completed_at,now()),updated_at=now()
  where invitee_user_id=auth.uid() and status='pending_qualification'
  returning * into v_attr;
  return jsonb_build_object('recorded',v_attr.id is not null,'attribution_id',v_attr.id);
end;
$$;

-- Internal only. This mirrors award_xp ledger semantics because award_xp correctly
-- forbids an authenticated invitee from awarding the inviter. Never grant this helper.
create or replace function public.award_referral_xp_internal(
  p_user_id uuid,p_amount integer,p_attribution_id uuid,p_role text
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_key text; v_existing uuid; v_before integer; v_after integer;
  v_level_before integer; v_level_after integer; v_ledger uuid;
begin
  v_key:=case when p_role like 'reversal_%'
    then format('referral:%s:%s',p_attribution_id,p_role)
    else format('referral:%s:%s:qualification',p_attribution_id,p_role) end;
  select id into v_existing from public.xp_ledger where idempotency_key=v_key;
  if found then return v_existing; end if;
  insert into public.users(user_id,xp) values(p_user_id,0) on conflict(user_id) do nothing;
  select coalesce(xp,0) into v_before from public.users where user_id=p_user_id for update;
  v_after:=greatest(0,v_before+p_amount);
  v_level_before:=public.xp_level_for(v_before);
  v_level_after:=public.xp_level_for(v_after);
  update public.users set xp=v_after where user_id=p_user_id;
  insert into public.xp_ledger(
    user_id,amount,source,reason,idempotency_key,referral_id,
    level_before,level_after,xp_before,xp_after,metadata
  ) values(
    p_user_id,p_amount,
    case when p_role like 'reversal_%' then 'referral_reversal'
      else 'referral_qualification' end,
    case when p_role like 'reversal_%' then 'Referral reward reversal'
      else 'Referral qualification reward' end,v_key,
    p_attribution_id,v_level_before,v_level_after,v_before,v_after,
    jsonb_build_object('recipient_role',p_role,'referral_attribution_id',p_attribution_id)
  ) returning id into v_ledger;
  return v_ledger;
end;
$$;

create or replace function public.sync_verified_referral_badges_internal(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_count integer; v_rule record; v_badge public.badge_catalog%rowtype;
  v_unlocked text[]:=array[]::text[]; v_attr_id uuid;
begin
  select count(*)::int into v_count from public.referral_attributions
   where inviter_user_id=p_user_id and status in('qualified','rewarded')
     and review_status not in('rejected');
  for v_rule in select * from (values
    ('referral_1','Wing Buddy',1),
    ('referral_5','Wing Crew Captain',5),
    ('referral_10','Wing Recruiter',10)
  ) as r(code,name,threshold)
  loop
    insert into public.badge_catalog(code,name,description,icon,xp_reward,category,tier,is_active)
    values(v_rule.code,v_rule.name,
      format('Earned from %s verified qualified referral%s.',v_rule.threshold,
        case when v_rule.threshold=1 then '' else 's' end),
      'account-multiple-plus',0,'referral',
      case when v_rule.threshold=1 then 1 when v_rule.threshold=5 then 2 else 3 end,true)
    on conflict(code) do update set description=excluded.description,category='referral',
      is_active=true
    returning * into v_badge;
    if v_count>=v_rule.threshold then
      insert into public.user_badges(user_id,badge_id) values(p_user_id,v_badge.id)
      on conflict do nothing;
      if found then
        v_unlocked:=array_append(v_unlocked,v_rule.code);
        select id into v_attr_id from public.referral_attributions
          where inviter_user_id=p_user_id and status in('qualified','rewarded')
          order by qualified_at desc limit 1;
        insert into public.referral_in_app_notifications(
          user_id,referral_attribution_id,event_type,title,body,deep_link
        ) values(p_user_id,v_attr_id,'referral_badge_unlocked',
          v_badge.name||' unlocked',
          format('%s verified referral milestone complete.',v_rule.threshold),
          'buffago://profile/history')
        on conflict do nothing;
        perform public.enqueue_referral_push_internal(
          p_user_id,v_attr_id,'referral_badge_unlocked',
          v_badge.name||' unlocked',
          format('%s verified referral milestone complete.',v_rule.threshold));
        insert into public.user_events(user_id,session_id,event_name,metadata)
        values(p_user_id,gen_random_uuid(),'referral_badge_unlocked',
          jsonb_build_object('badge_code',v_rule.code,
            'verified_referral_count',v_count,'referral_attribution_id',v_attr_id))
        on conflict do nothing;
      end if;
    else
      delete from public.user_badges
      where user_id=p_user_id and badge_id=v_badge.id;
    end if;
  end loop;
  return jsonb_build_object('verified_count',v_count,'unlocked',to_jsonb(v_unlocked));
end;
$$;

create or replace function public.settle_referral_for_rating_internal(
  p_invitee_user_id uuid,p_rating_id uuid
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_attr public.referral_attributions%rowtype; v_cfg public.referral_reward_config%rowtype;
  v_inviter_ledger uuid; v_invitee_ledger uuid; v_badges jsonb;
begin
  select * into v_attr from public.referral_attributions
    where invitee_user_id=p_invitee_user_id and status='pending_qualification'
    for update;
  if not found then return jsonb_build_object('qualified',false,'reason','no_pending_referral'); end if;
  if not exists(
    select 1 from public.destination_ratings dr
    where dr.id=p_rating_id and dr.user_id=p_invitee_user_id
      and not coalesce(dr.is_buffacoin,false)
      and dr.crispiness is not null and dr.sauce is not null
      and dr.meat is not null and dr.overall is not null
  ) then return jsonb_build_object('qualified',false,'reason','rating_not_eligible'); end if;
  if exists(
    select 1 from public.destination_ratings prior
    join public.destination_ratings current_rating on current_rating.id=p_rating_id
    where prior.user_id=p_invitee_user_id and prior.id<>p_rating_id
      and not coalesce(prior.is_buffacoin,false)
      and prior.crispiness is not null and prior.sauce is not null
      and prior.meat is not null and prior.overall is not null
      and prior.created_at<=current_rating.created_at
  ) then
    update public.referral_attributions set status='rejected',rejected_at=now(),
      rejection_reason='not_first_valid_rating',updated_at=now() where id=v_attr.id;
    return jsonb_build_object('qualified',false,'reason','not_first_valid_rating');
  end if;
  if v_attr.onboarding_completed_at is null then
    return jsonb_build_object('qualified',false,'reason','onboarding_incomplete');
  end if;
  if v_attr.expired_at is not null and v_attr.expired_at<=now() then
    update public.referral_attributions set status='expired',updated_at=now() where id=v_attr.id;
    return jsonb_build_object('qualified',false,'reason','expired');
  end if;
  if v_attr.inviter_user_id=p_invitee_user_id then
    update public.referral_attributions set status='rejected',rejected_at=now(),
      rejection_reason='self_referral',updated_at=now() where id=v_attr.id;
    return jsonb_build_object('qualified',false,'reason','self_referral');
  end if;
  if not exists(select 1 from auth.users where id=v_attr.inviter_user_id
      and deleted_at is null and (banned_until is null or banned_until<now()))
    or not exists(select 1 from auth.users where id=p_invitee_user_id
      and deleted_at is null and (banned_until is null or banned_until<now())) then
    update public.referral_attributions set status='rejected',rejected_at=now(),
      rejection_reason='account_unavailable',updated_at=now() where id=v_attr.id;
    return jsonb_build_object('qualified',false,'reason','account_unavailable');
  end if;
  select * into v_cfg from public.referral_reward_config where config_key='default' and is_enabled;
  if not found then return jsonb_build_object('qualified',false,'reason','program_disabled'); end if;
  update public.referral_attributions set status='qualified',qualified_at=now(),
    qualifying_rating_id=p_rating_id,updated_at=now() where id=v_attr.id;
  if now()-coalesce(v_attr.signed_up_at,v_attr.created_at)<interval '10 minutes' then
    insert into public.referral_abuse_signals(
      referral_attribution_id,signal_type,severity,deduplication_key,details
    ) values(v_attr.id,'rapid_qualification','review',
      'rapid_qualification:'||v_attr.id,
      jsonb_build_object('seconds_since_signup',
        extract(epoch from now()-coalesce(v_attr.signed_up_at,v_attr.created_at))::int))
    on conflict(deduplication_key) do nothing;
  end if;
  if (
    select count(*) from public.referral_attributions
    where inviter_user_id=v_attr.inviter_user_id
      and qualified_at>now()-interval '1 hour'
  )>=5 then
    insert into public.referral_abuse_signals(
      referral_attribution_id,signal_type,severity,deduplication_key,details
    ) values(v_attr.id,'inviter_velocity','review',
      'inviter_velocity:'||v_attr.id,
      jsonb_build_object('window','1_hour'))
    on conflict(deduplication_key) do nothing;
  end if;
  v_inviter_ledger:=public.award_referral_xp_internal(
    v_attr.inviter_user_id,v_cfg.inviter_reward_xp,v_attr.id,'inviter');
  v_invitee_ledger:=public.award_referral_xp_internal(
    p_invitee_user_id,v_cfg.invitee_reward_xp,v_attr.id,'invitee');
  insert into public.referral_rewards(
    referral_attribution_id,recipient_user_id,recipient_role,reward_amount,
    ledger_entry_id,idempotency_key
  ) values
    (v_attr.id,v_attr.inviter_user_id,'inviter',v_cfg.inviter_reward_xp,
      v_inviter_ledger,format('referral:%s:inviter:qualification',v_attr.id)),
    (v_attr.id,p_invitee_user_id,'invitee',v_cfg.invitee_reward_xp,
      v_invitee_ledger,format('referral:%s:invitee:qualification',v_attr.id))
  on conflict(referral_attribution_id,recipient_role,reward_type) do nothing;
  update public.referral_attributions set status='rewarded',rewarded_at=now(),updated_at=now()
    where id=v_attr.id;
  insert into public.referral_in_app_notifications(
    user_id,referral_attribution_id,event_type,title,body
  ) values
    (v_attr.inviter_user_id,v_attr.id,'friend_qualified','Referral reward earned',
      'Your friend rated their first wing spot. Your reward is ready.'),
    (p_invitee_user_id,v_attr.id,'invitee_qualified','First rating complete',
      'Your referral reward is ready.')
  on conflict do nothing;
  perform public.enqueue_referral_push_internal(
    v_attr.inviter_user_id,v_attr.id,'referral_friend_qualified',
    'Referral reward earned',
    'Your friend rated their first wing spot. Your reward is ready.');
  perform public.enqueue_referral_push_internal(
    p_invitee_user_id,v_attr.id,'referral_invitee_qualified',
    'First rating complete','Your referral reward is ready.');
  v_badges:=public.sync_verified_referral_badges_internal(v_attr.inviter_user_id);
  insert into public.user_events(user_id,session_id,event_name,metadata)
  values
    (v_attr.inviter_user_id,gen_random_uuid(),'referral_qualification_completed',
      jsonb_build_object('referral_attribution_id',v_attr.id,
        'reward_amount',v_cfg.inviter_reward_xp,'recipient_role','inviter')),
    (v_attr.inviter_user_id,gen_random_uuid(),'referral_reward_issued',
      jsonb_build_object('referral_attribution_id',v_attr.id,
        'reward_amount',v_cfg.inviter_reward_xp,'recipient_role','inviter')),
    (p_invitee_user_id,gen_random_uuid(),'referral_reward_issued',
      jsonb_build_object('referral_attribution_id',v_attr.id,
        'reward_amount',v_cfg.invitee_reward_xp,'recipient_role','invitee'))
  on conflict do nothing;
  return jsonb_build_object('qualified',true,'attribution_id',v_attr.id,
    'inviter_reward',v_cfg.inviter_reward_xp,'invitee_reward',v_cfg.invitee_reward_xp,
    'badge_progress',v_badges);
end;
$$;

create or replace function public.submit_validated_crawl_rating(
  p_crawl_id uuid,p_destination_id uuid,p_latitude double precision,
  p_longitude double precision,p_accuracy_m double precision,
  p_crispiness smallint,p_sauce smallint,p_meat smallint,p_overall smallint,
  p_wings_eaten smallint default 0,p_tag_id bigint default null,
  p_sauce_style smallint default null,p_spice_level smallint default null,
  p_would_order_again boolean default null,p_flavor_vibe smallint[] default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_user uuid:=auth.uid(); v_crawl public.crawls%rowtype; v_dest public.destinations%rowtype;
  v_rating_id uuid; v_distance_m double precision; v_referral jsonb;
  v_stop_order integer;
  v_is_admin boolean:=auth.uid()='23898359-306a-4dd3-91f0-da66da19ccfc'::uuid;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if p_crispiness not between 1 and 10 or p_sauce not between 1 and 10
    or p_meat not between 1 and 10 or p_overall not between 1 and 10 then
    raise exception 'invalid_rating_scores';
  end if;
  select * into v_crawl from public.crawls where crawl_id=p_crawl_id and user_id=v_user;
  if not found then raise exception 'crawl_not_owned'; end if;
  if not exists(
    select 1 from public.routes r where r.id=v_crawl.route_id and p_destination_id in
      (r.stop1_id,r.stop2_id,r.stop3_id,r.stop4_id,r.stop5_id)
  ) and not exists(
    select 1 from public.route_ordered_destinations rod
      where rod.route_id=v_crawl.route_id and rod.destination_id=p_destination_id
  ) then raise exception 'destination_not_in_crawl'; end if;
  select coalesce(
    (select rod.stop_order from public.route_ordered_destinations rod
      where rod.route_id=v_crawl.route_id and rod.destination_id=p_destination_id limit 1),
    (select array_position(
      array[r.stop1_id,r.stop2_id,r.stop3_id,r.stop4_id,r.stop5_id],
      p_destination_id
    ) from public.routes r where r.id=v_crawl.route_id)
  ) into v_stop_order;
  if exists(
    with route_stops as (
      select rod.destination_id,rod.stop_order
      from public.route_ordered_destinations rod where rod.route_id=v_crawl.route_id
      union all
      select x.destination_id,x.stop_order
      from public.routes r
      cross join lateral unnest(array[
        r.stop1_id,r.stop2_id,r.stop3_id,r.stop4_id,r.stop5_id
      ]) with ordinality x(destination_id,stop_order)
      where r.id=v_crawl.route_id
        and not exists(select 1 from public.route_ordered_destinations
          where route_id=v_crawl.route_id)
    )
    select 1 from route_stops s
    where s.destination_id is not null and s.stop_order<v_stop_order
      and not exists(
        select 1 from public.destination_ratings dr
        where dr.crawl_id=p_crawl_id and dr.user_id=v_user
          and dr.destination_id=s.destination_id
      )
  ) then raise exception 'crawl_stop_order_failed'; end if;
  select * into v_dest from public.destinations where id=p_destination_id;
  if not found or v_dest.lat is null or v_dest.lng is null then
    raise exception 'destination_location_missing';
  end if;
  if not v_is_admin then
    if p_latitude is null or p_longitude is null
      or p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then
      raise exception 'location_required';
    end if;
    if p_accuracy_m is not null and (p_accuracy_m<0 or p_accuracy_m>10000) then
      raise exception 'location_accuracy_invalid';
    end if;
    v_distance_m:=6371000*2*asin(sqrt(
      power(sin(radians((v_dest.lat::double precision-p_latitude)/2)),2)+
      cos(radians(p_latitude))*cos(radians(v_dest.lat::double precision))*
      power(sin(radians((v_dest.lng::double precision-p_longitude)/2)),2)
    ));
    -- Hidden operational acceptance tolerance. Public copy remains 100 yards.
    if v_distance_m is null or v_distance_m>804.67 then
      raise exception 'rating_proximity_failed';
    end if;
  end if;
  insert into public.destination_ratings(
    destination_id,crawl_id,user_id,crispiness,sauce,meat,overall,wings_eaten,
    tag_id,sauce_style,spice_level,would_order_again,flavor_vibe,is_buffacoin
  ) values(
    p_destination_id,p_crawl_id,v_user,p_crispiness,p_sauce,p_meat,p_overall,
    coalesce(p_wings_eaten,0),p_tag_id,p_sauce_style,p_spice_level,
    p_would_order_again,p_flavor_vibe,false
  )
  on conflict(destination_id,crawl_id,user_id) do update set
    crispiness=excluded.crispiness,sauce=excluded.sauce,meat=excluded.meat,
    overall=excluded.overall,wings_eaten=excluded.wings_eaten,tag_id=excluded.tag_id,
    sauce_style=excluded.sauce_style,spice_level=excluded.spice_level,
    would_order_again=excluded.would_order_again,flavor_vibe=excluded.flavor_vibe
  returning id into v_rating_id;
  -- Rating acceptance and referral settlement are one transaction. Any settlement
  -- error rolls the rating back; retries are protected by database uniqueness.
  v_referral:=public.settle_referral_for_rating_internal(v_user,v_rating_id);
  return jsonb_build_object('rating_id',v_rating_id,'accepted',true,
    'referral',v_referral);
end;
$$;

create or replace function public.get_referral_hub()
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_user uuid:=auth.uid(); v_code text; v_cfg public.referral_reward_config%rowtype;
  v_qualified int; v_pending int; v_joined int; v_rewards int; v_recent jsonb;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  select e.code into v_code from public.ensure_referral_code(v_user) e limit 1;
  select * into v_cfg from public.referral_reward_config where config_key='default';
  select
    count(*) filter(where status in('signed_up','pending_qualification'))::int,
    count(*) filter(where status in('qualified','rewarded'))::int,
    count(*) filter(where invitee_user_id is not null)::int
  into v_pending,v_qualified,v_joined
  from public.referral_attributions where inviter_user_id=v_user;
  select coalesce(sum(reward_amount),0)::int into v_rewards
    from public.referral_rewards where recipient_user_id=v_user and reward_amount>0;
  select coalesce(jsonb_agg(x order by x.created_at desc),'[]'::jsonb) into v_recent
  from (
    select id,created_at,
      case when status='clicked' then 'Invitation opened'
        when status in('claimed','signed_up','pending_qualification') then 'First rating pending'
        when status in('qualified','rewarded') then 'Reward earned'
        else 'Invitation closed' end as status_label
    from public.referral_attributions where inviter_user_id=v_user
    order by created_at desc limit 10
  ) x;
  return jsonb_build_object(
    'code',v_code,'joined_count',v_joined,'pending_count',v_pending,
    'qualified_count',v_qualified,'total_rewards',v_rewards,
    'inviter_reward_xp',v_cfg.inviter_reward_xp,
    'invitee_reward_xp',v_cfg.invitee_reward_xp,
    'next_badge_threshold',case when v_qualified<1 then 1 when v_qualified<5 then 5
      when v_qualified<10 then 10 else null end,
    'recent',v_recent
  );
end;
$$;

create or replace function public.reconcile_referrals(p_dry_run boolean default true)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_missing_rewards int; v_badge_mismatches int; v_invalid int;
  v_qualified int; v_ledger_mismatches int; v_duplicate_rewards int; v_user uuid;
begin
  select count(*)::int into v_qualified from public.referral_attributions
    where status in('qualified','rewarded');
  select count(*)::int into v_missing_rewards
  from public.referral_attributions a
  where a.status='rewarded' and (
    select count(*) from public.referral_rewards r
      where r.referral_attribution_id=a.id and r.reward_type='qualification_xp'
  )<>2;
  select count(*)::int into v_invalid from public.referral_attributions
   where inviter_user_id=invitee_user_id
      or (status='rewarded' and (qualified_at is null or rewarded_at is null));
  select count(*)::int into v_ledger_mismatches
  from public.referral_rewards r left join public.xp_ledger x on x.id=r.ledger_entry_id
  where x.id is null or x.user_id<>r.recipient_user_id or x.amount<>r.reward_amount
    or x.referral_id<>r.referral_attribution_id
    or x.idempotency_key<>r.idempotency_key;
  select count(*)::int into v_duplicate_rewards from (
    select referral_attribution_id,recipient_role,reward_type
    from public.referral_rewards group by 1,2,3 having count(*)>1
  ) d;
  with verified as (
    select inviter_user_id,count(*)::int n from public.referral_attributions
    where status in('qualified','rewarded') and review_status<>'rejected'
    group by inviter_user_id
  ), expected as (
    select v.inviter_user_id,r.code,(v.n>=r.threshold) should_have
    from verified v cross join (values
      ('referral_1',1),('referral_5',5),('referral_10',10)
    ) r(code,threshold)
  )
  select count(*)::int into v_badge_mismatches
  from expected e left join public.badge_catalog b on b.code=e.code
  where e.should_have is distinct from exists(
    select 1 from public.user_badges ub
    where ub.user_id=e.inviter_user_id and ub.badge_id=b.id
  );
  if not p_dry_run then
    for v_user in select distinct inviter_user_id from public.referral_attributions
    loop perform public.sync_verified_referral_badges_internal(v_user); end loop;
    insert into public.referral_abuse_signals(
      referral_attribution_id,signal_type,severity,deduplication_key,details
    )
    select a.id,'ledger_inconsistency','high','ledger_inconsistency:'||a.id,
      jsonb_build_object('reason','missing_or_inconsistent_reward_ledger')
    from public.referral_attributions a
    where a.status='rewarded' and (
      select count(*) from public.referral_rewards r
      where r.referral_attribution_id=a.id and r.reward_type='qualification_xp'
    )<>2
    on conflict(deduplication_key) do nothing;
  end if;
  return jsonb_build_object('dry_run',p_dry_run,'qualified_referrals',v_qualified,
    'missing_reward_sets',v_missing_rewards,'ledger_mismatches',v_ledger_mismatches,
    'duplicate_reward_sets',v_duplicate_rewards,'invalid_status_rows',v_invalid,
    'badge_mismatches',v_badge_mismatches,
    'apply_actions',case when p_dry_run then 0 else v_badge_mismatches+v_missing_rewards end);
end;
$$;

create or replace function public.flag_referral_account_deletion()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.referral_abuse_signals(
    referral_attribution_id,signal_type,severity,deduplication_key,details
  )
  select a.id,'invitee_deleted','review','invitee_deleted:'||a.id,
    jsonb_build_object('status_at_deletion',a.status)
  from public.referral_attributions a where a.invitee_user_id=old.id
  on conflict(deduplication_key) do nothing;
  return old;
end;
$$;
drop trigger if exists auth_user_referral_deletion_signal on auth.users;
create trigger auth_user_referral_deletion_signal before delete on auth.users
  for each row execute function public.flag_referral_account_deletion();

create or replace function public.reverse_referral_reward(
  p_referral_attribution_id uuid,p_reason text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_attr public.referral_attributions%rowtype; v_reward public.referral_rewards%rowtype;
  v_ledger uuid;
begin
  if nullif(btrim(coalesce(p_reason,'')),'') is null then
    raise exception 'reversal_reason_required';
  end if;
  select * into v_attr from public.referral_attributions
    where id=p_referral_attribution_id for update;
  if not found then raise exception 'referral_not_found'; end if;
  if v_attr.status='reversed' then
    return jsonb_build_object('reversed',false,'reason','already_reversed');
  end if;
  if v_attr.status<>'rewarded' then
    return jsonb_build_object('reversed',false,'reason','not_rewarded');
  end if;
  for v_reward in select * from public.referral_rewards
    where referral_attribution_id=v_attr.id and reward_type='qualification_xp'
  loop
    v_ledger:=public.award_referral_xp_internal(
      v_reward.recipient_user_id,-abs(v_reward.reward_amount),v_attr.id,
      'reversal_'||v_reward.recipient_role);
    insert into public.referral_rewards(
      referral_attribution_id,recipient_user_id,recipient_role,reward_type,
      reward_amount,ledger_entry_id,idempotency_key
    ) values(
      v_attr.id,v_reward.recipient_user_id,v_reward.recipient_role,'reversal_xp',
      -abs(v_reward.reward_amount),v_ledger,
      format('referral:%s:reversal_%s',v_attr.id,v_reward.recipient_role)
    ) on conflict(referral_attribution_id,recipient_role,reward_type) do nothing;
  end loop;
  update public.referral_attributions set status='reversed',reversed_at=now(),
    rejection_reason=left(p_reason,240),updated_at=now() where id=v_attr.id;
  perform public.sync_verified_referral_badges_internal(v_attr.inviter_user_id);
  insert into public.referral_abuse_signals(
    referral_attribution_id,signal_type,severity,deduplication_key,details
  ) values(v_attr.id,'rating_reversed','high','rating_reversed:'||v_attr.id,
    jsonb_build_object('reason',left(p_reason,240)))
  on conflict(deduplication_key) do nothing;
  return jsonb_build_object('reversed',true,'attribution_id',v_attr.id);
end;
$$;

create or replace view public.referral_reporting_daily as
select
  date_trunc('day',coalesce(a.clicked_at,a.created_at))::date as report_date,
  coalesce(a.source,'unknown') as source,
  coalesce(a.campaign,'none') as campaign,
  coalesce(a.placement,'unknown') as placement,
  count(*)::bigint as link_opens,
  count(*) filter(where a.invitee_user_id is not null)::bigint as attributed_signups,
  count(*) filter(where a.status in('qualified','rewarded','reversed'))::bigint
    as qualified_referrals,
  round(100.0*count(*) filter(where a.status in('qualified','rewarded','reversed'))
    /nullif(count(*) filter(where a.invitee_user_id is not null),0),2)
    as signup_to_first_rating_percent,
  avg(a.qualified_at-a.signed_up_at)
    filter(where a.qualified_at is not null and a.signed_up_at is not null)
    as average_time_to_qualification,
  coalesce(sum(r.reward_cost_xp),0)::bigint as reward_cost_xp,
  count(*) filter(where a.review_status in('flagged','under_review','rejected'))::bigint
    as suspicious_or_rejected
from public.referral_attributions a
left join (
  select referral_attribution_id,
    sum(reward_amount) filter(where reward_amount>0) as reward_cost_xp
  from public.referral_rewards group by referral_attribution_id
) r on r.referral_attribution_id=a.id
group by 1,2,3,4;
revoke all on public.referral_reporting_daily from public,anon,authenticated;
grant select on public.referral_reporting_daily to service_role;

create or replace view public.referral_funnel_summary as
select
  (select count(*) from public.user_events
    where event_name='referral_share_completed')::bigint as invitations_shared,
  (select count(*) from public.referral_attributions where clicked_at is not null)::bigint
    as link_opens,
  (select count(*) from public.referral_attributions where invitee_user_id is not null)::bigint
    as attributed_signups,
  (select count(*) from public.referral_attributions
    where status in('qualified','rewarded','reversed'))::bigint as qualified_referrals,
  round(100.0*(select count(*) from public.referral_attributions
      where status in('qualified','rewarded','reversed'))
    /nullif((select count(*) from public.referral_attributions
      where invitee_user_id is not null),0),2) as signup_to_first_rating_percent,
  (select avg(qualified_at-signed_up_at) from public.referral_attributions
    where qualified_at is not null and signed_up_at is not null)
    as average_time_to_qualification,
  (select coalesce(sum(reward_amount),0) from public.referral_rewards
    where reward_amount>0)::bigint as reward_cost_xp,
  (select coalesce(avg(referral_count),0) from (
    select count(*)::numeric referral_count from public.referral_attributions
    where status in('qualified','rewarded','reversed') group by inviter_user_id
  ) q)::numeric(12,2) as qualified_referrals_per_inviter,
  (select metadata->>'placement' from public.user_events
    where event_name='referral_share_completed' and metadata ? 'placement'
    group by metadata->>'placement' order by count(*) desc limit 1) as top_share_placement,
  (select count(*) from public.referral_attributions
    where status='rejected' or review_status in('flagged','under_review','rejected'))::bigint
    as rejected_or_suspicious,
  round(100.0*(select count(distinct a.invitee_user_id)
      from public.referral_attributions a
      where a.qualified_at is not null and exists(
        select 1 from public.destination_ratings dr
        where dr.user_id=a.invitee_user_id
          and dr.created_at>=a.qualified_at+interval '7 days'
      ))
    /nullif((select count(*) from public.referral_attributions
      where qualified_at is not null),0),2) as referred_user_7d_return_percent;
revoke all on public.referral_funnel_summary from public,anon,authenticated;
grant select on public.referral_funnel_summary to service_role;

-- Bind new referral ledger rows to attributions without risking deployment failure on
-- unverifiable historical non-null values. Staging must inspect and VALIDATE this FK.
do $$ begin
  if not exists(select 1 from pg_constraint where conname='xp_ledger_referral_id_fkey') then
    alter table public.xp_ledger add constraint xp_ledger_referral_id_fkey
      foreign key(referral_id) references public.referral_attributions(id) not valid;
  end if;
end $$;

revoke all on function public.generate_referral_code() from public,anon,authenticated;
revoke all on function public.provision_referral_code_internal(uuid)
  from public,anon,authenticated;
revoke all on function public.ensure_new_user_referral_code() from public,anon,authenticated;
revoke all on function public.award_referral_xp_internal(uuid,integer,uuid,text)
  from public,anon,authenticated;
revoke all on function public.sync_verified_referral_badges_internal(uuid)
  from public,anon,authenticated;
revoke all on function public.settle_referral_for_rating_internal(uuid,uuid)
  from public,anon,authenticated;
revoke all on function public.enqueue_referral_push_internal(uuid,uuid,text,text,text)
  from public,anon,authenticated;
revoke all on function public.ensure_referral_code(uuid) from public,anon;
revoke all on function public.get_referral_public_config() from public;
revoke all on function public.validate_referral_code(text) from public;
revoke all on function public.record_referral_click(text,text,text,text,text) from public;
revoke all on function public.get_referral_hub() from public,anon;
revoke all on function public.claim_referral(text,text,text,text,text) from public,anon;
revoke all on function public.mark_referral_onboarding_complete() from public,anon;
revoke all on function public.submit_validated_crawl_rating(
  uuid,uuid,double precision,double precision,double precision,
  smallint,smallint,smallint,smallint,smallint,bigint,smallint,smallint,boolean,smallint[]
) from public,anon;
revoke all on function public.reconcile_referrals(boolean) from public,anon,authenticated;
revoke all on function public.flag_referral_account_deletion()
  from public,anon,authenticated;
revoke all on function public.reverse_referral_reward(uuid,text)
  from public,anon,authenticated;

grant execute on function public.ensure_referral_code(uuid) to authenticated;
grant execute on function public.get_referral_public_config() to anon,authenticated;
grant execute on function public.validate_referral_code(text) to anon,authenticated;
grant execute on function public.record_referral_click(text,text,text,text,text)
  to anon,authenticated;
grant execute on function public.get_referral_hub() to authenticated;
grant execute on function public.claim_referral(text,text,text,text,text) to authenticated;
grant execute on function public.mark_referral_onboarding_complete() to authenticated;
grant execute on function public.submit_validated_crawl_rating(
  uuid,uuid,double precision,double precision,double precision,
  smallint,smallint,smallint,smallint,smallint,bigint,smallint,smallint,boolean,smallint[]
) to authenticated;
grant execute on function public.reconcile_referrals(boolean) to service_role;
grant execute on function public.reverse_referral_reward(uuid,text) to service_role;

comment on table public.referral_attributions is
  'Private referral lifecycle and abuse-review record. Clients use privacy-safe RPCs.';
comment on function public.submit_validated_crawl_rating(
  uuid,uuid,double precision,double precision,double precision,
  smallint,smallint,smallint,smallint,smallint,bigint,smallint,smallint,boolean,smallint[]
) is 'Canonical authenticated crawl-rating transaction. Public guidance is 100 yards; hidden operational GPS tolerance is 0.5 mile. Accepted rating and referral settlement commit or roll back together.';

commit;
