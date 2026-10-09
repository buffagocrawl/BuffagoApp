/* Public Wingdex gallery boundary. No storage paths or moderation metadata leave this function. */
// Remote imports resolve in Deno; the app's TypeScript resolver cannot fetch them.
// @ts-ignore
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0'; // eslint-disable-line import/no-unresolved

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Promise<Response>): unknown;
};
type Photo = {
  id: string; destination_id: string; media_type: 'photo'; status: 'approved';
  thumbnail_storage_path: string | null; processed_storage_path: string | null;
  like_count: number; dislike_count: number; created_at: string;
  consent_version: string | null; consented_at: string | null; attribution_preference: string;
};
const processedPath = (photo: Photo) => `processed/${photo.id}/primary`;
const thumbnailPath = (photo: Photo) => `thumbnails/${photo.id}/preview`;
const hasCanonicalProcessed = (photo: Photo) => photo.processed_storage_path === processedPath(photo);
const hasCanonicalThumbnail = (photo: Photo) => photo.thumbnail_storage_path === thumbnailPath(photo);

const HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'private, max-age=30',
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
};
const MAX_DESTINATIONS = 250;
const MAX_IMAGES = 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function respond(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: HEADERS });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: HEADERS });
  if (request.method !== 'POST') return respond(405, { ok: false, error: 'method_not_allowed' });

  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return respond(503, { ok: false, error: 'gallery_unavailable' });

  let body: Record<string, unknown> | null;
  try { body = await request.json(); } catch { return respond(400, { ok: false, error: 'invalid_request' }); }
  const ids = Array.from(new Set<string>((Array.isArray(body?.destination_ids) ? body.destination_ids : []).filter((id: unknown): id is string => typeof id === 'string' && UUID.test(id)))).slice(0, MAX_DESTINATIONS);
  if (!ids.length) return respond(200, { ok: true, restaurants: [] });
  const includeImages = body?.include_images === true;
  const includeCovers = body?.include_covers === true;
  const fullSubmission = typeof body?.submission_id === 'string' && UUID.test(body.submission_id) ? body.submission_id : null;
  const offset = Math.max(0, Math.min(100000, Math.floor(Number(body?.offset) || 0)));

  const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  try {
  // Page metadata in batches, never one query per restaurant. No original asset fallback.
  // The legacy RPC permits publishing statuses and omits votes, so this boundary
  // now uses the deployed submissions columns without modifying the database.
  const candidates: Photo[] = [];
  for (let start = 0; ; start += 1000) {
    let query = admin.from('wing_media_submissions')
      .select('id,destination_id,media_type,status,thumbnail_storage_path,processed_storage_path,like_count,dislike_count,created_at,consent_version,consented_at,attribution_preference')
      .in('destination_id', ids).eq('media_type', 'photo').eq('status', 'approved')
      .is('owner_deleted_at', null).is('withdrawn_at', null)
      .not('user_id', 'is', null).not('consent_version', 'is', null).not('consented_at', 'is', null)
      .order('like_count', { ascending: false }).order('dislike_count', { ascending: true })
      .order('created_at', { ascending: true }).order('id', { ascending: true });
    if (fullSubmission) query = query.eq('id', fullSubmission);
    const { data, error } = await query.range(start, start + 999);
    if (error) return respond(503, { ok: false, error: 'gallery_unavailable' });
    candidates.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  const grouped = new Map<string, Photo[]>(ids.map((id) => [id, []]));
  for (const photo of candidates) grouped.get(photo.destination_id)?.push(photo);
  const hasConsent = (photo: Photo) => Boolean(photo.consent_version?.trim() && photo.consented_at
    && Date.parse(photo.consented_at) <= Date.now() && ['username', 'display_name', 'anonymous'].includes(photo.attribution_preference));
  // Validate assets before counting, ranking covers, or applying pagination.
  // Keep processed-media eligibility: original-only approvals are counted separately.
  const paths = Array.from(new Set(candidates.filter((photo) => hasCanonicalProcessed(photo) && hasConsent(photo))
    .map((photo) => photo.processed_storage_path)
    .filter((path): path is string => typeof path === 'string' && Boolean(path))));
  const signedByPath = new Map<string, string>();
  const expiresAt = new Date(Date.now() + 300000).toISOString();
  // Batch signing also prevents a per-restaurant storage request on the list.
  for (let start = 0; start < paths.length; start += 100) {
    const { data, error } = await admin.storage.from('wing-submissions').createSignedUrls(paths.slice(start, start + 100), 300);
    if (error) return respond(503, { ok: false, error: 'gallery_unavailable' });
    for (const item of data || []) if (!item.error && typeof item.path === 'string' && typeof item.signedUrl === 'string' && item.signedUrl) signedByPath.set(item.path, item.signedUrl);
  }
  // Only the visible page needs thumbnail URLs. The processed sign above
  // establishes exact displayable counts and is also the safe fallback.
  const visibleByDestination = new Map<string, Photo[]>();
  for (const [destinationId, photos] of grouped) {
    const usable = photos.filter((photo) => hasCanonicalProcessed(photo) && hasConsent(photo)
      && signedByPath.has(photo.processed_storage_path!));
    visibleByDestination.set(destinationId, fullSubmission ? usable : includeImages
      ? usable.slice(offset, offset + MAX_IMAGES) : includeCovers ? usable.slice(0, 1) : []);
  }
  const thumbnailPaths = Array.from(new Set(Array.from(visibleByDestination.values()).flat()
    .filter(hasCanonicalThumbnail).map((photo) => photo.thumbnail_storage_path)
    .filter((path): path is string => typeof path === 'string' && Boolean(path))));
  if (!fullSubmission) for (let start = 0; start < thumbnailPaths.length; start += 100) {
    const { data, error } = await admin.storage.from('wing-submissions').createSignedUrls(thumbnailPaths.slice(start, start + 100), 300);
    if (error) return respond(503, { ok: false, error: 'gallery_unavailable' });
    for (const item of data || []) if (!item.error && typeof item.path === 'string' && typeof item.signedUrl === 'string' && item.signedUrl) signedByPath.set(item.path, item.signedUrl);
  }
  const restaurants = [];
  for (const [destinationId, photos] of grouped) {
    const images = [];
    const usable = photos.filter((photo) => hasCanonicalProcessed(photo) && hasConsent(photo)
      && signedByPath.has(photo.processed_storage_path!));
    const visibleCandidates = visibleByDestination.get(destinationId) || [];
    // Signed URLs check object existence and preserve the private bucket boundary.
    for (const submission of visibleCandidates) {
      const signedUrl = fullSubmission ? signedByPath.get(submission.processed_storage_path!)
        : (hasCanonicalThumbnail(submission) ? signedByPath.get(submission.thumbnail_storage_path!) : undefined)
          || signedByPath.get(submission.processed_storage_path!);
      if (!signedUrl) continue;
      images.push({ submission_id: submission.id, destination_id: destinationId,
        media_type: 'photo', status: 'approved', signed_url: signedUrl,
        expires_at: expiresAt,
        like_count: submission.like_count, dislike_count: submission.dislike_count, created_at: submission.created_at });
    }
    restaurants.push({
      destination_id: destinationId,
      picture_count: usable.length,
      approved_submission_count: photos.filter(hasConsent).length,
      images,
    });
  }
  return respond(200, { ok: true, restaurants });
  } catch {
    return respond(503, { ok: false, error: 'gallery_unavailable' });
  }
});
