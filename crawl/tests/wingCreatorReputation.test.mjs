import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { formatWingShotRejectionReason, UNKNOWN_WING_SHOT_REJECTION } from '../lib/wingShotCopy.js';

const card = readFileSync(new URL('../components/creator/WingCreatorSummaryCard.jsx', import.meta.url), 'utf8');
const leaderboard = readFileSync(new URL('../components/creator/CreatorLeaderboardPanel.jsx', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../supabase/migrations/20260729122000_wing_shots_creator_rewards.sql', import.meta.url), 'utf8');

test('Wing Creator uses Reputation and removes the First Wing Shot chip', () => {
  assert.match(card, /Creator Reputation/);
  assert.doesNotMatch(card, /Creator XP/);
  assert.doesNotMatch(card, /First Wing Shot/);
  assert.match(card, /creator\.info-button/);
  assert.match(card, /How Wing Creator works/);
  assert.match(card, /creator\.info-modal/);
  assert.match(card, /<ScrollView/);
  assert.match(card, /Close Wing Creator explanation/);
  assert.match(card, /Got It/);
  assert.match(card, /paddingBottom: 30/);
});

test('rejection codes always render friendly copy', () => {
  assert.equal(formatWingShotRejectionReason('quality_unusable'), 'The video quality was too low to use.');
  assert.equal(formatWingShotRejectionReason('too_dark'), 'The video was too dark to clearly see the wings.');
  assert.equal(formatWingShotRejectionReason('blurry'), 'The video was too blurry to clearly see the wings.');
  assert.equal(formatWingShotRejectionReason('unsafe_content'), 'The video did not meet BuffaGo’s content guidelines.');
  assert.equal(formatWingShotRejectionReason('unrelated_content'), 'The video did not clearly show the wings or restaurant experience.');
  assert.equal(formatWingShotRejectionReason('duplicate'), 'This appears to be a duplicate submission.');
  assert.equal(formatWingShotRejectionReason('unsupported_media'), 'This media format could not be processed.');
  assert.equal(formatWingShotRejectionReason('new_raw_code'), UNKNOWN_WING_SHOT_REJECTION);
  assert.doesNotMatch(formatWingShotRejectionReason('quality_unusable'), /_/);
});

test('Creators leaderboard presents reputation, counts, current-user treatment, and server tie-break order', () => {
  assert.match(leaderboard, /Creator Reputation/);
  assert.match(leaderboard, /row\.is_current_user/);
  assert.match(leaderboard, /avatar_url/);
  assert.match(migration, /total\.creator_xp desc,\s+total\.featured_submissions desc,\s+total\.approved_submissions desc,\s+total\.reached_at,\s+total\.user_id/);
  assert.match(migration, /reward\.event_kind in \('approval_xp', 'featured_xp'\)/);
  assert.match(migration, /not exists \([\s\S]*reverses_reward_event_id/);
  assert.match(migration, /public\.can_user_appear_socially\(total\.user_id\)/);
});

test('overall XP remains separate from Creator Reputation', () => {
  assert.match(card, /Creator Reputation/);
  assert.match(card, /overall BuffaGo XP/);
  assert.match(leaderboard, /Reputation/);
});
