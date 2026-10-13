import { subscribePhotoVotes } from './photoVoteEvents.js';

export function orderWingdexPhotos(photos) {
  return [...photos].sort((a, b) => (Number(b.like_count) || 0) - (Number(a.like_count) || 0)
    || (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0)
    || String(a.submission_id).localeCompare(String(b.submission_id)));
}

const galleryCaches = new WeakMap();
let cacheRevision = 0;
subscribePhotoVotes(() => { cacheRevision += 1; });

/**
 * Wingdex's public media boundary. The Edge Function owns the moderation and
 * storage checks; this helper only normalizes its safe response for the UI.
 */
export function normalizeWingdexGalleryResponse(payload) {
  const rows = Array.isArray(payload?.restaurants) ? payload.restaurants : [];
  return rows.reduce((result, row) => {
    if (!row?.destination_id) return result;
    const images = Array.isArray(row.images)
      ? row.images.filter((image) => typeof image?.signed_url === 'string')
      : [];
    result[String(row.destination_id)] = {
      count: Number.isFinite(Number(row.picture_count)) && row.picture_count != null
        ? Math.max(0, Number(row.picture_count)) : images.length,
      approvedSubmissionCount: Number.isFinite(Number(row.approved_submission_count)) && row.approved_submission_count != null
        ? Math.max(0, Number(row.approved_submission_count)) : null,
      images: orderWingdexPhotos(images),
    };
    return result;
  }, {});
}

export async function loadWingdexGallery(destinationIds, client) {
  const ids = Array.from(new Set((destinationIds || []).filter(Boolean).map(String)));
  if (!ids.length) return {};
  const result = {};
  // Match the server limit instead of silently losing counts beyond 250 places.
  for (let start = 0; start < ids.length; start += 250) {
    const { data, error } = await client.functions.invoke('wing-public-gallery', {
      body: { destination_ids: ids.slice(start, start + 250), include_images: false, include_covers: true },
    });
    if (error || data?.ok === false) throw error || new Error('Pictures are temporarily unavailable.');
    Object.assign(result, normalizeWingdexGalleryResponse(data));
  }
  return result;
}

/** Revalidate approval and sign only the selected processed asset. */
export async function loadWingdexFullPhoto(photo, client) {
  const { data, error } = await client.functions.invoke('wing-public-gallery', {
    body: { destination_ids: [photo.destination_id], submission_id: photo.submission_id },
  });
  if (error || data?.ok === false) throw new Error('Photo unavailable. Check your connection and retry.');
  const image = normalizeWingdexGalleryResponse(data)[photo.destination_id]?.images[0];
  // Older deployed handlers may ignore submission_id and return a different
  // photo from the same restaurant. Never substitute that image in the viewer.
  if (!image?.submission_id || image.submission_id !== photo.submission_id) {
    throw new Error('This photo is no longer available.');
  }
  return image;
}

export async function loadWingdexRestaurantGallery(destinationId, client, { offset = 0 } = {}) {
  if (!destinationId) return { count: 0, images: [] };
  if (!galleryCaches.has(client)) galleryCaches.set(client, new Map());
  const cache = galleryCaches.get(client);
  const key = `${destinationId}:${offset}`;
  const cached = cache.get(key);
  if (cached && cached.revision === cacheRevision && cached.expires > Date.now()) return cached.promise;
  const entry = { revision: cacheRevision, expires: Date.now() + 30000, promise: null };
  entry.promise = (async () => {
    const { data, error } = await client.functions.invoke('wing-public-gallery', {
      body: { destination_ids: [String(destinationId)], include_images: true, offset },
    });
    if (error || data?.ok === false) throw error || new Error('Pictures are temporarily unavailable.');
    return normalizeWingdexGalleryResponse(data)[String(destinationId)] || { count: 0, images: [] };
  })();
  cache.set(key, entry);
  try { return await entry.promise; }
  catch (error) { if (cache.get(key) === entry) cache.delete(key); throw error; }
}
