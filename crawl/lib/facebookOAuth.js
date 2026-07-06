import AsyncStorage from '@react-native-async-storage/async-storage';
import { makeRedirectUri } from 'expo-auth-session';
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { dbg, sanitizeForLogging } from './debugLog';
import { trackEvent } from './analytics';
import { supabase } from './supabase';

export const OAUTH_RETURN_URL_KEY = 'buffago:oauth:return_url';
export const OAUTH_RETURN_PATH_KEY = 'buffago:oauth:return_path';
export const OAUTH_LINK_USER_ID_KEY = 'buffago:oauth:link_user_id';
export const OAUTH_FLOW_ID_KEY = 'buffago:oauth:flow_id';
export const OAUTH_FLOW_MODE_KEY = 'buffago:oauth:flow_mode';
export const OAUTH_FLOW_STARTED_AT_KEY = 'buffago:oauth:started_at';
export const OAUTH_LINK_SESSION_KEY = 'buffago:oauth:link_session';

const ANDROID_REDIRECT_GRACE_MS = 1800;

const elapsedMs = (startedAt) => Math.max(0, Date.now() - startedAt);

async function emitFacebookLog(eventName, detail = {}, screen = null) {
  const payload = sanitizeForLogging({
    provider: 'facebook',
    device_platform: Platform.OS,
    ...detail,
  });

  try {
    console.info(`[facebook] ${eventName}`, payload);
  } catch {}

  await Promise.allSettled([
    dbg(eventName, payload, 'facebook'),
    trackEvent({ eventName, screen, metadata: payload }),
  ]);
}

export function getFacebookRedirectUrl() {
  if (Constants.appOwnership === 'expo') {
    return makeRedirectUri({ path: 'auth/callback' });
  }

  return makeRedirectUri({
    scheme: 'buffago',
    path: 'auth/callback',
  });
}

export function getFacebookRedirectDiagnostics() {
  return {
    makeRedirectUri: getFacebookRedirectUrl(),
    linkingCreateUrl: Linking.createURL('auth/callback'),
    appOwnership: Constants.appOwnership || null,
    executionEnvironment: Constants.executionEnvironment || null,
  };
}

export function describeUrl(rawUrl) {
  try {
    const parsed = new URL(String(rawUrl));
    const query = parsed.searchParams;
    const fragment = new URLSearchParams(parsed.hash.replace(/^#/, ''));
    return {
      protocol: parsed.protocol.replace(':', ''),
      host: parsed.host,
      path: parsed.pathname,
      hasCode: query.has('code'),
      hasError: query.has('error') || query.has('error_code') || fragment.has('error'),
      hasAccessToken: fragment.has('access_token'),
      hasRefreshToken: fragment.has('refresh_token'),
      hasIdentityId: query.has('identity_id') || fragment.has('identity_id'),
      hasProvider: query.has('provider'),
      redirectToScheme:
        query.get('redirect_to')?.split(':')?.[0] ||
        query.get('redirect_uri')?.split(':')?.[0] ||
        null,
      queryKeys: [...query.keys()].filter(
        (key) => !['code', 'access_token', 'refresh_token', 'token', 'state'].includes(key)
      ),
      fragmentKeys: [...fragment.keys()].filter(
        (key) => !['code', 'access_token', 'refresh_token', 'token', 'state'].includes(key)
      ),
    };
  } catch {
    return { parseError: true };
  }
}

export function sanitizeAuthError(error) {
  return {
    name: error?.name || null,
    code: error?.code || error?.status || null,
    message: String(error?.message || error || 'unknown').slice(0, 220),
    stack:
      typeof error?.stack === 'string'
        ? error.stack.split('\n').slice(0, 4).join('\n').slice(0, 500)
        : null,
  };
}

export function facebookAppInfo() {
  return {
    platform: Platform.OS,
    appOwnership: Constants.appOwnership || null,
    executionEnvironment: Constants.executionEnvironment || null,
    appVersion: Constants.expoConfig?.version || Constants.nativeAppVersion || null,
    build:
      Constants.nativeBuildVersion ||
      Constants.expoConfig?.android?.versionCode ||
      Constants.expoConfig?.ios?.buildNumber ||
      null,
    packageName:
      Constants.expoConfig?.android?.package ||
      Constants.expoConfig?.ios?.bundleIdentifier ||
      null,
  };
}

export function facebookConfigChecklist(redirectUrl) {
  return {
    oauthSurface: Platform.OS === 'android' ? 'chrome_custom_tabs' : 'auth_session',
    androidPackage: 'com.buffago.app',
    appScheme: 'buffago',
    redirectUrl: describeUrl(redirectUrl),
    redirectDiagnostics: getFacebookRedirectDiagnostics(),
    requiredAndroidIntent: 'buffago://auth/callback',
    requiredSupabaseRedirectAllowListEntry: 'buffago://auth/callback',
    requiredSupabaseProvider: 'Facebook provider enabled with App ID and App Secret',
    requiredFacebookOauthRedirect: `${process.env.EXPO_PUBLIC_SUPABASE_URL || '<supabase-url>'}/auth/v1/callback`,
  };
}

async function storeFlowState({ flowId, mode, returnPath, currentUserId, startedAt }) {
  await AsyncStorage.multiSet([
    [OAUTH_FLOW_ID_KEY, flowId],
    [OAUTH_FLOW_MODE_KEY, mode],
    [OAUTH_FLOW_STARTED_AT_KEY, String(startedAt)],
    [OAUTH_RETURN_PATH_KEY, returnPath],
  ]);
  if (mode === 'link_identity' && currentUserId) {
    await AsyncStorage.setItem(OAUTH_LINK_USER_ID_KEY, currentUserId);
  } else {
    await AsyncStorage.removeItem(OAUTH_LINK_USER_ID_KEY);
  }
}

export async function readOAuthFlowState() {
  const entries = await AsyncStorage.multiGet([
    OAUTH_FLOW_ID_KEY,
    OAUTH_FLOW_MODE_KEY,
    OAUTH_FLOW_STARTED_AT_KEY,
    OAUTH_RETURN_PATH_KEY,
    OAUTH_LINK_USER_ID_KEY,
  ]);

  const map = Object.fromEntries(entries);
  return {
    flowId: map[OAUTH_FLOW_ID_KEY] || null,
    mode: map[OAUTH_FLOW_MODE_KEY] || null,
    startedAt: Number(map[OAUTH_FLOW_STARTED_AT_KEY]) || null,
    returnPath: map[OAUTH_RETURN_PATH_KEY] || null,
    expectedUserId: map[OAUTH_LINK_USER_ID_KEY] || null,
  };
}

export async function isOAuthFlowInProgress({ mode = null } = {}) {
  const flowState = await readOAuthFlowState();
  if (!flowState.mode) return false;
  if (!mode) return true;
  return flowState.mode === mode;
}

async function storeLinkSessionSnapshot(session, { flowId, screen } = {}) {
  if (!session?.user?.id || !session?.access_token || !session?.refresh_token) {
    await AsyncStorage.removeItem(OAUTH_LINK_SESSION_KEY);
    return;
  }

  const snapshot = {
    flowId: flowId || null,
    screen: screen || null,
    userId: session.user.id,
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    capturedAt: new Date().toISOString(),
  };

  await AsyncStorage.setItem(OAUTH_LINK_SESSION_KEY, JSON.stringify(snapshot));
}

export async function getStoredLinkSessionSnapshot() {
  const raw = await AsyncStorage.getItem(OAUTH_LINK_SESSION_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (!parsed?.userId || !parsed?.accessToken || !parsed?.refreshToken) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function clearStoredLinkSessionSnapshot() {
  await AsyncStorage.removeItem(OAUTH_LINK_SESSION_KEY);
}

export async function clearFacebookFlowState() {
  try {
    await AsyncStorage.multiRemove([
      OAUTH_RETURN_URL_KEY,
      OAUTH_RETURN_PATH_KEY,
      OAUTH_LINK_USER_ID_KEY,
      OAUTH_FLOW_ID_KEY,
      OAUTH_FLOW_MODE_KEY,
      OAUTH_FLOW_STARTED_AT_KEY,
    ]);
    await clearStoredLinkSessionSnapshot();
  } catch {
    // Cleanup must never replace the original auth result.
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runFacebookOAuth({
  mode,
  currentUserId = null,
  returnPath,
  screen,
}) {
  const startedAt = Date.now();
  const flowId = `fb_${startedAt}_${Math.random().toString(16).slice(2, 8)}`;
  const redirectUrl = getFacebookRedirectUrl();
  const common = { flowId, mode, screen };

  await storeFlowState({ flowId, mode, returnPath, currentUserId, startedAt });
  if (mode === 'link_identity') {
    const { data: sessionData } = await supabase.auth.getSession();
    await storeLinkSessionSnapshot(sessionData?.session ?? null, { flowId, screen });
  } else {
    await clearStoredLinkSessionSnapshot();
  }
  await emitFacebookLog(
    'facebook_link_start',
    {
      ...common,
      target_url: null,
      redirect_url: redirectUrl,
      redirect_diagnostics: getFacebookRedirectDiagnostics(),
      app_info: facebookAppInfo(),
    },
    screen
  );
  await dbg('facebook_button_tapped', {
    ...common,
    ...facebookAppInfo(),
    hasSession: Boolean(currentUserId),
    redirect: describeUrl(redirectUrl),
    redirectDiagnostics: getFacebookRedirectDiagnostics(),
    elapsedMs: elapsedMs(startedAt),
  }, 'facebook');

  let customTabsInfo = null;
  if (Platform.OS === 'android' && WebBrowser.getCustomTabsSupportingBrowsersAsync) {
    try {
      customTabsInfo = await WebBrowser.getCustomTabsSupportingBrowsersAsync();
    } catch (error) {
      customTabsInfo = { error: sanitizeAuthError(error) };
    }
  }

  await dbg('facebook_oauth_request_started', {
    ...common,
    redirect: describeUrl(redirectUrl),
    redirectDiagnostics: getFacebookRedirectDiagnostics(),
    app: facebookAppInfo(),
    customTabs: customTabsInfo
      ? {
          preferredBrowserPackage: customTabsInfo.preferredBrowserPackage || null,
          defaultBrowserPackage: customTabsInfo.defaultBrowserPackage || null,
          browserPackageCount: customTabsInfo.browserPackages?.length ?? null,
          servicePackageCount: customTabsInfo.servicePackages?.length ?? null,
          error: customTabsInfo.error || null,
        }
      : null,
    elapsedMs: elapsedMs(startedAt),
  }, 'facebook');

  const options = {
    redirectTo: redirectUrl,
    scopes: 'public_profile,email',
    skipBrowserRedirect: true,
  };

  await dbg(
    'facebook_oauth_method_selected',
    {
      ...common,
      method: mode === 'link_identity' ? 'linkIdentity' : 'signInWithOAuth',
      currentUserId,
      redirect: describeUrl(redirectUrl),
      elapsedMs: elapsedMs(startedAt),
    },
    'facebook'
  );

  const response =
    mode === 'link_identity'
      ? await supabase.auth.linkIdentity({ provider: 'facebook', options })
      : await supabase.auth.signInWithOAuth({ provider: 'facebook', options });

  if (response.error) {
    await emitFacebookLog(
      'facebook_link_failure',
      {
        ...common,
        phase: 'oauth_request',
        error: response.error?.message || 'Unknown OAuth error',
        stack: sanitizeAuthError(response.error).stack,
        redirect_url: redirectUrl,
        target_url: null,
      },
      screen
    );
    await dbg('facebook_oauth_request_failed', {
      ...common,
      ...sanitizeAuthError(response.error),
      elapsedMs: elapsedMs(startedAt),
    }, 'facebook');
    throw response.error;
  }

  const authUrl = response.data?.url || null;
  if (!redirectUrl) {
    await emitFacebookLog(
      'facebook_link_missing_redirect',
      {
        ...common,
        target_url: authUrl,
        redirect_url: null,
      },
      screen
    );
    throw new Error('Facebook redirect URL is missing');
  }

  await emitFacebookLog(
    'facebook_link_open_url',
    {
      ...common,
      target_url: authUrl,
      redirect_url: redirectUrl,
    },
    screen
  );

  await dbg('facebook_oauth_request_succeeded', {
    ...common,
    hasProviderUrl: Boolean(authUrl),
    providerUrl: authUrl ? describeUrl(authUrl) : null,
    authorizeUrl: authUrl,
    redirectDiagnostics: getFacebookRedirectDiagnostics(),
    elapsedMs: elapsedMs(startedAt),
  }, 'facebook');
  if (!authUrl) {
    await emitFacebookLog(
      'facebook_link_failure',
      {
        ...common,
        phase: 'oauth_url_missing',
        error: 'No Facebook provider URL returned from Supabase',
        stack: null,
        target_url: null,
        redirect_url: redirectUrl,
      },
      screen
    );
    throw new Error('No Facebook provider URL returned from Supabase');
  }

  try {
    await WebBrowser.warmUpAsync?.();
    await WebBrowser.mayInitWithUrlAsync?.(authUrl);
  } catch (error) {
    await emitFacebookLog(
      'facebook_link_failure',
      {
        ...common,
        phase: 'browser_warmup',
        error: error?.message || 'Browser warmup failed',
        stack: sanitizeAuthError(error).stack,
        target_url: authUrl,
        redirect_url: redirectUrl,
      },
      screen
    );
    await dbg('facebook_browser_warmup_failed', {
      ...common,
      ...sanitizeAuthError(error),
      elapsedMs: elapsedMs(startedAt),
    }, 'facebook');
  }

  let observedRedirectUrl = null;
  let resolveRedirect;
  const redirectPromise = new Promise((resolve) => {
    resolveRedirect = resolve;
  });
  const redirectSub = Linking.addEventListener('url', ({ url }) => {
    dbg('facebook_linking_event_observed', {
      ...common,
      url: url || null,
      parsed: url ? describeUrl(url) : null,
      matchesRedirect: Boolean(url && String(url).startsWith(redirectUrl)),
      elapsedMs: elapsedMs(startedAt),
    }, 'facebook');
    if (!url || !String(url).startsWith(redirectUrl)) return;
    observedRedirectUrl = url;
    AsyncStorage.setItem(OAUTH_RETURN_URL_KEY, url).catch(() => {});
    emitFacebookLog(
      'facebook_link_callback_received',
      {
        ...common,
        callback: describeUrl(url),
        target_url: authUrl,
        redirect_url: redirectUrl,
      },
      screen
    ).catch(() => {});
    dbg('facebook_redirect_deep_link_received', {
      ...common,
      callback: describeUrl(url),
      elapsedMs: elapsedMs(startedAt),
    }, 'facebook');
    resolveRedirect?.(url);
  });

  await dbg('facebook_browser_session_opening', {
    ...common,
    providerUrl: describeUrl(authUrl),
    redirect: describeUrl(redirectUrl),
    elapsedMs: elapsedMs(startedAt),
  }, 'facebook');

  let result;
  try {
    await emitFacebookLog(
      'facebook_browser_session_selected',
      {
        ...common,
        target_url: authUrl,
        redirect_url: redirectUrl,
        surface: Platform.OS === 'android' ? 'chrome_custom_tabs' : 'auth_session',
      },
      screen
    );

    await emitFacebookLog(
      'facebook_link_browser_opened',
      {
        ...common,
        target_url: authUrl,
        redirect_url: redirectUrl,
      },
      screen
    );

    result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
    await dbg('facebook_browser_session_result', {
      ...common,
      type: result?.type || null,
      hasUrl: Boolean(result?.url),
      resultUrl: result?.url ? describeUrl(result.url) : null,
      observedRedirect: Boolean(observedRedirectUrl),
      elapsedMs: elapsedMs(startedAt),
    }, 'facebook');

    if (!result?.url && !observedRedirectUrl && Platform.OS === 'android') {
      await dbg('facebook_android_redirect_grace_started', {
        ...common,
        durationMs: ANDROID_REDIRECT_GRACE_MS,
        resultType: result?.type || null,
        elapsedMs: elapsedMs(startedAt),
      }, 'facebook');
      await Promise.race([redirectPromise, wait(ANDROID_REDIRECT_GRACE_MS)]);
    }
  } catch (error) {
    await emitFacebookLog(
      'facebook_link_failure',
      {
        ...common,
        phase: 'browser_session',
        error: error?.message || 'Browser session failed',
        stack: sanitizeAuthError(error).stack,
        target_url: authUrl,
        redirect_url: redirectUrl,
      },
      screen
    );
    await dbg('facebook_browser_session_error', {
      ...common,
      ...sanitizeAuthError(error),
      elapsedMs: elapsedMs(startedAt),
    }, 'facebook');
    throw error;
  } finally {
    redirectSub?.remove?.();
    try {
      await WebBrowser.coolDownAsync?.();
    } catch {}
  }

  const callbackUrl = result?.url || observedRedirectUrl;
  if (callbackUrl) {
    await AsyncStorage.setItem(OAUTH_RETURN_URL_KEY, callbackUrl);
    await dbg('facebook_callback_handoff_ready', {
      ...common,
      callback: describeUrl(callbackUrl),
      elapsedMs: elapsedMs(startedAt),
    }, 'facebook');
    return { outcome: 'callback', callbackUrl, flowId, startedAt };
  }

  const outcome =
    result?.type === 'cancel' || result?.type === 'dismiss' ? 'cancelled' : 'failed';
  if (outcome === 'cancelled') {
    await emitFacebookLog(
      'facebook_link_cancelled',
      {
        ...common,
        browser_result_type: result?.type || null,
        target_url: authUrl,
        redirect_url: redirectUrl,
        observed_redirect: Boolean(observedRedirectUrl),
      },
      screen
    );
  } else {
    await emitFacebookLog(
      'facebook_link_timeout',
      {
        ...common,
        browser_result_type: result?.type || null,
        target_url: authUrl,
        redirect_url: redirectUrl,
        observed_redirect: Boolean(observedRedirectUrl),
      },
      screen
    );
  }
  await dbg('facebook_flow_finished', {
    ...common,
    outcome,
    browserResultType: result?.type || null,
    config: facebookConfigChecklist(redirectUrl),
    elapsedMs: elapsedMs(startedAt),
  }, 'facebook');
  await clearFacebookFlowState();
  return { outcome, callbackUrl: null, flowId, startedAt, resultType: result?.type || null };
}
