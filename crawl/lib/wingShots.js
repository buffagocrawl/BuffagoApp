export const WING_SHOT_CONSENT_VERSION = 'wing-shots-v1';
export const WING_SHOT_VIDEO_TARGET_SECONDS = 7;
export const WING_SHOT_VIDEO_MAX_SECONDS = 10;
export const WING_SHOT_PHOTO_MAX_BYTES = 20 * 1024 * 1024;
export const WING_SHOT_VIDEO_MAX_BYTES = 50 * 1024 * 1024;

const PHOTO_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
]);
const VIDEO_MIME_TYPES = new Set(['video/mp4', 'video/quicktime']);
const ATTRIBUTION_PREFERENCES = new Set(['username', 'display_name', 'anonymous']);

export class WingShotClientError extends Error {
  constructor(code, message, options = {}) {
    super(message, options);
    this.name = 'WingShotClientError';
    this.code = code;
    this.stage = options.stage ?? null;
  }
}

export function createCorrelationId() {
  if (typeof globalThis.crypto?.randomUUID !== 'function') {
    throw new WingShotClientError(
      'secure_random_unavailable',
      'Secure upload identifiers are unavailable on this device.',
    );
  }
  return globalThis.crypto.randomUUID();
}

export function validateWingShotMedia(media) {
  if (!media || !['photo', 'video'].includes(media.kind)) {
    throw new WingShotClientError('invalid_media', 'Choose a supported photo or video.');
  }
  if (!Number.isInteger(media.sizeBytes) || media.sizeBytes < 1) {
    throw new WingShotClientError('invalid_media_size', 'The media size could not be verified.');
  }
  const allowedMimes = media.kind === 'photo' ? PHOTO_MIME_TYPES : VIDEO_MIME_TYPES;
  if (!allowedMimes.has(media.mimeType)) {
    throw new WingShotClientError(
      'unsupported_media_type',
      'Choose a JPEG, PNG, WebP, HEIC, MP4, or QuickTime file.',
    );
  }
  const maximumBytes =
    media.kind === 'photo' ? WING_SHOT_PHOTO_MAX_BYTES : WING_SHOT_VIDEO_MAX_BYTES;
  if (media.sizeBytes > maximumBytes) {
    throw new WingShotClientError(
      'media_too_large',
      media.kind === 'photo'
        ? 'That photo is too large. Choose one under 20 MiB.'
        : 'That video is too large. Choose one under 50 MiB.',
    );
  }
  if (media.kind === 'video') {
    if (!Number.isFinite(media.durationSeconds) || media.durationSeconds <= 0) {
      throw new WingShotClientError(
        'invalid_video_duration',
        'The video duration could not be verified.',
      );
    }
    if (media.durationSeconds > WING_SHOT_VIDEO_MAX_SECONDS) {
      throw new WingShotClientError(
        'video_too_long',
        'Keep your Wing Shot video to 10 seconds or less.',
      );
    }
  }
  if (typeof media.getUploadBody !== 'function') {
    throw new WingShotClientError(
      'media_reader_unavailable',
      'This device could not prepare the selected media.',
    );
  }
  return media;
}

export function validateWingShotSubmission(input) {
  if (!input?.destinationId) {
    throw new WingShotClientError('restaurant_required', 'Choose the restaurant for this Wing Shot.');
  }
  if (input.ratingId != null && typeof input.ratingId !== 'string') {
    throw new WingShotClientError('invalid_rating', 'The selected rating could not be verified.');
  }
  if (!['rating', 'onboarding', 'buffacoin', 'profile', 'home_cta'].includes(input.submissionSource)) {
    throw new WingShotClientError('invalid_submission_source', 'This Wing Shot entry point is not supported.');
  }
  validateWingShotMedia(input.media);
  if (input.consentAccepted !== true) {
    throw new WingShotClientError(
      'consent_required',
      'Review and accept the media consent before submitting.',
    );
  }
  if (!ATTRIBUTION_PREFERENCES.has(input.attributionPreference)) {
    throw new WingShotClientError(
      'attribution_required',
      'Choose how you would like to be credited.',
    );
  }
  if ((input.caption ?? '').length > 500) {
    throw new WingShotClientError('caption_too_long', 'Keep your caption to 500 characters.');
  }
  return input;
}

/** @param {() => string} idFactory */
export function createWingShotUploadSession(idFactory = createCorrelationId) {
  const correlationId = idFactory();
  return {
    correlationId,
    reserveIdempotencyKey: `wing-reserve-${idFactory()}`,
    finalizeIdempotencyKey: `wing-finalize-${idFactory()}`,
    reservation: null,
    uploadCompleted: false,
    requestFingerprint: null,
  };
}

function throwIfAborted(signal) {
  if (signal?.aborted) {
    throw new WingShotClientError('upload_cancelled', 'Upload cancelled.', {
      stage: 'cancelled',
    });
  }
}

function assertClient(client) {
  if (!client?.rpc || !client?.storage?.from) {
    throw new WingShotClientError('client_unavailable', 'Wing Shot upload is unavailable.');
  }
}

function rpcError(code, stage, error) {
  const serverCode = String(error?.message ?? error?.code ?? '');
  if (serverCode.includes('invalid_media_size')) {
    return new WingShotClientError(
      'media_too_large',
      'This media is too large. Choose a smaller file (photos under 20 MiB, videos under 50 MiB).',
      { stage },
    );
  }
  if (serverCode.includes('rating_not_found')) {
    return new WingShotClientError(
      'rating_not_found',
      'That rating could not be linked to this restaurant.',
      { stage },
    );
  }
  return new WingShotClientError(code, 'We could not complete that step. Please try again.', {
    stage,
  });
}

// TODO: Remove debug logging after Wing Shot upload issue is resolved.
function logSupabaseError(error) {
  console.error('[WingShot] Supabase error object:', error);
  console.error('[WingShot] Supabase error details', {
    message: error?.message,
    details: error?.details,
    hint: error?.hint,
    code: error?.code,
    status: error?.status,
    statusCode: error?.statusCode,
  });
}

function isExistingObjectError(error) {
  return (
    Number(error?.statusCode ?? error?.status) === 409 ||
    String(error?.message ?? '').toLowerCase().includes('already exists')
  );
}

async function defaultUploadTransport({
  client,
  bucket,
  path,
  body,
  mimeType,
}) {
  return client.storage.from(bucket).upload(path, body, {
    contentType: mimeType,
    upsert: false,
    cacheControl: '3600',
  });
}

/**
 * Executes reserve -> exact private storage path -> finalize.
 *
 * The mutable session intentionally survives retries. If finalization fails
 * after storage succeeds, retry skips re-upload. A duplicate object response
 * is never treated as success on its own; finalization must still prove the
 * reserved object exists and belongs to the current user.
 */
export async function submitWingShot({
  client,
  input,
  session,
  signal,
  onProgress = (_value) => {},
  uploadTransport = defaultUploadTransport,
}) {
  assertClient(client);
  validateWingShotSubmission(input);
  // Keep upload diagnostics development-visible without logging local paths,
  // filenames, user identifiers, tokens, or media contents.
  console.log('[WingShot] Upload started', {
    mediaType: input.media.kind,
    mimeType: input.media.mimeType,
    sizeBytes: input.media.sizeBytes,
  });
  if (!session?.correlationId) {
    throw new WingShotClientError('session_required', 'Start a new upload session.');
  }
  const requestFingerprint = JSON.stringify([
    input.ratingId ?? null,
    input.destinationId,
    input.submissionSource,
    input.media.kind,
    input.media.mimeType,
    input.media.sizeBytes,
    input.media.durationSeconds ?? null,
    input.attributionPreference,
    input.caption?.trim() ?? '',
  ]);
  if (
    session.requestFingerprint !== null &&
    session.requestFingerprint !== requestFingerprint
  ) {
    throw new WingShotClientError(
      'session_input_changed',
      'The selected media changed. Start a new upload attempt.',
    );
  }
  session.requestFingerprint = requestFingerprint;
  throwIfAborted(signal);
  onProgress(2);

  let body = null;
  if (!session.uploadCompleted) {
    try {
      body = await input.media.getUploadBody(signal);
      console.log('[WingShot] Media prepared for upload', {
        size: body?.byteLength ?? body?.size,
      });
    } catch (error) {
      if (signal?.aborted) throwIfAborted(signal);
      throw new WingShotClientError(
        'media_read_failed',
        'The selected media could not be read. Choose it again.',
        { stage: 'prepare', cause: error },
      );
    }
  }
  throwIfAborted(signal);
  onProgress(8);

  if (!session.reservation) {
    console.log('[WingShot] Reservation request', {
      ratingId: input.ratingId ?? null,
      destinationId: input.destinationId,
      mediaType: input.media.kind,
      mimeType: input.media.mimeType,
      sizeBytes: input.media.sizeBytes,
      submissionSource: input.submissionSource,
    });
    let reservationResult;
    try {
      reservationResult = await client.rpc('reserve_wing_submission_upload', {
        p_rating_id: input.ratingId ?? null,
        p_media_type: input.media.kind,
        p_expected_mime_type: input.media.mimeType,
        p_expected_size_bytes: input.media.sizeBytes,
        p_consent_version: WING_SHOT_CONSENT_VERSION,
        p_attribution_preference: input.attributionPreference,
        p_user_caption: input.caption?.trim() || null,
        p_idempotency_key: session.reserveIdempotencyKey,
        p_correlation_id: session.correlationId,
        p_destination_id: input.destinationId,
        p_submission_source: input.submissionSource,
      });
    } catch (error) {
      logSupabaseError(error);
      throw error;
    }
    const { data, error } = reservationResult;
    console.log('[WingShot] Reservation response', {
      data: data
        ? {
            submissionId: data.submission_id,
            bucket: data.bucket,
            uploadPath: data.upload_path,
            expiresAt: data.expires_at,
          }
        : null,
      error: error ? { message: error.message, details: error.details, hint: error.hint, code: error.code, status: error.status, statusCode: error.statusCode } : null,
    });
    if (error || !data?.submission_id || !data?.bucket || !data?.upload_path) {
      if (error) logSupabaseError(error);
      console.warn(
        '[WingShot] Upload blocked:',
        error?.message ?? 'Eligibility response was incomplete.',
      );
      throw rpcError('reservation_failed', 'reserve', error);
    }
    session.reservation = {
      submissionId: data.submission_id,
      bucket: data.bucket,
      uploadPath: data.upload_path,
    };
  }
  throwIfAborted(signal);
  onProgress(20);

  if (!session.uploadCompleted) {
    console.log('[WingShot] Uploading to Supabase Storage...');
    const storagePath = session.reservation.uploadPath;
    let uploadResult;
    try {
      uploadResult = await uploadTransport({
        client,
        bucket: session.reservation.bucket,
        path: storagePath,
        body,
        mimeType: input.media.mimeType,
        signal,
        onProgress: (value) => onProgress(Math.max(20, Math.min(85, value))),
      });
    } catch (error) {
      console.error('[WingShot] Storage upload failed');
      logSupabaseError(error);
      throw error;
    }
    const { error } = uploadResult;
    if (error && !isExistingObjectError(error)) {
      console.error('[WingShot] Storage upload failed');
      logSupabaseError(error);
      throw new WingShotClientError('upload_failed', 'Upload interrupted. Try again.', {
        stage: 'upload',
      });
    }
    console.log('[WingShot] Storage upload result', {
      path: storagePath,
      ok: !error || isExistingObjectError(error),
      error: error ? { message: error.message, details: error.details, hint: error.hint, code: error.code, status: error.status, statusCode: error.statusCode } : null,
    });
    session.uploadCompleted = true;
  }
  throwIfAborted(signal);
  onProgress(88);

  console.log('[WingShot] Creating database record...');
  let finalizeResult;
  try {
    finalizeResult = await client.rpc('finalize_wing_submission_upload', {
      p_submission_id: session.reservation.submissionId,
      p_idempotency_key: session.finalizeIdempotencyKey,
      p_correlation_id: session.correlationId,
    });
  } catch (error) {
    console.error('[WingShot] Database insert failed');
    logSupabaseError(error);
    throw error;
  }
  const { data, error } = finalizeResult;
  if (error || !data?.submission_id || data?.status !== 'uploaded') {
    console.error('[WingShot] Database insert failed');
    if (error) logSupabaseError(error);
    throw rpcError('finalization_failed', 'finalize', error);
  }
  console.log('[WingShot] Finalization result', {
    submissionId: data.submission_id,
    status: data.status,
  });
  onProgress(100);
  return data;
}

export function wingShotUserMessage(error) {
  if (error instanceof WingShotClientError) return error.message;
  const code = String(error?.code ?? '');
  if (code === 'permission_denied') {
    return 'Permission was not granted. You can choose another option or submit later.';
  }
  if (code === 'media_dependency_unavailable') {
    return 'Camera and library access are not available in this app build.';
  }
  if (code === 'picker_cancelled') return '';
  if (code === 'offline') return 'You appear to be offline. Reconnect and try again.';
  return 'Something went wrong. Your rating is still saved, and you can try the upload again.';
}
