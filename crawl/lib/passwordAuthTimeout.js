export const PASSWORD_AUTH_TIMEOUT_MS = 15000;

export function createPasswordAuthTimeoutError() {
  const error = new Error('Sign-in timed out. Check your connection and try again.');
  error.code = 'PASSWORD_AUTH_TIMEOUT';
  return error;
}

export async function withPasswordAuthTimeout(promise, timeoutMs = PASSWORD_AUTH_TIMEOUT_MS) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(createPasswordAuthTimeoutError()), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
