import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sql = readFileSync(
  new URL('../supabase/migrations/20260729129000_verified_progression_xp.sql', import.meta.url),
  'utf8',
);
const client = readFileSync(new URL('../utils/xp.js', import.meta.url), 'utf8');

test('client progression uses the evidence-backed RPC, not generic award_xp', () => {
  assert.match(client, /claim_verified_progression_xp/);
  assert.doesNotMatch(client, /rpc\('award_xp'/);
  assert.doesNotMatch(client, /\.from\('users'\)\s*\.update\(/);
  assert.match(client, /A missing or failed RPC is/);
});

test('rating XP requires a verified in-person non-BuffaCoin rating', () => {
  assert.match(sql, /rating_verification_receipts/);
  assert.match(sql, /verification_type = 'in_person_proximity'/);
  assert.match(sql, /receipt\.wing_shot_eligible/);
  assert.match(sql, /not coalesce\(rating\.is_buffacoin, false\)/);
});

test('server derives fixed amounts and idempotency from durable evidence', () => {
  for (const amount of [5, 15, 25, 50, 100, 150]) {
    assert.match(sql, new RegExp(`v_amount := ${amount}`));
  }
  assert.match(sql, /rating-detail:tag:/);
  assert.match(sql, /new-destination:/);
  assert.match(sql, /daily-first-rating:/);
  assert.match(sql, /crawl-completed:/);
  assert.match(sql, /first-route:/);
  assert.match(sql, /p_idempotency_key := v_key/);
});

test('crawl completion XP requires an owned completed crawl and all route stops rated', () => {
  assert.match(sql, /status = 'completed'/);
  assert.match(sql, /route_ordered_destinations/);
  assert.match(sql, /v_rated_count < v_stop_count/);
  assert.match(sql, /complete_crawl_evidence_required/);
  assert.match(sql, /verified_crawl_completion_award_required/);
});

test('generic XP remains private while verified claim is authenticated', () => {
  assert.match(sql, /revoke all on function public\.claim_verified_progression_xp/);
  assert.match(sql, /grant execute on function public\.claim_verified_progression_xp[\s\S]*to authenticated, service_role/);
});
