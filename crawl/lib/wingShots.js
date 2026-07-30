import { errorContext, mediaLogContext, sanitizedObjectPath, wingShotLog } from './wingShotDiagnostics.js';
import { WING_SHOT_PHOTO_MAX_BYTES, WING_SHOT_VIDEO_MAX_BYTES, WING_SHOT_VIDEO_MAX_MB } from './wingShotLimits.js';

export const WING_SHOT_CONSENT_VERSION = 'wing-shots-v1';
export const WING_SHOT_VIDEO_TARGET_SECONDS = 7;
export const WING_SHOT_VIDEO_MIN_SECONDS = 3;
export const WING_SHOT_VIDEO_MAX_SECONDS = 10;
export { WING_SHOT_PHOTO_MAX_BYTES, WING_SHOT_VIDEO_MAX_BYTES, WING_SHOT_VIDEO_MAX_MB } from './wingShotLimits.js';

const PHOTO_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
]);
const VIDEO_MIME_TYPES = new Set(['video/mp4', 'video/quicktime']);
const ATTRIBUTION_PREFERENCES = new Set(['username', 'display_name', 'anonymous']);
const VIDEO_EXTENSIONS = new Set(['mp4', 'mov']);

export class WingShotClientError extends Error {
  constructor(code, message, options = {}) {
    super(message, options);
    this.name = 'WingShotClientError';
    this.code = code;
    this.stage = options.stage ?? null;
    this.cause = options.cause ?? null;
    this.durationSeconds = options.durationSeconds ?? null;
    this.sizeBytes = options.sizeBytes ?? null;
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
  if (media.kind === 'video') {
    const extension = String(media.fileName ?? '').split(/[?#]/)[0].split('.').pop()?.toLowerCase() || 'unknown';
    if (extension !== 'unknown' && !VIDEO_EXTENSIONS.has(extension)) {
      throw new WingShotClientError('unsupported_media_type', 'This video format is not supported.', { stage: 'validate' });
    }
  }
  const maximumBytes =
    media.kind === 'photo' ? WING_SHOT_PHOTO_MAX_BYTES : WING_SHOT_VIDEO_MAX_BYTES;
  if (media.sizeBytes > maximumBytes) {
    throw new WingShotClientError(
      'media_too_large',
      media.kind === 'photo'
        ? 'That photo is too large. Choose one under 20 MiB.'
        : 'That video is too large. Choose one under 50 MiB.',
      { sizeBytes: media.sizeBytes },
    );
  }
  if (media.kind === 'video') {
    if (!Number.isFinite(media.durationSeconds) || media.durationSeconds <= 0) {
      throw new WingShotClientError(
        'invalid_video_duration',
        'The video duration could not be verified.',
      );
    }
    if (media.durationSeconds < WING_SHOT_VIDEO_MIN_SECONDS) {
      throw new WingShotClientError(
        'video_too_short',
        `This video is ${formatSeconds(media.durationSeconds)} seconds long. Wing Shots must be between ${WING_SHOT_VIDEO_MIN_SECONDS} and ${WING_SHOT_VIDEO_MAX_SECONDS} seconds.`,
        { stage: 'validate', durationSeconds: media.durationSeconds },
      );
    }
    if (media.durationSeconds > WING_SHOT_VIDEO_MAX_SECONDS) {
      throw new WingShotClientError(
        'video_too_long',
        'Keep your Wing Shot video to 10 seconds or less.',
        { stage: 'validate', durationSeconds: media.durationSeconds },
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
  if (input.submissionSource === 'rating' && !input.ratingId) {
    throw new WingShotClientError('rating_required', 'The rating association is missing.', { stage: 'validate' });
  }
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
  const serverCode = [error?.code, error?.message, error?.details, error?.hint].filter(Boolean).join(' ');
  if (serverCode.includes('invalid_media_size')) {
    return new WingShotClientError(
      'media_too_large',
      'This media is too large. Choose a smaller file (photos under 20 MiB, videos under 50 MiB).',
      { stage, cause: error, sizeBytes: error?.expected_size_bytes ?? error?.sizeBytes ?? null },
    );
  }
  if (serverCode.includes('wing_submission_already_finalized')) {
    return new WingShotClientError('duplicate_completed_submission', 'This rating already has a Wing Shot.', { stage, cause: error });
  }
  if (serverCode.includes('wing_submission_already_reserved') || serverCode.includes('idempotency_key_conflict')) {
    return new WingShotClientError('retryable_submission', 'Your rating is already saved. Let’s retry your Wing Shot.', { stage, cause: error });
  }
  if (error?.status >= 500 || error?.statusCode >= 500 || /network|timeout|fetch/i.test(serverCode)) {
    return new WingShotClientError('temporary_server_or_network', 'The upload did not finish.', { stage, cause: error });
  }
  if (stage === 'reserve' && error) {
    return new WingShotClientError('rpc_server_validation', 'The server rejected this Wing Shot.', { stage, cause: error });
  }
  const eligibilityMessages = {
    rating_not_found: 'We could not use that rating for a Wing Shot. Please try again.',
    rating_not_owned: 'We could not use that rating for a Wing Shot. Please try again.',
    buffacoin_rating: 'Wing Shots are available after restaurant ratings.',
    destination_mismatch: 'We could not use that restaurant rating for a Wing Shot. Please try again.',
    incomplete_rating: 'Finish all rating scores before adding a Wing Shot.',
  };
  const eligibilityCode = Object.keys(eligibilityMessages).find((value) =>
    serverCode.includes(value),
  );
  if (eligibilityCode) {
    return new WingShotClientError(
      eligibilityCode,
      eligibilityMessages[eligibilityCode],
      { stage, cause: error },
    );
  }
  return new WingShotClientError(code, 'We could not complete that step. Please try again.', {
    stage,
    cause: error,
  });
}

function formatSeconds(value) {
  return Number.isInteger(value) ? String(value) : Number(value).toFixed(1);
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
  onStage = (_stage) => {},
  uploadTransport = defaultUploadTransport,
}) {
  assertClient(client);
  wingShotLog(session?.correlationId ?? 'unknown', 'Upload preparation', {
    platform: typeof navigator !== 'undefined' ? navigator.platform || 'native' : 'native',
    ratingIdPresent: Boolean(input?.ratingId),
    destinationIdPresent: Boolean(input?.destinationId),
    userIdPresent: Boolean(input?.userId),
    ...mediaLogContext(input?.media),
  });
  try {
    validateWingShotSubmission(input);
  } catch (error) {
    wingShotLog(session?.correlationId ?? 'unknown', 'Validation failed', {
      ...mediaLogContext(input?.media),
      validationRule: error?.code ?? 'unknown',
      exception: errorContext(error),
    }, 'warn');
    throw error;
  }
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
  wingShotLog(session.correlationId, 'Video preprocessing or normalization', {
    ...mediaLogContext(input.media),
    preprocessing: 'client upload body preparation',
  });
  onStage('preparing');
  onProgress(2);

  let body = null;
  if (!session.uploadCompleted) {
    try {
      body = await input.media.getUploadBody(signal);
      wingShotLog(session.correlationId, 'Local file validation', {
        ...mediaLogContext(input.media),
        localFileExists: true,
        localFileReadable: true,
      });
    } catch (error) {
      if (signal?.aborted) throwIfAborted(signal);
      const readError = new WingShotClientError(
        'media_read_failed',
        'The selected media could not be read. Choose it again.',
        { stage: 'prepare', cause: error },
      );
      wingShotLog(session.correlationId, 'Validation failed', {
        ...mediaLogContext(input.media),
        validationRule: 'local_file_readable',
        localFileExists: Boolean(input.media.uri),
        localFileReadable: false,
        exception: errorContext(error),
      }, 'warn');
      throw readError;
    }
  }
  throwIfAborted(signal);
  onProgress(8);

  if (!session.reservation) {
    const rpcName = 'reserve_wing_submission_upload';
    const rpcArgs = {
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
    };
    wingShotLog(session.correlationId, 'RPC request', {
      rpcName,
      rpcArguments: { ratingIdPresent: Boolean(rpcArgs.p_rating_id), destinationIdPresent: Boolean(rpcArgs.p_destination_id), userIdPresent: Boolean(input.userId), mediaType: rpcArgs.p_media_type, mimeType: rpcArgs.p_expected_mime_type, expectedSizeBytes: rpcArgs.p_expected_size_bytes, consentVersionPresent: true, attributionPreferencePresent: true, captionPresent: Boolean(rpcArgs.p_user_caption), idempotencyKeyPresent: true, correlationIdPresent: true, submissionSource: rpcArgs.p_submission_source },
    });
    let reservationResult;
    try {
      reservationResult = await client.rpc(rpcName, rpcArgs);
    } catch (error) {
      wingShotLog(session.correlationId, 'RPC failure', { rpcName, exception: errorContext(error), recordCreation: 'unknown' }, 'error');
      throw rpcError('reservation_failed', 'reserve', error);
    }
    const { data, error } = reservationResult;
    wingShotLog(session.correlationId, 'RPC response', { rpcName, exception: errorContext(error), existingRecordFound: Boolean(data?.resumed || data?.existing_record_found), existingRecordId: data?.existing_record_id ?? data?.submission_id ?? null, existingRecordStatus: data?.existing_record_status ?? data?.status ?? null, recordCreation: data?.resumed ? 'existing_record_resumed' : error ? 'failed' : 'created' }, error ? 'error' : 'debug');
    if (error || !data?.submission_id || !data?.bucket || !data?.upload_path) {
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
    onStage('uploading');
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
      wingShotLog(session.correlationId, 'Upload failed', {
        bucket: session.reservation.bucket,
        objectPath: sanitizedObjectPath(storagePath),
        supabaseError: errorContext(error),
      }, 'error');
      throw new WingShotClientError('upload_failed', 'Upload interrupted. Try again.', { stage: 'upload', cause: error });
    }
    const { error } = uploadResult;
    wingShotLog(session.correlationId, 'Supabase Storage upload', {
      bucket: session.reservation.bucket,
      objectPath: sanitizedObjectPath(storagePath),
      ...mediaLogContext(input.media),
      supabaseError: errorContext(error),
    }, error ? 'error' : 'debug');
    if (error && !isExistingObjectError(error)) {
      throw new WingShotClientError('upload_failed', 'Upload interrupted. Try again.', {
        stage: 'upload',
      });
    }
    session.uploadCompleted = true;
  }
  throwIfAborted(signal);
  onStage('finalizing');
  onProgress(95);

  let finalizeResult;
  try {
    finalizeResult = await client.rpc('finalize_wing_submission_upload', {
      p_submission_id: session.reservation.submissionId,
      p_idempotency_key: session.finalizeIdempotencyKey,
      p_correlation_id: session.correlationId,
    });
  } catch (error) {
    wingShotLog(session.correlationId, 'RPC failure', {
      rpcName: 'finalize_wing_submission_upload',
      exception: errorContext(error),
      existingRecordFound: true,
      existingRecordId: session.reservation.submissionId,
      existingRecordStatus: 'reserved',
      recordCreation: 'already_reserved',
    }, 'error');
    throw rpcError('finalization_failed', 'finalize', error);
  }
  const { data, error } = finalizeResult;
  wingShotLog(session.correlationId, 'RPC response', {
    rpcName: 'finalize_wing_submission_upload',
    exception: errorContext(error),
    existingRecordFound: true,
    existingRecordId: session.reservation.submissionId,
    existingRecordStatus: data?.status ?? 'reserved',
    recordCreation: error ? 'failed' : 'updated',
  }, error ? 'error' : 'debug');
  wingShotLog(session.correlationId, 'Database record creation/update', {
    ratingIdPresent: Boolean(input.ratingId),
    destinationIdPresent: Boolean(input.destinationId),
    userIdPresent: Boolean(input.userId),
    supabaseError: errorContext(error),
  }, error ? 'error' : 'debug');
  if (error || !data?.submission_id || data?.status !== 'uploaded') {
    throw rpcError('finalization_failed', 'finalize', error);
  }
  return data;
}

export function wingShotUserMessage(error) {
  const code = String(error?.code ?? '');
  const saved = ' Your rating is already saved.';
  if (error instanceof WingShotClientError) {
    if (code === 'video_too_short') return `This Wing Shot is too short. This video is ${formatSeconds(error.durationSeconds ?? 0)} seconds long. Wing Shots must be between ${WING_SHOT_VIDEO_MIN_SECONDS} and ${WING_SHOT_VIDEO_MAX_SECONDS} seconds.${saved}`;
    if (code === 'video_too_long') return `This Wing Shot is too long. This video is ${formatSeconds(error.durationSeconds ?? 0)} seconds long. Wing Shots must be between ${WING_SHOT_VIDEO_MIN_SECONDS} and ${WING_SHOT_VIDEO_MAX_SECONDS} seconds.${saved}`;
    if (code === 'media_too_large') {
      const sizeMb = Number.isFinite(error.sizeBytes) ? (error.sizeBytes / (1024 * 1024)).toFixed(1) : '?';
      return `Your rating is already saved. This video is ${sizeMb} MB; Wing Shots must be under ${WING_SHOT_VIDEO_MAX_MB} MB. Choose another video or skip the upload.`;
    }
    if (code === 'retryable_submission') return 'Your rating is already saved. Let’s retry your Wing Shot.';
    if (code === 'duplicate_completed_submission') return 'This rating already has a Wing Shot.';
    if (code === 'rpc_server_validation') return 'Your rating is already saved, but this video could not be accepted. Choose another video or skip the upload.';
    if (code === 'temporary_server_or_network') return 'Your rating is already saved. The upload didn’t finish—check your connection and try again.';
    if (code === 'unsupported_media_type') return `This video format isn’t supported. Try recording a new video or selecting an MP4 or MOV.${saved}`;
    if (code === 'media_read_failed' || code === 'media_reader_unavailable') return `We can’t access this video anymore. Please select or record it again.${saved}`;
    if (code === 'invalid_video_duration' || code === 'metadata_extraction_failed') return `We couldn’t read this video’s details. Try recording it again or choose another video.${saved}`;
    if (code === 'preprocessing_failed') return 'We couldn’t prepare this video for upload. Your rating is already saved—try another video or skip the upload.';
    if (code === 'upload_failed' || code === 'offline' || code === 'network_failed') return `The upload didn’t finish. Check your connection and try again.${saved}`;
    if (code === 'rating_required' || code === 'rating_not_found' || code === 'rating_not_owned' || code === 'destination_mismatch') return 'Your rating was saved, but we couldn’t connect this Wing Shot to it. Please close and try again.';
    return `${error.message}${saved}`;
  }
  if (code === 'DUPLICATE_MEDIA') {
    return `This video was already submitted in another Wing Shot. Record or choose a different clip and try again.${saved}`;
  }
  if (code === 'MEDIA_PROCESSING_FAILED' || code === 'UNEXPECTED_PROCESSING_FAILURE') {
    return 'We couldn’t prepare this video for upload. Your rating is already saved—try another video or skip the upload.';
  }
  if (code === 'permission_denied') {
    return 'Permission was not granted. Your rating is already saved—choose another option or skip the upload.';
  }
  if (code === 'media_dependency_unavailable') {
    return 'Camera and library access are not available in this app build. Your rating is already saved—skip the upload or try again later.';
  }
  if (code === 'picker_cancelled') return '';
  if (code === 'offline') return `The upload didn’t finish. Check your connection and try again.${saved}`;
  return 'Your rating is already saved, but we couldn’t process this Wing Shot. Try another video or skip the upload.';
}

export function wingShotProcessingCopy(error) {
  if (String(error?.code ?? error?.failure_code ?? '') === 'DUPLICATE_MEDIA') {
    return { title: 'Duplicate video', message: 'This video was already submitted in another Wing Shot. Record or choose a different clip and try again.', primaryAction: 'Choose a different video', secondaryAction: 'Close' };
  }
  return { title: 'Wing Shot upload issue', message: 'Your rating is already saved. Try another video or skip the upload.', primaryAction: 'Try again', secondaryAction: 'Skip media upload' };
}
