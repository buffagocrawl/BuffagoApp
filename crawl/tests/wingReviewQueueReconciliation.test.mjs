import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const root = new URL('../../', import.meta.url);
const read = (name) => readFileSync(new URL(name, root), 'utf8');
const migration = read('crawl/supabase/migrations/20260731020000_wing_review_queue_processing_reconciliation.sql');
const finalizer = read('crawl/supabase/migrations/20260731013034_wing_review_only_finalization.sql');
const mango = read('Agents/Mango Habanero/src/main.jsx');
const server = read('Agents/Mango Habanero/server/index.mjs');

test('validated submission finalization enters the canonical pending-review state', () => {
  assert.match(finalizer, /drop trigger if exists enqueue_wing_processing_after_submission/i);
  assert.match(finalizer, /'in_review'/);
  assert.match(finalizer, /'review_status', 'pending_review'/);
  assert.doesNotMatch(finalizer, /ensure_wing_processing_job|insert into public\.wing_processing_jobs/i);
});

test('legacy processing recovery is service-only, safe, and idempotent', () => {
  assert.match(migration, /create or replace function public\.reconcile_stuck_wing_processing/i);
  assert.match(migration, /s\.status = 'processing'/);
  assert.match(migration, /storage\.objects/);
  assert.match(migration, /j\.status in \('pending', 'claimed', 'retry'\)/);
  assert.match(migration, /wing_transition_submission\(/);
  assert.match(migration, /'in_review', 'processing'/);
  assert.match(migration, /system-reconcile:processing-to-review/);
  assert.match(migration, /to service_role/);
});

test('Mango exposes pending-review actions and structured transition failures', () => {
  assert.match(mango, /new Set\(\['in_review'\]\)/);
  assert.match(mango, /item\.status === 'in_review' && item\.original_object_exists/);
  assert.match(mango, /Approve/);
  assert.match(mango, /Reject/);
  assert.match(server, /status_transition/);
  assert.match(server, /status_transition_failed/);
  assert.match(server, /failure_reason/);
});

test('manual review remains the only approval path and rejects invalid states', () => {
  const review = read('crawl/supabase/migrations/20260730233913_wing_review_intake_lifecycle.sql');
  assert.match(review, /v_submission\.status <> 'in_review'/);
  assert.match(review, /original_media_required_for_review/);
  assert.match(review, /case when p_action = 'approve' then 'approved' else 'rejected' end/);
  assert.match(review, /rejection_reason/);
});
