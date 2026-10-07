import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import jpeg from 'jpeg-js';
import { encode as encodePng } from 'fast-png';
import { edgeRuntime } from './helpers/edge-runtime.mjs';

const user = '10000000-0000-4000-a000-000000000001';
const correlationId = '20000000-0000-4000-a000-000000000002';
const destination = '30000000-0000-4000-a000-000000000003';
const auth = { getUser: async () => ({ data: { user: { id: user } } }) };
const validJpeg = Buffer.from(jpeg.encode({ width: 2, height: 2, data: Buffer.alloc(16, 255) }, 90).data);
const validPng = Buffer.from(encodePng({ width: 2, height: 2, data: new Uint8Array(16).fill(255), channels: 4, depth: 8 }));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const validationClient = (file) => ({ auth, storage: { from: () => ({ download: async () => ({ data: file }) }) }, from: () => ({ upsert: async () => ({ error: null }) }) });
const query = (data) => ({ select() { return this; }, eq() { return this; }, is() { return this; }, update() { return this; }, maybeSingle: async () => ({ data }) });

test('validator converts a Storage exception to a controlled retryable response', async () => {
  const invoke = edgeRuntime('wing-media-validate', { auth, storage: { from: () => ({ download: async () => { throw new Error('offline'); } }) } });
  const result = await invoke({ bucket: 'wing-shot-staging', objectPath: `${user}/${correlationId}/photo.jpg`, mediaType: 'photo', declaredMimeType: 'image/jpeg', declaredFileSizeBytes: 100 });
  assert.equal(result.status, 503);
  assert.equal(result.body.retryable, true);
});

for (const mime of ['image/webp', 'image/heic']) test(`validator rejects unsupported ${mime}`, async () => {
  const file = new Blob(['not an image'], { type: mime });
  const result = await edgeRuntime('wing-media-validate', validationClient(file))({ bucket: 'wing-shot-staging', objectPath: `${user}/${correlationId}/photo`, mediaType: 'photo', declaredMimeType: mime, declaredFileSizeBytes: file.size });
  assert.equal(result.status, 400);
  assert.equal(result.body.code, 'unsupported_media_type');
});

test('staging authorization supports missing filename using declared image MIME', async () => {
  const invoke = edgeRuntime('wing-media-stage-authorize', { auth, rpc: async () => ({data:['wing_shot_prompt','wing_shot_photo_upload'].map(flag_key=>({flag_key,enabled_for_user:true}))}), storage: { from: () => ({ createSignedUploadUrl: async () => ({ data: { signedUrl: 'https://signed.test' } }) }) } });
  const result = await invoke({ correlationId, destinationId: destination, mediaType: 'photo', mimeType: 'image/jpeg', fileSizeBytes: 100 });
  assert.equal(result.status, 200);
  assert.match(result.body.objectPath, /\.jpg$/);
});

for (const [name, bytes, mime] of [
  ['3-byte JPEG signature', new Uint8Array([255, 216, 255]), 'image/jpeg'],
  ['truncated JPEG', validJpeg.subarray(0, 40), 'image/jpeg'],
  ['malformed PNG', new Uint8Array([137,80,78,71,13,10,26,10,1,2,3]), 'image/png'],
  ['arbitrary bytes with image MIME', new TextEncoder().encode('not an image'), 'image/jpeg'],
]) test(`validator rejects ${name}`, async () => {
  const file = new Blob([bytes], { type: mime });
  const result = await edgeRuntime('wing-media-validate', validationClient(file))({ bucket: 'wing-shot-staging', objectPath: `${user}/${correlationId}/photo`, mediaType: 'photo', declaredMimeType: mime, declaredFileSizeBytes: file.size, localMetadata: { width: 1, height: 1 } });
  assert.equal(result.status, 400);
  assert.equal(result.body.code, 'media_corrupt');
});

for (const [name, bytes, mime] of [['JPEG', validJpeg, 'image/jpeg'], ['PNG', validPng, 'image/png']]) test(`validator decodes valid ${name} and ignores fake client dimensions`, async () => {
  const file = new Blob([bytes], { type: mime });
  const result = await edgeRuntime('wing-media-validate', validationClient(file))({ bucket: 'wing-shot-staging', objectPath: `${user}/${correlationId}/photo`, mediaType: 'photo', declaredMimeType: mime, declaredFileSizeBytes: file.size, localMetadata: { width: 99999, height: 99999 } });
  assert.equal(result.status, 200);
  assert.deepEqual([result.body.width, result.body.height], [2, 2]);
});

test('promotion rejects MIME or size differing from reservation', async () => {
  const intent = { submission_id: destination, user_id: user, expected_storage_path: `originals/${user}/${destination}/source`, expected_mime_type: 'image/jpeg', expected_size_bytes: 100, media_type: 'photo', status: 'reserved', expires_at: new Date(Date.now() + 60000).toISOString() };
  const invoke = edgeRuntime('wing-media-promote', { auth, from: () => query(intent), storage: { from() { throw new Error('Storage must not be reached'); } } });
  for (const overrides of [{ expectedMimeType: 'image/png' }, { expectedSizeBytes: 101 }]) {
    const result = await invoke({ correlationId, submissionId: destination, bucket: 'wing-shot-staging', objectPath: `${user}/${correlationId}/photo.jpg`, ...overrides });
    assert.equal(result.status, 400);
    assert.equal(result.body.code, 'promotion_contract_invalid');
  }
});

test('authorization network failure is controlled and retryable', async () => {
  const result = await edgeRuntime('wing-media-stage-authorize', { auth: { getUser: async () => { throw new Error('offline'); } } })({ correlationId, destinationId: destination, mediaType: 'photo', mimeType: 'image/jpeg', fileSizeBytes: 100 });
  assert.equal(result.status, 503);
  assert.equal(result.body.retryable, true);
});

for (const disabled of ['wing_shot_prompt','wing_shot_photo_upload']) test(`new staging fails closed when ${disabled} is disabled for the caller`, async () => {
  const client = { auth, rpc: async () => ({ data: ['wing_shot_prompt','wing_shot_photo_upload'].map(flag_key=>({flag_key,enabled_for_user:flag_key!==disabled})) }), storage: { from() { throw new Error('Storage must not be reached'); } } };
  const result = await edgeRuntime('wing-media-stage-authorize',client)({correlationId,mediaType:'photo',mimeType:'image/jpeg',fileSizeBytes:100});
  assert.equal(result.status,403); assert.equal(result.body.code,'wing_shot_photo_upload_disabled');
});

test('new staging checks the authenticated cohort on each request and fails closed on flag errors', async () => {
  let enabled=true, signed=0;
  const client={auth,rpc:async()=>({data:['wing_shot_prompt','wing_shot_photo_upload'].map(flag_key=>({flag_key,enabled_for_user:enabled}))}),storage:{from:()=>({createSignedUploadUrl:async()=>{signed++;return {data:{signedUrl:'https://test.local/upload'}};}})}};
  let config;
  const invoke=edgeRuntime('wing-media-stage-authorize',client,{'https://esm.sh/@supabase/supabase-js@2.58.0':{createClient:(_url,_key,options)=>{if(options?.global)config=options;return client;}}});
  const body={correlationId,mediaType:'photo',mimeType:'image/jpeg',fileSizeBytes:100};
  assert.equal((await invoke(body)).status,200);
  assert.equal(config.global.headers.Authorization,'Bearer test');
  enabled=false;
  assert.equal((await invoke(body)).status,403); assert.equal(signed,1);
  client.rpc=async()=>{throw new Error('offline');};
  const failed=await invoke(body); assert.equal(failed.status,503); assert.equal(failed.body.retryable,true);
  client.rpc=async()=>({error:{message:'unavailable'}});
  assert.equal((await invoke(body)).status,503); assert.equal(signed,1);
});

test('promotion rejects an unvalidated reservation', async () => {
  const intent = { submission_id:destination,user_id:user,expected_storage_path:`originals/${user}/${destination}/source`,expected_mime_type:'image/jpeg',expected_size_bytes:3,media_type:'photo',status:'reserved',expires_at:new Date(Date.now()+60000).toISOString() };
  const client = { auth, from:(table)=>query(table === 'wing_submission_upload_intents' ? intent : null), storage:{ from(){ throw new Error('Storage must not be reached'); } } };
  const result = await edgeRuntime('wing-media-promote', client)({correlationId,submissionId:destination,bucket:'wing-shot-staging',objectPath:`${user}/${correlationId}/photo.jpg`});
  assert.equal(result.status,409);
  assert.equal(result.body.code,'validation_required');
});

test('promotion rejects object substitution after validation', async () => {
  const changed = new Blob([validPng], { type: 'image/jpeg' });
  const destinationPath = `originals/${user}/${destination}/source`;
  const stagingPath = `${user}/${correlationId}/photo.jpg`;
  const intent = { submission_id:destination,user_id:user,expected_storage_path:destinationPath,expected_mime_type:'image/jpeg',expected_size_bytes:changed.size,media_type:'photo',status:'reserved',expires_at:new Date(Date.now()+60000).toISOString() };
  const receipt = { id:'40000000-0000-4000-a000-000000000004',user_id:user,correlation_id:correlationId,staging_bucket:'wing-shot-staging',staging_path:stagingPath,sha256:sha256(validJpeg),size_bytes:changed.size,mime_type:'image/jpeg',expires_at:new Date(Date.now()+60000).toISOString(),submission_id:null };
  const client={auth,from:(table)=>query(table==='wing_submission_upload_intents'?intent:receipt),storage:{from:(bucket)=>({download:async()=>bucket==='wing-submissions'?{data:null,error:{message:'missing'}}:{data:changed}})}};
  const result=await edgeRuntime('wing-media-promote',client)({correlationId,submissionId:destination,bucket:'wing-shot-staging',objectPath:stagingPath});
  assert.equal(result.status,409);
  assert.equal(result.body.code,'staging_object_changed');
});

for (const slug of ['wing-media-validate', 'wing-media-promote']) test(`${slug} reads fresh Storage bytes with a unique cache nonce`, async () => {
  let options;
  const requests = [];
  const file = new Blob([validJpeg], { type: 'image/jpeg' });
  const client = { ...validationClient(file), from: () => query(null) };
  const invoke = edgeRuntime(slug, client, {
    'https://esm.sh/@supabase/supabase-js@2.58.0': { createClient: (_url, _key, config) => { if (config) options = config; return client; } },
    fetch: async (url, init) => { requests.push({ url: String(url), cache: init.cache }); return new Response(''); },
  });
  await invoke({ correlationId, submissionId: destination, bucket: 'wing-shot-staging', objectPath: `${user}/${correlationId}/photo.jpg`, mediaType: 'photo', declaredMimeType: 'image/jpeg', declaredFileSizeBytes: file.size });
  assert.ok(options?.global?.fetch);
  for (let i = 0; i < 2; i++) await options.global.fetch('https://test.local/storage/v1/object/wing-shot-staging/photo.jpg', { method: 'GET' });
  assert.notEqual(requests[0].url, requests[1].url);
  assert.ok(requests.every((entry) => entry.cache === 'no-store' && new URL(entry.url).searchParams.has('wing_validation_nonce')));
});
