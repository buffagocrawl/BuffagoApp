const SENSITIVE_KEYS = /token|authorization|cookie|signed.?url|raw.?media|secret/i;

function safeValue(value, depth = 0) {
  if (depth > 2 || value == null) return value ?? null;
  if (value instanceof Error) return errorContext(value);
  if (Array.isArray(value)) return value.slice(0, 10).map((item) => safeValue(item, depth + 1));
  if (typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !SENSITIVE_KEYS.test(key))
      .map(([key, item]) => [key, safeValue(item, depth + 1)]),
  );
}

export function uriScheme(uri) {
  const match = String(uri ?? '').match(/^([a-z][a-z\d+.-]*):/i);
  return match ? match[1].toLowerCase() : 'unknown';
}

export function fileExtension(fileNameOrUri) {
  const value = String(fileNameOrUri ?? '').split(/[?#]/)[0];
  const match = value.match(/\.([a-z0-9]{1,8})$/i);
  return match ? match[1].toLowerCase() : 'unknown';
}

export function sanitizedObjectPath(path) {
  const parts = String(path ?? '').split('/').filter(Boolean);
  return parts.length > 1 ? `…/${parts.slice(-2).join('/')}` : 'provided';
}

export function errorContext(error) {
  if (!error) return null;
  return {
    className: error.constructor?.name ?? null,
    name: error.name,
    code: error.code ?? null,
    internalCode: error.code ?? null,
    message: error.message ?? String(error),
    details: error.details ?? null,
    hint: error.hint ?? null,
    status: error.status ?? error.statusCode ?? error.httpStatus ?? null,
    httpStatus: error.status ?? error.statusCode ?? error.httpStatus ?? null,
    stage: error.stage ?? null,
    stack: error.stack ?? null,
    cause: error.cause ? errorContext(error.cause) : null,
  };
}

export function wingShotLog(attemptId, event, context = {}, level = 'debug') {
  const payload = safeValue(context);
  const line = `[WingShot][${attemptId}] ${event}`;
  // This is intentionally scoped to Wing Shot events; do not enable general
  // Metro logging here.
  const logger = console[level] || console.debug;
  logger(line, payload);
}

export function mediaLogContext(media) {
  return {
    platform: typeof navigator !== 'undefined' ? navigator.platform || 'native' : 'native',
    mediaType: media?.kind ?? null,
    mimeType: media?.mimeType ?? null,
    fileExtension: fileExtension(media?.fileName || media?.uri),
    fileSizeBytes: media?.sizeBytes ?? null,
    videoDurationSeconds: media?.durationSeconds ?? null,
    videoDimensions: media?.width && media?.height ? { width: media.width, height: media.height } : null,
    localFileExists: Boolean(media?.uri),
    localFileReadable: typeof media?.getUploadBody === 'function',
    uriScheme: uriScheme(media?.uri),
  };
}
