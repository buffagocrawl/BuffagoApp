import { errorContext, mediaLogContext, sanitizedObjectPath, wingShotLog } from './wingShotDiagnostics.js';
import { WING_SHOT_PHOTO_MAX_BYTES, WING_SHOT_VIDEO_MAX_BYTES, WING_SHOT_VIDEO_MAX_MB } from './wingShotLimits.js';
import { transitionWingShotUpload } from './wingShotUploadState.js';

export const WING_SHOT_CONSENT_VERSION = 'wing-shots-v1';
export const WING_SHOT_VIDEO_TARGET_SECONDS = 7;
export const WING_SHOT_VIDEO_MIN_SECONDS = 3;
export const WING_SHOT_VIDEO_MAX_SECONDS = 10;
export const WING_SHOT_MAX_PHOTO_EDGE = 2_048;
export const WING_SHOT_MAX_VIDEO_EDGE = 4_096;
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
    this.retryAfterSeconds = options.retryAfterSeconds ?? null;
    this.retryable = options.retryable ?? false;
    this.httpStatus = options.httpStatus ?? null;
    this.serverCode = options.serverCode ?? null;
    this.serverMessage = options.serverMessage ?? null;
    this.correlationId = options.correlationId ?? null;
    this.databaseCode = options.databaseCode ?? null;
    this.databaseMessage = options.databaseMessage ?? null;
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
  const maxEdge = media.kind === 'photo' ? WING_SHOT_MAX_PHOTO_EDGE : WING_SHOT_MAX_VIDEO_EDGE;
  if ((media.width != null || media.height != null) && (!Number.isInteger(media.width) || !Number.isInteger(media.height) || media.width < 1 || media.height < 1 || Math.max(media.width, media.height) > maxEdge)) {
    throw new WingShotClientError('invalid_dimensions', 'This media’s dimensions are not supported.', { stage: 'validate' });
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
    state: 'idle',
    reserveIdempotencyKey: `wing-reserve-${idFactory()}`,
    finalizeIdempotencyKey: `wing-finalize-${idFactory()}`,
    reservation: null,
    uploadCompleted: false,
    requestFingerprint: null,
    staging: null,
    uploadedObject: null,
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

function errorChain(error, depth = 0) {
  if (!error || depth > 4) return [];
  return [error, ...errorChain(error.cause, depth + 1)];
}

/**
 * Performs the immediate, server-trusted validation pass. The server returns
 * reason_code only; transport and exception text never reach the UI.
 */
export async function validateWingShotMediaRemotely({
  client,
  media,
  signal,
  validationTransport,
  staging,
}) {
  validateWingShotMedia(media);
  if (signal?.aborted) throw new WingShotClientError('validation_cancelled', 'Validation cancelled.', { stage: 'validate' });
  let result;
  try {
    if (validationTransport) {
      result = await validationTransport({ client, media, staging, signal });
    } else {
      result = await invokeWingShotFunction(client, 'wing-media-validate', {
        bucket: staging.bucket,
        objectPath: staging.objectPath,
        correlationId: staging.correlationId,
        mediaType: media.kind,
        declaredMimeType: media.mimeType,
        declaredFileSizeBytes: media.sizeBytes,
        localMetadata: { width: media.width ?? null, height: media.height ?? null, durationSeconds: media.durationSeconds ?? null },
      }, staging.correlationId);
    }
  } catch (error) {
    throw new WingShotClientError('validation_network_failure', 'Validation is temporarily unavailable.', { stage: 'validate', cause: error, retryable: true });
  }
  const data = result?.data;
  if (result?.error || data?.valid === false) {
    const code = String(data?.reason_code || result?.__wingFailure?.reasonCode || 'validation_unknown');
    const options = { stage: 'validate', retryable: Boolean(data?.retryable), retryAfterSeconds: data?.retry_after_seconds, httpStatus: result?.__wingFailure?.status };
    throw new WingShotClientError(code, 'Wing Shot validation failed.', options);
  }
  if (data?.valid !== true) {
    throw new WingShotClientError('validation_unknown', 'Wing Shot validation failed.', { stage: 'validate' });
  }
  return data;
}

function serverErrorText(error) {
  return errorChain(error)
    .flatMap((item) => [item?.code, item?.message, item?.details, item?.hint])
    .filter(Boolean)
    .join(' ');
}

function retryAfterSeconds(error) {
  for (const item of errorChain(error)) {
    const candidates = [
      item?.retry_after_seconds,
      item?.retryAfterSeconds,
      item?.retry_after,
      item?.retryAfter,
    ];
    const value = candidates.find((candidate) => Number.isFinite(Number(candidate)) && Number(candidate) > 0);
    if (value != null) return Math.ceil(Number(value));
  }
  return null;
}

export async function parseWingShotFunctionError(error) {
  const response = error?.context instanceof Response ? error.context : null;
  let body = null;
  let text = null;
  if (response) {
    try {
      const clone = response.clone();
      text = await clone.text();
      try { body = text ? JSON.parse(text) : null; } catch (_) { /* non-JSON gateway response */ }
    } catch (_) { /* a consumed or unavailable response is still a handled failure */ }
  }
  const status = Number(error?.status ?? error?.statusCode ?? response?.status) || null;
  const retryHeader = response?.headers?.get?.('retry-after');
  const retryAfter = Number(retryHeader);
  return { status, headers: response?.headers ?? null, body, text, retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter > 0 ? Math.ceil(retryAfter) : null };
}

function isFunctionAuthFailure(failure) {
  return failure.status === 401 || ['authentication_required', 'invalid_token'].includes(String(failure.body?.code || failure.body?.reason_code || ''));
}

function withTimeout(promise, milliseconds) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error('Wing Shot function request timed out'), { code: 'network_timeout' })), milliseconds);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function functionClientError(failure, stage, fallbackCode = 'function_request_failed') {
  const body = failure?.body && typeof failure.body === 'object' ? failure.body : {};
  const status = failure?.status ?? null;
  const serverCode = String(body.code || body.reason_code || (body.ok === false ? fallbackCode : `function_http_${status || 'unknown'}`));
  const code = status === 401 ? 'authentication_required' : status === 403 ? 'authorization_failed' : status === 429 ? 'rate_limited' : status === 413 ? 'file_too_large' : serverCode;
  const retryable = body.retryable === true || (status >= 500 && status !== 501);
  return new WingShotClientError(code, String(body.message || failure?.text || 'The upload could not finish. Try again.'), {
    stage: body.stage || stage,
    cause: failure?.error ?? null,
    retryable,
    retryAfterSeconds: body.retryAfterSeconds ?? body.retry_after_seconds ?? failure?.retryAfterSeconds,
    httpStatus: status,
    serverCode,
    serverMessage: body.message || failure?.text || null,
    correlationId: body.correlationId || null,
  });
}

async function invokeWingShotFunction(client, functionName, body, correlationId) {
  let refreshed = false;
  let accessToken = null;
  for (;;) {
    if (!accessToken) {
      const sessionResult = await client.auth.getSession();
      accessToken = sessionResult?.data?.session?.access_token ?? null;
    }
    wingShotLog(correlationId, 'function_request_headers', { stage: functionName, tokenSource: accessToken ? (refreshed ? 'refreshed_access_token' : 'supabase_session_access_token') : 'none', bearerPresent: Boolean(accessToken), bearerShape: accessToken ? 'jwt_like' : 'absent', apikeyPresent: Boolean(client.supabaseKey), refreshAttempted: refreshed }, 'debug');
    const result = await withTimeout(client.functions.invoke(functionName, { body, headers: { ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}), ...(client.supabaseKey ? { apikey: client.supabaseKey } : {}), 'x-wing-correlation-id': correlationId } }), 30_000);
    if (!result?.error) return result;
    const failure = await parseWingShotFunctionError(result.error);
    if (!refreshed && isFunctionAuthFailure(failure)) {
      refreshed = true;
      wingShotLog(correlationId, 'auth_refresh_started', { stage: functionName, httpStatus: failure.status, reasonCode: failure.body?.reason_code || 'gateway_auth_failure' }, 'warn');
      const refreshResult = await client.auth.refreshSession();
      if (!refreshResult?.error && refreshResult?.data?.session?.access_token) {
        accessToken = refreshResult.data.session.access_token;
        wingShotLog(correlationId, 'auth_refresh_succeeded', { stage: functionName, reasonCode: 'token_refreshed' }, 'debug');
        continue;
      }
      return { ...result, __wingFailure: { ...failure, reasonCode: 'authentication_expired', refreshAttempted: true } };
    }
    return { ...result, __wingFailure: { ...failure, reasonCode: failure.body?.code || failure.body?.reason_code || null, refreshAttempted: refreshed } };
  }
}

function databaseErrorDetails(error) {
  const chain = errorChain(error);
  const source = chain.find((item) =>
    String(item?.code ?? '') === '42900' || String(item?.message ?? '').includes('wing_upload_rate_limit_exceeded'),
  ) ?? chain[0] ?? error;
  return {
    code: source?.code ?? null,
    message: source?.message ?? null,
    retryAfterSeconds: retryAfterSeconds(error),
  };
}

function setUploadState(session, nextState) {
  if (!session) return;
  try {
    session.state = transitionWingShotUpload(session.state ?? 'idle', nextState);
  } catch (_) {
    session.state = nextState;
  }
}

function rpcError(code, stage, error) {
  const serverCode = serverErrorText(error);
  const database = databaseErrorDetails(error);
  if (/(^|\D)42900(\D|$)/.test(serverCode) || serverCode.includes('wing_upload_rate_limit_exceeded')) {
    return new WingShotClientError(
      'RATE_LIMITED',
      'Wing Shot uploads are temporarily rate limited.',
      {
        stage,
        cause: error,
        retryAfterSeconds: database.retryAfterSeconds,
        retryable: true,
        httpStatus: 429,
        databaseCode: database.code,
        databaseMessage: database.message,
      },
    );
  }
  if (serverCode.includes('invalid_media_size')) {
    return new WingShotClientError(
      'media_too_large',
      'This media is too large. Choose a smaller file (photos under 20 MiB, videos under 50 MiB).',
      { stage, cause: error, sizeBytes: error?.expected_size_bytes ?? error?.sizeBytes ?? null },
    );
  }
  if (serverCode.includes('uploaded_object_not_found') || serverCode.includes('uploaded_object_invalid')) {
    return new WingShotClientError('OBJECT_VALIDATION_FAILED', 'The uploaded object could not be securely verified.', {
      stage, cause: error, retryable: true, databaseCode: database.code, databaseMessage: database.message,
    });
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

function finalizationMayHaveCommitted(error) {
  const serverCode = serverErrorText(error).toLowerCase();
  return error?.status >= 500
    || error?.statusCode >= 500
    || /23505|duplicate|wing_processing_jobs|timeout|network|fetch/.test(serverCode);
}

async function recoverFinalizedSubmission(client, submissionId) {
  try {
    const { data, error } = await client.rpc('get_my_wing_submission_history', {
      p_limit: 100,
      p_before: null,
    });
    if (error || !Array.isArray(data)) return null;
    const row = data.find((item) => item?.submission_id === submissionId);
    if (!row || row.display_status !== 'In Review') return null;
    const displayStatus = row.display_status || 'In Review';
    return {
      submission_id: submissionId,
      status: 'in_review',
      review_status: 'pending_review',
      display_status: displayStatus,
    };
  } catch (_) {
    return null;
  }
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

function canonicalUploadedObject(bucket, requestedPath, uploadData) {
  const path = String(uploadData?.path ?? '');
  const fullPath = String(uploadData?.fullPath ?? '');
  const expectedFullPath = `${bucket}/${requestedPath}`;
  // Do not normalize, trim, or decode Storage references. Finalization accepts
  // only the exact canonical object tied to this reservation.
  if (!bucket || path !== requestedPath || (fullPath && fullPath !== expectedFullPath)) {
    throw new WingShotClientError('upload_response_invalid', 'Storage returned an unexpected object reference.', { stage: 'upload', retryable: true });
  }
  return { bucket, path, fullPath: fullPath || expectedFullPath };
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
  setUploadState(session, 'ready');
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
  setUploadState(session, 'authorizing');
  onStage('authorizing');
  onProgress(2);

  let body = null;
  if (!session.uploadCompleted && !session.staging) {
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
      const classifiedError = rpcError('reservation_failed', 'reserve', error);
      const database = databaseErrorDetails(error);
      wingShotLog(session.correlationId, 'RPC failure', {
        rpcName,
        databaseCode: database.code,
        databaseMessage: database.message,
        clientClassification: classifiedError.code,
        retryAfterSeconds: classifiedError.retryAfterSeconds,
        exception: errorContext(error),
        recordCreation: 'unknown',
      }, 'warn');
      throw classifiedError;
    }
    const { data, error } = reservationResult;
    if (!error && data?.error_code === 'WING_SHOT_RATE_LIMITED') {
      throw new WingShotClientError('RATE_LIMITED', 'Wing Shot upload rate limit reached.', {
        stage: 'reserve', retryAfterSeconds: data.retry_after_seconds, retryable: true, httpStatus: 429,
      });
    }
    const classifiedError = error ? rpcError('reservation_failed', 'reserve', error) : null;
    const database = databaseErrorDetails(error);
    wingShotLog(session.correlationId, 'RPC response', { rpcName, databaseCode: database.code, databaseMessage: database.message, clientClassification: classifiedError?.code ?? null, retryAfterSeconds: classifiedError?.retryAfterSeconds ?? null, exception: errorContext(error), existingRecordFound: Boolean(data?.resumed || data?.existing_record_found), existingRecordId: data?.existing_record_id ?? data?.submission_id ?? null, existingRecordStatus: data?.existing_record_status ?? data?.status ?? null, recordCreation: data?.resumed ? 'existing_record_resumed' : error ? 'failed' : 'created' }, error ? 'warn' : 'debug');
    if (error || !data?.submission_id || !data?.bucket || !data?.upload_path) {
      throw classifiedError ?? rpcError('reservation_failed', 'reserve', error);
    }
    session.reservation = {
      submissionId: data.submission_id,
      bucket: data.bucket,
      uploadPath: data.upload_path,
    };
  }
  throwIfAborted(signal);
  onProgress(20);

  if (!session.uploadCompleted && session.staging) {
    setUploadState(session, 'uploading');
    onStage('uploading');
    try {
      const result = await invokeWingShotFunction(client, 'wing-media-promote', {
        bucket: session.staging.bucket,
        objectPath: session.staging.objectPath,
        submissionId: session.reservation.submissionId,
        correlationId: session.correlationId,
        mediaType: input.media.kind,
        expectedMimeType: input.media.mimeType,
        expectedSizeBytes: input.media.sizeBytes,
      }, session.correlationId);
      if (result.error) {
        const failure = result.__wingFailure || { status: null, body: null, text: null };
        throw functionClientError(failure, 'promote');
      }
      if (result.data?.ok === false || result.data?.promoted !== true) {
        throw functionClientError({ status: null, body: result.data, text: null }, 'promote');
      }
      session.uploadedObject = canonicalUploadedObject(result.data?.bucket, result.data?.path, result.data);
      if (session.uploadedObject.bucket !== session.reservation.bucket || session.uploadedObject.path !== session.reservation.uploadPath) {
        throw new WingShotClientError('upload_response_invalid', 'Promotion returned an unexpected object reference.', { stage: 'promote', retryable: true });
      }
      onProgress(85);
    } catch (error) {
      if (error instanceof WingShotClientError) throw error;
      throw new WingShotClientError('upload_failed', 'Upload interrupted. Try again.', { stage: 'promote', cause: error, retryable: true });
    }
    session.uploadCompleted = true;
  } else if (!session.uploadCompleted) {
    setUploadState(session, 'uploading');
    onStage('uploading');
    const storagePath = session.reservation.uploadPath;
    let lastUploadProgress = -1;
    let uploadResult;
    try {
      uploadResult = await uploadTransport({
        client,
        bucket: session.reservation.bucket,
        path: storagePath,
        body,
        mimeType: input.media.mimeType,
        signal,
        onProgress: (value) => {
          const integerProgress = Math.max(20, Math.min(85, Math.round(value)));
          if (integerProgress !== lastUploadProgress) {
            lastUploadProgress = integerProgress;
            onProgress(integerProgress);
          }
        },
      });
    } catch (error) {
      wingShotLog(session.correlationId, 'Upload failed', {
        bucket: session.reservation.bucket,
        objectPath: sanitizedObjectPath(storagePath),
        supabaseError: errorContext(error),
      }, 'warn');
      throw new WingShotClientError('upload_failed', 'Upload interrupted. Try again.', { stage: 'upload', cause: error });
    }
    const { data: uploadData, error } = uploadResult;
    wingShotLog(session.correlationId, 'Supabase Storage upload', {
      bucket: session.reservation.bucket,
      objectPath: sanitizedObjectPath(storagePath),
      ...mediaLogContext(input.media),
      supabaseError: errorContext(error),
    }, error ? 'warn' : 'debug');
    if (error && !isExistingObjectError(error)) {
      throw new WingShotClientError('upload_failed', 'Upload interrupted. Try again.', {
        stage: 'upload',
      });
    }
    session.uploadedObject = error
      ? { bucket: session.reservation.bucket, path: storagePath, fullPath: `${session.reservation.bucket}/${storagePath}` }
      : canonicalUploadedObject(session.reservation.bucket, storagePath, uploadData);
    session.uploadCompleted = true;
  }
  throwIfAborted(signal);
  setUploadState(session, 'server_validating');
  onStage('server_validating');
  setUploadState(session, 'finalizing');
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
    }, 'warn');
    const recovered = await recoverFinalizedSubmission(client, session.reservation.submissionId);
    if (recovered) return recovered;
    const classified = rpcError('finalization_failed', 'finalize', error);
    if (finalizationMayHaveCommitted(error) && classified.code !== 'OBJECT_VALIDATION_FAILED') {
      throw new WingShotClientError(
        'finalization_recovery_pending',
        'Your Wing Shot uploaded, but we’re finishing it in the background.',
        { stage: 'finalize', cause: error, retryable: true },
      );
    }
    throw classified;
  }
  const { data, error } = finalizeResult;
  wingShotLog(session.correlationId, 'RPC response', {
    rpcName: 'finalize_wing_submission_upload',
    exception: errorContext(error),
    existingRecordFound: true,
    existingRecordId: session.reservation.submissionId,
    existingRecordStatus: data?.status ?? 'reserved',
    recordCreation: error ? 'failed' : 'updated',
  }, error ? 'warn' : 'debug');
  wingShotLog(session.correlationId, 'Database record creation/update', {
    ratingIdPresent: Boolean(input.ratingId),
    destinationIdPresent: Boolean(input.destinationId),
    userIdPresent: Boolean(input.userId),
    supabaseError: errorContext(error),
  }, error ? 'warn' : 'debug');
  if (error) {
    const recovered = await recoverFinalizedSubmission(client, session.reservation.submissionId);
    if (recovered) return recovered;
    const classified = rpcError('finalization_failed', 'finalize', error);
    if (finalizationMayHaveCommitted(error) && classified.code !== 'OBJECT_VALIDATION_FAILED') {
      throw new WingShotClientError(
        'finalization_recovery_pending',
        'Your Wing Shot uploaded, but we’re finishing it in the background.',
        { stage: 'finalize', cause: error, retryable: true },
      );
    }
    throw classified;
  }
  if (!data?.submission_id || !['in_review', 'pending_review'].includes(data?.status)) {
    throw new WingShotClientError(
      'finalization_recovery_pending',
      'Your Wing Shot uploaded, but we’re finishing it in the background.',
      { stage: 'finalize', retryable: true },
    );
  }
  return data;
}

export function wingShotUserMessage(error) {
  const code = String(error?.code ?? '');
  if (code === 'camera_permission_denied') return 'Camera access is needed to record a Wing Shot. Your rating is already saved—allow camera access or choose another option.';
  if (code === 'library_permission_denied' || code === 'permission_denied') return 'Photo library access is needed to choose a Wing Shot. Your rating is already saved—allow access or skip the upload.';
  if (code === 'offline') return 'You appear to be offline. Your rating is saved—reconnect and try the upload again.';
  if (code === 'network_timeout' || code === 'timeout') return 'The upload timed out. Your rating is saved—check your connection and try again.';
  if (code === 'authentication_required') return 'Your session expired. Your rating is saved—sign in again to upload your Wing Shot.';
  if (code === 'OBJECT_VALIDATION_FAILED') return 'We couldn’t finish uploading your Wing Shot. Your rating is already saved. Please try the upload again.';
  if (code === 'finalization_recovery_pending' || code === 'finalization_failed') return 'Your Wing Shot uploaded, but we’re finishing it in the background. Check your Creator history shortly.';
  if (code === 'authorization_failed') return 'Your rating is saved, but this upload is no longer authorized. Choose the media again or skip the upload.';
  if (code === 'rate_limited') {
    const retry = Number.isFinite(Number(error?.retryAfterSeconds)) && Number(error.retryAfterSeconds) > 0 ? `try again in ${formatRetryAfter(Number(error.retryAfterSeconds))}` : 'try again later';
    return `You’ve uploaded several Wing Shots recently. Your rating is already saved—${retry}.`;
  }
  if (code === 'server_temporarily_unavailable') return 'Wing Shot upload is temporarily unavailable. Your rating is saved—please try again.';
  if (code === 'file_too_large') return 'That file is too large to upload. Choose a smaller photo or video.';
  if (code === 'local_validation_error') return 'This media could not be checked on this device. Choose another file and try again.';
  if (code === 'validation_state_error') return 'This Wing Shot is no longer ready to validate. Choose the media again.';
  if (code === 'media_too_large') return 'This file is too large to upload. Try choosing a shorter video or a smaller photo.';
  if (code === 'video_too_long') return 'This video is longer than we can accept. Trim it and try again.';
  if (code === 'video_too_short') return 'This video is too short. Record a slightly longer Wing Shot and try again.';
  if (code === 'unsupported_media_type' || code === 'unsupported_format') return 'We can’t use this file format. Try a standard photo or MP4 video.';
  if (code === 'media_unreadable' || code === 'corrupt_media' || code === 'media_read_failed') return 'We couldn’t read this file. Try selecting it again or choose another one.';
  if (code === 'invalid_dimensions' || code === 'photo_dimensions_invalid' || code === 'video_dimensions_invalid') return 'This media’s dimensions aren’t supported. Try another photo or video.';
  if (code === 'validation_network_failure' || code === 'validation_retryable' || code === 'network_failed') return 'We couldn’t validate your Wing Shot right now. Check your connection and try again.';
  if (code === 'WING_SHOT_RATE_LIMITED' || code === 'RATE_LIMITED' || code === 'rate_limited') {
    const retry = Number.isFinite(Number(error?.retryAfterSeconds)) && Number(error.retryAfterSeconds) > 0
      ? ` Try again in ${formatRetryAfter(Number(error.retryAfterSeconds))}.`
      : ' Please wait a few minutes and try again.';
    return `You’ve reached the upload limit.${retry} Your rating is already saved.`;
  }
  if (code === 'authentication_required') return 'Please sign in before validating a Wing Shot.';
  if (code === 'upload_authorization_failed' || code === 'staging_upload_failed') return 'The Wing Shot upload could not start or finish. Check your connection and try again.';
  if (code === 'staging_object_missing' || code === 'staging_object_forbidden') return 'This Wing Shot upload expired. Choose the media again.';
  if (code === 'unreadable_media' || code === 'corrupted_media') return 'We couldnâ€™t read this media. Choose another photo or video.';
  if (code === 'validator_unavailable' || code === 'validation_timeout' || code === 'validation_internal_failure') return 'Validation is temporarily unavailable. Try again.';
  if (code === 'stale_validation_cancelled') return '';
  if (code === 'validation_cancelled') return '';
  if (code === 'validation_unknown') return 'We couldn’t validate this Wing Shot. Try selecting it again or choose another file.';
  const saved = ' Your rating is already saved.';
  if (error instanceof WingShotClientError) {
    if (code === 'WING_SHOT_RATE_LIMITED' || code === 'RATE_LIMITED') {
      const retry = Number.isFinite(error.retryAfterSeconds) && error.retryAfterSeconds > 0
        ? ` Please try again in ${formatRetryAfter(error.retryAfterSeconds)} or skip the upload.`
        : ' Please try again later or skip the upload.';
      return `Your rating is already saved. You’ve been rate limited from uploading more Wing Shots for now.${retry}`;
    }
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
    return 'We couldn’t validate this Wing Shot. Try selecting it again or choose another file.';
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

function formatRetryAfter(seconds) {
  if (seconds < 60) return `${seconds} seconds`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.ceil(minutes / 60);
  return `${hours} hour${hours === 1 ? '' : 's'}`;
}

export function wingShotProcessingCopy(error) {
  if (['WING_SHOT_RATE_LIMITED', 'RATE_LIMITED', 'rate_limited'].includes(String(error?.code ?? ''))) {
    return { title: 'Too many Wing Shots', message: wingShotUserMessage(error), primaryAction: 'Try again', secondaryAction: 'Skip media upload' };
  }
  if (String(error?.code ?? error?.failure_code ?? '') === 'DUPLICATE_MEDIA') {
    return { title: 'Duplicate video', message: 'This video was already submitted in another Wing Shot. Record or choose a different clip and try again.', primaryAction: 'Choose a different video', secondaryAction: 'Close' };
  }
  return { title: 'Wing Shot upload issue', message: 'Your rating is already saved. Try another video or skip the upload.', primaryAction: 'Try again', secondaryAction: 'Skip media upload' };
}
