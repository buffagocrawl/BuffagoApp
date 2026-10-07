/* eslint-disable import/no-unresolved */
// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store, private, max-age=0',
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
};
const SIGNED_URL_SECONDS = 60;

function respond(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: JSON_HEADERS,
  });
}

function bearerToken(request: Request) {
  const authorization = request.headers.get('authorization') ?? '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: JSON_HEADERS });
  }
  if (request.method !== 'POST') {
    return respond(405, { ok: false, error: 'method_not_allowed' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const token = bearerToken(request);
  if (!supabaseUrl || !serviceRoleKey) {
    return respond(503, { ok: false, error: 'preview_service_unavailable' });
  }
  if (!token) {
    return respond(401, { ok: false, error: 'authentication_required' });
  }

  let payload: { request_id?: unknown };
  try {
    payload = await request.json();
  } catch {
    return respond(400, { ok: false, error: 'invalid_request' });
  }
  if (
    typeof payload.request_id !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(payload.request_id)
  ) {
    return respond(400, { ok: false, error: 'invalid_request' });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData?.user?.id) {
    return respond(401, { ok: false, error: 'authentication_required' });
  }

  // The historical claim RPC is intentionally admin-review-only. Owner
  // previews need a separate requester + submission-owner check before a
  // conditional, one-time claim; do not broaden the existing admin RPC.
  const { data: access } = await admin.from('wing_media_access_requests')
    .select('id,submission_id,requester_id,purpose,status,expires_at,requested_path')
    .eq('id', payload.request_id).eq('requester_id', authData.user.id).maybeSingle();
  let ownerClaim = null;
  if (access?.purpose === 'owner_preview' && access.status === 'pending' && Date.parse(access.expires_at) > Date.now()) {
    const { data: submission } = await admin.from('wing_media_submissions')
      .select('id,user_id,media_type,original_storage_path,processed_storage_path,thumbnail_storage_path')
      .eq('id', access.submission_id).eq('user_id', authData.user.id).maybeSingle();
    if (submission?.media_type === 'photo' && [submission.original_storage_path, submission.processed_storage_path, submission.thumbnail_storage_path].filter(Boolean).includes(access.requested_path)) {
      const { data: claimed } = await admin.from('wing_media_access_requests')
        .update({ status: 'consumed', consumed_at: new Date().toISOString() })
        .eq('id', access.id).eq('requester_id', authData.user.id).eq('status', 'pending')
        .gt('expires_at', new Date().toISOString()).select('id').maybeSingle();
      if (claimed) ownerClaim = { bucket_id: 'wing-submissions', object_path: access.requested_path };
    }
  }
  const { data: claims, error: claimError } = ownerClaim ? { data: [ownerClaim], error: null } : await admin.rpc(
    'claim_wing_media_access_request_for_user',
    {
      p_request_id: payload.request_id,
      p_requester_id: authData.user.id,
    },
  );
  const claim = Array.isArray(claims) ? claims[0] : null;
  if (claimError || !claim?.bucket_id || !claim?.object_path) {
    return respond(404, { ok: false, error: 'preview_unavailable' });
  }

  // Storage signed URLs are capabilities, so confirm the claimed canonical
  // object exists before minting one. Never echo the private path to callers.
  const { data: object, error: objectError } = await admin.storage
    .from(claim.bucket_id)
    .download(claim.object_path);
  if (objectError || !object) {
    return respond(404, { ok: false, error: 'preview_unavailable' });
  }

  const { data: signed, error: signedError } = await admin.storage
    .from(claim.bucket_id)
    .createSignedUrl(claim.object_path, SIGNED_URL_SECONDS);
  if (signedError || !signed?.signedUrl) {
    return respond(503, { ok: false, error: 'preview_temporarily_unavailable' });
  }

  return respond(200, {
    ok: true,
    signed_url: signed.signedUrl,
    expires_in_seconds: SIGNED_URL_SECONDS,
  });
});
