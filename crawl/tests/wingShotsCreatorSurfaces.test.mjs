import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const migration = readFileSync(new URL('../supabase/migrations/20260729132000_wing_creator_surfaces.sql', import.meta.url), 'utf8');
const client = readFileSync(new URL('../lib/wingCreator.js', import.meta.url), 'utf8');
const history = readFileSync(new URL('../app/profile/wing-shots/index.jsx', import.meta.url), 'utf8');
const detail = readFileSync(new URL('../app/profile/wing-shots/[id].jsx', import.meta.url), 'utf8');
const leaderboard = readFileSync(new URL('../components/creator/CreatorLeaderboardPanel.jsx', import.meta.url), 'utf8');
const edge = readFileSync(new URL('../supabase/functions/wing-media-preview/index.ts', import.meta.url), 'utf8');

test('owner detail is private, sanitized, and exposes only real posted HTTPS links', () => {
  assert.match(migration, /submission\.user_id = auth\.uid\(\)/);
  assert.match(migration, /public\.wing_safe_rejection_category/);
  assert.match(migration, /job\.status = 'posted'/);
  assert.match(migration, /not job\.dry_run/);
  assert.match(migration, /instagram\\\.com/);
  assert.match(migration, /facebook\\\.com\|fb\\\.com/);
  const detailFunction = migration.slice(migration.indexOf('create or replace function public.get_my_wing_submission_detail'), migration.indexOf('revoke all on function public.get_my_wing_submission_detail'));
  const returnedColumns = detailFunction.slice(detailFunction.indexOf('returns table'), detailFunction.indexOf('language sql'));
  assert.doesNotMatch(returnedColumns, /reviewer_notes|storage_path|moderation_status/);
});

test('Creator leaderboard is server gated and keeps privacy filtering in authoritative RPC', () => {
  assert.match(migration, /wing_shot_creator_leaderboard/);
  assert.match(migration, /if not coalesce\(v_enabled, false\) then\s+return/);
  assert.match(migration, /revoke execute on function public\.get_wing_creator_leaderboard\(text, integer\)\s+from authenticated/);
  assert.match(client, /get_wing_creator_leaderboard_surface/);
  assert.match(leaderboard, /Creator Reputation is earned from approved and featured Wing Shots/);
  assert.match(leaderboard, /approved/);
  assert.match(leaderboard, /featured/);
  assert.match(leaderboard, /creator_leaderboard_viewed/);
});

test('history and detail include stable selectors and understandable states', () => {
  for (const label of ['Processing', 'In Review', 'Approved', 'Featured', 'Not Selected Yet', 'Rejected', 'Upload Failed', 'Withdrawn']) {
    assert.ok(migration.includes(`'${label}'`) || readFileSync(new URL('../components/creator/SubmissionStatusChip.jsx', import.meta.url), 'utf8').includes(label));
  }
  assert.match(history, /testID="creator\.history"/);
  assert.match(history, /'creator\.history\.first-item'/);
  assert.match(detail, /testID="creator\.detail\.withdraw"/);
  assert.match(detail, /testID="creator\.detail\.request-review"/);
  assert.match(detail, /Your rating is still saved/);
});

test('unposted withdrawal and posted review are separate server-authoritative actions', () => {
  assert.match(client, /withdraw_wing_submission/);
  assert.match(client, /p_expected_status/);
  assert.match(migration, /request_wing_published_content_review/);
  assert.match(migration, /submission\.status = 'posted'/);
  assert.match(migration, /wing_content_review_one_open_per_submission/);
  assert.match(migration, /idempotency_key text not null unique/);
});

test('private preview broker verifies the caller and returns a short-lived signed URL', () => {
  assert.match(client, /request_wing_media_access/);
  assert.match(client, /p_purpose: 'owner_preview'/);
  assert.match(client, /wing-media-preview/);
  assert.match(edge, /admin\.auth\.getUser\(token\)/);
  assert.match(edge, /claim_wing_media_access_request_for_user/);
  assert.match(edge, /p_requester_id: authData\.user\.id/);
  assert.match(edge, /const SIGNED_URL_SECONDS = 60/);
  assert.doesNotMatch(edge, /console\.(log|warn|error)/);
});
