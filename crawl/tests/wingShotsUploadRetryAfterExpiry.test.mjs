import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '..');
const migration = fs.readFileSync(
  path.join(
    root,
    'supabase',
    'migrations',
    '20260729136000_wing_upload_retry_after_expiry.sql',
  ),
  'utf8',
);

test('expired intent history is preserved while only active ratings stay unique', () => {
  assert.match(
    migration,
    /drop constraint if exists wing_submission_upload_intents_rating_id_key/i,
  );
  assert.match(
    migration,
    /unique index if not exists wing_upload_intents_one_active_per_rating/i,
  );
  assert.match(
    migration,
    /where status in \('reserved', 'finalized'\)/i,
  );
  assert.doesNotMatch(migration, /delete from public\.wing_submission_upload_intents/i);
  assert.doesNotMatch(migration, /on conflict[\s\S]{0,100}do update/i);
});

test('terminal intents cannot be revived and new paths use a fresh submission UUID', () => {
  assert.match(
    migration,
    /old\.status in \('finalized', 'expired', 'cancelled'\)/i,
  );
  assert.match(
    migration,
    /wing_upload_intent_terminal_state_is_immutable/i,
  );
  assert.match(migration, /v_submission_id uuid := gen_random_uuid\(\)/i);
  assert.match(
    migration,
    /'originals\/' \|\| v_user_id::text \|\| '\/'\s*\|\| v_submission_id::text/i,
  );
});

test('fresh reservation retains all owner eligibility flag and rate-limit controls', () => {
  assert.match(migration, /v_user_id uuid := auth\.uid\(\)/i);
  assert.match(migration, /wing_shot_rating_is_eligible/i);
  assert.match(migration, /wing_shot_prompt_disabled/i);
  assert.match(migration, /wing_shot_photo_upload_disabled/i);
  assert.match(migration, /wing_shot_video_upload_disabled/i);
  // The existing insert trigger remains authoritative for hourly/daily limits.
  assert.match(
    migration,
    /insert into public\.wing_submission_upload_intents/i,
  );
  assert.doesNotMatch(migration, /disable trigger/i);
});

test('rating lock and partial uniqueness prevent parallel active reservations', () => {
  assert.match(migration, /wing-rating-reservation:/i);
  assert.match(migration, /pg_advisory_xact_lock/i);
  assert.match(
    migration,
    /intent\.status in \('reserved', 'finalized'\)/i,
  );
  assert.match(migration, /wing_submission_already_finalized/i);
});

test('idempotent replay returns immutable history without reactivating the intent', () => {
  assert.match(
    migration,
    /where idempotency_key = p_idempotency_key/i,
  );
  assert.match(migration, /return v_existing\.result/i);
  assert.doesNotMatch(
    migration,
    /update public\.wing_submission_upload_intents[\s\S]{0,100}status = 'reserved'/i,
  );
});
