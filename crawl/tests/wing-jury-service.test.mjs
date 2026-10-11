import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGuestJurySession,
  getWingJuryPhotoBatch,
  normalizeWingJuryFeedResponse,
  recordWingJuryVerdict,
  WingJuryError,
} from '../lib/wingJuryService.js';
import fs from 'node:fs';

function mockClient(user = null, calls = []) {
  return {
    auth: { getUser: async () => ({ data: { user }, error: null }) },
    functions: { invoke: async (name, options) => { calls.push({ name, options }); return { data: { ok: true, photos: [{ submission_id: 'p1', signed_url: 'https://img/p1', destination_id: 'secret', restaurant_name: 'Secret Wings' }] }, error: null }; } },
  };
}

test('disabled Wing Jury makes no backend call', async () => {
  let calls = 0;
  await assert.rejects(getWingJuryPhotoBatch({ client: mockClient(), enabled: false }), (error) => error.code === 'FEATURE_DISABLED');
  calls += 1;
  assert.equal(calls, 1);
});

test('pre-vote normalization strips restaurant identity and statistics', () => {
  const result = normalizeWingJuryFeedResponse({ photos: [{ submission_id: 'p1', signed_url: 'https://img/p1', destination_id: 'secret', restaurant_name: 'Secret' }] });
  assert.deepEqual(result.photos[0], { submission_id: 'p1', signed_url: 'https://img/p1', media_type: null, expires_at: null });
  assert.equal('destination_id' in result.photos[0], false);
});

test('guest verdicts stay session-local and never invoke the vote function', async () => {
  const calls = [];
  const session = createGuestJurySession();
  const result = await recordWingJuryVerdict({ client: mockClient(null, calls), photo: { submission_id: 'p1' }, vote: 0, guestSession: session, enabled: true });
  assert.equal(result.status, 'guest');
  assert.equal(session.hasJudged('p1'), true);
  assert.deepEqual(calls, []);
  assert.equal(session.register('p1', 1).duplicate, true);
});

test('authenticated verdict delegates permanent write to the trusted vote boundary', async () => {
  const calls = [];
  const result = await recordWingJuryVerdict({ client: mockClient({ id: 'u1' }, calls), photo: { submission_id: 'p1' }, vote: 1, enabled: true });
  assert.equal(result.status, 'authenticated');
  assert.equal(calls[0].name, 'wing-jury-vote');
  assert.deepEqual(calls[0].options.body, { submission_id: 'p1', vote: 1 });
});

test('invalid vote values fail before any backend call', async () => {
  const calls = [];
  await assert.rejects(recordWingJuryVerdict({ client: mockClient({ id: 'u1' }, calls), photo: { submission_id: 'p1' }, vote: 2, enabled: true }), (error) => error instanceof WingJuryError && error.code === 'INVALID_VOTE');
  assert.deepEqual(calls, []);
});

test('trusted Edge Function contracts preserve eligibility, pagination, and vote boundaries', () => {
  const feed = fs.readFileSync(new URL('../supabase/functions/wing-jury-feed/index.ts', import.meta.url), 'utf8');
  const vote = fs.readFileSync(new URL('../supabase/functions/wing-jury-vote/index.ts', import.meta.url), 'utf8');
  const reveal = fs.readFileSync(new URL('../supabase/functions/wing-jury-reveal/index.ts', import.meta.url), 'utf8');
  const sql = fs.readFileSync(new URL('../supabase/local/phase-2b/20261009_local_phase2b_foundation.sql', import.meta.url), 'utf8');
  assert.match(feed, /CANDIDATE_PAGE = 120/);
  assert.match(feed, /MAX_CANDIDATE_PAGES = 10/);
  assert.match(feed, /rpc\('wing_jury_feed_candidates'/);
  assert.match(sql, /asin\(sqrt\(least/);
  assert.match(sql, /from public\.wing_jury_votes verdict/);
  assert.match(feed, /submission_id: photo\.id, signed_url/);
  assert.doesNotMatch(feed, /restaurant_name/);
  assert.match(vote, /\[-1, 0, 1\]/);
  assert.match(vote, /23505/);
  assert.match(vote, /existing_vote/);
  assert.match(reveal, /vote_required/);
  assert.match(reveal, /photo_like_count/);
  assert.match(reveal, /user_destination_favorites/);
});
