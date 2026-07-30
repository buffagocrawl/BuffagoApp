// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';
import { response } from '../_shared/wingShotResponse.ts';
const BUCKET = 'wing-shot-staging';
Deno.serve(async (request) => {
  const expected = Deno.env.get('WING_STAGING_GC_SECRET');
  if (!expected || request.headers.get('x-wing-staging-gc-secret') !== expected) return response(401, { ok: false, code: 'authentication_required', message: 'Cleanup authentication failed.', stage: 'staging_gc', retryable: false, correlationId: 'system' });
  const admin = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
  // Never delete staged media while its reservation is still active. If the
  // guard query fails, fail closed and leave objects for a later run.
  const { data: activeIntents, error: intentError } = await admin
    .from('wing_submission_upload_intents')
    .select('correlation_id,status,expires_at')
    .eq('status', 'reserved')
    .gt('expires_at', new Date().toISOString());
  if (intentError) return response(503, { ok: false, code: 'server_temporarily_unavailable', message: 'Staging cleanup is temporarily unavailable.', stage: 'staging_gc', retryable: true, correlationId: 'system' });
  const protectedCorrelations = new Set((activeIntents || []).map((intent) => String(intent.correlation_id || '')));
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  let deleted = 0;
  const roots = await admin.storage.from(BUCKET).list('', { limit: 1000 });
  for (const userRoot of roots.data || []) {
    const correlations = await admin.storage.from(BUCKET).list(userRoot.name, { limit: 1000 });
    for (const correlation of correlations.data || []) {
      const files = await admin.storage.from(BUCKET).list(`${userRoot.name}/${correlation.name}`, { limit: 1000 });
      const old = (files.data || []).filter((file) => !protectedCorrelations.has(correlation.name) && Date.parse(file.created_at || file.updated_at || '') < cutoff).map((file) => `${userRoot.name}/${correlation.name}/${file.name}`);
      if (old.length) { await admin.storage.from(BUCKET).remove(old); deleted += old.length; }
    }
  }
  return response(200, { ok: true, deleted, stage: 'staging_gc', correlationId: 'system' });
});
