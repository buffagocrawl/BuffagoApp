// @ts-nocheck
// Trusted, bounded blind-photo feed. Restaurant identity is intentionally not returned.
// @ts-ignore
import { createBoundary, HEADERS, isValidCoordinate, respond, hasPublicPhotoMetadata, isPublicPhoto, encodeJuryCursor, decodeJuryCursor, readJuryBody, UUID, safeJurySignedUrl } from '../_shared/wingJury.ts';

const MAX_GUEST_EXCLUSIONS = 500;
const CANDIDATE_PAGE = 120;
const MAX_CANDIDATE_PAGES = 10;
const SIGNING_BATCH = 12;
const MAX_PAGE = 24;

function position(photo: any) {
  return { distance: photo.distance, destination_id: photo.destination_id, created_at: photo.created_at, submission_id: photo.id };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: HEADERS });
  if (request.method !== 'POST') return respond(405, { ok: false, error: 'method_not_allowed' });
  try {
    const body = await readJuryBody(request);
    if (!body) return respond(400, { ok: false, error: 'invalid_request' });
    const limit = body.limit == null ? 12 : body.limit;
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE) return respond(400, { ok: false, error: 'invalid_limit' });
    const judgedIds = body.judged_submission_ids ?? [];
    if (!Array.isArray(judgedIds) || judgedIds.length > MAX_GUEST_EXCLUSIONS || judgedIds.some((id) => typeof id !== 'string' || !UUID.test(id)))
      return respond(400, { ok: false, error: 'invalid_judged_ids' });
    const hasLocation = isValidCoordinate(body.latitude, body.longitude);
    if (!hasLocation && (body.latitude != null || body.longitude != null)) return respond(400, { ok: false, error: 'invalid_location' });
    const latitude = hasLocation ? body.latitude : null; const longitude = hasLocation ? body.longitude : null;
    const { admin, user } = await createBoundary(request);
    let cursor;
    try { cursor = await decodeJuryCursor(body.cursor, user, latitude, longitude); }
    catch { return respond(400, { ok: false, error: 'invalid_cursor' }); }
    const photos = [];
    let exhausted = false;
    let done = false;
    // RPC ordering covers the complete eligible catalog. Edge transfer/signing
    // is bounded per request; reaching the work cap yields a continuation,
    // including on an empty visible page, rather than false exhaustion.
    for (let candidatePage = 0; candidatePage < MAX_CANDIDATE_PAGES && !done; candidatePage += 1) {
      const result = await admin.rpc('wing_jury_feed_candidates', {
        p_latitude: latitude, p_longitude: longitude,
        p_user_id: user?.id && !user.is_anonymous ? user.id : null,
        p_judged_submission_ids: user?.id && !user.is_anonymous ? [] : judgedIds,
        p_after_distance: cursor?.distance ?? null,
        p_after_destination_id: cursor?.destination_id ?? null,
        p_after_created_at: cursor?.created_at ?? null,
        p_after_submission_id: cursor?.submission_id ?? null,
        p_limit: CANDIDATE_PAGE,
      });
      if (result.error || !Array.isArray(result.data) || result.data.length > CANDIDATE_PAGE)
        return respond(503, { ok: false, error: 'feed_unavailable' });
      const candidates = result.data;
      if (!candidates.length) { exhausted = true; break; }
      for (let offset = 0; offset < candidates.length && !done; offset += SIGNING_BATCH) {
        const batch = candidates.slice(offset, offset + SIGNING_BATCH);
        const eligibility = await Promise.all(batch.map(async (photo) => hasPublicPhotoMetadata(photo) && await isPublicPhoto(admin, photo.id)));
        const live = batch.filter((_photo, index) => eligibility[index]);
        let urls = new Map();
        let stillPublic = [];
        const expires_at = new Date(Date.now() + 300000).toISOString();
        if (live.length) {
          const signed = await admin.storage.from('wing-submissions').createSignedUrls(live.map((photo) => photo.processed_storage_path), 300);
          if (signed.error) return respond(503, { ok: false, error: 'feed_unavailable' });
          urls = new Map((signed.data || []).map((row) => [row.path, safeJurySignedUrl(row.signedUrl, row.path)]).filter(([, url]) => url));
          stillPublic = await Promise.all(live.map((photo) => isPublicPhoto(admin, photo.id)));
        }
        const released = new Set(live.filter((photo, index) => stillPublic[index] && urls.has(photo.processed_storage_path)).map((photo) => photo.id));
        for (let index = 0; index < batch.length; index += 1) {
          const photo = batch[index];
          // Advance only consumed rows. Signed-but-unconsumed rows must remain
          // reachable when the visible page fills in the middle of a batch.
          cursor = position(photo);
          if (released.has(photo.id)) {
            const signed_url = urls.get(photo.processed_storage_path);
            photos.push({ submission_id: photo.id, signed_url, media_type: 'photo', expires_at });
          }
          if (photos.length === limit) {
            exhausted = offset + index + 1 === candidates.length && candidates.length < CANDIDATE_PAGE;
            done = true;
            break;
          }
        }
      }
      if (!done && candidates.length < CANDIDATE_PAGE) { exhausted = true; break; }
    }
    const hasMore = !exhausted;
    return respond(200, { ok: true, photos, has_more: hasMore, location_fallback: !hasLocation,
      next_cursor: hasMore && cursor ? await encodeJuryCursor(cursor, user, latitude, longitude) : null });
  } catch { return respond(503, { ok: false, error: 'feed_unavailable' }); }
});
