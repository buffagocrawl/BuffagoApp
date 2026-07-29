import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const migration = readFileSync(new URL('../supabase/migrations/20260729132000_wing_creator_surfaces.sql', import.meta.url), 'utf8');
const client = readFileSync(new URL('../lib/wingCreator.js', import.meta.url), 'utf8');
const overview = readFileSync(new URL('../app/profile/wing-shots/index.jsx', import.meta.url), 'utf8');
const history = readFileSync(new URL('../app/profile/wing-shots/history.jsx', import.meta.url), 'utf8');
const summary = readFileSync(new URL('../components/creator/WingCreatorSummaryCard.jsx', import.meta.url), 'utf8');
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

test('Creator leaderboard is server gated, private, and uses Reputation copy', () => {
  assert.match(migration, /wing_shot_creator_leaderboard/);
  assert.match(migration, /if not coalesce\(v_enabled, false\) then\s+return/);
  assert.match(migration, /revoke execute on function public\.get_wing_creator_leaderboard\(text, integer\)\s+from authenticated/);
  assert.match(client, /get_wing_creator_leaderboard_surface/);
  assert.match(leaderboard, /Creators/);
  assert.match(leaderboard, /Creator Reputation/);
  assert.doesNotMatch(leaderboard, /Creator XP/);
  assert.match(leaderboard, /featured/);
  assert.match(leaderboard, /creator_leaderboard_viewed/);
});

test('Wing Creator opens a dedicated, back-navigable history screen without duplicate summary content', () => {
  assert.match(overview, /Your Wing Shots/);
  assert.match(overview, /Private submission history and Creator progress/);
  assert.match(overview, /edges=\{\['top', 'bottom'\]\}/);
  assert.match(overview, /paddingBottom: 28/);
  assert.match(summary, /router\.push\('\/profile\/wing-shots\/history'\)/);
  assert.match(history, /title="Wing Shot History"/);
  assert.match(history, /subtitle="Your private submission history"/);
  assert.match(history, /icon="arrow-left"/);
  assert.match(history, /router\.back\(\)/);
  assert.match(history, /edges=\{\['top', 'bottom'\]\}/);
  assert.match(history, /paddingBottom: 32/);
  assert.doesNotMatch(history, /WingCreatorSummaryCard/);
  assert.doesNotMatch(history, /creator\.open-history/);
});

test('history and detail include stable selectors, statuses, and friendly rejection copy', () => {
  for (const label of ['Processing', 'In Review', 'Approved', 'Featured', 'Not Selected Yet', 'Rejected', 'Upload Failed', 'Withdrawn']) {
    assert.ok(migration.includes(`'${label}'`) || readFileSync(new URL('../components/creator/SubmissionStatusChip.jsx', import.meta.url), 'utf8').includes(label));
  }
  assert.match(history, /testID="creator\.history"/);
  assert.match(history, /'creator\.history\.first-item'/);
  assert.match(history, /formatWingShotRejectionReason/);
  assert.match(history, /<SubmissionStatusChip status=\{item\.display_status\} \/>/);
  assert.match(history, /item\.display_status === 'Rejected'/);
  assert.match(history, /Submitted \{formatDate\(item\.created_at\)\}/);
  assert.match(detail, /testID="creator\.detail\.withdraw"/);
  assert.match(detail, /testID="creator\.detail\.request-review"/);
  assert.match(detail, /formatWingShotRejectionReason/);
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
  assert.match(edge, /'cache-control': 'no-store, private, max-age=0'/);
  assert.doesNotMatch(edge, /console\.(log|warn|error)/);
});
