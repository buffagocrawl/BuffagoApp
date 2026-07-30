export const WING_SHOT_UPLOAD_STATES = Object.freeze([
  'idle',
  'choosing',
  'locally_validating',
  'ready',
  'authorizing',
  'uploading',
  'server_validating',
  'finalizing',
  'succeeded',
  'failed_retryable',
  'failed_media',
  'failed_auth',
  'cancelled',
]);

const TRANSITIONS = {
  idle: ['choosing', 'ready', 'cancelled'],
  choosing: ['locally_validating', 'idle', 'cancelled'],
  locally_validating: ['ready', 'failed_media', 'failed_auth', 'failed_retryable', 'cancelled'],
  ready: ['authorizing', 'cancelled', 'locally_validating'],
  authorizing: ['uploading', 'failed_auth', 'failed_retryable', 'cancelled'],
  uploading: ['server_validating', 'failed_media', 'failed_retryable', 'cancelled'],
  server_validating: ['finalizing', 'failed_media', 'failed_retryable', 'cancelled'],
  finalizing: ['succeeded', 'failed_retryable', 'failed_media', 'cancelled'],
  succeeded: ['idle'],
  failed_retryable: ['ready', 'authorizing', 'cancelled', 'locally_validating'],
  failed_media: ['choosing', 'idle', 'cancelled'],
  failed_auth: ['authorizing', 'idle', 'cancelled'],
  cancelled: ['idle', 'choosing', 'ready'],
};

export function canTransitionWingShotUpload(from, to) {
  return from === to || Boolean(TRANSITIONS[from]?.includes(to));
}

export function transitionWingShotUpload(from, to) {
  if (!canTransitionWingShotUpload(from, to)) {
    throw new Error(`Invalid Wing Shot upload transition: ${from} -> ${to}`);
  }
  return to;
}

export function failureStateForWingShotError(error) {
  if (String(error?.code ?? '').includes('auth') || error?.httpStatus === 401 || error?.httpStatus === 403) {
    return 'failed_auth';
  }
  if (error?.retryable || error?.httpStatus === 429 || Number(error?.httpStatus) >= 500) {
    return 'failed_retryable';
  }
  return 'failed_media';
}
