import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sql = readFileSync(
  new URL('../supabase/migrations/20260729126000_wing_shots_notifications.sql', import.meta.url),
  'utf8',
);

test('submission transitions enqueue approved rejected and featured events once', () => {
  for (const type of ['wing_shot_approved', 'wing_shot_rejected', 'wing_shot_featured']) {
    assert.match(sql, new RegExp(`'${type}'`));
  }
  assert.match(sql, /after insert on public\.wing_submission_state_transitions/);
  assert.match(sql, /v_key := v_event_type \|\| ':' \|\| v_submission\.id::text/);
  assert.match(sql, /on conflict \(user_id, event_type, deduplication_key\)/);
});

test('featured copy is celebratory and deep-links to the featured submission', () => {
  assert.match(sql, /🌶️ You''re featured on BuffaGo today!/);
  assert.match(sql, /buffago:\/\/wing-shots\//);
  assert.match(sql, /'\/wing-shots\/' \|\| v_submission\.id::text/);
});

test('notifications honor feature flag preference quiet hours and source state', () => {
  assert.match(sql, /flag_key = 'wing_shot_featured_notifications'/);
  assert.match(sql, /creator_updates boolean not null default true/);
  assert.match(sql, /v_pref\.quiet_hours_enabled/);
  assert.match(sql, /submission\.user_id = v_event\.user_id/);
  assert.match(sql, /submission\.status = 'posted'/);
  assert.match(sql, /badge_event\.event_kind = 'awarded'/);
});

test('notification provider outcome is independent and receipts are auditable', () => {
  assert.match(sql, /create table if not exists public\.wing_notification_receipts/);
  assert.match(sql, /outcome in \('queued', 'preference_disabled', 'flag_disabled'\)/);
  assert.match(sql, /before update or delete on public\.wing_notification_receipts/);
  assert.doesNotMatch(sql, /insert into public\.notification_delivery_attempts/);
  assert.doesNotMatch(sql, /raise exception '.*provider/i);
});
