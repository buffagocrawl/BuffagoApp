import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  formatWingShotRejectionReason,
  UNKNOWN_WING_SHOT_REJECTION,
} from '../lib/wingShotRejection.js';

const card = readFileSync(new URL('../components/creator/WingCreatorSummaryCard.jsx', import.meta.url), 'utf8');
const leaderboard = readFileSync(new URL('../components/creator/CreatorLeaderboardPanel.jsx', import.meta.url), 'utf8');
const formatter = readFileSync(new URL('../lib/wingShotRejection.js', import.meta.url), 'utf8');

test('Wing Creator uses Reputation copy and the info modal without the First Wing Shot chip', () => {
  assert.match(card, /Creator Reputation/);
  assert.doesNotMatch(card, /Creator XP/);
  assert.doesNotMatch(card, /First Wing Shot/);
  assert.match(card, /How Wing Creator works/);
  assert.match(card, /visible={infoVisible}/);
  assert.match(card, /onRequestClose=\{\(\) => setInfoVisible\(false\)\}/);
});

test('rejection formatter maps known codes and protects unknown values', () => {
  for (const code of ['quality_unusable', 'too_dark', 'blurry', 'unsafe_content', 'unrelated_content', 'duplicate', 'unsupported_media']) {
    assert.match(formatter, new RegExp(code));
  }
  assert.match(formatter, /This Wing Shot did not meet the current submission guidelines/);
  assert.equal(formatWingShotRejectionReason('quality_unusable'), 'The video quality was too low to use.');
  assert.equal(formatWingShotRejectionReason('future_internal_code'), UNKNOWN_WING_SHOT_REJECTION);
  assert.equal(formatWingShotRejectionReason(null), UNKNOWN_WING_SHOT_REJECTION);
});

test('creator leaderboard presents Reputation, aggregate counts, and current-user rank', () => {
  assert.match(leaderboard, /Creator Reputation is earned from approved and featured Wing Shots/);
  assert.match(leaderboard, /Your Rank/);
  assert.match(leaderboard, /approved/);
  assert.match(leaderboard, /featured/);
  assert.doesNotMatch(leaderboard, /Creator XP/);
});
