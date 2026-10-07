// @ts-nocheck
// Deno runtime tests, not Expo types (matching image-validation.test.ts).
// Exercise the real Edge handler code with mocked SDK boundaries in Deno.
import { edgeRuntime } from '../../../tests/helpers/edge-runtime.mjs';
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

const owner = '10000000-0000-4000-a000-000000000001';
const destinationId = '30000000-0000-4000-a000-000000000003';
const correlationId = '20000000-0000-4000-a000-000000000002';
const body = { correlationId, destinationId, mediaType: 'photo', mimeType: 'image/jpeg', fileSizeBytes: 100, fileName: 'photo.jpg' };
const client = (prompt: boolean, photo: boolean) => ({
  auth: { getUser: async () => ({ data: { user: { id: owner } } }) },
  rpc: async () => ({ data: [{ flag_key: 'wing_shot_prompt', enabled_for_user: prompt }, { flag_key: 'wing_shot_photo_upload', enabled_for_user: photo }] }),
  storage: { from: () => ({ createSignedUploadUrl: async () => ({ data: { signedUrl: 'https://upload.test' } }) }) },
});
Deno.test('global photo rollout permits normal authenticated staging', async () => {
  const result = await edgeRuntime('wing-media-stage-authorize', client(true, true))(body);
  assertEquals(result.status, 200); assertEquals(result.body.ok, true);
});
for (const [prompt, photo] of [[false, true], [true, false], [false, false]]) {
  Deno.test(`staging denies rollback prompt=${prompt} photo=${photo}`, async () => {
    const result = await edgeRuntime('wing-media-stage-authorize', client(prompt, photo))(body);
    assertEquals(result.status, 403); assertEquals(result.body.code, 'wing_shot_photo_upload_disabled');
  });
}
Deno.test('new video staging remains denied with global photo rollout', async () => {
  const result = await edgeRuntime('wing-media-stage-authorize', client(true, true))({ ...body, mediaType: 'video', mimeType: 'video/mp4' });
  assertEquals(result.status, 400);
});
Deno.test('public gallery returns approved signed images without private storage paths', async () => {
  const invoke = edgeRuntime('wing-public-gallery', {
    rpc: async () => ({ data: [{ destination_id: destinationId, picture_count: 1, images: [{ submission_id: correlationId, storage_path: 'private/path' }] }] }),
    storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: 'https://image.test' } }) }) },
  });
  const result = await invoke({ destination_ids: [destinationId], include_images: true }, { headers: { 'content-type': 'application/json' } });
  assertEquals(result.status, 200); assertEquals(result.body.restaurants[0].picture_count, 1);
  assertEquals(result.body.restaurants[0].images[0].signed_url, 'https://image.test');
  assertEquals('storage_path' in result.body.restaurants[0].images[0], false);
});
Deno.test('public gallery Storage failure skips image without crashing', async () => {
  const result = await edgeRuntime('wing-public-gallery', {
    rpc: async () => ({ data: [{ destination_id: destinationId, picture_count: 1, images: [{ submission_id: correlationId, storage_path: 'private/path' }] }] }),
    storage: { from: () => ({ createSignedUrl: async () => ({ error: Error('missing') }) }) },
  })({ destination_ids: [destinationId], include_images: true });
  assertEquals(result.status, 200); assertEquals(result.body.restaurants[0].images, []);
});
