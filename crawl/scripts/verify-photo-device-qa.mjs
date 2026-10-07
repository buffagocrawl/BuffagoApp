// Explicit opt-in production fixture. Never uses or modifies real submissions.
// Credentials are read from ignored local files; output contains only check names.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { loadPhotoWorkflowFlags } from '../lib/photoWorkflowFlags.js';
import { loadWingdexRestaurantGallery } from '../lib/wingdexGallery.js';

if (!process.argv.includes('--run-production-fixture')) throw Error('Pass --run-production-fixture to explicitly run the disposable production test.');
const require = createRequire(import.meta.url);
const dotenv = require('dotenv');
const env = (path) => dotenv.parse(readFileSync(new URL(path, import.meta.url)));
const mobile = env('../.env.production');
const qa = env('../../.env.cayenne.local');
const mango = env('../../Agents/Mango Habanero/.env');
const url = mobile.EXPO_PUBLIC_SUPABASE_URL;
assert.equal(new URL(url).hostname, 'vhfxnizaxdanmvmouuaf.supabase.co');
assert.equal(mango.SUPABASE_URL.replace(/\/$/, ''), url.replace(/\/$/, ''));
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const client = createClient(url, mobile.EXPO_PUBLIC_SUPABASE_ANON_KEY, options);
const publicClient = createClient(url, mobile.EXPO_PUBLIC_SUPABASE_ANON_KEY, options);
const admin = createClient(url, mango.SUPABASE_SERVICE_ROLE_KEY, options);
const checks = [];
const checked = async (name, promise) => {
  const result = await promise;
  if (result.error) throw Object.assign(Error(`${name} failed`), { code: result.error.code });
  checks.push(name);
  return result.data;
};
const correlationId = randomUUID();
let stage, reservation, rating;
const fixtureCrawlId = randomUUID();
const fixtureRatingId = randomUUID();
let fixtureCrawlCreated = false;
let fixtureRatingCreated = false;
let fixtureFinalized = false;
let publicCountBefore = null;
let authenticated = false;
try {
  const auth = await checked('ordinary QA password authentication', client.auth.signInWithPassword({ email: qa.CAYENNE_TEST_EMAIL, password: qa.CAYENNE_TEST_PASSWORD }));
  authenticated = true;
  const owner = auth.user.id;
  const flags = await loadPhotoWorkflowFlags(client);
  assert.deepEqual([flags.prompt, flags.photo, flags.video], [true, true, false]);
  checks.push('client flags prompt/photo enabled; video disabled');
  const { data: roleRows } = await admin.from('app_user_roles').select('role').eq('user_id', owner).eq('active', true);
  assert.equal((roleRows || []).some((row) => /admin|reviewer/.test(row.role)), false, 'QA uploader must be ordinary');
  const destinations = await checked('fixture destination lookup', client.from('destinations').select('id').limit(1));
  assert.ok(destinations[0]?.id);
  const destinationId = destinations[0].id;
  const jpeg = require('jpeg-js');
  const bytes = jpeg.encode({ width: 2, height: 2, data: Buffer.alloc(16, 255) }, 90).data;
  stage = await checked('stage authorization', client.functions.invoke('wing-media-stage-authorize', { body: {
    correlationId, destinationId, mediaType: 'photo', mimeType: 'image/jpeg', fileSizeBytes: bytes.length, fileName: 'device-qa-fixture.jpg',
  }, headers: { 'x-wing-correlation-id': correlationId } }));
  assert.equal(stage.ok, true);
  const uploadToken = new URL(stage.signedUploadUrl).searchParams.get('token');
  await checked('signed staged upload', client.storage.from(stage.bucket).uploadToSignedUrl(stage.objectPath, uploadToken, bytes, { contentType: 'image/jpeg' }));
  const validation = await checked('authoritative image validation', client.functions.invoke('wing-media-validate', { body: {
    bucket: stage.bucket, objectPath: stage.objectPath, correlationId, mediaType: 'photo', declaredMimeType: 'image/jpeg', declaredFileSizeBytes: bytes.length,
  }, headers: { 'x-wing-correlation-id': correlationId } }));
  assert.equal(validation.valid, true);
  // Seed a disposable rating fixture after staging. This does not impersonate
  // physical proximity or claim to exercise the device's location verification.
  await checked('disposable QA crawl fixture seed', admin.from('crawls').insert({ crawl_id: fixtureCrawlId, user_id: owner, is_solo: true }));
  fixtureCrawlCreated = true;
  await checked('disposable complete QA rating fixture seed', admin.from('destination_ratings').insert({
    id: fixtureRatingId, crawl_id: fixtureCrawlId, destination_id: destinationId, user_id: owner,
    crispiness: 5, sauce: 5, meat: 5, overall: 5, is_buffacoin: false,
  }));
  fixtureRatingCreated = true;
  rating = await checked('ordinary owner reads seeded rating', client.from('destination_ratings').select('id,destination_id,crispiness,sauce,meat,overall,weight_score').eq('id', fixtureRatingId).single());
  const eligibility = await checked('server rating eligibility', client.rpc('get_wing_shot_rating_eligibility', { p_rating_id: rating.id }));
  assert.equal(eligibility.eligible, true);
  reservation = await checked('ordinary user reservation', client.rpc('reserve_wing_submission_upload', {
    p_rating_id: rating.id, p_destination_id: rating.destination_id, p_media_type: 'photo', p_expected_mime_type: 'image/jpeg',
    p_expected_size_bytes: bytes.length, p_consent_version: 'wing-shots-v1', p_attribution_preference: 'anonymous',
    p_user_caption: 'Disposable device QA fixture', p_idempotency_key: `device-qa-reserve:${correlationId}`, p_correlation_id: correlationId, p_submission_source: 'profile',
  }));
  assert.ok(reservation.submission_id);
  const promotion = await checked('receipt-bound exact-object promotion', client.functions.invoke('wing-media-promote', { body: {
    bucket: stage.bucket, objectPath: stage.objectPath, submissionId: reservation.submission_id, correlationId, mediaType: 'photo', expectedMimeType: 'image/jpeg', expectedSizeBytes: bytes.length,
  }, headers: { 'x-wing-correlation-id': correlationId } }));
  assert.equal(promotion.promoted, true);
  const finalizeArgs = { p_submission_id: reservation.submission_id, p_idempotency_key: `device-qa-finalize:${correlationId}`, p_correlation_id: correlationId };
  const finalized = await checked('attach existing QA rating and enter moderation', client.rpc('finalize_wing_submission_upload', finalizeArgs));
  assert.equal(finalized.status, 'in_review');
  fixtureFinalized = true;
  await checked('idempotent finalization retry', client.rpc('finalize_wing_submission_upload', finalizeArgs));
  const before = await loadWingdexRestaurantGallery(rating.destination_id, publicClient);
  publicCountBefore = before.count;
  assert.equal(before.images.some((row) => row.submission_id === reservation.submission_id), false);
  checks.push('pending photo hidden in public gallery');
  const reviewed = await checked('supported Mango approve RPC for QA fixture only', admin.rpc('mango_review_wing_submission', {
    p_submission_id: reservation.submission_id, p_action: 'approve', p_reason_category: 'standard_acceptable',
    p_reviewer_note: 'Disposable production QA fixture; remove immediately after gallery verification', p_reviewer_id: mango.MANGO_REVIEWER_ID,
    p_idempotency_key: `device-qa-review:${correlationId}`, p_correlation_id: correlationId,
  }));
  assert.equal(reviewed.status, 'approved');
  const after = await loadWingdexRestaurantGallery(rating.destination_id, client);
  assert.equal(after.count, before.count + 1);
  checks.push('approved Wingdex count increments exactly once');
  const publicGallery = await loadWingdexRestaurantGallery(rating.destination_id, publicClient);
  const image = publicGallery.images.find((row) => row.submission_id === reservation.submission_id);
  assert.ok(image);
  const response = await fetch(image.signed_url);
  assert.equal(response.status, 200);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), Buffer.from(bytes));
  checks.push('independent anonymous public gallery loads exact approved image');
  const current = await checked('existing rating stays unchanged', client.from('destination_ratings').select('id,destination_id,crispiness,sauce,meat,overall,weight_score').eq('id', rating.id).single());
  assert.deepEqual(current, rating);
} finally {
  // Every cleanup predicate uses identifiers created by this invocation only.
  if (stage?.objectPath) await checked('fixture staging object cleanup', admin.storage.from(stage.bucket).remove([stage.objectPath]));
  if (reservation?.submission_id) {
    const id = reservation.submission_id;
    if (reservation.upload_path) await checked('fixture promoted object cleanup', admin.storage.from('wing-submissions').remove([reservation.upload_path]));
    const existing = await checked('fixture cleanup state lookup', admin.from('wing_media_submissions').select('status').eq('id', id).maybeSingle());
    fixtureFinalized = Boolean(existing);
    if (existing && existing.status !== 'withdrawn') {
      await checked('supported owner withdrawal reverses QA approval XP', client.rpc('withdraw_wing_submission', {
        p_submission_id: id, p_expected_status: existing.status,
        p_idempotency_key: `device-qa-withdraw:${correlationId}`, p_correlation_id: correlationId,
      }));
    }
    if (!existing) await checked('unfinalized fixture reservation cleanup', admin.from('wing_submission_upload_intents').delete().eq('submission_id', id));
    if (fixtureFinalized) {
      const rewards = await checked('fixture reward reversal verification', admin.from('wing_creator_reward_events').select('amount').eq('submission_id', id));
      assert.equal(rewards.reduce((sum, row) => sum + row.amount, 0), 0);
      const cleaned = await loadWingdexRestaurantGallery(rating.destination_id, publicClient);
      if (publicCountBefore !== null) assert.equal(cleaned.count, publicCountBefore);
      assert.equal(cleaned.images.some((row) => row.submission_id === id), false);
      checks.push('fixture no longer public; required append-only audit retained');
    }
  }
  if (!fixtureFinalized) {
    await checked('fixture validation receipt cleanup', admin.from('wing_media_validation_receipts').delete().eq('correlation_id', correlationId));
    await checked('fixture mutation receipt cleanup', admin.from('wing_submission_mutation_receipts').delete().eq('correlation_id', correlationId));
    if (fixtureRatingCreated) await checked('disposable QA rating fixture cleanup', admin.from('destination_ratings').delete().eq('id', fixtureRatingId));
    if (fixtureCrawlCreated) await checked('disposable QA crawl fixture cleanup', admin.from('crawls').delete().eq('crawl_id', fixtureCrawlId));
  }
  if (authenticated) await client.auth.signOut({ scope: 'local' });
  console.log(JSON.stringify({ checks }, null, 2));
}
