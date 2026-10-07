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
      images,
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
      body: { destination_ids: ids.slice(start, start + 250), include_images: false },
    });
    if (error || data?.ok === false) throw error || new Error('Pictures are temporarily unavailable.');
    Object.assign(result, normalizeWingdexGalleryResponse(data));
  }
  return result;
}

export async function loadWingdexRestaurantGallery(destinationId, client, { offset = 0 } = {}) {
  if (!destinationId) return { count: 0, images: [] };
  const { data, error } = await client.functions.invoke('wing-public-gallery', {
    body: { destination_ids: [String(destinationId)], include_images: true, offset },
  });
  if (error || data?.ok === false) throw error || new Error('Pictures are temporarily unavailable.');
  return normalizeWingdexGalleryResponse(data)[String(destinationId)] || { count: 0, images: [] };
}
