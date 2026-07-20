export const CALLBACK_TIMEOUT_MS = 15000;

export function resolveCallbackFallbackRoute({ returnPath = null, mode = null } = {}) {
  if (returnPath) return returnPath;
  if (mode === 'link_identity') return '/user';
  return '/auth/login';
}

export function createCallbackTimeoutError(provider = null) {
  if (provider === 'google') {
    return new Error('Google sign-in took too long to finish. Please return to BuffaGo and try again.');
  }

  if (provider === 'facebook') {
    return new Error('Facebook sign-in took too long to finish. Please return to BuffaGo and try again.');
  }

  return new Error('Sign-in took too long to finish. Please return to BuffaGo and try again.');
}

export async function withCallbackTimeout(promise, provider, timeoutMs = CALLBACK_TIMEOUT_MS) {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(createCallbackTimeoutError(provider)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId);
  }
}
