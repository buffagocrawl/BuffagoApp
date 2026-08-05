// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';
import { bearerToken } from '../_shared/wingShotResponse.ts';

const SOURCE_BUCKET = 'wing-shot-staging';
const DESTINATION_BUCKET = 'wing-submissions';
const MAX_BYTES = { photo: 20 * 1024 * 1024 };
const MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic']);
const baseHeaders = { 'content-type': 'application/json', 'cache-control': 'no-store' };

function correlationId(request, body = {}) {
  return String(request.headers.get('x-wing-correlation-id') || body.correlationId || 'unknown');
}

function response(request, status, code, message, stage, options = {}) {
  const id = correlationId(request, options.body);
  const retryable = Boolean(options.retryable);
  const retryAfterSeconds = Number.isInteger(options.retryAfterSeconds) && options.retryAfterSeconds > 0
    ? options.retryAfterSeconds : null;
  const headers = { ...baseHeaders };
  if (status === 429 && retryAfterSeconds) headers['retry-after'] = String(retryAfterSeconds);
  return new Response(JSON.stringify({
    ok: false, code, message, stage, retryable, retryAfterSeconds, correlationId: id,
  }), { status, headers });
}

function success(request, body) {
  return new Response(JSON.stringify({ ok: true, ...body, correlationId: correlationId(request, body) }), {
    status: 200, headers: baseHeaders,
  });
}

const safeObjectName = (path) => String(path || '').split('/').pop() || '';
const validUuid = (value) => /^[0-9a-f-]{36}$/i.test(String(value || ''));
const errorStatus = (error) => Number(error?.status ?? error?.statusCode ?? error?.statusCodeValue) || null;
const errorRetryAfter = (error) => {
  const value = Number(error?.retryAfterSeconds ?? error?.retry_after_seconds ?? error?.retryAfter);
  return Number.isFinite(value) && value > 0 ? Math.ceil(value) : 60;
};
const log = (event, fields = {}) => console.log(JSON.stringify({ event, ...fields }));

Deno.serve(async (request) => {
  let body = {};
  const idFromHeader = request.headers.get('x-wing-correlation-id') || 'unknown';
  if (request.method !== 'POST') return response(request, 405, 'unsupported_request', 'Only POST is supported.', 'request');
  try {
    body = await request.json();
  } catch (_) {
    return response(request, 400, 'invalid_json', 'The promotion request was not valid JSON.', 'request');
  }
  const id = correlationId(request, body);
  if (!validUuid(id) || body.correlationId !== id) return response(request, 400, 'invalid_correlation_id', 'The upload correlation identifier is invalid.', 'request', { body });

  const token = bearerToken(request);
  const userClient = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_ANON_KEY'));
  const { data: { user } } = token ? await userClient.auth.getUser(token) : { data: { user: null } };
  if (!user) return response(request, 401, 'authentication_required', 'Sign in to continue this upload.', 'authentication', { body });

  const { bucket, objectPath, submissionId } = body;
  const objectName = safeObjectName(objectPath);
  if (bucket !== SOURCE_BUCKET || !validUuid(submissionId) || typeof objectPath !== 'string'
    || objectPath !== `${user.id}/${id}/${objectName}` || !/^[a-zA-Z0-9._-]{1,96}$/.test(objectName)) {
    return response(request, 403, 'staging_object_forbidden', 'This staged upload is not owned by the current user.', 'authorization', { body });
  }

  const admin = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
  try {
    // Reservation precedes promotion. The authoritative pre-finalization row is
    // the upload intent; wing_media_submissions is created by finalize RPC.
    const { data: intent, error: intentError } = await admin.from('wing_submission_upload_intents')
      .select('submission_id,user_id,expected_storage_path,expected_mime_type,expected_size_bytes,media_type,status,expires_at')
      .eq('submission_id', submissionId).eq('user_id', user.id).maybeSingle();
    if (intentError) {
      const status = errorStatus(intentError) === 429 ? 429 : 503;
      return response(request, status, status === 429 ? 'promotion_rate_limited' : 'promotion_database_unavailable', 'We could not verify this upload yet. Try again.', 'authorization', { body, retryable: true, retryAfterSeconds: status === 429 ? errorRetryAfter(intentError) : null });
    }
    if (!intent) return response(request, 404, 'submission_not_found', 'This upload reservation could not be found.', 'authorization', { body });
    if (!['reserved', 'finalized'].includes(intent.status)) return response(request, 409, 'submission_not_promotable', 'This upload is no longer ready for promotion.', 'authorization', { body });
    if (intent.expires_at && new Date(intent.expires_at).getTime() <= Date.now()) return response(request, 409, 'submission_reservation_expired', 'This upload reservation expired. Choose the media again.', 'authorization', { body });
    if (intent.expected_storage_path !== body.destinationPath && body.destinationPath != null) return response(request, 403, 'destination_path_forbidden', 'The destination for this upload is not valid.', 'authorization', { body });

    const expectedMime = String(body.expectedMimeType || intent.expected_mime_type || '').toLowerCase();
    const expectedSize = Number(body.expectedSizeBytes ?? intent.expected_size_bytes);
    if (intent.media_type !== 'photo' || !MIMES.has(expectedMime) || !Number.isInteger(expectedSize) || expectedSize < 1 || intent.media_type !== body.mediaType && body.mediaType != null) {
      return response(request, 400, 'promotion_contract_invalid', 'The promotion request does not match the reserved media.', 'validation', { body });
    }
    if (expectedSize > MAX_BYTES.photo) return response(request, 413, 'payload_too_large', 'This photo is too large to store.', 'validation', { body });

    const destinationPath = intent.expected_storage_path;
    const existing = await admin.storage.from(DESTINATION_BUCKET).download(destinationPath);
    let destinationReady = Boolean(existing.data) && !existing.error;
    if (destinationReady && (Number(existing.data.size) !== expectedSize || (existing.data.type && String(existing.data.type).toLowerCase() !== expectedMime))) {
      return response(request, 409, 'destination_object_conflict', 'A different media object already uses this upload reservation.', 'destination_copy', { body });
    }
    if (!destinationReady) {
      const { data: source, error: sourceError } = await admin.storage.from(SOURCE_BUCKET).download(objectPath);
      if (sourceError || !source) return response(request, 404, 'staging_object_missing', 'The staged media could not be found. Choose it again.', 'source_read', { body });
      if (Number(source.size) !== expectedSize) return response(request, 400, 'staging_size_mismatch', 'The staged media does not match the reserved upload.', 'source_read', { body });
      const sourceMime = String(source.type || '').toLowerCase();
      if (sourceMime && sourceMime !== expectedMime) return response(request, 400, 'staging_mime_mismatch', 'The staged media type does not match the reserved upload.', 'source_read', { body });
      const { error: copyError } = await admin.storage.from(DESTINATION_BUCKET).upload(destinationPath, source, {
        contentType: expectedMime, upsert: false, cacheControl: '3600',
      });
      if (copyError && !String(copyError.message || '').toLowerCase().includes('already exists')) {
        if (errorStatus(copyError) === 429) return response(request, 429, 'promotion_rate_limited', 'Promotion is temporarily rate limited. Try again later.', 'destination_copy', { body, retryable: true, retryAfterSeconds: errorRetryAfter(copyError) });
        log('promotion_failed', { correlation_id: id, submission_id: submissionId, stage: 'destination_copy', reason_code: 'destination_copy_failed', retryable: true, http_status: 503 });
        return response(request, 503, 'destination_copy_failed', 'The media could not be moved yet. Try again.', 'destination_copy', { body, retryable: true });
      }
      destinationReady = true;
    }
    if (!destinationReady) return response(request, 503, 'destination_unavailable', 'The media destination is temporarily unavailable. Try again.', 'destination_copy', { body, retryable: true });
    const { error: cleanupError } = await admin.storage.from(SOURCE_BUCKET).remove([objectPath]);
    if (cleanupError) {
      if (errorStatus(cleanupError) === 429) return response(request, 429, 'promotion_rate_limited', 'Promotion is temporarily rate limited. Try again later.', 'source_cleanup', { body, retryable: true, retryAfterSeconds: errorRetryAfter(cleanupError) });
      log('promotion_cleanup_failed', { correlation_id: id, submission_id: submissionId, stage: 'source_cleanup', reason_code: 'source_cleanup_failed', retryable: true, http_status: 503 });
      return response(request, 503, 'source_cleanup_failed', 'The media was copied, but cleanup is still pending. Try again.', 'source_cleanup', { body, retryable: true });
    }
    log('promotion_succeeded', { correlation_id: id, submission_id: submissionId, stage: 'complete', destination_bucket: DESTINATION_BUCKET, media_type: intent.media_type, expected_size_bytes: expectedSize });
    return success(request, {
      promoted: true,
      submissionId,
      bucket: DESTINATION_BUCKET,
      path: destinationPath,
      fullPath: `${DESTINATION_BUCKET}/${destinationPath}`,
    });
  } catch (error) {
    log('promotion_internal_failure', { correlation_id: idFromHeader === id ? id : 'unknown', submission_id: validUuid(submissionId) ? submissionId : null, stage: 'internal', reason_code: 'promotion_internal_failure', retryable: true });
    return response(request, 503, 'promotion_internal_failure', 'Promotion is temporarily unavailable. Try again.', 'internal', { body, retryable: true });
  }
});
