import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = readFileSync(new URL('../lib/wingShotHistory.js', import.meta.url), 'utf8');
const { wingShotHistoryCollection, normalizeJuryCounts, loadWingShotJuryCounts } = await import(`data:text/javascript,${encodeURIComponent(source)}`);

test('all persisted moderation/publishing states map into three history collections', () => {
  for (const status of ['uploaded', 'processing', 'in_review', 'Processing', 'In Review']) assert.equal(wingShotHistoryCollection({ internal_status: status }), 'review');
  for (const status of ['approved', 'posted', 'generation_pending', 'ready_to_post', 'scheduled', 'posting', 'Featured', 'Not Selected Yet']) assert.equal(wingShotHistoryCollection({ display_status: status }), 'approved');
  for (const status of ['rejected', 'failed', 'withdrawn', 'Upload Failed', 'Duplicate video']) assert.equal(wingShotHistoryCollection({ display_status: status }), 'failed');
});

test('jury counts include neutral verdicts as passes and distinguish unavailable from zero', () => {
  assert.deepEqual(normalizeJuryCounts({ like_count: 0, dislike_count: 0, neutral_count: 0 }), { likes: 0, dislikes: 0, passes: 0 });
  assert.deepEqual(normalizeJuryCounts({ like_count: 7, dislike_count: 2, neutral_count: 3 }), { likes: 7, dislikes: 2, passes: 3 });
  assert.equal(normalizeJuryCounts(null), null);
  assert.equal(normalizeJuryCounts({ like_count: 0, dislike_count: 0 }), null);
});

test('only approved photos request real persisted Jury counts, failures never fabricate totals', async () => {
  const rows = [{ submission_id: 'a', media_type: 'photo', display_status: 'Approved' }, { submission_id: 'b', media_type: 'photo', display_status: 'In Review' }];
  const client = { from(table) { assert.equal(table, 'wing_jury_photo_vote_counts'); return { select(columns) { assert.equal(columns, 'submission_id,like_count,dislike_count,neutral_count'); return { async in(column, ids) { assert.equal(column, 'submission_id'); assert.deepEqual(ids, ['a']); return { data: [{ submission_id: 'a', like_count: 3, dislike_count: 1, neutral_count: 2 }] }; } }; } }; } };
  assert.deepEqual((await loadWingShotJuryCounts(rows, client))[0].jury_counts, { likes: 3, dislikes: 1, passes: 2 });
  const failed = { from: () => ({ select: () => ({ in: async () => ({ error: new Error('offline') }) }) }) };
  assert.equal((await loadWingShotJuryCounts(rows, failed))[0].jury_counts, null);
});

test('Journey retires duplicate rating/challenge UI while keeping rating dialog and creator achievements', () => {
  const journey = readFileSync(new URL('../app/profile/history/index.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(journey, /WeeklyChallengeStats|>Rating history<|>Rating History</);
  assert.match(journey, /Rated YTD, open rating history/);
  assert.match(journey, /setDialogMode\('ratings'\)/);
  const creator = readFileSync(new URL('../components/creator/WingCreatorSummaryCard.jsx', import.meta.url), 'utf8');
  assert.match(creator, /'wing_photographer', 'crawl_cameraperson'/);
  assert.match(creator, /loadMyWingCreatorSummary/);
});

test('focused rating history closes on Android Back and removes its handler on blur', () => {
  const source = readFileSync(new URL('../app/profile/history/index.jsx', import.meta.url), 'utf8');
  const expression = source.replace(/\r\n/g, '\n').match(/useFocusEffect\(useCallback\(\(\) => \{\n    if \(!dialogOpen[\s\S]*?\}, \[dialogOpen, dialogMode\]\)\);/)?.[0];
  assert.ok(expression);assert.match(source, /accessibilityLabel="Back to Journey"/);
  const install = new Function('dialogOpen','dialogMode','useFocusEffect','useCallback','BackHandler','setDialogOpen',expression);
  for(const [open,mode,expected] of [[false,'ratings',0],[true,'active',0],[true,'ratings',1]]) {
    let listener,cleanup,closed=false,removed=0,calls=0;
    install(open,mode,callback=>{cleanup=callback();},callback=>callback,{addEventListener(event,callback){assert.equal(event,'hardwareBackPress');calls++;listener=callback;return {remove(){removed++;}};}},value=>{closed=value===false;});
    assert.equal(calls,expected);
    if(listener){assert.equal(listener(),true);assert.equal(closed,true);cleanup();assert.equal(removed,1);}
  }
});

test('owner RPC supplies authoritative zeros; older-server and transport errors preserve table fallback', async () => {
  const rows = [{ submission_id: 'a', media_type: 'photo', display_status: 'Approved' }];
  const client = { rpc: async (name, args) => {
    assert.equal(name, 'get_my_wing_shot_jury_counts'); assert.deepEqual(args, { p_submission_ids: ['a'] });
    return { data: [{ submission_id: 'a', like_count: 0, dislike_count: 0, neutral_count: 0 }] };
  }, from() { throw new Error('Owner RPC success must not request public fallback'); } };
  assert.deepEqual((await loadWingShotJuryCounts(rows, client))[0].jury_counts, { likes: 0, dislikes: 0, passes: 0 });
  const fallback = { ...client, rpc: async () => ({ error: { code: 'PGRST202' } }), from: () => ({ select: () => ({ in: async () => ({ data: [{ submission_id: 'a', like_count: 7, dislike_count: 2, neutral_count: 3 }] }) }) }) };
  assert.deepEqual((await loadWingShotJuryCounts(rows, fallback))[0].jury_counts, { likes: 7, dislikes: 2, passes: 3 });
  fallback.rpc = async () => { throw new Error('offline'); };
  assert.deepEqual((await loadWingShotJuryCounts(rows, fallback))[0].jury_counts, { likes: 7, dislikes: 2, passes: 3 });
});
