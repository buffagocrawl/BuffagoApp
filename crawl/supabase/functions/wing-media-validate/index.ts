// @ts-nocheck

const PHOTO_MAX_BYTES = 20 * 1024 * 1024;
const VIDEO_MAX_BYTES = 50 * 1024 * 1024;
const VIDEO_MIN_SECONDS = 3;
const VIDEO_MAX_SECONDS = 10;
const PHOTO_MAX_EDGE = 2048;
const VIDEO_MAX_EDGE = 4096;

const headers = { 'content-type': 'application/json', 'cache-control': 'no-store' };

function log(event: string, fields: Record<string, unknown> = {}) {
  // Do not include bytes, media content, paths, or signed URLs in this log.
  console.log(JSON.stringify({ event, ...fields }));
}

function response(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers });
}

function fail(reason_code: string, retryable = false, status = 400) {
  return response(status, { valid: false, reason_code, retryable });
}

function hasJpeg(bytes: Uint8Array) {
  return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

function hasPng(bytes: Uint8Array) {
  return bytes.length >= 8 && bytes.slice(0, 8).every((value, index) => value === [137, 80, 78, 71, 13, 10, 26, 10][index]);
}

function hasMp4(bytes: Uint8Array) {
  return bytes.length >= 12 && new TextDecoder().decode(bytes.slice(4, 8)) === 'ftyp';
}

Deno.serve(async (request: Request) => {
  const mediaId = request.headers.get('x-wing-media-id') ?? crypto.randomUUID();
  log('validation_started', { media_id: mediaId });
  try {
    if (request.method !== 'POST') return response(405, { valid: false, reason_code: 'method_not_allowed', retryable: false });
    const form = await request.formData();
    const file = form.get('media');
    const kind = String(form.get('media_type') ?? '');
    const mime = String(form.get('mime_type') ?? '').toLowerCase();
    const width = Number(form.get('width'));
    const height = Number(form.get('height'));
    const duration = Number(form.get('duration_seconds'));
    if (!(file instanceof File) || file.size < 1) return fail('media_unreadable');
    const maximum = kind === 'photo' ? PHOTO_MAX_BYTES : kind === 'video' ? VIDEO_MAX_BYTES : 0;
    if (!maximum) return fail('unsupported_media_type');
    if (file.size > maximum) return fail('media_too_large');
    const maxEdge = kind === 'photo' ? PHOTO_MAX_EDGE : VIDEO_MAX_EDGE;
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || Math.max(width, height) > maxEdge) return fail('invalid_dimensions');
    if (kind === 'video' && (!Number.isFinite(duration) || duration <= 0)) return fail('corrupt_media');
    if (kind === 'video' && duration < VIDEO_MIN_SECONDS) return fail('video_too_short');
    if (kind === 'video' && duration > VIDEO_MAX_SECONDS) return fail('video_too_long');
    const bytes = new Uint8Array(await file.arrayBuffer());
    const readable = kind === 'photo'
      ? (mime === 'image/jpeg' ? hasJpeg(bytes) : mime === 'image/png' ? hasPng(bytes) : bytes.length > 12)
      : (mime === 'video/mp4' || mime === 'video/quicktime') && hasMp4(bytes);
    if (!readable) return fail('corrupt_media');
    if (kind === 'photo' && !['image/jpeg', 'image/png', 'image/webp', 'image/heic'].includes(mime)) return fail('unsupported_media_type');
    if (kind === 'video' && !['video/mp4', 'video/quicktime'].includes(mime)) return fail('unsupported_media_type');
    // Source bitrate is intentionally not inspected here; normalization owns it.
    log('validation_passed', { media_id: mediaId, media_type: kind });
    return response(200, { valid: true });
  } catch (_error) {
    log('validation_retryable_failure', { media_id: mediaId, reason_code: 'validation_infrastructure_failure' });
    return fail('validation_network_failure', true, 503);
  }
});
