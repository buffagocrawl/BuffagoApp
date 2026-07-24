import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(
  new URL('../../supabase/migrations/20260724033000_referral_system_v1.sql', import.meta.url),
  'utf8'
);

test('referral migration defines normalized lifecycle and database duplicate defenses', () => {
  for (const table of [
    'referral_reward_config', 'referral_codes', 'referral_attributions',
    'referral_rewards', 'referral_abuse_signals', 'referral_in_app_notifications',
  ]) assert.match(sql, new RegExp(`create table if not exists public\\.${table}`));
  assert.match(sql, /unique \(referral_attribution_id,recipient_role,reward_type\)/);
  assert.match(sql, /unique \(idempotency_key\)/);
  assert.match(sql, /referral_attributions_invitee_unique[\s\S]*invitee_user_id is not null/);
  assert.match(sql, /referral_attributions_rating_unique[\s\S]*qualifying_rating_id is not null/);
});

test('RLS denies direct referral lifecycle and reward mutation', () => {
  assert.match(sql, /alter table public\.referral_attributions enable row level security/);
  assert.match(sql, /revoke all on public\.referral_reward_config[\s\S]*from anon, authenticated/);
  assert.doesNotMatch(sql, /grant (insert|update|delete)[\s\S]*referral_(attributions|rewards)/i);
  assert.match(sql, /revoke all on function public\.settle_referral_for_rating_internal/);
  assert.match(sql, /grant execute on function public\.submit_validated_crawl_rating[\s\S]*to authenticated/);
});

test('canonical rating RPC owns proximity acceptance and referral settlement transaction', () => {
  const fn = sql.match(/create or replace function public\.submit_validated_crawl_rating[\s\S]*?\n\$\$;/)?.[0] || '';
  assert.match(fn, /v_distance_m>804\.67/);
  assert.doesNotMatch(fn, /91\.44/);
  assert.match(fn, /insert into public\.destination_ratings/);
  assert.match(fn, /settle_referral_for_rating_internal\(v_user,v_rating_id\)/);
  assert.ok(fn.indexOf('insert into public.destination_ratings') <
    fn.indexOf('settle_referral_for_rating_internal(v_user,v_rating_id)'));
});

test('self-referral, existing accounts, remote ratings, and duplicate rewards are blocked', () => {
  assert.match(sql, /v_code\.user_id=v_user[\s\S]*self_referral/);
  assert.match(sql, /now\(\)-v_auth_created > v_cfg\.claim_window/);
  assert.match(sql, /exists\(select 1 from public\.destination_ratings where user_id=v_user\)/);
  assert.match(sql, /is_buffacoin[\s\S]*false/);
  assert.match(sql, /for update/);
});

test('reconciliation defaults to dry-run and apply mode is service-only and auditable', () => {
  assert.match(sql, /reconcile_referrals\(p_dry_run boolean default true\)/);
  assert.match(sql, /if not p_dry_run then[\s\S]*sync_verified_referral_badges_internal/);
  assert.match(sql, /ledger_inconsistency/);
  assert.match(sql, /grant execute on function public\.reconcile_referrals\(boolean\) to service_role/);
});

test('verified referral badges use qualified records at 1, 5, and 10 without milestone XP', () => {
  assert.match(sql, /\('referral_1','Wing Buddy',1\)/);
  assert.match(sql, /\('referral_5','Wing Crew Captain',5\)/);
  assert.match(sql, /\('referral_10','Wing Recruiter',10\)/);
  assert.match(sql, /where inviter_user_id=p_user_id and status in\('qualified','rewarded'\)/);
  assert.match(sql, /'account-multiple-plus',0,'referral'/);
});

test('claim validation covers case folding invalid disabled self existing and one-inviter rules', () => {
  assert.match(sql, /lower\(code\)=lower\(btrim\(coalesce\(p_code,''\)\)\)/);
  assert.match(sql, /and is_active/);
  assert.match(sql, /invalid_or_disabled/);
  assert.match(sql, /self_referral/);
  assert.match(sql, /existing_account/);
  assert.match(sql, /existing_activity/);
  assert.match(sql, /referral_attributions_invitee_unique/);
});

test('notification and badge side effects are idempotent and preference gated', () => {
  assert.match(sql, /unique \(user_id,referral_attribution_id,event_type\)/);
  assert.match(sql, /where p\.user_id=\$1 and p\.friend_activity/);
  assert.match(sql, /on conflict\(user_id,event_type,deduplication_key\) do nothing/);
  assert.match(sql, /referral_badge_unlocked/);
});

test('account deletion preserves audit and flags review instead of cascading rewards', () => {
  assert.match(sql, /Deliberately not an auth\.users FK/);
  assert.match(sql, /flag_referral_account_deletion/);
  assert.match(sql, /invitee_deleted/);
  assert.match(sql, /deleted_at is null[\s\S]*banned_until/);
});

test('migration is rerun-safe and production starts disabled', () => {
  assert.match(sql, /is_enabled boolean not null default false/);
  assert.match(sql, /create table if not exists public\.referral_codes/);
  assert.match(sql, /drop policy if exists referral_codes_owner_read/);
  assert.match(sql, /drop trigger if exists auth_user_referral_code/);
  assert.match(sql, /on conflict \(config_key\) do nothing/);
});

test('service reporting covers shares opens signups qualification cost placement and retention', () => {
  assert.match(sql, /create or replace view public\.referral_funnel_summary/);
  for (const field of [
    'invitations_shared', 'link_opens', 'attributed_signups', 'qualified_referrals',
    'signup_to_first_rating_percent', 'average_time_to_qualification',
    'reward_cost_xp', 'qualified_referrals_per_inviter', 'top_share_placement',
    'rejected_or_suspicious', 'referred_user_7d_return_percent',
  ]) assert.match(sql, new RegExp(field));
  assert.match(sql, /grant select on public\.referral_funnel_summary to service_role/);
});
