export const wingShotHeaders = { 'content-type': 'application/json', 'cache-control': 'no-store' };

export function correlationId(request: Request, body: any = {}) {
  return String(request.headers.get('x-wing-correlation-id') || body?.correlationId || 'unknown');
}

export function response(status: number, body: Record<string, unknown>, retryAfterSeconds?: number) {
  const headers = new Headers(wingShotHeaders);
  if (status === 429 && retryAfterSeconds && retryAfterSeconds > 0) headers.set('retry-after', String(Math.ceil(retryAfterSeconds)));
  return new Response(JSON.stringify(body), { status, headers });
}

export function failure(request: Request, code: string, message: string, stage: string, status: number, body: any = {}, options: { retryable?: boolean; retryAfterSeconds?: number } = {}) {
  return response(status, {
    ok: false,
    code,
    message,
    stage,
    retryable: options.retryable ?? (status >= 500 || status === 429),
    ...(options.retryAfterSeconds ? { retryAfterSeconds: Math.ceil(options.retryAfterSeconds) } : {}),
    correlationId: correlationId(request, body),
  }, options.retryAfterSeconds);
}

export function bearerToken(request: Request) {
  return request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1] || null;
}

export function safePathFingerprint(path: unknown) {
  const parts = String(path || '').split('/');
  return parts.length > 1 ? `…/${parts.slice(-2).join('/')}` : 'provided';
}
