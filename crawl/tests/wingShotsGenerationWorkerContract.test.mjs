import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(
  new URL(
    '../supabase/migrations/20260729134000_wing_generation_worker_contract.sql',
    import.meta.url
  ),
  'utf8'
);

test('generation context is claim-bound and exposes processed media only', () => {
  const fn = sql.match(
    /create or replace function public\.begin_wing_generation_job[\s\S]*?\n\$\$;/
  )?.[0] || '';
  assert.match(fn, /status <> 'claimed'/);
  assert.match(fn, /claim_token <> p_claim_token/);
  assert.match(fn, /lease_expires_at <= now\(\)/);
  assert.match(fn, /processed_storage_path/);
  assert.match(fn, /processed_community_media_not_found/);
  assert.doesNotMatch(fn, /original_storage_path/);
  assert.doesNotMatch(fn, /user_caption/);
  assert.match(fn, /social_opt_out/);
  assert.match(fn, /BuffaGo community/);
});

test('generation completion proves community source and accessible alt text', () => {
  const fn = sql.match(
    /create or replace function public\.complete_wing_generation[\s\S]*?\n\$\$;/
  )?.[0] || '';
  assert.match(fn, /p_metadata->>'source' <> 'community_submission'/);
  assert.match(fn, /source_processed_path/);
  assert.match(fn, /instagram_alt_text/);
  assert.match(fn, /facebook_alt_text/);
  assert.match(fn, /generated_alt_text/);
  assert.match(fn, /generated_assets_missing/);
  assert.match(fn, /'ready_to_post'/);
});

test('generation failures use bounded retries and dead-letter transition', () => {
  const fn = sql.match(
    /create or replace function public\.fail_wing_generation_job[\s\S]*?\n\$\$;/
  )?.[0] || '';
  assert.match(fn, /attempt_count < v_job\.max_attempts/);
  assert.match(fn, /interval '30 minutes'/);
  assert.match(fn, /'branded_generation_dead_lettered'/);
  assert.match(fn, /'generation-dead:' \|\| v_job\.id::text/);
});

test('generation worker RPCs are service-role only', () => {
  assert.match(
    sql,
    /revoke all on function public\.begin_wing_generation_job[\s\S]*from public, anon, authenticated/
  );
  assert.match(
    sql,
    /grant execute on function public\.begin_wing_generation_job[\s\S]*to service_role/
  );
});
