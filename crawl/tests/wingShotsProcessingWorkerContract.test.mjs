import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '..');
const migrationPath = path.join(
  root,
  'supabase',
  'migrations',
  '20260729133000_wing_processing_worker_contract.sql',
);
const sql = fs.readFileSync(migrationPath, 'utf8');

test('processing worker contract automatically enqueues and supports bounded backfill', () => {
  assert.match(sql, /after insert on public\.wing_media_submissions/i);
  assert.match(sql, /enqueue_wing_processing_backlog/i);
  assert.match(sql, /p_limit not between 1 and 500/i);
  assert.match(sql, /for update skip locked/i);
});

test('claim-bound context exposes deterministic private paths only to service role', () => {
  assert.match(sql, /begin_wing_processing_job/i);
  assert.match(sql, /v_job\.claim_token <> p_claim_token/i);
  assert.match(sql, /v_job\.lease_expires_at <= now\(\)/i);
  assert.match(sql, /'processed\/' \|\| v_submission\.id::text \|\| '\/primary'/i);
  assert.match(sql, /to service_role/i);
  assert.match(sql, /from public, anon, authenticated/i);
});

test('successful settlement verifies both protected objects before human review', () => {
  assert.match(sql, /processed_media_path_mismatch/i);
  assert.match(sql, /processed_media_not_found/i);
  assert.match(sql, /object\.bucket_id = 'wing-submissions'/i);
  assert.match(sql, /'media_processing_completed'/i);
  assert.match(sql, /'in_review'/i);
  assert.doesNotMatch(sql, /'approved'\s*,\s*'processing'/i);
});

test('failure settlement delegates bounded retry and dead-letters submission state', () => {
  assert.match(sql, /public\.finish_wing_processing_job/i);
  assert.match(sql, /v_job_status = 'dead'/i);
  assert.match(sql, /'media_processing_dead_lettered'/i);
  assert.match(sql, /'failed'/i);
});

test('original retention is bounded, configurable, and cleanup is auditable', () => {
  assert.match(sql, /original_retention_days integer not null default 30/i);
  assert.match(sql, /original_retention_days between 1 and 90/i);
  assert.match(sql, /original_deleted_at timestamptz/i);
  assert.match(sql, /enqueue_wing_media_cleanup/i);
  assert.match(sql, /claim_wing_media_cleanup_job/i);
  assert.match(sql, /finish_wing_media_cleanup_job/i);
  assert.match(sql, /wing_media_cleanup_receipts/i);
  assert.match(sql, /wing_cleanup_receipts_are_append_only/i);
});

test('cleanup targets originals only and leaves processed/publication assets alone', () => {
  assert.match(
    sql,
    /object_path ~ '\^originals\/\[0-9a-f-\]\{36\}\/\[0-9a-f-\]\{36\}\/source\$'/i,
  );
  assert.doesNotMatch(
    sql,
    /cleanup_kind[\s\S]{0,100}publication\//i,
  );
  assert.match(sql, /intent\.expires_at <= now\(\) - interval '1 hour'/i);
  assert.match(sql, /submission\.processed_storage_path is not null/i);
});
