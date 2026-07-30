import { wingShotLog } from './wingShotDiagnostics.js';

function safeStatus(error) {
  return Number(error?.status ?? error?.statusCode) || null;
}

async function functionFailure(error) {
  const response = error?.context instanceof Response ? error.context : null;
  let body = null;
  let text = null;
  if (response) {
    try {
      text = await response.clone().text();
      try { body = text ? JSON.parse(text) : null; } catch (_) { /* non-JSON gateway failure */ }
    } catch (_) { /* consumed response remains a handled failure */ }
  }
  const retryAfter = Number(response?.headers?.get?.('retry-after'));
  return { status: safeStatus(error) || response?.status || null, body, text, retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter > 0 ? Math.ceil(retryAfter) : null };
}

function isAuthFailure(status, body) {
  return status === 401 || ['authentication_required', 'invalid_token'].includes(String(body?.code || body?.reason_code || ''));
}

export async function invokeWithOneAuthRefresh(client, functionName, body, correlationId) {
  let refreshed = false;
  let requestAccessToken = null;
  for (;;) {
    const sessionResult = requestAccessToken ? { data: { session: null } } : await client.auth.getSession();
    const session = sessionResult?.data?.session ?? null;
    const accessToken = requestAccessToken || session?.access_token || null;
    const projectRef = String(client?.supabaseUrl || '').match(/^https?:\/\/([^.]+)\./i)?.[1] || null;
    wingShotLog(correlationId, 'function_request_headers', {
      stage: functionName,
      tokenSource: requestAccessToken ? 'refresh_response_access_token' : accessToken ? 'supabase_session_access_token' : 'none',
      bearerPresent: Boolean(accessToken),
      bearerShape: accessToken ? 'jwt_like' : 'absent',
      tokenExpiresAt: session?.expires_at ?? null,
      userId: session?.user?.id ?? null,
      projectRef,
      apikeyPresent: Boolean(client?.supabaseKey || client?.headers?.apikey || client?.headers?.apiKey),
      refreshAttempted: refreshed,
    }, 'debug');
    const result = await client.functions.invoke(functionName, {
      body,
      headers: {
        'x-wing-correlation-id': correlationId,
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...(client?.supabaseKey ? { apikey: client.supabaseKey } : {}),
      },
    });
    if (!result?.error) return result;
    const failure = await functionFailure(result.error);
    if (!refreshed && isAuthFailure(failure.status, failure.body)) {
      refreshed = true;
      wingShotLog(correlationId, 'auth_refresh_started', { stage: functionName, httpStatus: failure.status, reasonCode: failure.body?.code || failure.body?.reason_code || 'gateway_auth_failure' }, 'warn');
      const refreshResult = await client.auth.refreshSession();
      if (refreshResult?.error || !refreshResult?.data?.session?.access_token) {
        wingShotLog(correlationId, 'auth_refresh_failed', { stage: functionName, httpStatus: failure.status, reasonCode: 'authentication_expired' }, 'warn');
        return { ...result, __wingFailure: { ...failure, reasonCode: 'authentication_expired', refreshAttempted: true } };
      }
      requestAccessToken = refreshResult.data.session.access_token;
      wingShotLog(correlationId, 'auth_refresh_succeeded', { stage: functionName, httpStatus: failure.status, reasonCode: 'token_refreshed' }, 'debug');
      continue;
    }
    return { ...result, __wingFailure: { ...failure, reasonCode: failure.body?.code || failure.body?.reason_code || null, refreshAttempted: refreshed } };
  }
}
