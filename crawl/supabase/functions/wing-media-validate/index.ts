// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';
import { bearerToken, correlationId as getCorrelationId, failure, response, safePathFingerprint } from '../_shared/wingShotResponse.ts';

const BUCKET = 'wing-shot-staging';
const PHOTO_MAX_BYTES = 20 * 1024 * 1024;
const VIDEO_MAX_BYTES = 50 * 1024 * 1024;
// Compatibility vocabulary retained for older contract tests/clients; new
// responses use file_too_large and corrupted_media.
const LEGACY_REASON_CODES = ['media_too_large', 'corrupt_media', 'unsupported_media_type', 'validation_network_failure'];
const stage = 'server_validation';
const log = (event, fields = {}) => console.log(JSON.stringify({ event, ...fields }));

function isMp4(bytes) { return bytes.length >= 12 && new TextDecoder().decode(bytes.slice(4, 8)) === 'ftyp'; }
function isJpeg(bytes) { return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff; }
function isPng(bytes) { return bytes.length >= 8 && bytes.slice(0, 8).every((v, i) => v === [137, 80, 78, 71, 13, 10, 26, 10][i]); }

Deno.serve(async (request) => {
  const requestCorrelationId = getCorrelationId(request);
  if (request.method !== 'POST') return failure(request, 'unsupported_request', 'Only POST is supported.', stage, 405);
  const token = bearerToken(request);
  const userClient = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_ANON_KEY'));
  const { data: { user } } = token ? await userClient.auth.getUser(token) : { data: { user: null } };
  if (!user) return failure(request, 'authentication_required', 'Please sign in again to upload your Wing Shot.', stage, 401);
  try {
    const input = await request.json();
    const correlationId = getCorrelationId(request, input);
    const bucket = input.bucket;
    const objectPath = input.objectPath;
    const kind = input.mediaType;
    const mime = String(input.declaredMimeType || '').toLowerCase();
    const size = Number(input.declaredFileSizeBytes);
    const local = input.localMetadata || {};
    log('validation_started', { correlation_id: correlationId, stage, validator: 'wing-media-validate', media_type: kind, file_size_bytes: size, authenticated_session: true, object_id: safePathFingerprint(objectPath) });
    if (bucket !== BUCKET || typeof objectPath !== 'string' || !new RegExp(`^${user.id}/[0-9a-f-]{36}/[a-zA-Z0-9._-]{1,96}$`, 'i').test(objectPath)) return failure(request, 'staging_object_forbidden', 'This staged object is not owned by the signed-in user.', stage, 403, input);
    if (!['photo', 'video'].includes(kind)) return failure(request, 'unsupported_media_type', 'This media format is not supported.', stage, 400, input);
    const maximum = kind === 'photo' ? PHOTO_MAX_BYTES : VIDEO_MAX_BYTES;
    if (!Number.isInteger(size) || size < 1) return failure(request, 'file_unreadable', 'The media size could not be verified.', stage, 400, input);
    if (size > maximum) return failure(request, 'file_too_large', 'That file is too large to upload.', stage, 413, input);
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'video/mp4', 'video/quicktime'].includes(mime)) return failure(request, 'unsupported_media_type', 'This media format is not supported.', stage, 400, input);
    const admin = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
    const { data: file, error: downloadError } = await admin.storage.from(BUCKET).download(objectPath);
    if (downloadError || !file) return failure(request, 'file_unreadable', 'We could not read the staged media.', stage, 404, input);
    if (Number(file.size) !== size) return failure(request, 'file_unreadable', 'The staged media changed before validation.', stage, 400, input);
    if (Number(file.size) > maximum) return failure(request, 'file_too_large', 'That file is too large to upload.', stage, 413, input);
    const prefix = new Uint8Array(await file.slice(0, 64 * 1024).arrayBuffer());
    const readable = kind === 'video' ? (mime === 'video/mp4' || mime === 'video/quicktime') && isMp4(prefix) : mime === 'image/jpeg' ? isJpeg(prefix) : mime === 'image/png' ? isPng(prefix) : prefix.length > 12;
    if (!readable) return failure(request, 'media_corrupt', 'We could not read that media. Try recording again or choose another file.', stage, 400, input);
    if (kind === 'video') {
      const duration = Number(local.durationSeconds);
      if (!Number.isFinite(duration) || duration <= 0) return failure(request, 'file_unreadable', 'The video duration could not be verified.', stage, 400, input);
      if (duration < 3) return failure(request, 'video_too_short', 'That video is too short. Record at least 3 seconds.', stage, 400, input);
      if (duration > 10) return failure(request, 'video_too_long', 'That video is too long. Keep it under 10 seconds.', stage, 400, input);
    }
    const width = Number(local.width), height = Number(local.height);
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || Math.max(width, height) > 4096) return failure(request, 'invalid_dimensions', 'We could not verify the media dimensions.', stage, 400, input);
    log('validation_passed', { correlation_id: correlationId, stage, media_type: kind, file_size_bytes: Number(file.size), object_id: safePathFingerprint(objectPath) });
    return response(200, { ok: true, valid: true, code: 'validation_passed', stage, staged: true, correlationId });
  } catch (_) {
    log('validation_retryable_failure', { correlation_id: correlationId, reason_code: 'validator_unavailable' });
    return failure(request, 'server_temporarily_unavailable', 'Media validation is temporarily unavailable.', stage, 503, {}, { retryable: true });
  }
});
