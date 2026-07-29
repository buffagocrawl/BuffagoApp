import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const securitySql = (
  await readFile(
    new URL('../supabase/migrations/20260729121000_wing_shots_security_rpc.sql', import.meta.url),
    'utf8',
  )
).toLowerCase();

test('all Wing Shots core and boundary tables enable RLS and revoke client table access', () => {
  const tables = [
    'app_user_roles',
    'wing_media_submissions',
    'wing_submission_state_transitions',
    'wing_moderation_decisions',
    'wing_processing_jobs',
    'wing_media_fingerprints',
    'social_content_jobs',
    'social_publication_attempts',
    'wing_admin_actions',
    'wing_nightly_run_receipts',
    'wing_submission_upload_intents',
    'wing_media_access_requests',
    'wing_submission_mutation_receipts',
    'wing_account_deletion_manifests',
  ];
  for (const table of tables) {
    assert.match(
      securitySql,
      new RegExp(`alter table public\\.${table} enable row level security`),
      `${table} must enable RLS`,
    );
  }
  assert.match(securitySql, /from public, anon, authenticated/);
  assert.doesNotMatch(
    securitySql,
    /grant\s+(insert|update|delete|all)[^;]*\s+to\s+(anon|authenticated)/,
  );
});

test('upload reservation is owner-bound, bounded, affirmative-consent based, and idempotent', () => {
  assert.match(securitySql, /create table if not exists public\.wing_submission_upload_intents/);
  assert.match(securitySql, /expected_size_bytes between 1 and 52428800/);
  assert.match(securitySql, /expires_at <= created_at \+ interval '30 minutes'/);
  assert.match(securitySql, /consent_version text not null/);
  assert.match(securitySql, /consented_at timestamptz not null/);
  assert.match(securitySql, /attribution_preference in \('username', 'display_name', 'anonymous'\)/);
  assert.match(securitySql, /perform pg_advisory_xact_lock/);
  assert.match(securitySql, /idempotency_key text not null unique/);
  assert.match(securitySql, /where id = p_rating_id\s+and user_id = v_user_id/);
  assert.match(
    securitySql,
    /and public\.wing_shot_rating_is_eligible\(p_rating_id, v_user_id\)/,
  );
  assert.equal(
    (securitySql.match(/v_existing\.user_id is distinct from v_user_id/g) ?? []).length,
    3,
    'deleted-owner receipts must not pass NULL comparison during idempotent replay',
  );
});

test('private Storage policy allows only an exact active owner reservation', () => {
  assert.match(securitySql, /create policy wing_submissions_original_insert/);
  assert.match(securitySql, /bucket_id = 'wing-submissions'/);
  assert.match(securitySql, /owner_id = auth\.uid\(\)::text/);
  assert.match(securitySql, /split_part\(name, '\/', 1\) = 'originals'/);
  assert.match(securitySql, /split_part\(name, '\/', 2\) = auth\.uid\(\)::text/);
  assert.match(securitySql, /split_part\(name, '\/', 4\) = 'source'/);
  assert.match(securitySql, /public\.wing_can_upload_reserved_original\(name\)/);
  assert.match(securitySql, /intent\.expected_storage_path = p_object_name/);
  assert.match(securitySql, /intent\.status = 'reserved'/);
  assert.match(securitySql, /intent\.expires_at > now\(\)/);
  assert.doesNotMatch(securitySql, /create policy wing_submissions_(select|update|delete)/);
});

test('finalization proves the private object exists before creating authoritative submission state', () => {
  assert.match(securitySql, /create or replace function public\.finalize_wing_submission_upload/);
  assert.match(securitySql, /from storage\.objects object/);
  assert.match(securitySql, /object\.bucket_id = 'wing-submissions'/);
  assert.match(securitySql, /object\.name = v_intent\.expected_storage_path/);
  assert.match(securitySql, /object\.owner_id = v_user_id::text/);
  assert.match(securitySql, /insert into public\.wing_media_submissions/);
  assert.match(securitySql, /insert into public\.wing_submission_state_transitions/);
  assert.match(securitySql, /set status = 'finalized', finalized_at = now\(\)/);
});

test('state changes use expected-state locking and the explicit non-terminal graph', () => {
  assert.match(securitySql, /create or replace function public\.wing_transition_submission/);
  assert.match(securitySql, /for update/);
  assert.match(securitySql, /v_submission\.status <> p_expected_from_status/);
  assert.match(securitySql, /when 'uploaded' then p_to_status in \('processing', 'withdrawn'\)/);
  assert.match(
    securitySql,
    /when 'in_review' then p_to_status in \('approved', 'rejected', 'processing', 'withdrawn'\)/,
  );
  assert.match(securitySql, /when 'posting' then p_to_status in \('posted', 'failed'\)/);
  assert.match(securitySql, /invalid_wing_submission_transition/);
  assert.match(securitySql, /rejection_reason_required/);
  assert.doesNotMatch(securitySql, /when '(rejected|posted|withdrawn)' then/);
});

test('owner withdrawal cannot affect another user or terminal content', () => {
  assert.match(securitySql, /create or replace function public\.withdraw_wing_submission/);
  assert.match(securitySql, /where id = p_submission_id\s+and user_id = v_user_id/);
  assert.match(securitySql, /status in \('rejected', 'posted', 'withdrawn'\)/);
  assert.match(securitySql, /'owner_withdrawal'/);
  assert.match(securitySql, /'retention_review_required', true/);
});

test('history is owner-scoped and excludes storage, moderation, and reviewer internals', () => {
  const historyBody = securitySql.match(
    /create or replace function public\.get_my_wing_submission_history[\s\S]*?\n\$\$;/,
  )?.[0];
  assert.ok(historyBody);
  assert.match(historyBody, /submission\.user_id = auth\.uid\(\)/);
  assert.match(historyBody, /limit greatest\(1, least\(coalesce\(p_limit, 25\), 100\)\)/);
  assert.doesNotMatch(historyBody, /storage_path|perceptual_hash|reviewer_notes|raw_result/);
});

test('media access uses a five-minute opaque request and exposes paths only to service role', () => {
  assert.match(securitySql, /expires_at <= created_at \+ interval '5 minutes'/);
  assert.match(securitySql, /paths and signed urls are deliberately absent from this client result/);
  assert.match(securitySql, /'request_id', v_request_id/);
  assert.match(securitySql, /revoke all on function public\.claim_wing_media_access_request\(uuid\)/);
  assert.match(
    securitySql,
    /grant execute on function public\.claim_wing_media_access_request\(uuid\)\s+to service_role/,
  );
  assert.doesNotMatch(
    securitySql,
    /grant execute on function public\.claim_wing_media_access_request\(uuid\)\s+to authenticated/,
  );
});

test('account deletion pseudonymizes owners and emits a service-only private-object manifest', () => {
  assert.match(securitySql, /create table if not exists public\.wing_account_deletion_manifests/);
  assert.match(securitySql, /create or replace function public\.wing_apply_owner_pseudonymization/);
  assert.match(securitySql, /wing_owner_reidentification_forbidden/);
  assert.match(securitySql, /create or replace function public\.prepare_wing_account_media_cleanup/);
  assert.match(securitySql, /select submission\.original_storage_path as object_path/);
  assert.match(securitySql, /select job\.generated_media_path/);
  assert.match(securitySql, /'account_deletion'/);
  assert.match(securitySql, /owner_deleted_at = now\(\)/);
  assert.match(securitySql, /user_id = null/);
  assert.match(securitySql, /update public\.rating_verification_receipts/);
  assert.match(securitySql, /update public\.wing_creator_reward_events/);
  assert.match(securitySql, /update public\.wing_creator_badge_events/);
  assert.match(
    securitySql,
    /grant execute on function public\.prepare_wing_account_media_cleanup\(uuid, uuid\)\s+to service_role/,
  );
  assert.doesNotMatch(
    securitySql,
    /grant execute on function public\.prepare_wing_account_media_cleanup\(uuid, uuid\)\s+to authenticated/,
  );
});
