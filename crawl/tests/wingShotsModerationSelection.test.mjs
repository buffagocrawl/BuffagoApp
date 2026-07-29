import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sql = (
  await readFile(
    new URL(
      '../supabase/migrations/20260729124000_wing_shots_moderation_selection.sql',
      import.meta.url,
    ),
    'utf8',
  )
).toLowerCase();

test('moderation contract is structured, versioned, bounded, and advisory', () => {
  assert.match(sql, /create or replace function public\.record_wing_ai_moderation/);
  assert.match(sql, /p_result \?& v_required/);
  assert.match(sql, /'contains_chicken_wings','wing_confidence'/);
  assert.match(sql, /'minors_visible'/);
  assert.match(sql, /'personal_information_visible'/);
  assert.match(sql, /'spam_probability','duplicate_probability','quality_score'/);
  assert.match(sql, /moderation_model_version_required/);
  assert.match(sql, /moderation_score_out_of_range/);
  assert.doesNotMatch(
    sql.match(/create or replace function public\.record_wing_ai_moderation[\s\S]*?\n\$\$;/)?.[0] ?? '',
    /'approved'/,
  );
});

test('thresholds route unsafe and uncertain content without auto-approval', () => {
  assert.match(sql, /minimum_wing_confidence numeric\(5,4\) not null default 0\.6500/);
  assert.match(sql, /clear_reject_wing_confidence numeric\(5,4\) not null default 0\.1500/);
  assert.match(sql, /then 'reject'/);
  assert.match(sql, /then 'manual_review'/);
  assert.match(sql, /wing_verification_status = case/);
  assert.match(sql, /then 'likely_wings'/);
  assert.match(sql, /then 'not_wings'/);
});

test('upload abuse controls enforce suspension and bounded hourly/daily rates', () => {
  assert.match(sql, /create table public\.wing_user_moderation_state/);
  assert.match(sql, /status in \('active', 'limited', 'suspended'\)/);
  assert.match(sql, /create trigger wing_upload_intent_rate_limit/);
  assert.match(sql, /created_at >= now\(\) - interval '1 hour'/);
  assert.match(sql, /created_at >= date_trunc\('day', now\(\)\)/);
  assert.match(sql, /wing_upload_rate_limit_exceeded/);
  assert.match(sql, /wing_uploads_suspended/);
});

test('fingerprints create auditable duplicate signals and force review', () => {
  assert.match(sql, /create or replace function public\.record_wing_fingerprint/);
  assert.match(sql, /coalesce\(p_similarity,0\) >= \.90/);
  assert.match(sql, /'perceptual_duplicate'/);
  assert.match(sql, /'video_fingerprint_match'/);
  assert.match(sql, /moderation_status='manual_review'/);
  assert.match(sql, /p_idempotency_key,p_correlation_id/);
});

test('processing claims use skip-locked leases, stale recovery, backoff, and dead state', () => {
  assert.match(sql, /create or replace function public\.claim_wing_processing_job/);
  assert.match(sql, /for update skip locked limit 1/);
  assert.match(sql, /last_error_code='stale_lease'/);
  assert.match(sql, /attempt_count>=max_attempts then 'dead'/);
  assert.match(sql, /interval '30 seconds'\*\(2\^greatest\(attempt_count-1,0\)\)/);
  assert.match(sql, /invalid_or_expired_job_claim/);
});

test('admin queue is role-gated and excludes raw results and storage paths', () => {
  const queue = sql.match(
    /create or replace function public\.get_wing_admin_queue[\s\S]*?\n\$\$;/,
  )?.[0] ?? '';
  assert.match(queue, /wing_has_app_role\('wing_reviewer'\)/);
  assert.match(queue, /wing_reviewer_role_required/);
  assert.match(queue, /'latest_flags'/);
  assert.match(queue, /'prior_user_features'/);
  assert.match(queue, /'recent_restaurant_features'/);
  assert.doesNotMatch(queue, /raw_result|storage_path|reviewer_notes|perceptual_hash/);
});

test('human review is authoritative, audited, idempotent, and requires override notes', () => {
  assert.match(sql, /create or replace function public\.review_wing_submission/);
  assert.match(sql, /submission_not_in_review/);
  assert.match(sql, /review_reason_and_notes_required/);
  assert.match(sql, /sensitive_override_requires_documented_override/);
  assert.match(sql, /perform public\.wing_transition_submission/);
  assert.match(sql, /insert into public\.wing_admin_actions/);
  assert.match(sql, /perform pg_advisory_xact_lock\(hashtextextended\('wing-admin:'/);
});

test('nightly selection is atomic, business-date unique, transparent, and cleanly skips', () => {
  const nightly = sql.match(
    /create or replace function public\.run_wing_nightly_selection[\s\S]*?\n\$\$;/,
  )?.[0] ?? '';
  assert.match(nightly, /pg_advisory_xact_lock\(hashtextextended\('wing-nightly:'/);
  assert.match(nightly, /where business_date=p_business_date for update/);
  assert.match(nightly, /'skipped_no_approved_content'/);
  assert.match(nightly, /'skipped_no_approved_content',0/);
  assert.match(nightly, /'quality'/);
  assert.match(nightly, /'wing_confidence'/);
  assert.match(nightly, /'queue_age'/);
  assert.match(nightly, /'creator_diversity_penalty'/);
  assert.match(nightly, /'restaurant_diversity_penalty'/);
  assert.match(nightly, /order by \(/);
  assert.match(nightly, /for update skip locked/);
});

test('manual priority cannot bypass safety, wing, duplicate, or abuse filters', () => {
  assert.match(sql, /moderation_status in \('likely_acceptable','overridden'\)/);
  assert.match(sql, /wing_verification_status in \('likely_wings','overridden'\)/);
  assert.match(sql, /s\.duplicate_group is null/);
  assert.match(sql, /a\.severity in \('high','critical'\)/);
  assert.match(sql, /least\(10,s\.priority\*\.1\)/);
});

test('generation is leased and creates recoverable independent platform jobs', () => {
  assert.match(sql, /create table public\.wing_generation_jobs/);
  assert.match(sql, /create or replace function public\.claim_wing_generation_job/);
  assert.match(sql, /instagram_job_id uuid not null unique/);
  assert.match(sql, /facebook_job_id uuid not null unique/);
  assert.match(sql, /generated_assets_missing/);
  assert.match(sql, /v_job\.instagram_job_id,v_job\.submission_id,'instagram'/);
  assert.match(sql, /v_job\.facebook_job_id,v_job\.submission_id,'facebook'/);
  assert.match(sql, /'ready',true/);
  assert.match(sql, /generation_job_unavailable/);
});

test('new control tables are RLS protected and worker RPCs are service-only', () => {
  for (const table of [
    'wing_moderation_config',
    'wing_user_moderation_state',
    'wing_submission_abuse_signals',
    'wing_generation_jobs',
  ]) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.match(sql, /from public,anon,authenticated/);
  assert.match(sql, /public\.claim_wing_processing_job\(text,integer\)[\s\S]*?to service_role/);
  assert.doesNotMatch(sql, /claim_wing_processing_job\(text,integer\)\s+to authenticated/);
  assert.match(sql, /public\.get_wing_admin_queue\(integer\)[\s\S]*?to authenticated/);
});

