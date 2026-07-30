// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';
const BUCKET = 'wing-shot-staging';
const headers = { 'content-type': 'application/json', 'cache-control': 'no-store' };
const json = (status, body) => new Response(JSON.stringify(body), { status, headers });
Deno.serve(async (request) => {
  if (request.method !== 'POST') return json(405, { reason_code: 'unsupported_request' });
  const auth = request.headers.get('authorization') || '';
  const userClient = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_ANON_KEY'), { global: { headers: { authorization: auth } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json(401, { reason_code: 'authentication_required' });
  try {
    const { bucket, objectPath, correlationId } = await request.json();
    if (bucket !== BUCKET || !/^[0-9a-f-]{36}$/i.test(String(correlationId)) || typeof objectPath !== 'string' || objectPath !== `${user.id}/${correlationId}/${objectPath.split('/').pop()}` || !/^[a-zA-Z0-9._-]{1,96}$/.test(objectPath.split('/').pop() || '')) return json(403, { reason_code: 'staging_object_forbidden' });
    const admin = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
    const { error } = await admin.storage.from(BUCKET).remove([objectPath]);
    if (error) return json(503, { reason_code: 'validator_unavailable', retryable: true });
    return json(200, { deleted: true });
  } catch (_) { return json(400, { reason_code: 'staging_cleanup_failed' }); }
});
