import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createClient } from '@supabase/supabase-js';
const source=readFileSync(new URL('./fixtures/native-visual/supabase.js',import.meta.url),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
function fixture(dev, { sample = null, fault = false, fetch } = {}) {
  let options;
  vm.runInNewContext(code,{exports:{},__DEV__:dev,URL,Response,Headers,btoa,fetch,
    process: { env: { EXPO_PUBLIC_BUFFAGO_NATIVE_IMAGE_FAULT_QA: fault ? '1' : '0' } },
    require:name=>name==='./approvedPhoto'?{__esModule:true,default:sample}:({createClient:(_url,_key,value)=>{options=value;return {};}})});
  return options;
}

test('opt-in image faults use only local processed-fixture URLs and preserve write denial', async () => {
  const requests = [];
  const sample = { restaurant: { id: 'fixture-spot-0' }, gallery: { picture_count: 1,
    images: [{ submission_id: 'fixture-photo-1', destination_id: 'fixture-spot-0', signed_url: 'fixture-asset', expires_at: '2099-01-01T00:00:00Z' }] } };
  const options = fixture(true, { sample, fault: true, fetch: async url => {
    requests.push(url); return new Response(JSON.stringify({ scenario: 'expired-full', revision: 4 }));
  } });
  const res = await options.global.fetch('https://native-fixture.invalid/functions/v1/wing-public-gallery', {
    method: 'POST', body: JSON.stringify({ destination_ids: ['fixture-spot-0'], submission_id: 'fixture-photo-1' }),
  });
  const photo = (await res.json()).restaurants[0].images[0];
  assert.deepEqual(requests, ['http://127.0.0.1:8084/state?kind=full']);
  assert.equal(photo.signed_url, 'http://127.0.0.1:8084/image/full/0/4.png');
  assert.equal(photo.expires_at, '2000-01-01T00:00:00Z');
  assert.equal((await options.global.fetch('https://native-fixture.invalid/rest/v1/wing_media_photo_votes', { method: 'POST' })).status, 403);
});
test('native fixture refuses release execution',()=>assert.throws(()=>fixture(false),/Development fixtures only/));
test('native fixture blocks live hosts and table writes',async()=>{
  const {global:{fetch}}=fixture(true);
  await assert.rejects(fetch('https://production.example/rest/v1/destinations'),/network boundary blocked/);
  assert.equal((await fetch('https://native-fixture.invalid/rest/v1/destination_ratings',{method:'POST',body:'{}'})).status,403);
  assert.equal((await fetch('https://native-fixture.invalid/rest/v1/rpc/finalize_wing_submission_upload',{method:'POST',body:'{}'})).status,403);
});

test('SDK single-row reads resolve the active crawl and its joined route', async () => {
  const options = fixture(true);
  const client = createClient('https://native-fixture.invalid', 'fixture.anonymous.key', {
    auth: { persistSession: false, autoRefreshToken: false }, global: options.global,
  });
  const { data: crawl, error: crawlError } = await client.from('crawls').select('*').eq('crawl_id', 'fixture-active').single();
  assert.equal(crawlError, null);
  assert.equal(crawl.route_id, 'fixture-route');
  const { data: route, error: routeError } = await client.from('routes').select('*').eq('id', crawl.route_id).single();
  assert.equal(routeError, null);
  assert.equal(route.title, 'QA Buffalo Classics');
  assert.equal(route.stop1.name, 'QA Harbor Wings');
  assert.equal(route.stop3.name, 'QA Northside Wings');
});
test('native fixture keeps session storage in memory and empty galleries empty',async()=>{
  const options=fixture(true);
  const session=JSON.parse(await options.auth.storage.getItem());
  assert.equal(session.user.email,'native-fixture@example.invalid');
  const response=await options.global.fetch('https://native-fixture.invalid/functions/v1/wing-public-gallery',{method:'POST',body:JSON.stringify({destination_ids:['fixture-spot-0']})});
  const result=await response.json();
  assert.deepEqual(result.restaurants[0].images,[]);
  assert.equal(result.restaurants[0].picture_count,0);
});

test('resumed crawl route joins resolve its existing stop IDs and preserve the read-only boundary', async () => {
  const { global: { fetch } } = fixture(true);
  const response = await fetch('https://native-fixture.invalid/rest/v1/routes?id=eq.fixture-route&select=id,stop1,stop2,stop3',
    { headers: { Accept: 'application/vnd.pgrst.object+json' } });
  const route = await response.json();
  assert.equal(route.id, 'fixture-route');
  for (let ordinal = 1; ordinal <= 3; ordinal++) {
    const stop = route[`stop${ordinal}`];
    assert.equal(stop.id, route[`stop${ordinal}_id`]);
    assert.ok(stop.name && stop.address && Number.isFinite(stop.lat) && Number.isFinite(stop.lng));
  }
  assert.equal(route.stop4, null);
  assert.equal(route.stop5, null);
  assert.equal((await fetch('https://native-fixture.invalid/rest/v1/crawls', { method: 'PATCH', body: '{}' })).status, 403);
});
