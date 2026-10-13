import test from 'node:test';
import assert from 'node:assert/strict';
import { loadWingdexRestaurantGallery, orderWingdexPhotos } from '../lib/wingdexGallery.js';
import { publishPhotoVote } from '../lib/photoVoteEvents.js';

test('photo order ignores dislikes and uses newest first followed by a stable ID',()=>{
  const photos=[
    {submission_id:'old',like_count:8,dislike_count:0,created_at:'2026-10-01'},
    {submission_id:'b',like_count:8,dislike_count:20,created_at:'2026-10-12'},
    {submission_id:'a',like_count:8,dislike_count:99,created_at:'2026-10-12'},
    {submission_id:'popular',like_count:9,created_at:'2026-01-01'},
  ];
  assert.deepEqual(orderWingdexPhotos(photos).map(p=>p.submission_id),['popular','a','b','old']);
  assert.equal(photos[0].submission_id,'old','Sorting must not mutate shared cache rows');
});

test('inline and detail gallery reads coalesce, pages remain separate, votes invalidate caches',async()=>{
  let calls=0,release;
  const pending=new Promise(resolve=>release=resolve);
  const client={functions:{invoke:async(_name,{body})=>{calls++;await pending;return {data:{restaurants:[{destination_id:'fixture',picture_count:2,images:[{submission_id:`page-${body.offset}`,signed_url:'fixture:image'}]}]}};}}};
  const inline=loadWingdexRestaurantGallery('fixture',client);const detail=loadWingdexRestaurantGallery('fixture',client);
  assert.equal(calls,1);release();assert.deepEqual(await inline,await detail);
  await loadWingdexRestaurantGallery('fixture',client);assert.equal(calls,1);
  await loadWingdexRestaurantGallery('fixture',client,{offset:60});assert.equal(calls,2);
  publishPhotoVote('fixture-user',{submission_id:'page-0',like_count:1,current_vote:1});
  await loadWingdexRestaurantGallery('fixture',client);assert.equal(calls,3);
});

test('a failed gallery request is evicted so Retry dispatches a fresh read',async()=>{
  let calls=0;const client={functions:{invoke:async()=>++calls===1?{error:new Error('offline')}:{data:{restaurants:[]}}}};
  await assert.rejects(loadWingdexRestaurantGallery('fixture',client),/offline/);
  assert.deepEqual(await loadWingdexRestaurantGallery('fixture',client),{count:0,images:[]});assert.equal(calls,2);
});
