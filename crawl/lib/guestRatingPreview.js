export const GUEST_RATING_PREVIEW_KEY = 'buffago:guest_rating_preview:v1';
export const GUEST_RATING_PREVIEW_SCHEMA_VERSION = 1;

export function createGuestRatingPreview(payload, previewId, createdAt = new Date().toISOString()) {
  if (!previewId) throw new Error('preview_id_required');
  return {
    schema_version: GUEST_RATING_PREVIEW_SCHEMA_VERSION,
    preview_id: previewId,
    status: 'local_preview',
    created_at: createdAt,
    payload,
  };
}

export async function saveGuestRatingPreview(storage, preview) {
  await storage.setItem(GUEST_RATING_PREVIEW_KEY, JSON.stringify(preview));
  return preview;
}

export async function loadGuestRatingPreview(storage) {
  const raw = await storage.getItem(GUEST_RATING_PREVIEW_KEY);
  if (!raw) return null;
  const parsed = JSON.parse(raw);
  if (
    parsed?.schema_version !== GUEST_RATING_PREVIEW_SCHEMA_VERSION ||
    !parsed?.preview_id ||
    parsed?.status !== 'local_preview'
  ) throw new Error('guest_preview_schema_invalid');
  return parsed;
}

export async function deleteGuestRatingPreview(storage) {
  await storage.removeItem(GUEST_RATING_PREVIEW_KEY);
}
