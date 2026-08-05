// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

const BUCKET = 'wing-shot-staging';
const MAX = { photo: 20 * 1024 * 1024 };
const MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic']);
const headers = { 'content-type': 'application/json', 'cache-control': 'no-store' };
const correlation = (request, body = {}) => String(request.headers.get('x-wing-correlation-id') || body.correlationId || 'unknown');
const json = (status, body) => new Response(JSON.stringify(body), { status, headers });
const fail = (request, code, message, status = 400, body = {}) => json(status, {
  ok: false, code, message, stage: 'staging_authorization', retryable: status >= 500, correlationId: correlation(request, body),
});
const cleanName = (name) => String(name || 'wing-shot').split(/[\\/]/).pop().replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 96) || 'wing-shot';
const bearerToken = (request) => {
  const value = request.headers.get('authorization') || '';
  return value.match(/^Bearer\s+(.+)$/i)?.[1] || null;
};
const projectRef = (url) => { try { return new URL(url).hostname.split('.')[0] || null; } catch (_) { return null; } };
const log = (event, fields = {}) => console.log(JSON.stringify({ event, ...fields }));

Deno.serve(async (request) => {
  const requestCorrelationId = correlation(request);
  if (request.method !== 'POST') return fail(request, 'unsupported_request', 'Only POST is supported.', 405);
  let body = {};
  try { body = await request.json(); } catch (_) { return fail(request, 'invalid_json', 'The authorization request was not valid JSON.', 400); }
  const correlationId = correlation(request, body);
  const token = bearerToken(request);
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !anonKey) return fail(request, 'authorization_unavailable', 'Authentication is temporarily unavailable.', 503, body);
  if (!token) {
    log('authorization_rejected', { correlation_id: correlationId, stage: 'staging_authorization', http_status: 401, reason_code: 'authentication_required', auth_boundary: 'function', auth_source: 'missing_bearer', project_ref: projectRef(supabaseUrl), request_dispatched: true });
    return fail(request, 'authentication_required', 'Please sign in again to upload your Wing Shot.', 401, body);
  }

  // verify_jwt is intentionally false for these mobile endpoints so the
  // function can return a controlled response. Auth still verifies the caller
  // token against this project; the token is passed explicitly to getUser.
  const authClient = createClient(supabaseUrl, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData?.user?.id) {
    log('authorization_rejected', { correlation_id: correlationId, stage: 'staging_authorization', http_status: 401, reason_code: 'authentication_required', auth_boundary: 'function', auth_source: 'getUser', project_ref: projectRef(supabaseUrl), request_dispatched: true, auth_error_code: authError?.code || null });
    return fail(request, 'authentication_required', 'Please sign in again to upload your Wing Shot.', 401, body);
  }
  const user = authData.user;
  log('authorization_authenticated', { correlation_id: correlationId, stage: 'staging_authorization', auth_boundary: 'function', auth_source: 'getUser', project_ref: projectRef(supabaseUrl), user_id: user.id, request_dispatched: true });

  try {
    const kind = body.mediaType;
    const mime = String(body.mimeType || '').toLowerCase();
    const size = Number(body.fileSizeBytes);
    if (kind !== 'photo' || !MIMES.has(mime)) return fail(request, 'unsupported_format', 'Only JPEG, PNG, WebP, or HEIC photos are supported.', 400, body);
    if (!/^[0-9a-f-]{36}$/i.test(String(body.correlationId || '')) || String(body.correlationId) !== correlationId) return fail(request, 'invalid_correlation_id', 'The upload correlation identifier is invalid.', 400, body);
    if (!Number.isInteger(size) || size < 1) return fail(request, 'invalid_media_size', 'The media size could not be verified.', 400, body);
    if (size > MAX[kind]) return fail(request, 'file_too_large', 'This media is too large to upload.', 413, body);
    const extension = cleanName(body.fileName).split('.').pop()?.toLowerCase() || 'jpg';
    if (!['jpg', 'jpeg', 'png', 'webp', 'heic'].includes(extension)) return fail(request, 'unsupported_format', 'This photo format is not supported.', 400, body);
    const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
    const objectPath = `${user.id}/${correlationId}/${cleanName(body.fileName)}`;
    const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(objectPath, { upsert: false });
    if (error || !data?.signedUrl) {
      log('authorization_failed', { correlation_id: correlationId, stage: 'staging_authorization', http_status: 503, reason_code: 'upload_authorization_failed', auth_boundary: 'function', user_id: user.id, project_ref: projectRef(supabaseUrl), request_dispatched: true });
      return fail(request, 'upload_authorization_failed', 'Upload authorization is temporarily unavailable.', 503, body);
    }
    log('authorization_issued', { correlation_id: correlationId, stage: 'staging_authorization', http_status: 200, reason_code: 'authorization_issued', media_type: kind, file_size_bytes: size, auth_boundary: 'function', user_id: user.id, project_ref: projectRef(supabaseUrl), request_dispatched: true });
    return json(200, { ok: true, bucket: BUCKET, objectPath, signedUploadUrl: data.signedUrl, expiresInSeconds: 7200, correlationId });
  } catch (_) {
    log('authorization_failed', { correlation_id: requestCorrelationId, stage: 'staging_authorization', http_status: 400, reason_code: 'upload_authorization_failed', auth_boundary: 'function', request_dispatched: true });
    return fail(request, 'upload_authorization_failed', 'Upload authorization could not be completed.', 400, body);
  }
});
