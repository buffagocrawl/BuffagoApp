import test from 'node:test';
import assert from 'node:assert/strict';
import { createVoteController, optimisticVote, loadOwnPhotoVotes } from '../lib/wingdexPhotos.js';
import { publishPhotoVote, subscribePhotoVotes } from '../lib/photoVoteEvents.js';
const photo = (vote = null) => ({ submission_id: 'a', destination_id: 'restaurant', current_vote: vote, like_count: 14, dislike_count: 2, neutral_count: 3 });
for (const [before, tap, after, likes, dislikes, neutral] of [
  [null, 1, 1, 15, 2, 3], [null, -1, -1, 14, 3, 3], [1, 1, null, 13, 2, 3],
  [-1, -1, null, 14, 1, 3], [1, -1, -1, 13, 3, 3], [-1, 1, 1, 15, 1, 3],
  [0, 1, 1, 15, 2, 2], [1, 0, 0, 13, 2, 4], [0, 0, null, 14, 2, 2],
]) test(`vote ${before} + tap ${tap} -> ${after}`, () => {
  assert.deepEqual(optimisticVote(photo(before), tap), { ...photo(after), like_count: likes, dislike_count: dislikes, neutral_count: neutral });
});
function client(result = { error: null }, user = { id: 'active-user' }) {
  const calls = [];
  const query = { eq(k,v) { calls.push([k,v]); return this; }, select(s) { calls.push(['select',s]); return this; },
    in(k,v) { calls.push([k,v]); return this; }, then(resolve,reject) { return Promise.resolve(result).then(resolve,reject); } };
  return { calls, auth: { getUser: async () => ({ data: { user }, error: null }) },
    from(name) { calls.push(['table',name]); return query; },
    async rpc(name,args) { calls.push(['rpc',name,args]); const response = await result;
      return response.error ? response : { error: null, data: { submission_id: args.p_submission_id, vote: args.p_vote, like_count: 27, dislike_count: 9, neutral_count: 8 } }; } };
}
test('edits and withdrawal use one authenticated RPC and authoritative counts', async () => {
  const c=client(); const emitted=[];
  await createVoteController(c)(photo(),1,(...args)=>emitted.push(args),'active-user');
  assert.deepEqual(c.calls[0],['rpc','set_wing_jury_photo_vote',{p_submission_id:'a',p_vote:1}]);
  assert.equal(emitted[0][1],true); assert.equal(emitted[1][1],false);
  assert.equal(emitted[1][0].like_count,27);
  await createVoteController(c)(photo(1),1,()=>{});
  assert.equal(c.calls[1][2].p_vote,null);
  assert.ok(!c.calls.some(([kind])=>kind==='table'));
});
test('failure rolls back and releases the shared client lock',async()=>{
  const c=client({error:{message:'offline'}});const emitted=[];
  await assert.rejects(createVoteController(c)(photo(),1,(...args)=>emitted.push(args)),/Could not save/);
  assert.deepEqual(emitted[1],[photo(),false]);
  await assert.rejects(createVoteController(c)(photo(),-1,()=>{}));assert.equal(c.calls.length,2);
});
test('two controllers for the same client prevent duplicate taps across screens',async()=>{
  let release;const pending=new Promise(r=>release=r);const c=client(pending);
  const first=createVoteController(c)(photo(),1,()=>{});
  await createVoteController(c)(photo(),-1,()=>assert.fail('duplicate publish'));
  await Promise.resolve(); assert.equal(c.calls.length,1);
  release({error:null});await first;
});
test('different photos can mutate concurrently',async()=>{
  let release;const c=client(new Promise(r=>release=r));const run=createVoteController(c);
  const a=run(photo(),1,()=>{});const b=run({...photo(),submission_id:'b'},-1,()=>{});
  await Promise.resolve();assert.equal(c.calls.length,2);release({error:null});await Promise.all([a,b]);
});
test('guests and account changes cannot nominate an identity',async()=>{
  for(const user of [null,{id:'guest',is_anonymous:true}]){
    const c=client({error:null},user);await assert.rejects(createVoteController(c)(photo(),1,()=>{}),/Sign in/);assert.equal(c.calls.length,0);
  }
  const c=client();await assert.rejects(createVoteController(c)(photo(),1,()=>{},'old-user'),/account changed/);assert.equal(c.calls.length,0);
});
test('own-vote reads use the Jury table, account filter, and bounded batches',async()=>{
  const c=client({error:null,data:[{submission_id:'a',vote:0}]});
  const photos=[photo(),...Array.from({length:500},(_,n)=>({...photo(),submission_id:String(n)}))];
  const result=await loadOwnPhotoVotes(photos,c);
  assert.equal(result[0].current_vote,0);assert.equal(result[1].current_vote,null);
  assert.ok(c.calls.filter(([k])=>k==='table').every(([,name])=>name==='wing_jury_votes'));
  assert.deepEqual(c.calls.filter(([k])=>k==='submission_id').map(([,ids])=>ids.length),[250,250,1]);
  assert.equal(c.calls.filter(([k,v])=>k==='user_id'&&v==='active-user').length,3);
});
test('successful mutation invalidates both mounted screens, failure does not',async()=>{
  const events=[];const unsubscribe=subscribePhotoVotes(event=>events.push(event));
  try {
    await createVoteController(client())(photo(),1,()=>{});
    assert.equal(events.length,1);assert.equal(events[0].userId,'active-user');assert.equal(events[0].photo.current_vote,1);
    await assert.rejects(createVoteController(client({error:{}}))(photo(),-1,()=>{}));assert.equal(events.length,1);
    publishPhotoVote('other-account',{submission_id:'a',current_vote:-1});assert.equal(events.at(-1).userId,'other-account');
  } finally {unsubscribe();}
});
