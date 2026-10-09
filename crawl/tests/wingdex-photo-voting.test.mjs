import test from 'node:test';
import assert from 'node:assert/strict';
import { createVoteController, optimisticVote, loadOwnPhotoVotes } from '../lib/wingdexPhotos.js';

const photo = (vote = null) => ({ submission_id: 'a', destination_id: 'restaurant', current_vote: vote, like_count: 14, dislike_count: 2 });
for (const [before, tap, after, likes, dislikes] of [
  [null, 1, 1, 15, 2], [null, -1, -1, 14, 3], [1, 1, null, 13, 2],
  [-1, -1, null, 14, 1], [1, -1, -1, 13, 3], [-1, 1, 1, 15, 1],
]) test(`vote ${before} + tap ${tap} -> ${after}`, () => {
  assert.deepEqual(optimisticVote(photo(before), tap), { ...photo(after), like_count: likes, dislike_count: dislikes });
});

function client(result, user = { id: 'active-user' }) {
  const calls = [];
  const query = { delete() { calls.push(['delete']); return this; }, eq(k, v) { calls.push([k, v]); return this; },
    select(s) { calls.push(['select', s]); return this; }, in(k,v) { calls.push([k,v]); return this; },
    upsert(row, options) { calls.push(['upsert', row, options]); return this; },
    then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); } };
  return { calls, auth: { getUser: async () => ({ data: { user }, error: null }) }, from(name) { calls.push(['table', name]); return query; } };
}
test('mutations use authenticated identity and composite upsert, never counters', async () => {
  const c = client({ error: null }); const publish = [];
  await createVoteController(c)(photo(), 1, (...args) => publish.push(args));
  assert.deepEqual(c.calls.find(([kind]) => kind === 'upsert'), ['upsert', { submission_id: 'a', user_id: 'active-user', vote: 1 }, { onConflict: 'submission_id,user_id' }]);
  assert.equal(publish[0][1], true); assert.equal(publish[1][1], false);
  const remove = client({ error: null }); await createVoteController(remove)(photo(1), 1, () => {});
  assert.ok(remove.calls.some(([k,v]) => k === 'user_id' && v === 'active-user'));
  assert.ok(remove.calls.some(([k]) => k === 'delete'));
});
test('failed mutation rolls back and releases the lock', async () => {
  const c = client({ error: { message: 'offline' } }); const publish = []; const run = createVoteController(c);
  await assert.rejects(run(photo(), 1, (p,b) => publish.push([p,b])), /Could not save/);
  assert.equal(publish[0][0].like_count, 15); assert.deepEqual(publish[1], [photo(), false]);
  await assert.rejects(run(photo(), -1, () => {})); assert.equal(c.calls.filter(([k]) => k === 'upsert').length, 2);
});
test('duplicate taps cannot mutate or corrupt counts, other photos remain independent', async () => {
  let resolve; const wait = new Promise((r) => { resolve = r; }); const c = client(wait);
  const run = createVoteController(c); const published = [];
  const first = run(photo(), 1, (p) => published.push(p));
  await run(photo(), -1, () => assert.fail('second tap must be ignored'));
  await Promise.resolve(); assert.equal(c.calls.filter(([k]) => k === 'upsert').length, 1);
  resolve({ error: null }); await first; assert.equal(published.at(-1).like_count, 15);
  await run({ ...photo(), submission_id: 'b' }, -1, (p) => assert.equal(p.submission_id, 'b'));
});
test('different photos can be voted concurrently without sharing a pending lock', async () => {
  let releaseA; let releaseB;
  const waits = {
    a: new Promise((resolve) => { releaseA = resolve; }),
    b: new Promise((resolve) => { releaseB = resolve; }),
  };
  const calls = [];
  const c = { auth: { getUser: async () => ({ data: { user: { id: 'active-user' } }, error: null }) },
    from: () => ({ upsert: (row) => { calls.push(row); return waits[row.submission_id]; } }) };
  const run = createVoteController(c);
  const published = [];
  const a = run(photo(), 1, (value, pending) => published.push(['a', value.current_vote, pending]));
  const b = run({ ...photo(), submission_id: 'b' }, -1,
    (value, pending) => published.push(['b', value.current_vote, pending]));
  await Promise.resolve();
  assert.deepEqual(calls.map((row) => row.submission_id).sort(), ['a', 'b']);
  releaseB({ error: null }); await b;
  assert.ok(published.some(([id, vote, pending]) => id === 'b' && vote === -1 && pending === false));
  assert.ok(!published.some(([id, , pending]) => id === 'a' && pending === false));
  releaseA({ error: null }); await a;
  assert.ok(published.some(([id, vote, pending]) => id === 'a' && vote === 1 && pending === false));
});
test('guests and account changes cannot supply another identity', async () => {
  const c = client({ error: null }, null);
  await assert.rejects(createVoteController(c)(photo(), 1, () => {}), /Sign in/); assert.equal(c.calls.length, 0);
  const switched = client({ error: null });
  await assert.rejects(createVoteController(switched)(photo(), 1, () => {}, 'previous-user'), /account changed/);
  assert.equal(switched.calls.length, 0);
});
test('vote reads filter to active user and requested submissions only', async () => {
  const c = client({ error: null, data: [{ submission_id: 'a', vote: -1 }] });
  const result = await loadOwnPhotoVotes([photo(), { ...photo(), submission_id: 'b' }], c);
  assert.equal(result[0].current_vote, -1); assert.equal(result[1].current_vote, null);
  assert.deepEqual(c.calls.find(([k]) => k === 'user_id'), ['user_id', 'active-user']);
  assert.deepEqual(c.calls.find(([k]) => k === 'submission_id'), ['submission_id', ['a', 'b']]);
});
test('large galleries batch own-vote reads without truncation', async () => {
  const c=client({error:null,data:[]});
  const photos=Array.from({length:501},(_,i)=>({...photo(),submission_id:String(i)}));
  assert.equal((await loadOwnPhotoVotes(photos,c)).length,501);
  assert.deepEqual(c.calls.filter(([k])=>k==='submission_id').map(([,ids])=>ids.length),[250,250,1]);
  assert.equal(c.calls.filter(([k,v])=>k==='user_id' && v==='active-user').length,3);
});
