/* Public Wingdex gallery boundary. No storage paths or moderation metadata leave this function. */
// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'private, max-age=30',
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
};
const MAX_DESTINATIONS = 250;
const MAX_IMAGES = 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function respond(status, body) {
  return new Response(JSON.stringify(body), { status, headers: HEADERS });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: HEADERS });
  if (request.method !== 'POST') return respond(405, { ok: false, error: 'method_not_allowed' });

  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return respond(503, { ok: false, error: 'gallery_unavailable' });

  let body;
  try { body = await request.json(); } catch { return respond(400, { ok: false, error: 'invalid_request' }); }
  const ids = Array.from(new Set((Array.isArray(body?.destination_ids) ? body.destination_ids : []).filter((id) => typeof id === 'string' && UUID.test(id)))).slice(0, MAX_DESTINATIONS);
  if (!ids.length) return respond(200, { ok: true, restaurants: [] });
  const includeImages = body?.include_images === true;

  const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: submissions, error } = await admin
    .from('wing_media_submissions')
    .select('id, destination_id, thumbnail_storage_path, processed_storage_path, created_at')
    .in('destination_id', ids)
    .eq('media_type', 'photo')
    .eq('status', 'approved')
    .not('thumbnail_storage_path', 'is', null)
    .not('processed_storage_path', 'is', null)
    .order('created_at', { ascending: false });
  if (error) return respond(503, { ok: false, error: 'gallery_unavailable' });

  const grouped = new Map(ids.map((id) => [id, []]));
  for (const submission of submissions || []) {
    const bucket = grouped.get(submission.destination_id);
    if (bucket) bucket.push(submission);
  }

  const restaurants = [];
  for (const id of ids) {
    const candidates = grouped.get(id) || [];
    const images = [];
    const visibleCandidates = includeImages ? candidates.slice(0, MAX_IMAGES) : candidates;
    // Counts are based on successfully signed protected thumbnails, so stale
    // rows or missing objects cannot appear as public pictures.
    for (const submission of visibleCandidates) {
      const { data: signed, error: signedError } = await admin.storage
        .from('wing-submissions')
        .createSignedUrl(submission.thumbnail_storage_path, 60);
      if (signedError || !signed?.signedUrl) continue;
      images.push({ submission_id: submission.id, signed_url: signed.signedUrl });
    }
    restaurants.push({
      destination_id: id,
      picture_count: images.length,
      ...(includeImages ? { images } : {}),
    });
  }
  return respond(200, { ok: true, restaurants });
});
