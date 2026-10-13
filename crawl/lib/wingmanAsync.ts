// Bound the entire operation, including response bodies and client callbacks.
// A timed-out write may have committed: retries must use the shared idempotent RPC.
export function bounded<T>(operation: PromiseLike<T>, ms = 45000, signal?: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const cancel = () => { cleanup(); reject(new Error('Wingman request cancelled.')); };
    const timer = setTimeout(() => { cleanup(); reject(new Error('Wingman took too long. Please try again; your details are still here.')); }, ms);
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', cancel); };
    // Always observe the underlying promise, even when already cancelled.
    Promise.resolve(operation).then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
    if (signal?.aborted) { cancel(); return; }
    signal?.addEventListener('abort', cancel, { once: true });
  });
}

export async function wingmanRequest<T>(start: (signal: AbortSignal) => PromiseLike<T>, ms = 45000, signal?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  signal?.addEventListener('abort', abort, { once: true });
  try {
    if (controller.signal.aborted) throw new Error('Wingman request cancelled.');
    return await bounded(start(controller.signal), ms, controller.signal);
  }
  finally { controller.abort(); signal?.removeEventListener('abort', abort); }
}

export async function errorBody(error: any): Promise<any> {
  try { return await bounded(error?.context?.clone().json(), 2000); } catch { return null; }
}

export async function wingmanError(error: any): Promise<string> {
  const status = error?.context?.status;
  if (status === 401) return 'Your session could not be verified. Sign in again or retry as a guest.';
  if (status === 429) return 'Too many requests. Give it a little time and try again.';
  if (status >= 500) return 'Wingman is temporarily unavailable. Please try again.';
  const body = await errorBody(error);
  return typeof body?.error === 'string' ? body.error : error?.message || 'Wingman could not complete that request. Please try again.';
}
