import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(
  new URL(
    '../supabase/migrations/20260729120500_wing_shots_rating_provenance.sql',
    import.meta.url
  ),
  'utf8'
);

const receiptTable = sql.match(
  /create table if not exists public\.rating_verification_receipts[\s\S]*?\n\);/
)?.[0] || '';

const canonicalRatingRpc = sql.match(
  /create or replace function public\.submit_validated_crawl_rating[\s\S]*?\n\$\$;/
)?.[0] || '';

test('creates normalized durable rating verification receipts without raw coordinates', () => {
  assert.match(receiptTable, /rating_id uuid not null/);
  assert.match(receiptTable, /constraint rating_verification_receipts_rating_unique unique \(rating_id\)/);
  assert.match(receiptTable, /verification_type in \([\s\S]*'in_person_proximity'/);
  assert.match(receiptTable, /wing_shot_eligible boolean not null default false/);
  assert.match(receiptTable, /validator_version text not null/);
  assert.match(receiptTable, /accuracy_class text/);
  assert.match(receiptTable, /distance_bucket text/);
  assert.doesNotMatch(receiptTable, /\b(latitude|longitude)\b/i);
});

test('receipt eligibility shape permits only verified in-person provenance', () => {
  assert.match(
    receiptTable,
    /wing_shot_eligible[\s\S]*verification_type = 'in_person_proximity'[\s\S]*eligibility_reason = 'verified_in_person'/
  );
  assert.match(
    receiptTable,
    /not wing_shot_eligible[\s\S]*verification_type <> 'in_person_proximity'/
  );
  for (const excludedType of [
    'administrative',
    'imported',
    'onboarding_seed',
    'unverified',
  ]) {
    assert.match(receiptTable, new RegExp(`'${excludedType}'`));
  }
});

test('receipts are append-only and unavailable for direct client mutation', () => {
  assert.match(sql, /before update or delete on public\.rating_verification_receipts/);
  assert.match(sql, /rating_verification_receipts_are_append_only/);
  assert.match(sql, /alter table public\.rating_verification_receipts enable row level security/);
  assert.match(
    sql,
    /revoke all on public\.rating_verification_receipts from public, anon, authenticated/
  );
  assert.doesNotMatch(
    sql,
    /grant (?:insert|update|delete)[\s\S]*rating_verification_receipts to authenticated/i
  );
  assert.match(receiptTable, /user_id uuid references auth\.users\(id\) on delete set null/);
  assert.match(receiptTable, /rating_verification_receipts_owner_deletion_shape/);
  assert.match(sql, /sole permitted mutation is one-way identity pseudonymization/);
});

test('canonical rating RPC rejects incomplete scores and preserves in-person validation', () => {
  for (const score of ['p_crispiness', 'p_sauce', 'p_meat', 'p_overall']) {
    assert.match(canonicalRatingRpc, new RegExp(`${score} is null`));
    assert.match(canonicalRatingRpc, new RegExp(`${score} not between 1 and 10`));
  }
  assert.match(canonicalRatingRpc, /crawl_not_owned/);
  assert.match(canonicalRatingRpc, /destination_not_in_crawl/);
  assert.match(canonicalRatingRpc, /destination_location_missing/);
  assert.match(canonicalRatingRpc, /location_required/);
  assert.match(canonicalRatingRpc, /rating_proximity_failed/);
  assert.match(canonicalRatingRpc, /v_distance_m>804\.67/);
  assert.match(canonicalRatingRpc, /is_buffacoin[\s\S]*false/);
});

test('canonical RPC persists rating before provenance and excludes administrative bypass', () => {
  assert.match(canonicalRatingRpc, /insert into public\.destination_ratings/);
  assert.match(canonicalRatingRpc, /insert into public\.rating_verification_receipts/);
  assert.ok(
    canonicalRatingRpc.indexOf('insert into public.destination_ratings')
      < canonicalRatingRpc.indexOf('insert into public.rating_verification_receipts')
  );
  assert.match(
    canonicalRatingRpc,
    /case when v_is_admin then 'administrative' else 'in_person_proximity' end/
  );
  assert.match(canonicalRatingRpc, /v_wing_shot_reason:='administrative_rating'/);
  assert.match(canonicalRatingRpc, /wing_shot_eligible/);
  assert.match(canonicalRatingRpc, /wing_shot_eligibility_reason/);
});

test('failed rating cannot leave provenance because persistence and settlement share a transaction', () => {
  assert.ok(
    canonicalRatingRpc.indexOf('insert into public.rating_verification_receipts')
      < canonicalRatingRpc.indexOf('settle_referral_for_rating_internal(v_user,v_rating_id)')
  );
  assert.match(
    canonicalRatingRpc,
    /Any failure rolls all three back/
  );
});

test('eligibility predicate fails closed for BuffaCoin incomplete or unverified ratings', () => {
  const predicate = sql.match(
    /create or replace function public\.wing_shot_rating_is_eligible[\s\S]*?\n\$\$;/
  )?.[0] || '';
  assert.match(predicate, /rating\.user_id = p_user_id/);
  assert.match(predicate, /not coalesce\(rating\.is_buffacoin, false\)/);
  assert.match(predicate, /rating\.crispiness between 1 and 10/);
  assert.match(predicate, /rating\.sauce between 1 and 10/);
  assert.match(predicate, /rating\.meat between 1 and 10/);
  assert.match(predicate, /rating\.overall between 1 and 10/);
  assert.match(predicate, /receipt\.verification_type = 'in_person_proximity'/);
  assert.match(predicate, /receipt\.wing_shot_eligible/);
  assert.match(predicate, /receipt\.eligibility_reason = 'verified_in_person'/);
  assert.match(
    sql,
    /grant execute on function public\.wing_shot_rating_is_eligible\(uuid, uuid\)[\s\S]*to service_role/
  );
  assert.doesNotMatch(
    sql,
    /grant execute on function public\.wing_shot_rating_is_eligible\(uuid, uuid\)\s+to authenticated/
  );
});

test('owner eligibility RPC sanitizes results and treats absent provenance as unverified', () => {
  const ownerRpc = sql.match(
    /create or replace function public\.get_wing_shot_rating_eligibility[\s\S]*?\n\$\$;/
  )?.[0] || '';
  assert.match(ownerRpc, /v_user_id uuid := auth\.uid\(\)/);
  assert.match(ownerRpc, /and user_id = v_user_id/);
  assert.match(ownerRpc, /buffacoin_rating/);
  assert.match(ownerRpc, /incomplete_rating/);
  assert.match(ownerRpc, /v_receipt\.id is null[\s\S]*unverified_rating/);
  assert.match(ownerRpc, /public\.wing_shot_rating_is_eligible\(p_rating_id, v_user_id\)/);
  assert.doesNotMatch(ownerRpc, /p_latitude|p_longitude|storage_path/);
  assert.match(
    sql,
    /grant execute on function public\.get_wing_shot_rating_eligibility\(uuid\)[\s\S]*to authenticated, service_role/
  );
});

test('migration does not backfill legacy onboarding imported or direct ratings', () => {
  assert.doesNotMatch(
    sql,
    /insert into public\.rating_verification_receipts[\s\S]*select[\s\S]*from public\.destination_ratings/i
  );
  assert.match(sql, /No receipt or any non-in-person receipt means no Wing Shot eligibility/);
});
