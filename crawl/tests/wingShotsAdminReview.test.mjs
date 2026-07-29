import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationPath = new URL(
  '../supabase/migrations/20260729128000_wing_shots_admin_review_surface.sql',
  import.meta.url,
);
const edgePath = new URL('../supabase/functions/wing-media-preview/index.ts', import.meta.url);
const clientPath = new URL('../lib/adminWingShots.ts', import.meta.url);
const routePath = new URL('../app/admin/wing-shots/index.tsx', import.meta.url);
const cardPath = new URL(
  '../components/admin/wingShots/AdminQueueCard.tsx',
  import.meta.url,
);
const actionPath = new URL(
  '../components/admin/wingShots/ReviewActionSheet.tsx',
  import.meta.url,
);

const [sql, edge, client, route, card, actionSheet] = await Promise.all([
  readFile(migrationPath, 'utf8'),
  readFile(edgePath, 'utf8'),
  readFile(clientPath, 'utf8'),
  readFile(routePath, 'utf8'),
  readFile(cardPath, 'utf8'),
  readFile(actionPath, 'utf8'),
]);

test('admin queue is role and feature gated and exposes sanitized review context', () => {
  const queue = sql.match(
    /create or replace function public\.get_wing_admin_queue[\s\S]*?\n\$\$;/,
  )?.[0];
  assert.ok(queue, 'queue RPC must exist');
  assert.match(queue, /wing_has_app_role\('wing_reviewer'\)/);
  assert.match(queue, /wing_has_app_role\('wing_admin'\)/);
  assert.match(queue, /wing_moderation_queue_enabled_for_user\(\)/);
  assert.match(queue, /'rating', jsonb_build_object/);
  assert.match(queue, /'consent', jsonb_build_object/);
  assert.match(queue, /'moderation_summary'/);
  assert.match(queue, /'duplicate_signals'/);
  assert.match(queue, /'status_history'/);
  assert.match(queue, /'generated_posts'/);
  assert.doesNotMatch(queue, /original_storage_path|processed_storage_path|thumbnail_storage_path/);
  assert.doesNotMatch(queue, /raw_result|model_provider|model_name|model_version/);
});

test('review actions are server allowlisted, require notes, and record human overrides', () => {
  const review = sql.match(
    /create or replace function public\.review_wing_submission_v2[\s\S]*?\n\$\$;/,
  )?.[0];
  assert.ok(review, 'review V2 RPC must exist');
  assert.match(review, /char_length\(trim\(p_notes\)\) not between 8 and 1000/);
  assert.match(review, /p_action = 'approve'/);
  assert.match(review, /p_action = 'reject'/);
  assert.match(review, /p_action = 'retry_processing'/);
  assert.match(review, /p_action = 'prioritize'/);
  assert.match(review, /p_action = 'remove_priority'/);
  assert.match(review, /p_action = 'withdraw_from_queue'/);
  assert.match(review, /p_action = 'mark_abuse'/);
  assert.match(review, /'human'/);
  assert.match(review, /'documented_override'/);
  assert.match(sql, /revoke all on function public\.review_wing_submission\([\s\S]*?from authenticated/);
  assert.match(sql, /review_wing_submission_v2\([\s\S]*?\) to authenticated/);
});

test('preview handoff is one-time, requester bound, short lived, and never serves originals', () => {
  const claim = sql.match(
    /create or replace function public\.claim_wing_media_access_request_for_user[\s\S]*?\n\$\$;/,
  )?.[0];
  assert.ok(claim, 'requester-bound claim must exist');
  assert.match(claim, /requester_id = p_requester_id/);
  assert.match(claim, /role_assignment\.role in \('wing_reviewer', 'wing_admin'\)/);
  assert.match(claim, /feature_flag\.flag_key = 'wing_shot_moderation_queue'/);
  assert.match(claim, /purpose = 'admin_review'/);
  assert.match(claim, /variant in \('processed', 'thumbnail', 'publication'\)/);
  assert.match(claim, /status = 'consumed'/);
  assert.doesNotMatch(claim, /variant.*original/);

  assert.match(edge, /admin\.auth\.getUser\(token\)/);
  assert.match(edge, /claim_wing_media_access_request_for_user/);
  assert.match(edge, /createSignedUrl\(claim\.object_path, SIGNED_URL_SECONDS\)/);
  assert.match(edge, /const SIGNED_URL_SECONDS = 60/);
  assert.match(edge, /cache-control.*no-store/i);
  assert.doesNotMatch(edge, /original_storage_path|serviceRoleKey.*JSON\.stringify/s);
});

test('admin client uses only protected RPC and Edge Function boundaries', () => {
  assert.match(client, /rpc\('get_wing_admin_queue'/);
  assert.match(client, /rpc\(\s*'request_wing_media_access'/);
  assert.match(client, /functions\.invoke\('wing-media-preview'/);
  assert.match(client, /rpc\('review_wing_submission_v2'/);
  assert.doesNotMatch(client, /\.from\(/);
  assert.doesNotMatch(client, /service.role|SUPABASE_SERVICE_ROLE_KEY/i);
});

test('route fails closed and exposes stable accessible selectors', () => {
  assert.match(route, /wing-admin\.denied/);
  assert.match(route, /No queue data was loaded/);
  assert.match(route, /wing-admin\.disabled/);
  assert.match(route, /wing-admin\.queue-list/);
  assert.match(route, /accessibilityLiveRegion="polite"/);
  assert.match(card, /wing-admin\.queue\.\$\{item\.submission_id\}\.action\.\$\{action\}/);
  assert.match(card, /Manual priority never bypasses safety|Every action requires a reason and notes/);
  assert.match(actionSheet, /wing-admin\.review\.notes/);
  assert.match(actionSheet, /minimum 8/);
  assert.match(actionSheet, /does not transfer\s+media ownership/s);
  assert.match(actionSheet, /documented_override/);
});
