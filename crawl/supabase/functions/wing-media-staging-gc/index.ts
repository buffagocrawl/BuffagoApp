// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';
const BUCKET = 'wing-shot-staging';
const headers = { 'content-type': 'application/json', 'cache-control': 'no-store' };
Deno.serve(async (request) => {
  const expected = Deno.env.get('WING_STAGING_GC_SECRET');
  if (!expected || request.headers.get('x-wing-staging-gc-secret') !== expected) return new Response(JSON.stringify({ reason_code: 'authentication_required' }), { status: 401, headers });
  const admin = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  let deleted = 0;
  const roots = await admin.storage.from(BUCKET).list('', { limit: 1000 });
  for (const userRoot of roots.data || []) {
    const correlations = await admin.storage.from(BUCKET).list(userRoot.name, { limit: 1000 });
    for (const correlation of correlations.data || []) {
      const files = await admin.storage.from(BUCKET).list(`${userRoot.name}/${correlation.name}`, { limit: 1000 });
      const old = (files.data || []).filter((file) => Date.parse(file.created_at || file.updated_at || '') < cutoff).map((file) => `${userRoot.name}/${correlation.name}/${file.name}`);
      if (old.length) { await admin.storage.from(BUCKET).remove(old); deleted += old.length; }
    }
  }
  return new Response(JSON.stringify({ deleted }), { status: 200, headers });
});
