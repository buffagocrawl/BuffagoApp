// @ts-nocheck
// Trusted, bounded blind-photo feed. Restaurant identity is intentionally not returned.
// @ts-ignore
import { createBoundary, HEADERS, isValidCoordinate, respond, hasPublicPhotoMetadata, isPublicPhoto, encodeJuryCursor, decodeJuryCursor, readJuryBody, UUID, safeJurySignedUrl } from '../_shared/wingJury.ts';

const MAX_GUEST_EXCLUSIONS = 500;
const CANDIDATE_PAGE = 120;
const MAX_CANDIDATE_PAGES = 10;
const SIGNING_BATCH = 12;
const MAX_PAGE = 24;

function position(photo: any, session: any = null) {
  if (session) return { ...session, page_number: photo.page_number };
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
    const randomized = body.feed_mode === 'randomized_v2';
    if (body.feed_mode != null && !randomized) return respond(400, { ok: false, error: 'invalid_feed_mode' });
    if (cursor && (cursor.version === 2) !== randomized) return respond(400, { ok: false, error: 'invalid_cursor' });
    if (randomized && !cursor && body.feed_session_id != null && !UUID.test(body.feed_session_id))
      return respond(400, { ok: false, error: 'invalid_feed_session' });
    // The server owns snapshot time; phone clock skew cannot block a session.
    const session = randomized ? { version: 2, session_id: cursor?.session_id || body.feed_session_id || crypto.randomUUID(), snapshot_at: cursor?.snapshot_at || new Date().toISOString() } : null;
    if (session && !cursor) {
      const stored = await admin.rpc('wing_jury_randomized_session_snapshot', {
        p_session_id: session.session_id, p_user_id: user?.id && !user.is_anonymous ? user.id : null,
        p_latitude: latitude, p_longitude: longitude,
      });
      if (stored.error) return respond(String(stored.error.message || '').includes('expired_feed_session') ? 409 : 503,
        { ok: false, error: String(stored.error.message || '').includes('expired_feed_session') ? 'feed_session_expired' : 'feed_unavailable' });
      if (stored.data != null) {
        if (typeof stored.data !== 'string' || !Number.isFinite(Date.parse(stored.data))) return respond(503, {ok:false,error:'feed_unavailable'});
        session.snapshot_at = stored.data;
      }
    }
    const photos = [];
    let exhausted = false;
    let done = false;
    // RPC ordering covers the complete eligible catalog. Edge transfer/signing
    // is bounded per request; reaching the work cap yields a continuation,
    // including on an empty visible page, rather than false exhaustion.
    for (let candidatePage = 0; candidatePage < MAX_CANDIDATE_PAGES && !done; candidatePage += 1) {
      const candidateLimit = randomized ? limit - photos.length : CANDIDATE_PAGE;
      const result = await admin.rpc(randomized ? 'wing_jury_randomized_feed_candidates' : 'wing_jury_feed_candidates', {
        p_latitude: latitude, p_longitude: longitude,
        p_user_id: user?.id && !user.is_anonymous ? user.id : null,
        p_judged_submission_ids: user?.id && !user.is_anonymous ? [] : judgedIds,
        ...(randomized ? {
          p_session_id: session.session_id, p_snapshot_at: session.snapshot_at,
          p_after_page: cursor?.page_number ?? 0,
        } : {
        p_after_distance: cursor?.distance ?? null,
        p_after_destination_id: cursor?.destination_id ?? null,
        p_after_created_at: cursor?.created_at ?? null,
        p_after_submission_id: cursor?.submission_id ?? null,
        }),
        p_limit: candidateLimit,
      });
      if (result.error) {
        if (randomized && String(result.error.message || '').includes('expired_feed_session'))
          return respond(409, { ok: false, error: 'feed_session_expired' });
        return respond(503, { ok: false, error: 'feed_unavailable' });
      }
      if (randomized && result.data?.error === 'feed_rate_limited')
        return new Response(JSON.stringify({ ok: false, error: 'feed_rate_limited', retryable: true, retry_after_seconds: 60 }),
          { status: 429, headers: { ...HEADERS, 'Retry-After': '60', 'access-control-expose-headers': 'Retry-After' } });
      if (randomized && result.data?.error === 'feed_capacity_exceeded')
        return respond(503, { ok: false, error: 'feed_capacity_exceeded' });
      if (randomized) {
        if (typeof result.data?.snapshot_at !== 'string' || !Number.isFinite(Date.parse(result.data.snapshot_at)))
          return respond(503, { ok: false, error: 'feed_unavailable' });
        session.snapshot_at = result.data.snapshot_at;
      }
      const candidates = randomized ? result.data?.candidates : result.data;
      if (!Array.isArray(candidates) || candidates.length > candidateLimit
        || (randomized && (!Number.isInteger(result.data?.page_number) || typeof result.data?.has_more !== 'boolean')))
        return respond(503, { ok: false, error: 'feed_unavailable' });
      if (!candidates.length) {
        if (randomized) cursor = position({ page_number: result.data.page_number }, session);
        if (randomized && result.data.has_more) continue;
        exhausted = true; break;
      }
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
          // A transient or incomplete signing response must replay the same
          // persisted page, never silently consume a still-eligible photo.
          if (randomized && live.some((photo) => !urls.has(photo.processed_storage_path))) return respond(503, { ok: false, error: 'feed_unavailable' });
          stillPublic = await Promise.all(live.map((photo) => isPublicPhoto(admin, photo.id)));
        }
        const released = new Set(live.filter((photo, index) => stillPublic[index] && urls.has(photo.processed_storage_path)).map((photo) => photo.id));
        for (let index = 0; index < batch.length; index += 1) {
          const photo = batch[index];
          // Advance only consumed rows. Signed-but-unconsumed rows must remain
          // reachable when the visible page fills in the middle of a batch.
          cursor = position(photo, session);
          if (released.has(photo.id)) {
            const signed_url = urls.get(photo.processed_storage_path);
            photos.push({ submission_id: photo.id, signed_url, media_type: 'photo', expires_at });
          }
          if (photos.length === limit) {
            exhausted = randomized ? !result.data.has_more : offset + index + 1 === candidates.length && candidates.length < candidateLimit;
            done = true;
            break;
          }
        }
      }
      if (randomized && !result.data.has_more) { exhausted = true; break; }
      if (!randomized && !done && candidates.length < candidateLimit) { exhausted = true; break; }
    }
    const hasMore = !exhausted;
    return respond(200, { ok: true, feed_version: randomized ? 2 : 1, photos, has_more: hasMore, location_fallback: !hasLocation,
      next_cursor: hasMore && cursor ? await encodeJuryCursor(cursor, user, latitude, longitude) : null });
  } catch { return respond(503, { ok: false, error: 'feed_unavailable' }); }
});
