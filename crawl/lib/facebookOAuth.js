import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { dbg } from './debugLog';
import { trackEvent } from './analytics';
import { supabase } from './supabase';

export const OAUTH_RETURN_URL_KEY = 'buffago:oauth:return_url';
export const OAUTH_RETURN_PATH_KEY = 'buffago:oauth:return_path';
export const OAUTH_LINK_USER_ID_KEY = 'buffago:oauth:link_user_id';
export const OAUTH_FLOW_ID_KEY = 'buffago:oauth:flow_id';
export const OAUTH_FLOW_MODE_KEY = 'buffago:oauth:flow_mode';
export const OAUTH_FLOW_STARTED_AT_KEY = 'buffago:oauth:started_at';

const ANDROID_REDIRECT_GRACE_MS = 1800;
const NATIVE_FACEBOOK_GRACE_MS = 2400;

const elapsedMs = (startedAt) => Math.max(0, Date.now() - startedAt);

function facebookNativeUrl(authUrl) {
  if (!authUrl) return null;
  try {
    return `fb://facewebmodal/f?href=${encodeURIComponent(String(authUrl))}`;
  } catch {
    return null;
  }
}

async function emitFacebookLog(eventName, detail = {}, screen = null) {
  const payload = {
    provider: 'facebook',
    device_platform: Platform.OS,
    ...detail,
  };

  try {
    console.info(`[facebook] ${eventName}`, payload);
  } catch {}

  await Promise.allSettled([
    dbg(eventName, payload, 'facebook'),
    trackEvent({ eventName, screen, metadata: payload }),
  ]);
}

export function getFacebookRedirectUrl() {
  const created = Linking.createURL('auth/callback');
  return Constants.appOwnership === 'expo' ? created : 'buffago://auth/callback';
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
  await emitFacebookLog(
    'facebook_link_start',
    {
      ...common,
      target_url: null,
      redirect_url: redirectUrl,
      app_info: facebookAppInfo(),
    },
    screen
  );
  await dbg('facebook_button_tapped', {
    ...common,
    ...facebookAppInfo(),
    hasSession: Boolean(currentUserId),
    redirect: describeUrl(redirectUrl),
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
    const nativeUrl = facebookNativeUrl(authUrl);
    await emitFacebookLog(
      'facebook_link_native_attempt',
      {
        ...common,
        native_url: nativeUrl,
        target_url: authUrl,
        redirect_url: redirectUrl,
      },
      screen
    );

    if (nativeUrl) {
      try {
        await Linking.openURL(nativeUrl);
        await Promise.race([redirectPromise, wait(NATIVE_FACEBOOK_GRACE_MS)]);
        if (!observedRedirectUrl) {
          await emitFacebookLog(
            'facebook_link_timeout',
            {
              ...common,
              phase: 'native_wait',
              target_url: authUrl,
              redirect_url: redirectUrl,
            },
            screen
          );
        }
      } catch (error) {
        await emitFacebookLog(
          'facebook_link_failure',
          {
            ...common,
            phase: 'native_open',
            error: error?.message || 'Native Facebook app open failed',
            stack: sanitizeAuthError(error).stack,
            target_url: authUrl,
            redirect_url: redirectUrl,
          },
          screen
        );
      }
    }

    if (observedRedirectUrl) {
      await AsyncStorage.setItem(OAUTH_RETURN_URL_KEY, observedRedirectUrl);
      await dbg('facebook_callback_handoff_ready', {
        ...common,
        callback: describeUrl(observedRedirectUrl),
        elapsedMs: elapsedMs(startedAt),
      }, 'facebook');
      return { outcome: 'callback', callbackUrl: observedRedirectUrl, flowId, startedAt };
    }

    if (!observedRedirectUrl) {
      await emitFacebookLog(
        'facebook_link_browser_opened',
        {
          ...common,
          target_url: authUrl,
          redirect_url: redirectUrl,
        },
        screen
      );
    }

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
