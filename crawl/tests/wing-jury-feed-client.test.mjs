import test from 'node:test';
import assert from 'node:assert/strict';
import { createGuestJurySession, getWingJuryPhotoBatch } from '../lib/wingJuryService.js';

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const photo = (n) => ({ submission_id: id(n), signed_url: `https://fixture/${n}`, media_type: 'photo' });
function client(invoke, user = null) {
  return { auth: { getUser: async () => ({ data: { user } }) }, functions: { invoke: async (...args) => { const result = await invoke(...args); return { ...result, data: { feed_version: 2, ...result.data } }; } } };
}

test('long guest sessions exclude every judged photo while requests carry only 500 hints', async () => {
  const guestSession = createGuestJurySession();
  for (let n = 1; n <= 700; n += 1) guestSession.register(id(n), 0);
  const calls = [];
  const result = await getWingJuryPhotoBatch({ enabled: true, guestSession, client: client(async (_name, { body }) => {
    calls.push(body);
    return { data: calls.length === 1
      ? { photos: [photo(1), photo(650)], has_more: true, next_cursor: 'page-2' }
      : { photos: [photo(700), photo(701)], has_more: false } };
  }) });
  assert.deepEqual(result.photos.map((p) => p.submission_id), [id(701)]);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].cursor, 'page-2');
  assert.equal(calls[0].judged_submission_ids.length, 500);
  assert.equal(calls[0].judged_submission_ids[0], id(201));
  assert.equal(guestSession.hasJudged(id(1)), true);
});

test('empty work-budget pages advance with bounded retries and retain continuation', async () => {
  let calls = 0;
  const result = await getWingJuryPhotoBatch({ enabled: true, client: client(async (_name, { body }) => {
    assert.equal(body.cursor, calls ? `cursor-${calls}` : null);
    calls += 1;
    return { data: { photos: [], has_more: true, next_cursor: `cursor-${calls}` } };
  }) });
  assert.equal(calls, 4);
  assert.equal(result.hasMore, true);
  assert.equal(result.nextCursor, 'cursor-4');
});

test('unavailable or denied location is the same deterministic null-coordinate request', async () => {
  for (const location of [null, {}, { latitude: null, longitude: null }]) {
    await getWingJuryPhotoBatch({ enabled: true, location, client: client(async (_name, { body }) => {
      assert.equal(body.latitude, null); assert.equal(body.longitude, null);
      return { data: { photos: [], has_more: false } };
    }) });
  }
});

test('broken cursor progress is a controlled error rather than an unbounded loop', async () => {
  for (const next_cursor of [null, 'same']) {
    let calls = 0;
    await assert.rejects(getWingJuryPhotoBatch({ enabled: true, cursor: 'same', client: client(async () => {
      calls += 1; return { data: { photos: [], has_more: true, next_cursor } };
    }) }), (error) => error.code === 'FEED_UNAVAILABLE');
    assert.equal(calls, 1);
  }
});

test('account change while an empty continuation is pending prevents the next request', async () => {
  let alive = true, calls = 0;
  await assert.rejects(getWingJuryPhotoBatch({ enabled: true, expectedUserId: 'A', isCurrent: () => alive,
    client: client(async () => { calls += 1; alive = false; return { data: { photos: [], has_more: true, next_cursor: 'next' } }; }, { id: 'A' })
  }), (error) => error.code === 'ACCOUNT_CHANGED');
  assert.equal(calls, 1);
});

test('deployed unversioned and v1 feeds remain usable and pin legacy cursors until a fresh session',async()=>{
 for(const version of [undefined,1]){
  const guestSession=createGuestJurySession(),calls=[];let updated=false;
  const legacyClient={auth:{getUser:async()=>({data:{user:null}})},functions:{invoke:async(_name,{body})=>{
   calls.push(body);return {data:{ok:true,...(updated?{feed_version:body.feed_mode?2:1}:version===undefined?{}:{feed_version:version}),photos:[photo(calls.length)],has_more:true,next_cursor:'legacy-'+calls.length}};
  }}};
  const first=await getWingJuryPhotoBatch({enabled:true,guestSession,client:legacyClient});assert.equal(first.feedMode,'legacy');assert.equal(first.feedVersion,1);assert.equal(calls[0].feed_mode,'randomized_v2');
  updated=true;
  const second=await getWingJuryPhotoBatch({enabled:true,guestSession,cursor:first.nextCursor,client:legacyClient});assert.equal(second.feedMode,'legacy');assert.equal(calls[1].cursor,'legacy-1');assert.equal(calls[1].feed_mode,undefined);assert.equal(calls[1].feed_session_id,undefined);
  guestSession.clear();const fresh=await getWingJuryPhotoBatch({enabled:true,guestSession,client:legacyClient});assert.equal(fresh.feedMode,'randomized');assert.equal(calls[2].cursor,null);
 }
});
test('a pinned randomized session cannot silently downgrade or mix legacy pages',async()=>{
 const guestSession=createGuestJurySession();let calls=0;
 const api=client(async()=>({data:{feed_version:++calls===1?2:1,photos:[photo(calls)],has_more:true,next_cursor:'page-'+calls}}));
 const first=await getWingJuryPhotoBatch({enabled:true,guestSession,client:api});assert.equal(first.feedMode,'randomized');
 await assert.rejects(getWingJuryPhotoBatch({enabled:true,guestSession,client:api,cursor:first.nextCursor}),error=>error.code==='FEED_UNAVAILABLE');
});
test('existing guest session pins the snapshot across initial-page retries and clears it at close',()=>{
 const guest=createGuestJurySession();const first=guest.feedSession();assert.deepEqual(guest.feedSession(),first);guest.clear();assert.notEqual(guest.feedSession().id,first.id);
});

test('session anchors initial normalized coordinates across movement, permission changes and fallback, then renews on a new entry',async()=>{
 for(const initial of [null,{latitude:42,longitude:-78}]){
  const guestSession=createGuestJurySession();const requests=[];
  const api=client(async(_name,{body})=>{requests.push(body);return {data:{photos:[],has_more:false}};});
  for(const location of [initial,{latitude:43,longitude:-79},null]) await getWingJuryPhotoBatch({client:api,guestSession,location,enabled:true});
  for(const body of requests){assert.equal(body.latitude,initial?.latitude??null);assert.equal(body.longitude,initial?.longitude??null);assert.equal(body.feed_session_id,requests[0].feed_session_id);}
  guestSession.clear();await getWingJuryPhotoBatch({client:api,guestSession,location:{latitude:44,longitude:-80},enabled:true});
  assert.equal(requests.at(-1).latitude,44);assert.equal(requests.at(-1).longitude,-80);assert.notEqual(requests.at(-1).feed_session_id,requests[0].feed_session_id);
 }
});

test('legacy compatibility still excludes every judged guest photo beyond the 500-ID request hint',async()=>{
 const guestSession=createGuestJurySession();for(let n=1;n<=700;n++)guestSession.register(id(n),0);const calls=[];
 const api={auth:{getUser:async()=>({data:{user:null}})},functions:{invoke:async(_name,{body})=>{
  calls.push(body);return {data: calls.length===1?{photos:[photo(1),photo(650)],has_more:true,next_cursor:'old-2'}:{photos:[photo(700),photo(701)],has_more:false}};
 }}};
 const result=await getWingJuryPhotoBatch({enabled:true,guestSession,client:api});assert.equal(result.feedMode,'legacy');assert.deepEqual(result.photos.map(p=>p.submission_id),[id(701)]);assert.equal(calls.length,2);assert.equal(calls[0].judged_submission_ids.length,500);assert.equal(calls[1].feed_mode,undefined);assert.equal(calls[1].cursor,'old-2');
});
