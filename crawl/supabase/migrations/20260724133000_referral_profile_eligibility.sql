-- Additive referral profile-eligibility hardening.
-- Do not edit or rerun the referral v1 or current-schema reconciliation migrations.
-- This migration is intentionally forward-only and does not enable the program.

begin;

alter table public.referral_codes
  add column if not exists dormant_due_to_missing_profile boolean not null default false;

-- Preserve every code. Existing codes owned by an account without a public profile
-- become dormant; a later legitimate profile can restore the same code.
update public.referral_codes c
set is_active = false,
    dormant_due_to_missing_profile = true,
    updated_at = now()
where c.is_active
  and not exists (select 1 from auth.users au where au.id = c.user_id
    and au.deleted_at is null
    and (au.banned_until is null or au.banned_until < now()))
  or (c.is_active and not exists (
    select 1 from public.users pu where pu.user_id = c.user_id
  ));

create or replace function public.referral_profile_eligibility(p_user_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select p_user_id is not null
    and exists (
      select 1 from auth.users au
      where au.id = p_user_id
        and au.deleted_at is null
        and (au.banned_until is null or au.banned_until < now())
    )
    and exists (select 1 from public.users pu where pu.user_id = p_user_id);
$$;

create or replace function public.refresh_referral_code_profile_eligibility(p_user_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  update public.referral_codes c
  set is_active = true,
      dormant_due_to_missing_profile = false,
      updated_at = now()
  where c.user_id = p_user_id
    and c.dormant_due_to_missing_profile
    and public.referral_profile_eligibility(c.user_id);

  update public.referral_codes c
  set is_active = false,
      dormant_due_to_missing_profile = true,
      updated_at = now()
  where c.user_id = p_user_id
    and c.is_active
    and not public.referral_profile_eligibility(c.user_id);
end;
$$;

create or replace function public.restore_referral_code_after_profile_insert()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  perform public.refresh_referral_code_profile_eligibility(new.user_id);
  return new;
end;
$$;

create or replace function public.refresh_referral_code_after_profile_delete()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  perform public.refresh_referral_code_profile_eligibility(old.user_id);
  return old;
end;
$$;

create trigger referral_code_profile_eligibility
after insert or update of user_id on public.users
for each row execute function public.restore_referral_code_after_profile_insert();
create trigger referral_code_profile_eligibility_delete
after delete on public.users
for each row execute function public.refresh_referral_code_after_profile_delete();

create or replace function public.refresh_referral_code_after_auth_change()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  perform public.refresh_referral_code_profile_eligibility(new.id);
  return new;
end;
$$;

create trigger referral_code_profile_eligibility_auth
after insert or update of deleted_at, banned_until on auth.users
for each row execute function public.refresh_referral_code_after_auth_change();

create or replace function public.validate_referral_code(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_code public.referral_codes%rowtype; v_cfg public.referral_reward_config%rowtype;
begin
  select * into v_cfg from public.referral_reward_config where config_key = 'default';
  select * into v_code from public.referral_codes c
  where lower(c.code) = lower(btrim(coalesce(p_code, '')))
    and c.is_active and public.referral_profile_eligibility(c.user_id);
  return jsonb_build_object(
    'valid', found and coalesce(v_cfg.is_enabled, false)
      and (v_cfg.starts_at is null or v_cfg.starts_at <= now())
      and (v_cfg.ends_at is null or v_cfg.ends_at > now()),
    'code', case when found then v_code.code else null end,
    'reason', case
      when not found then 'invalid_or_disabled'
      when not coalesce(v_cfg.is_enabled, false) then 'program_disabled'
      when v_cfg.starts_at is not null and v_cfg.starts_at > now() then 'campaign_not_started'
      when v_cfg.ends_at is not null and v_cfg.ends_at <= now() then 'campaign_expired'
      else null end
  );
end;
$$;

create or replace function public.record_referral_click(
  p_code text, p_anonymous_install_id text, p_source text default 'shared_link',
  p_campaign text default null, p_placement text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_code public.referral_codes%rowtype; v_id uuid; v_hash text;
begin
  if char_length(coalesce(p_anonymous_install_id, '')) not between 16 and 160 then
    return jsonb_build_object('recognized', false, 'reason', 'invalid_installation_id');
  end if;
  select * into v_code from public.referral_codes c
  where lower(c.code) = lower(btrim(coalesce(p_code, '')))
    and c.is_active and public.referral_profile_eligibility(c.user_id);
  if not found then return jsonb_build_object('recognized', false, 'reason', 'invalid_or_disabled'); end if;
  v_hash := encode(extensions.digest(convert_to(p_anonymous_install_id, 'UTF8'), 'sha256'), 'hex');
  insert into public.referral_attributions(
    referral_code_id, inviter_user_id, anonymous_install_hash, source, campaign, placement,
    status, clicked_at, expired_at
  ) values (
    v_code.id, v_code.user_id, v_hash, left(coalesce(nullif(p_source, ''), 'shared_link'), 64),
    nullif(left(coalesce(p_campaign, ''), 80), ''), nullif(left(coalesce(p_placement, ''), 80), ''),
    'clicked', now(), now() + interval '30 days'
  )
  on conflict (referral_code_id, anonymous_install_hash)
    where invitee_user_id is null and anonymous_install_hash is not null and status = 'clicked'
  do update set clicked_at = least(referral_attributions.clicked_at, excluded.clicked_at), updated_at = now()
  returning id into v_id;
  return jsonb_build_object('recognized', true, 'attribution_id', v_id, 'code', v_code.code);
end;
$$;

create or replace function public.claim_referral(
  p_code text, p_anonymous_install_id text default null,
  p_source text default 'manual', p_campaign text default null, p_placement text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid(); v_auth_created timestamptz; v_code public.referral_codes%rowtype;
  v_cfg public.referral_reward_config%rowtype; v_attr public.referral_attributions%rowtype; v_hash text;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  select created_at into v_auth_created from auth.users where id = v_user
    and deleted_at is null and (banned_until is null or banned_until < now());
  if not found then return jsonb_build_object('claimed', false, 'reason', 'account_unavailable'); end if;
  select * into v_cfg from public.referral_reward_config where config_key = 'default' and is_enabled;
  if not found then return jsonb_build_object('claimed', false, 'reason', 'program_disabled'); end if;
  if now() - v_auth_created > v_cfg.claim_window then return jsonb_build_object('claimed', false, 'reason', 'existing_account'); end if;
  if exists (select 1 from public.destination_ratings where user_id = v_user) then
    return jsonb_build_object('claimed', false, 'reason', 'existing_activity');
  end if;
  select * into v_code from public.referral_codes c
  where lower(c.code) = lower(btrim(coalesce(p_code, '')))
    and c.is_active and public.referral_profile_eligibility(c.user_id);
  if not found then return jsonb_build_object('claimed', false, 'reason', 'invalid_or_disabled'); end if;
  if v_code.user_id = v_user then return jsonb_build_object('claimed', false, 'reason', 'self_referral'); end if;
  if exists (select 1 from public.referral_attributions where invitee_user_id = v_user) then
    select * into v_attr from public.referral_attributions where invitee_user_id = v_user;
    return jsonb_build_object('claimed', v_attr.inviter_user_id = v_code.user_id,
      'reason', 'already_claimed', 'status', v_attr.status, 'attribution_id', v_attr.id);
  end if;
  if nullif(p_anonymous_install_id, '') is not null then
    v_hash := encode(extensions.digest(convert_to(p_anonymous_install_id, 'UTF8'), 'sha256'), 'hex');
    select * into v_attr from public.referral_attributions
    where referral_code_id = v_code.id and anonymous_install_hash = v_hash
      and invitee_user_id is null and status = 'clicked'
    order by clicked_at desc limit 1 for update;
  end if;
  if v_attr.id is null then
    insert into public.referral_attributions(
      referral_code_id, inviter_user_id, invitee_user_id, anonymous_install_hash,
      source, campaign, placement, status, clicked_at, claimed_at, signed_up_at, expired_at
    ) values (
      v_code.id, v_code.user_id, v_user, v_hash, left(coalesce(nullif(p_source, ''), 'manual'), 64),
      nullif(left(coalesce(p_campaign, ''), 80), ''), nullif(left(coalesce(p_placement, ''), 80), ''),
      'pending_qualification', now(), now(), v_auth_created, now() + v_cfg.attribution_ttl
    ) returning * into v_attr;
  else
    update public.referral_attributions set invitee_user_id = v_user, status = 'pending_qualification',
      claimed_at = now(), signed_up_at = v_auth_created, updated_at = now()
    where id = v_attr.id returning * into v_attr;
  end if;

  -- Deferred attribution is allowed, but profile-dependent side effects are not.
  if public.referral_profile_eligibility(v_user) then
    insert into public.referral_in_app_notifications(user_id, referral_attribution_id, event_type, title, body)
    values (v_attr.inviter_user_id, v_attr.id, 'friend_joined', 'Your wing buddy joined Buffago',
      'Their first wing rating is still pending.') on conflict do nothing;
    perform public.enqueue_referral_push_internal(v_attr.inviter_user_id, v_attr.id,
      'referral_friend_joined', 'Your wing buddy joined Buffago', 'Their first wing rating is still pending.');
    insert into public.user_events(user_id, session_id, event_name, metadata)
    values (v_attr.inviter_user_id, gen_random_uuid(), 'referred_user_signed_up',
      jsonb_build_object('referral_attribution_id', v_attr.id, 'source', v_attr.source,
        'campaign', v_attr.campaign, 'placement', v_attr.placement)) on conflict do nothing;
  end if;
  return jsonb_build_object('claimed', true, 'status', v_attr.status, 'attribution_id', v_attr.id);
end;
$$;

create or replace function public.mark_referral_onboarding_complete()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_attr public.referral_attributions%rowtype;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  update public.referral_attributions set onboarding_completed_at = coalesce(onboarding_completed_at, now()), updated_at = now()
  where invitee_user_id = auth.uid() and status = 'pending_qualification' returning * into v_attr;
  return jsonb_build_object('recorded', v_attr.id is not null, 'attribution_id', v_attr.id);
end;
$$;

create or replace function public.settle_referral_for_rating_internal(p_invitee_user_id uuid, p_rating_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_attr public.referral_attributions%rowtype; v_cfg public.referral_reward_config%rowtype;
  v_inviter_ledger uuid; v_invitee_ledger uuid; v_badges jsonb;
begin
  select * into v_attr from public.referral_attributions where invitee_user_id = p_invitee_user_id
    and status = 'pending_qualification' for update;
  if not found then return jsonb_build_object('qualified', false, 'reason', 'no_pending_referral'); end if;
  if not public.referral_profile_eligibility(v_attr.inviter_user_id)
     or not public.referral_profile_eligibility(p_invitee_user_id) then
    return jsonb_build_object('qualified', false, 'reason', 'profile_required');
  end if;
  if not exists (select 1 from public.destination_ratings dr where dr.id = p_rating_id and dr.user_id = p_invitee_user_id
    and not coalesce(dr.is_buffacoin, false) and dr.crispiness is not null and dr.sauce is not null
    and dr.meat is not null and dr.overall is not null) then
    return jsonb_build_object('qualified', false, 'reason', 'rating_not_eligible');
  end if;
  if exists (select 1 from public.destination_ratings prior join public.destination_ratings current_rating on current_rating.id = p_rating_id
    where prior.user_id = p_invitee_user_id and prior.id <> p_rating_id and not coalesce(prior.is_buffacoin, false)
      and prior.crispiness is not null and prior.sauce is not null and prior.meat is not null and prior.overall is not null
      and prior.created_at <= current_rating.created_at) then
    update public.referral_attributions set status = 'rejected', rejected_at = now(), rejection_reason = 'not_first_valid_rating', updated_at = now() where id = v_attr.id;
    return jsonb_build_object('qualified', false, 'reason', 'not_first_valid_rating');
  end if;
  if v_attr.onboarding_completed_at is null then return jsonb_build_object('qualified', false, 'reason', 'onboarding_incomplete'); end if;
  if v_attr.expired_at is not null and v_attr.expired_at <= now() then
    update public.referral_attributions set status = 'expired', updated_at = now() where id = v_attr.id;
    return jsonb_build_object('qualified', false, 'reason', 'expired');
  end if;
  if v_attr.inviter_user_id = p_invitee_user_id then return jsonb_build_object('qualified', false, 'reason', 'self_referral'); end if;
  select * into v_cfg from public.referral_reward_config where config_key = 'default' and is_enabled;
  if not found then return jsonb_build_object('qualified', false, 'reason', 'program_disabled'); end if;
  update public.referral_attributions set status = 'qualified', qualified_at = now(), qualifying_rating_id = p_rating_id, updated_at = now() where id = v_attr.id;
  v_inviter_ledger := public.award_referral_xp_internal(v_attr.inviter_user_id, v_cfg.inviter_reward_xp, v_attr.id, 'inviter');
  v_invitee_ledger := public.award_referral_xp_internal(p_invitee_user_id, v_cfg.invitee_reward_xp, v_attr.id, 'invitee');
  insert into public.referral_rewards(referral_attribution_id, recipient_user_id, recipient_role, reward_amount, ledger_entry_id, idempotency_key)
  values (v_attr.id, v_attr.inviter_user_id, 'inviter', v_cfg.inviter_reward_xp, v_inviter_ledger, format('referral:%s:inviter:qualification', v_attr.id)),
         (v_attr.id, p_invitee_user_id, 'invitee', v_cfg.invitee_reward_xp, v_invitee_ledger, format('referral:%s:invitee:qualification', v_attr.id))
  on conflict (referral_attribution_id, recipient_role, reward_type) do nothing;
  update public.referral_attributions set status = 'rewarded', rewarded_at = now(), updated_at = now() where id = v_attr.id;
  insert into public.referral_in_app_notifications(user_id, referral_attribution_id, event_type, title, body)
  values (v_attr.inviter_user_id, v_attr.id, 'friend_qualified', 'Referral reward earned', 'Your friend rated their first wing spot. Your reward is ready.'),
         (p_invitee_user_id, v_attr.id, 'invitee_qualified', 'First rating complete', 'Your referral reward is ready.') on conflict do nothing;
  perform public.enqueue_referral_push_internal(v_attr.inviter_user_id, v_attr.id, 'referral_friend_qualified', 'Referral reward earned', 'Your friend rated their first wing spot. Your reward is ready.');
  perform public.enqueue_referral_push_internal(p_invitee_user_id, v_attr.id, 'referral_invitee_qualified', 'First rating complete', 'Your referral reward is ready.');
  v_badges := public.sync_verified_referral_badges_internal(v_attr.inviter_user_id);
  insert into public.user_events(user_id, session_id, event_name, metadata)
  values (v_attr.inviter_user_id, gen_random_uuid(), 'referral_qualification_completed', jsonb_build_object('referral_attribution_id', v_attr.id)),
         (v_attr.inviter_user_id, gen_random_uuid(), 'referral_reward_issued', jsonb_build_object('referral_attribution_id', v_attr.id, 'reward_amount', v_cfg.inviter_reward_xp)),
         (p_invitee_user_id, gen_random_uuid(), 'referral_reward_issued', jsonb_build_object('referral_attribution_id', v_attr.id, 'reward_amount', v_cfg.invitee_reward_xp)) on conflict do nothing;
  return jsonb_build_object('qualified', true, 'attribution_id', v_attr.id, 'inviter_reward', v_cfg.inviter_reward_xp, 'invitee_reward', v_cfg.invitee_reward_xp, 'badge_progress', v_badges);
end;
$$;

revoke all on function public.referral_profile_eligibility(uuid) from public, anon, authenticated;
revoke all on function public.refresh_referral_code_profile_eligibility(uuid) from public, anon, authenticated;
revoke all on function public.restore_referral_code_after_profile_insert() from public, anon, authenticated;
revoke all on function public.refresh_referral_code_after_profile_delete() from public, anon, authenticated;
revoke all on function public.refresh_referral_code_after_auth_change() from public, anon, authenticated;

commit;
