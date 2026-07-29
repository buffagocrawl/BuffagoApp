import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  new URL(
    '../supabase/migrations/20260729122000_wing_shots_creator_rewards.sql',
    import.meta.url,
  ),
  'utf8',
);

test('Creator rewards use normalized append-only receipts with database uniqueness', () => {
  assert.match(migration, /create table if not exists public\.wing_creator_reward_events/i);
  assert.match(migration, /create table if not exists public\.wing_creator_badge_events/i);
  assert.match(migration, /wing_creator_reward_once_per_submission_kind/i);
  assert.match(migration, /wing_creator_approval_once_per_rating/i);
  assert.match(migration, /reverses_reward_event_id uuid unique/i);
  assert.match(migration, /before update or delete on public\.wing_creator_reward_events/i);
  assert.match(migration, /wing_creator_audit_is_append_only/i);
  assert.match(migration, /wing_creator_reward_owner_deletion_shape/i);
  assert.match(migration, /wing_creator_badge_owner_deletion_shape/i);
  assert.match(
    migration,
    /to_jsonb\(new\) - array\['user_id', 'owner_pseudonym_id', 'owner_deleted_at'\]/i,
  );
});

test('only authoritative approved and real posted transitions award Creator XP', () => {
  assert.match(
    migration,
    /v_transition\.to_status <> 'approved'[\s\S]*v_submission\.status <> 'approved'/i,
  );
  assert.match(
    migration,
    /v_transition\.to_status <> 'posted'[\s\S]*v_submission\.status <> 'posted'/i,
  );
  assert.match(migration, /job\.status = 'posted'/i);
  assert.match(migration, /and not job\.dry_run/i);
  assert.match(migration, /job\.external_post_id is not null/i);
  assert.match(migration, /v_submission\.duplicate_group is not null/i);
  assert.match(migration, /and is_buffacoin = false/i);
  assert.doesNotMatch(
    migration,
    /new\.to_status = '(uploaded|processing|in_review|rejected|failed)' then[\s\S]{0,180}wing_award_creator_reward_internal/i,
  );
});

test('transition trigger is retry-safe for approval, feature, and withdrawal counterbalance', () => {
  assert.match(migration, /after insert on public\.wing_submission_state_transitions/i);
  assert.match(migration, /new\.to_status = 'approved'/i);
  assert.match(migration, /new\.to_status = 'posted'/i);
  assert.match(migration, /new\.to_status = 'withdrawn'/i);
  assert.match(migration, /wing-creator-approval:/i);
  assert.match(migration, /wing-creator-featured:/i);
  assert.match(migration, /wing-auto-withdraw:/i);
  assert.match(migration, /pg_advisory_xact_lock/i);
});

test('fraud and revocation create negative ledger counterbalances without deleting audit', () => {
  assert.match(
    migration,
    /create or replace function public\.wing_reverse_creator_rewards_internal/i,
  );
  assert.match(migration, /p_amount := -abs\(v_reward\.amount\)/i);
  assert.match(migration, /p_source := 'wing_creator_reversal'/i);
  assert.match(migration, /'reward_reversal', -abs\(v_reward\.amount\)/i);
  assert.match(migration, /on conflict \(reverses_reward_event_id\) do nothing/i);
  assert.doesNotMatch(migration, /delete from public\.wing_creator_reward_events/i);
});

test('badges are centralized, threshold-derived, zero-XP, and auditable', () => {
  for (const badge of [
    'wing_shot_first',
    'wing_photographer',
    'wing_videographer',
    'jalapenos_pick',
    'wing_creator',
    'crawl_cameraperson',
    'state_correspondent',
  ]) {
    assert.match(migration, new RegExp(`'${badge}'`));
  }
  assert.match(migration, /insert into public\.badge_catalog/i);
  assert.match(migration, /xp_reward = 0/i);
  assert.match(migration, /insert into public\.user_badges/i);
  assert.match(migration, /wing_sync_creator_badges_internal/i);
  assert.match(migration, /event_kind = 'revoked'/i);
});

test('weekly and all-time Creator read models honor social privacy and bound limits', () => {
  assert.match(
    migration,
    /create or replace function public\.get_wing_creator_leaderboard/i,
  );
  assert.match(migration, /p_period not in \('week', 'all_time'\)/i);
  assert.match(migration, /public\.can_user_appear_socially\(total\.user_id\)/i);
  assert.match(migration, /greatest\(1, least\(coalesce\(p_limit, 25\), 100\)\)/i);
  assert.match(migration, /dense_rank\(\) over/i);
  assert.match(migration, /create or replace function public\.get_wing_creator_stats/i);
  assert.match(migration, /public\.friend_pair_is_blocked/i);
  assert.match(
    migration,
    /grant execute on function public\.get_wing_creator_leaderboard\(text, integer\)[\s\S]*to authenticated/i,
  );
});

test('generic authenticated XP forgery is closed with a compatibility-only Facebook boundary', () => {
  assert.match(
    migration,
    /revoke all on function public\.award_xp\([\s\S]*from public, anon, authenticated/i,
  );
  assert.match(
    migration,
    /if amount <> 50 or reason <> 'link_facebook' then[\s\S]*xp_add_legacy_contract_rejected/i,
  );
  assert.match(migration, /from auth\.identities identity/i);
  assert.match(migration, /identity\.provider = 'facebook'/i);
  assert.match(migration, /p_source := 'link_facebook'/i);
  assert.doesNotMatch(migration, /p_idempotency_key := 'legacy:facebook-link:/i);
  assert.match(
    migration,
    /grant execute on function public\.xp_add\(integer, text, uuid\) to authenticated/i,
  );
});

test('reward mutation functions and tables remain service-only', () => {
  assert.match(
    migration,
    /revoke all on[\s\S]*public\.wing_creator_reward_events[\s\S]*from public, anon, authenticated/i,
  );
  assert.match(
    migration,
    /grant select, insert on[\s\S]*public\.wing_creator_reward_events[\s\S]*to service_role/i,
  );
  assert.match(
    migration,
    /revoke all on function public\.wing_award_creator_reward_internal[\s\S]*from public, anon, authenticated/i,
  );
  assert.match(
    migration,
    /grant execute on function public\.wing_reverse_creator_rewards_internal[\s\S]*to service_role/i,
  );
});
