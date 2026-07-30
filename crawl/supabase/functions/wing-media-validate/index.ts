// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

const BUCKET = 'wing-shot-staging';
const PHOTO_MAX_BYTES = 20 * 1024 * 1024;
const VIDEO_MAX_BYTES = 50 * 1024 * 1024;
// Compatibility vocabulary retained for older contract tests/clients; new
// responses use file_too_large and corrupted_media.
const LEGACY_REASON_CODES = ['media_too_large', 'corrupt_media', 'unsupported_media_type', 'validation_network_failure'];
const headers = { 'content-type': 'application/json', 'cache-control': 'no-store' };
const json = (status, body) => new Response(JSON.stringify(body), { status, headers });
const fail = (reason_code, retryable = false, status = 400) => json(status, { valid: false, reason_code, retryable });
const log = (event, fields = {}) => console.log(JSON.stringify({ event, ...fields }));
const pathFingerprint = (path) => `${String(path).slice(-24)}`;

function isMp4(bytes) { return bytes.length >= 12 && new TextDecoder().decode(bytes.slice(4, 8)) === 'ftyp'; }
function isJpeg(bytes) { return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff; }
function isPng(bytes) { return bytes.length >= 8 && bytes.slice(0, 8).every((v, i) => v === [137, 80, 78, 71, 13, 10, 26, 10][i]); }

Deno.serve(async (request) => {
  const correlationId = request.headers.get('x-wing-correlation-id') ?? 'unknown';
  if (request.method !== 'POST') return fail('validation_internal_failure', false, 405);
  const auth = request.headers.get('authorization') || '';
  const userClient = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_ANON_KEY'), { global: { headers: { authorization: auth } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return fail('authentication_required', false, 401);
  try {
    const input = await request.json();
    const bucket = input.bucket;
    const objectPath = input.objectPath;
    const kind = input.mediaType;
    const mime = String(input.declaredMimeType || '').toLowerCase();
    const size = Number(input.declaredFileSizeBytes);
    const local = input.localMetadata || {};
    log('validation_started', { correlation_id: correlationId, stage: 'staging_upload_server_validator', validator: 'wing-media-validate', media_type: kind, file_size_bytes: size, authenticated_session: true, object_id: pathFingerprint(objectPath) });
    if (bucket !== BUCKET || typeof objectPath !== 'string' || !new RegExp(`^${user.id}/[0-9a-f-]{36}/[a-zA-Z0-9._-]{1,96}$`, 'i').test(objectPath)) return fail('staging_object_forbidden', false, 403);
    if (!['photo', 'video'].includes(kind)) return fail('unsupported_format');
    const maximum = kind === 'photo' ? PHOTO_MAX_BYTES : VIDEO_MAX_BYTES;
    if (!Number.isInteger(size) || size < 1 || size > maximum) return fail('file_too_large', false, 413);
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'video/mp4', 'video/quicktime'].includes(mime)) return fail('unsupported_format');
    const admin = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
    const { data: file, error: downloadError } = await admin.storage.from(BUCKET).download(objectPath);
    if (downloadError || !file) return fail('staging_object_missing', false, 404);
    if (Number(file.size) > maximum) return fail('file_too_large', false, 413);
    const prefix = new Uint8Array(await file.slice(0, 64 * 1024).arrayBuffer());
    const readable = kind === 'video' ? (mime === 'video/mp4' || mime === 'video/quicktime') && isMp4(prefix) : mime === 'image/jpeg' ? isJpeg(prefix) : mime === 'image/png' ? isPng(prefix) : prefix.length > 12;
    if (!readable) return fail('corrupted_media');
    if (kind === 'video') {
      const duration = Number(local.durationSeconds);
      if (!Number.isFinite(duration) || duration <= 0) return fail('unreadable_media');
      if (duration < 3) return fail('video_too_short');
      if (duration > 10) return fail('video_too_long');
    }
    const width = Number(local.width), height = Number(local.height);
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || Math.max(width, height) > 4096) return fail('invalid_dimensions');
    log('validation_passed', { correlation_id: correlationId, stage: 'staging_upload_server_validator', media_type: kind, file_size_bytes: Number(file.size), object_id: pathFingerprint(objectPath) });
    return json(200, { valid: true, reason_code: 'validation_passed', staged: true });
  } catch (_) {
    log('validation_retryable_failure', { correlation_id: correlationId, reason_code: 'validator_unavailable' });
    return fail('validator_unavailable', true, 503);
  }
});
