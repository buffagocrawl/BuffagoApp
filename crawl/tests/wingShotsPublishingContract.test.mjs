import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(
  new URL(
    '../supabase/migrations/20260729130000_wing_shots_publishing_rpc.sql',
    import.meta.url
  ),
  'utf8'
);

test('publisher claim uses a bounded lease, stale recovery, and skip locked', () => {
  const recovery = sql.match(
    /create or replace function public\.recover_stale_wing_social_jobs[\s\S]*?\n\$\$;/
  )?.[0] || '';
  const fn = sql.match(
    /create or replace function public\.claim_wing_social_job[\s\S]*?\n\$\$;/
  )?.[0] || '';
  assert.match(recovery, /where status in \('claimed', 'posting'\)[\s\S]*lease_expires_at <= now\(\)/);
  assert.match(recovery, /All independent platform jobs exhausted retries/);
  assert.match(recovery, /all_platform_publication_failed/);
  assert.match(fn, /p_platform not in \('instagram', 'facebook'\)/);
  assert.match(fn, /recover_stale_wing_social_jobs/);
  assert.match(fn, /for update skip locked/);
  assert.match(fn, /attempt_count < max_attempts/);
  assert.match(fn, /human_approved_at is not null/);
  assert.match(fn, /claim_token = v_token/);
  assert.match(fn, /response_metadata->>'container_id'/);
});

test('platform results remain independent and safe receipts reject secrets', () => {
  const fn = sql.match(
    /create or replace function public\.finish_wing_social_job[\s\S]*?\n\$\$;/
  )?.[0] || '';
  assert.match(fn, /p_result \?\| array\[[\s\S]*'access_token'[\s\S]*'signed_url'/);
  assert.match(fn, /insert into public\.social_publication_attempts/);
  assert.match(fn, /invalid_publish_result_status/);
  assert.match(fn, /publish_result_idempotency_conflict/);
  assert.match(fn, /v_job\.platform/);
  assert.match(fn, /then 'retry' else 'failed'/);
  assert.match(fn, /status = 'failed'/);
  const updates = [...fn.matchAll(
    /update public\.social_content_jobs[\s\S]*?where id = v_job\.id/g
  )];
  assert.ok(updates.length >= 4);
});

test('first real success transitions once and lets existing triggers settle rewards and notification', () => {
  const fn = sql.match(
    /create or replace function public\.finish_wing_social_job[\s\S]*?\n\$\$;/
  )?.[0] || '';
  assert.match(fn, /if v_submission\.status <> 'posted'/);
  assert.match(fn, /'featured:' \|\| v_submission\.id::text/);
  assert.match(fn, /public\.wing_transition_submission/);
  assert.match(fn, /reward_and_notification_settled_by_transition/);
  assert.match(fn, /v_featured_now := true/);
  assert.match(fn, /all_platform_publication_failed/);
});

test('dry run cannot produce a real post or feature transition', () => {
  const fn = sql.match(
    /create or replace function public\.finish_wing_social_job[\s\S]*?\n\$\$;/
  )?.[0] || '';
  assert.match(fn, /if v_job\.dry_run[\s\S]*real_publish_result_invalid/);
  assert.match(fn, /elsif v_status = 'dry_run_succeeded'/);
  assert.match(fn, /if not v_job\.dry_run then raise exception 'live_job_cannot_dry_run'/);
});

test('live approval is role and feature-flag gated', () => {
  const fn = sql.match(
    /create or replace function public\.approve_wing_social_job[\s\S]*?\n\$\$;/
  )?.[0] || '';
  assert.match(fn, /wing_has_app_role\('wing_admin'\)/);
  assert.match(fn, /wing_has_app_role\('wing_publisher'\)/);
  assert.match(fn, /wing_shot_instagram_publishing/);
  assert.match(fn, /wing_shot_facebook_publishing/);
  assert.match(fn, /wing_platform_publish_flag_disabled/);
  assert.match(fn, /human_approved_at/);
  assert.match(fn, /'dry_run_succeeded'/);
  assert.match(fn, /publishing_approval_idempotency_conflict/);
});

test('publishing mutation RPCs are service-only', () => {
  assert.match(
    sql,
    /revoke all on function public\.claim_wing_social_job\(text, text, integer\)[\s\S]*from public, anon, authenticated/
  );
  assert.match(
    sql,
    /grant execute on function public\.claim_wing_social_job\(text, text, integer\)[\s\S]*to service_role/
  );
  assert.match(
    sql,
    /grant execute on function public\.recover_stale_wing_social_jobs\(uuid\)[\s\S]*to service_role/
  );
  assert.match(
    sql,
    /grant execute on function public\.finish_wing_social_job\([\s\S]*to service_role/
  );
});
