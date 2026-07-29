import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const readRepo = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const migration = read('supabase/migrations/20260729180000_wing_processing_lifecycle_fix.sql');
const selection = read('supabase/migrations/20260729172000_jalapeno_approved_queue_authority.sql');
const workflow = readRepo('.github/workflows/wing-processing.yml');
const mango = readRepo('Agents/Mango Habanero/src/main.jsx');

test('approval is fail-closed on processing completion and private derivatives', () => {
  const review = migration.match(/create or replace function public\.mango_review_wing_submission[\s\S]*?end; \$\$;/)?.[0];
  assert.ok(review);
  assert.match(review, /s\.status <> 'in_review'/);
  assert.match(review, /processed_storage_path is null/);
  assert.match(review, /thumbnail_storage_path is null/);
  assert.match(review, /storage\.objects/);
  assert.match(review, /status='succeeded'/);
  assert.match(review, /unsafe_or_failed_media_cannot_be_approved/);
  assert.match(mango, /!readyForReview/);
});

test('repair is service-only, locked, forward-only, and idempotently enqueues processing', () => {
  assert.match(migration, /repair_stranded_wing_submission/);
  assert.match(migration, /auth\.role\(\) <> 'service_role'/);
  assert.match(migration, /for update/);
  assert.match(migration, /s\.status<>'approved'/);
  assert.match(migration, /s\.processed_storage_path is not null/);
  assert.match(migration, /s\.featured_at is not null/);
  assert.match(migration, /original_media_missing/);
  assert.match(migration, /publishing_has_started/);
  assert.match(migration, /wing_processing_jobs/);
  assert.match(migration, /system-repair:stranded-approved/);
  assert.match(migration, /revoke all on function public\.repair_stranded_wing_submission/);
});

test('processing workflow is bounded, scheduled, protected, and sanitized', () => {
  assert.match(workflow, /workflow_dispatch/);
  assert.match(workflow, /\*\/10 \* \* \* \*/);
  assert.match(workflow, /python-version: '3\.12'/);
  assert.match(workflow, /ffmpeg -version && ffprobe -version/);
  assert.match(workflow, /--validate-config/);
  assert.match(workflow, /--drain 25/);
  assert.match(workflow, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.doesNotMatch(workflow, /echo.*SUPABASE_SERVICE_ROLE_KEY|storage_path|signedUrl/i);
});

test('same-day empty receipts remain retryable without reopening active work', () => {
  assert.match(selection, /status not in \('running', 'skipped_no_approved_content'\)/);
  assert.match(selection, /p_submission_id is null or s\.id = p_submission_id/);
  assert.match(selection, /for update skip locked/);
});
