import { expect, it } from 'vitest';
import { selectWingPreviewPath } from '../server/mediaPreview.mjs';

it('falls back to the original when generated variants are missing', () => {
  expect(selectWingPreviewPath({ processed_storage_path: 'missing-processed', processed_object_exists: false,
    thumbnail_storage_path: 'missing-thumbnail', thumbnail_object_exists: false,
    original_storage_path: 'original-photo', original_object_exists: true })).toBe('original-photo');
});
it('chooses an available generated variant and handles an entirely missing object', () => {
  expect(selectWingPreviewPath({ processed_storage_path: 'processed', processed_object_exists: true })).toBe('processed');
  expect(selectWingPreviewPath({ original_storage_path: 'missing', original_object_exists: false })).toBe(null);
});
it('retains compatibility with older RPC responses without readiness fields', () => {
  expect(selectWingPreviewPath({ original_storage_path: 'legacy' })).toBe('legacy');
});
