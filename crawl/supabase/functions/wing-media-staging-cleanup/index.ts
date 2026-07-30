// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';
import { bearerToken, correlationId, failure, response } from '../_shared/wingShotResponse.ts';
const BUCKET = 'wing-shot-staging';
const stage = 'staging_cleanup';
Deno.serve(async (request) => {
  if (request.method !== 'POST') return failure(request, 'unsupported_request', 'Only POST is supported.', stage, 405);
  let input = {};
  try { input = await request.json(); } catch (_) { return failure(request, 'invalid_json', 'The cleanup request was not valid JSON.', stage, 400); }
  const token = bearerToken(request);
  const userClient = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_ANON_KEY'));
  const { data: { user } } = token ? await userClient.auth.getUser(token) : { data: { user: null } };
  if (!user) return failure(request, 'authentication_required', 'Please sign in again to manage this upload.', stage, 401, input);
  try {
    const { bucket, objectPath, correlationId: objectCorrelationId } = input;
    if (bucket !== BUCKET || !/^[0-9a-f-]{36}$/i.test(String(objectCorrelationId)) || typeof objectPath !== 'string' || objectPath !== `${user.id}/${objectCorrelationId}/${objectPath.split('/').pop()}` || !/^[a-zA-Z0-9._-]{1,96}$/.test(objectPath.split('/').pop() || '')) return failure(request, 'staging_object_forbidden', 'This staged object is not owned by the signed-in user.', stage, 403, input);
    const admin = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
    const { error } = await admin.storage.from(BUCKET).remove([objectPath]);
    if (error) return failure(request, 'server_temporarily_unavailable', 'Staged media cleanup is temporarily unavailable.', stage, 503, input, { retryable: true });
    return response(200, { ok: true, deleted: true, stage, correlationId: correlationId(request, input) });
  } catch (_) { return failure(request, 'unknown_upload_failure', 'Staged media cleanup could not be completed.', stage, 500, input); }
});
