import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import { AppState, Platform } from 'react-native';
import { supabase } from './supabase';
import { sanitizeAnalyticsMetadata } from './analyticsSchema';
const onboardingStepSix = require('./onboardingStepSix');

const ANON_ID_KEY = 'buffago:analytics:anonymous_id';
const SESSION_ID_KEY = 'buffago:analytics:session_id';
const LAST_ACTIVE_KEY = 'buffago:analytics:last_active_at';
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

let anonymousIdPromise = null;
let sessionIdPromise = null;
let lastAppState = AppState.currentState;

function enabled() {
  return String(process.env.EXPO_PUBLIC_ANALYTICS_DISABLED || '').toLowerCase() !== 'true';
}

function uuid() {
  try {
    return Crypto.randomUUID();
  } catch {
    return `evt_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }
}

const compactMetadata = sanitizeAnalyticsMetadata;

function appVersion() {
  return Constants.expoConfig?.version ?? Constants.manifest?.version ?? null;
}

export async function getAnonymousId() {
  if (!anonymousIdPromise) {
    anonymousIdPromise = (async () => {
      let id = await AsyncStorage.getItem(ANON_ID_KEY);
      if (!id) {
        id = `anon_${uuid()}`;
        await AsyncStorage.setItem(ANON_ID_KEY, id);
      }
      return id;
    })();
  }
  return anonymousIdPromise;
}

export async function getAnalyticsSessionId({ rotate = false } = {}) {
  if (rotate) sessionIdPromise = null;

  if (!sessionIdPromise) {
    sessionIdPromise = (async () => {
      const now = Date.now();
      const [existing, lastActiveRaw] = await Promise.all([
        AsyncStorage.getItem(SESSION_ID_KEY),
        AsyncStorage.getItem(LAST_ACTIVE_KEY),
      ]);

      const lastActive = Number(lastActiveRaw || 0);
      const expired = !Number.isFinite(lastActive) || now - lastActive > SESSION_TIMEOUT_MS;
      const id = rotate || !existing || expired ? uuid() : existing;

      await Promise.all([
        AsyncStorage.setItem(SESSION_ID_KEY, id),
        AsyncStorage.setItem(LAST_ACTIVE_KEY, String(now)),
      ]);

      return id;
    })();
  }

  return sessionIdPromise;
}

export async function rotateAnalyticsSession() {
  return getAnalyticsSessionId({ rotate: true });
}

/** @param {any} options */
export async function trackEvent(options = {}) {
  const {
    eventName,
    screen = null,
    userId = undefined,
    anonymousId = undefined,
    sessionId = undefined,
    stateId = null,
    routeId = null,
    crawlId = null,
    destinationId = null,
    metadata = {},
  } = options;
  if (!enabled() || !eventName) return;

  try {
    const [{ data }, anon, sid] = await Promise.all([
      userId === undefined ? supabase.auth.getSession() : Promise.resolve({ data: null }),
      anonymousId === undefined ? getAnonymousId() : Promise.resolve(anonymousId),
      sessionId === undefined ? getAnalyticsSessionId() : Promise.resolve(sessionId),
    ]);

    const resolvedUserId = userId === undefined ? data?.session?.user?.id ?? null : userId ?? null;

    await AsyncStorage.setItem(LAST_ACTIVE_KEY, String(Date.now()));

    let nextMetadata = compactMetadata({
      screen_name: screen,
      app_version: appVersion(),
      platform: Platform.OS,
      timestamp: new Date().toISOString(),
      ...metadata,
    });

    if (eventName === 'rating_started') {
      const rawStepSixContext = await AsyncStorage.getItem(onboardingStepSix.STEP_SIX_CONTEXT_KEY);
      if (rawStepSixContext) {
        try {
          const stepSixContext = JSON.parse(rawStepSixContext);
          nextMetadata = compactMetadata({
            ...nextMetadata,
            ...onboardingStepSix.buildRatingStartedMetadataFromContext(stepSixContext, {
              source_screen: screen,
            }),
          });
          await AsyncStorage.removeItem(onboardingStepSix.STEP_SIX_CONTEXT_KEY);
        } catch {}
      }
    }

    const payload = {
      event_name: String(eventName),
      screen,
      user_id: resolvedUserId,
      anonymous_id: anon ?? null,
      session_id: sid,
      state_id: stateId ?? null,
      route_id: routeId ?? null,
      crawl_id: crawlId ?? null,
      destination_id: destinationId ?? null,
      platform: Platform.OS,
      app_version: appVersion(),
      metadata: nextMetadata,
    };

    const { error } = await supabase.from('user_events').insert(payload);
    if (error && typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn('[analytics] insert failed', error.message || error);
    }
  } catch (e) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn('[analytics] trackEvent failed', e?.message || e);
    }
  }
}

export async function trackScreenViewed(screen, metadata = {}) {
  return trackEvent({ eventName: 'screen_viewed', screen, metadata });
}

export async function trackPrimaryCtaClicked(screen, ctaName, metadata = {}) {
  return trackEvent({
    eventName: 'primary_cta_clicked',
    screen,
    metadata: { cta_name: ctaName, ...metadata },
  });
}

export async function trackEmptyStateShown(screen, stateName, metadata = {}) {
  return trackEvent({
    eventName: 'empty_state_shown',
    screen,
    metadata: { state: stateName, ...metadata },
  });
}

export async function trackErrorShown(screen, error, metadata = {}) {
  return trackEvent({
    eventName: 'error_shown',
    screen,
    metadata: {
      error_code: error?.code ?? 'unknown',
      ...metadata,
    },
  });
}

export function installAppLifecycleTracking() {
  const sub = AppState.addEventListener('change', async (nextState) => {
    const wasBackground = lastAppState === 'background' || lastAppState === 'inactive';
    lastAppState = nextState;

    if (nextState === 'active' && wasBackground) {
      await rotateAnalyticsSession();
      await trackEvent({ eventName: 'app_opened', metadata: { source: 'foreground' } });
      return;
    }

    if (nextState === 'background' || nextState === 'inactive') {
      await trackEvent({ eventName: 'session_ended', metadata: { app_state: nextState } });
    }
  });

  return () => sub?.remove?.();
}
