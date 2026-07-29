import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sql = readFileSync(
  new URL('../supabase/migrations/20260729127000_wing_shots_home_rating.sql', import.meta.url),
  'utf8',
);

test('Home rating persistence is authenticated, server-authoritative, and idempotent', () => {
  assert.match(sql, /submit_validated_restaurant_rating/);
  assert.match(sql, /auth\.uid\(\)/);
  assert.match(sql, /unique \(user_id, operation_id\)/);
  assert.match(sql, /idempotent_replay/);
  assert.match(sql, /security definer/);
  assert.match(sql, /revoke all on public\.rating_submission_operations from public, anon, authenticated/);
});

test('only proximity-verified non-admin Home ratings become Wing Shot eligible', () => {
  assert.match(sql, /v_distance_m > 804\.67/);
  assert.match(sql, /v_wing_shot_eligible := true/);
  assert.match(sql, /v_reason := 'verified_in_person'/);
  assert.match(sql, /v_reason := 'administrative_rating'/);
  assert.match(sql, /is_buffacoin[\s\S]*false/);
  assert.match(sql, /'surface', 'home_restaurant'/);
});

test('rating, provenance, operation receipt, and referral settlement share one transaction', () => {
  assert.match(sql, /insert into public\.crawls/);
  assert.match(sql, /insert into public\.destination_ratings/);
  assert.match(sql, /insert into public\.rating_verification_receipts/);
  assert.match(sql, /insert into public\.rating_submission_operations/);
  assert.match(sql, /settle_referral_for_rating_internal/);
  assert.match(sql, /begin;[\s\S]*commit;/);
});
