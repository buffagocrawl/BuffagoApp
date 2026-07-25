export const ROOT_RETRY_SESSION_KEY = 'buffago:root-error-retries';
export const ROOT_RETRY_LIMIT = 2;

export function canRetryInSession(retryCount) {
  return Number(retryCount || 0) < ROOT_RETRY_LIMIT;
}

export function nextRetryCount(retryCount) {
  return Number(retryCount || 0) + 1;
}
