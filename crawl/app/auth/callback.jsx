// app/auth/callback.jsx
import { useEffect, useRef, useState } from 'react';
import { View, ActivityIndicator, Text, Platform } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Linking from 'expo-linking';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../lib/supabase';
import { dbg } from '../../lib/debugLog';
import { trackEvent } from '../../lib/analytics';
import {
  clearStoredLinkSessionSnapshot,
  clearFacebookFlowState,
  describeUrl,
  getStoredLinkSessionSnapshot,
  isOAuthFlowInProgress,
  OAUTH_FLOW_ID_KEY,
  OAUTH_FLOW_MODE_KEY,
  OAUTH_FLOW_STARTED_AT_KEY,
  OAUTH_LINK_USER_ID_KEY,
  OAUTH_RETURN_PATH_KEY,
  OAUTH_RETURN_URL_KEY,
  sanitizeAuthError,
} from '../../lib/facebookOAuth';
import {
  grantFacebookLinkRewardOnce,
  persistFacebookConnection,
  refreshLinkedProviders,
} from '../../lib/socialAccounts';
import { Button, useTheme } from 'react-native-paper';

// Onboarding keys (match OnboardingFlow)
const ONBOARDING_SEED_RATING_KEY = 'buffago:onboarding:seed_rating';
const ONBOARDING_DEST_SUGGESTION_KEY = 'buffago:onboarding:dest_suggestion';

const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,20}$/;

async function restoreLinkSessionSnapshot(snapshot, flowId) {
  if (!snapshot?.accessToken || !snapshot?.refreshToken) {
    throw new Error('Missing saved link session snapshot');
  }

  const { data, error } = await supabase.auth.setSession({
    access_token: snapshot.accessToken,
    refresh_token: snapshot.refreshToken,
  });

  if (error) {
    await dbg(
      'facebook_link_session_restore_failed',
      {
        flowId,
        snapshotUserId: snapshot?.userId || null,
        ...sanitizeAuthError(error),
      },
      'facebook'
    );
    throw error;
  }

  await dbg(
    'facebook_link_session_restore_succeeded',
    {
      flowId,
      snapshotUserId: snapshot?.userId || null,
      restoredUserId: data?.session?.user?.id || null,
    },
    'facebook'
  );

  return data?.session ?? null;
}

function safeParseUrl(url) {
  if (!url || typeof url !== 'string') return { query: {}, fragment: {}, hasFragment: false };

  const out = { query: {}, fragment: {}, hasFragment: false };

  const [base, frag] = url.split('#');
  if (frag && frag.length > 0) {
    out.hasFragment = true;
    const fragParams = new URLSearchParams(frag);
    for (const [k, v] of fragParams.entries()) out.fragment[k] = v;
  }

  const qIndex = base.indexOf('?');
  if (qIndex >= 0) {
    const qs = base.slice(qIndex + 1);
    const qParams = new URLSearchParams(qs);
    for (const [k, v] of qParams.entries()) out.query[k] = v;
  }

  return out;
}

function secretSummary(value) {
  if (typeof value !== 'string' || value.length === 0) {
    return { present: false, length: 0 };
  }

  return {
    present: true,
    length: value.length,
    prefix: value.slice(0, 4),
    suffix: value.slice(-4),
  };
}

// Same helper Ratings screen uses
const deriveStateCode = (address) => {
  if (!address || typeof address !== 'string') return null;

  const m = address.match(/,\s*([A-Z]{2})\s+\d{5}(-\d{4})?/);
  if (m) return m[1];

  const parts = address.split(',');
  for (let i = parts.length - 1; i >= 0; i--) {
    const token = parts[i].trim();
    const m2 = token.match(/^([A-Z]{2})(\s*\d{5})?$/i);
    if (m2) return m2[1].toUpperCase();
  }

  return null;
};

const toScoreOrNull = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const c = Math.round(n);
  if (c < 1 || c > 10) return null;
  return c;
};

const pickDisplayName = (user) => {
  const md = user?.user_metadata || {};
  return md.username || md.full_name || md.name || md.display_name || md.preferred_username || '';
};

const normalizeUsername = (raw) => {
  const base = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 20);

  if (base.length >= 3 && USERNAME_REGEX.test(base)) return base;
  return `user_${Math.floor(Math.random() * 90000 + 10000)}`;
};

// Only fill username if missing, always set avatar_url if we have it
const upsertProfileFromAuth = async (user) => {
  const userId = user?.id;
  if (!userId) return;

  const displayName = pickDisplayName(user);
  const desiredUsername = normalizeUsername(displayName);

  const avatarUrl = user?.user_metadata?.avatar_url || user?.user_metadata?.picture || null;

  const { data: existing, error: readErr } = await supabase
    .from('users')
    .select('username, avatar_url')
    .eq('user_id', userId)
    .maybeSingle();

  const existingUsername = readErr ? null : existing?.username || null;
  const existingAvatar = readErr ? null : existing?.avatar_url || null;

  const wantsUsername = !existingUsername || String(existingUsername).trim().length === 0;
  const wantsAvatar = !!avatarUrl && avatarUrl !== existingAvatar;

  if (!wantsUsername && !wantsAvatar) return;

  const payload = { user_id: userId };
  if (wantsUsername) payload.username = desiredUsername;
  if (wantsAvatar) payload.avatar_url = avatarUrl;

  for (let attempt = 0; attempt < 4; attempt++) {
    const tryPayload = { ...payload };

    if (wantsUsername && attempt > 0) {
      const suffix = String(Math.floor(Math.random() * 900 + 100));
      const base = desiredUsername.slice(0, Math.max(0, 20 - (suffix.length + 1)));
      tryPayload.username = `${base}_${suffix}`.slice(0, 20);
    }

    const { error: upErr } = await supabase.from('users').upsert(tryPayload, { onConflict: 'user_id' });
    if (!upErr) return;

    const msg = String(upErr.message || '').toLowerCase();
    const isUnique = msg.includes('duplicate') || msg.includes('unique');

    if (!wantsUsername || !isUnique) throw upErr;
  }
};

// Grants exactly 1 coin for onboarding seed bonus, only once per user
const grantOnboardingSeedCoinIfNeeded = async (userId) => {
  if (!userId) return;

  const { data: existing, error: checkErr } = await supabase
    .from('buffacoin_ledger')
    .select('id')
    .eq('user_id', userId)
    .eq('reason', 'onboarding_seed_bonus')
    .limit(1);

  if (checkErr) return;
  if (Array.isArray(existing) && existing.length > 0) return;

  await supabase.from('buffacoin_ledger').insert({
    user_id: userId,
    delta: 1,
    reason: 'onboarding_seed_bonus',
    created_at: new Date().toISOString(),
  });
};

const applyOnboardingDestinationSuggestionIfAny = async (userId) => {
  try {
    const raw = await AsyncStorage.getItem(ONBOARDING_DEST_SUGGESTION_KEY);
    if (!raw) return;

    let sug = null;
    try {
      sug = JSON.parse(raw);
    } catch {
      await AsyncStorage.removeItem(ONBOARDING_DEST_SUGGESTION_KEY);
      return;
    }

    const name = String(sug?.restaurant_name || '').trim();
    if (!name) {
      await AsyncStorage.removeItem(ONBOARDING_DEST_SUGGESTION_KEY);
      return;
    }

    const { error } = await supabase.from('destination_suggestions').insert({
      user_id: userId,
      state_id: sug?.state_id ?? null,
      restaurant_name: name,
      address: sug?.address ?? null,
    });

    if (!error) await AsyncStorage.removeItem(ONBOARDING_DEST_SUGGESTION_KEY);
  } catch {
    // non blocking
  }
};

const applyOnboardingSeedRatingIfAny = async (userId) => {
  try {
    const raw = await AsyncStorage.getItem(ONBOARDING_SEED_RATING_KEY);
    if (!raw) return;

    let seed = null;
    try {
      seed = JSON.parse(raw);
    } catch {
      await AsyncStorage.removeItem(ONBOARDING_SEED_RATING_KEY);
      return;
    }

    const destinationId = seed?.destination_id;
    if (!destinationId) {
      await AsyncStorage.removeItem(ONBOARDING_SEED_RATING_KEY);
      return;
    }

    let stateCode = String(seed?.state_code || '').trim().toUpperCase();

    if (!stateCode) {
      const { data: dest, error: destErr } = await supabase
        .from('destinations')
        .select('address')
        .eq('id', destinationId)
        .maybeSingle();

      if (!destErr) stateCode = deriveStateCode(dest?.address || '') || '';
    }

    if (!stateCode) return;

    await grantOnboardingSeedCoinIfNeeded(userId);

    const { error: spendErr } = await supabase.rpc('buffacoins_spend_for_wingdex', {
      p_destination_id: destinationId,
      p_state_code: stateCode,
    });

    if (spendErr) return;

    const { data: crawlId, error: crawlErr } = await supabase.rpc('buffacoins_get_or_create_token_crawl', {
      p_state_code: stateCode,
    });

    if (crawlErr || !crawlId) return;

    const insertPayload = {
      crawl_id: crawlId,
      destination_id: destinationId,
      user_id: userId,
      crispiness: toScoreOrNull(seed?.crispiness),
      sauce: toScoreOrNull(seed?.sauce),
      meat: toScoreOrNull(seed?.meat),
      overall: toScoreOrNull(seed?.overall),
      would_order_again: typeof seed?.would_order_again === 'boolean' ? seed.would_order_again : null,
      is_buffacoin: true,
      created_at: seed?.created_at || new Date().toISOString(),
    };

    const { error: insErr } = await supabase.from('destination_ratings').insert(insertPayload);
    if (!insErr) await AsyncStorage.removeItem(ONBOARDING_SEED_RATING_KEY);
  } catch {
    // non blocking
  }
};

export default function AuthCallback() {
  const router = useRouter();
  const { colors } = useTheme();
  const params = useLocalSearchParams();
  const liveUrl = Linking.useURL();

  const [errMsg, setErrMsg] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [processing, setProcessing] = useState(true);
  const [fallbackRoute, setFallbackRoute] = useState('/auth/login');
  const ranRef = useRef(false);

  useEffect(() => {
    ranRef.current = false;
  }, [attempt]);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    let cancelled = false;

    const finish = async () => {
      const callbackStartedAt = Date.now();
      let flowId = null;
      let flowMode = null;
      let flowStartedAt = callbackStartedAt;
      setProcessing(true);
      setErrMsg('');
      try {
        console.info('[auth/callback] processing started');
        flowId = await AsyncStorage.getItem(OAUTH_FLOW_ID_KEY);
        flowMode = await AsyncStorage.getItem(OAUTH_FLOW_MODE_KEY);
        const storedStartedAt = Number(await AsyncStorage.getItem(OAUTH_FLOW_STARTED_AT_KEY));
        if (Number.isFinite(storedStartedAt) && storedStartedAt > 0) flowStartedAt = storedStartedAt;

        await dbg(
          'oauth_callback_screen_started',
          {
            flowId,
            mode: flowMode,
            hasRouteReturnUrl: typeof params?.returnUrl === 'string' && params.returnUrl.length > 0,
            hasLiveUrl: typeof liveUrl === 'string' && liveUrl.length > 0,
            elapsedMs: Date.now() - flowStartedAt,
          },
          flowMode ? 'facebook' : 'auth'
        );

        let url =
          typeof params?.returnUrl === 'string' && params.returnUrl.length > 0
            ? params.returnUrl
            : null;

        if (!url && typeof liveUrl === 'string' && liveUrl.length > 0) url = liveUrl;

        if (!url) {
          const cached = await AsyncStorage.getItem(OAUTH_RETURN_URL_KEY);
          if (cached) {
            url = cached;
            await dbg('oauth_callback_url_source', { flowId, mode: flowMode, source: 'cache' }, flowMode ? 'facebook' : 'auth');
          }
        }

        if (!url) {
          const initialUrl = await Linking.getInitialURL();
          if (initialUrl) {
            url = initialUrl;
            await dbg('oauth_callback_url_source', { flowId, mode: flowMode, source: 'initial_url' }, flowMode ? 'facebook' : 'auth');
          }
        }

        if (!url) {
          await dbg(
            'oauth_callback_url_missing',
            { flowId, mode: flowMode, elapsedMs: Date.now() - flowStartedAt },
            flowMode ? 'facebook' : 'auth'
          );
          if (flowMode) {
            await dbg(
              'facebook_link_missing_redirect',
              {
                flowId,
                mode: flowMode,
                device_platform: Platform.OS,
                elapsedMs: Date.now() - flowStartedAt,
              },
              'facebook'
            );
            await trackEvent({
              eventName: 'facebook_link_missing_redirect',
              screen: 'auth/callback',
              metadata: {
                flow_id: flowId,
                mode: flowMode,
                device_platform: Platform.OS,
              },
            });
          }
          throw new Error('No OAuth callback URL found');
        }

        if (flowMode) {
          await dbg(
            'facebook_link_callback_received',
            {
              flowId,
              mode: flowMode,
              callback: describeUrl(url),
              device_platform: Platform.OS,
              elapsedMs: Date.now() - flowStartedAt,
            },
            'facebook'
          );
          await trackEvent({
            eventName: 'facebook_link_callback_received',
            screen: 'auth/callback',
            metadata: {
              flow_id: flowId,
              mode: flowMode,
              device_platform: Platform.OS,
            },
          });
        }

        const returnPath = (await AsyncStorage.getItem(OAUTH_RETURN_PATH_KEY)) || null;
        const expectedLinkUserId = (await AsyncStorage.getItem(OAUTH_LINK_USER_ID_KEY)) || null;
        const linkSessionSnapshot = await getStoredLinkSessionSnapshot();
        const safeFallbackRoute =
          returnPath ||
          (flowMode === 'link_identity' ? '/user' : '/auth/login');
        setFallbackRoute(safeFallbackRoute);

        await dbg(
          'facebook_redirect_url_received',
          {
            flowId,
            mode: flowMode,
            redirectUrl: url,
            callback: describeUrl(url),
            expectedLinkUserId,
            snapshotUserId: linkSessionSnapshot?.userId || null,
            elapsedMs: Date.now() - flowStartedAt,
          },
          flowMode ? 'facebook' : 'auth'
        );

        const parsed = safeParseUrl(url);
        const callbackError =
          parsed.query?.error_description ||
          parsed.query?.error_message ||
          parsed.query?.error ||
          parsed.fragment?.error_description ||
          parsed.fragment?.error_message ||
          parsed.fragment?.error ||
          null;

        const codeFromParams = typeof params?.code === 'string' ? params.code : null;
        const codeFromUrl = typeof parsed.query?.code === 'string' ? parsed.query.code : null;
        const code = codeFromParams || codeFromUrl;

        const accessToken =
          typeof parsed.fragment?.access_token === 'string' ? parsed.fragment.access_token : null;
        const refreshToken =
          typeof parsed.fragment?.refresh_token === 'string' ? parsed.fragment.refresh_token : null;

        const hasAnyCallbackCredential =
          Boolean(code) || Boolean(accessToken && refreshToken) || Boolean(callbackError);
        const flowActive = await isOAuthFlowInProgress();

        if (!hasAnyCallbackCredential && !flowActive) {
          await dbg(
            'oauth_callback_ignored_without_active_flow',
            {
              flowId,
              mode: flowMode,
              callback: describeUrl(url),
              elapsedMs: Date.now() - flowStartedAt,
            },
            flowMode ? 'facebook' : 'auth'
          );
          if (!cancelled) router.replace(safeFallbackRoute);
          return;
        }

        await dbg(
          'oauth_callback_secret_summary',
          {
            flowId,
            mode: flowMode,
            authCode: secretSummary(code),
            accessCredential: secretSummary(accessToken),
            refreshCredential: secretSummary(refreshToken),
            elapsedMs: Date.now() - flowStartedAt,
          },
          flowMode ? 'facebook' : 'auth'
        );

        await dbg(
          'oauth_callback_params_inspected',
          {
            flowId,
            mode: flowMode,
            callback: describeUrl(url),
            hasCode: Boolean(code),
            hasAccessToken: Boolean(accessToken),
            hasRefreshToken: Boolean(refreshToken),
            hasExpectedLinkUser: Boolean(expectedLinkUserId),
            elapsedMs: Date.now() - flowStartedAt,
          },
          flowMode ? 'facebook' : 'auth'
        );

        if (callbackError) {
          throw new Error(`OAuth provider returned an error: ${String(callbackError).slice(0, 180)}`);
        }

        if (code) {
          await dbg(
            'oauth_code_reached_supabase_exchange',
            {
              flowId,
              mode: flowMode,
              authCode: secretSummary(code),
              elapsedMs: Date.now() - flowStartedAt,
            },
            flowMode ? 'facebook' : 'auth'
          );
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            await dbg(
              'oauth_code_exchange_failed',
              {
                flowId,
                mode: flowMode,
                ...sanitizeAuthError(error),
                elapsedMs: Date.now() - flowStartedAt,
              },
              flowMode ? 'facebook' : 'auth'
            );
            throw error;
          }

          const userId = data?.session?.user?.id;
          if (!userId) throw new Error('No session user after code exchange');
          await dbg(
            'oauth_code_exchange_succeeded',
            { flowId, mode: flowMode, hasUserId: true, userId, elapsedMs: Date.now() - flowStartedAt },
            flowMode ? 'facebook' : 'auth'
          );
        } else if (accessToken && refreshToken) {
          await dbg(
            'oauth_fragment_tokens_reached_supabase_set_session',
            {
              flowId,
              mode: flowMode,
              accessCredential: secretSummary(accessToken),
              refreshCredential: secretSummary(refreshToken),
              elapsedMs: Date.now() - flowStartedAt,
            },
            flowMode ? 'facebook' : 'auth'
          );
          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) {
            await dbg(
              'oauth_set_session_failed',
              {
                flowId,
                mode: flowMode,
                ...sanitizeAuthError(error),
                elapsedMs: Date.now() - flowStartedAt,
              },
              flowMode ? 'facebook' : 'auth'
            );
            throw error;
          }

          const userId = data?.session?.user?.id;
          if (!userId) throw new Error('No session user after setSession');
          await dbg(
            'oauth_set_session_succeeded',
            { flowId, mode: flowMode, hasUserId: true, userId, elapsedMs: Date.now() - flowStartedAt },
            flowMode ? 'facebook' : 'auth'
          );
        } else if (flowMode === 'link_identity' && expectedLinkUserId) {
          await dbg(
            'facebook_link_callback_using_existing_session',
            { flowId, hasExpectedLinkUser: true, elapsedMs: Date.now() - flowStartedAt },
            'facebook'
          );
        } else {
          throw new Error(
            `OAuth callback missing code and missing fragment tokens. hasFragment=${String(parsed.hasFragment)}`
          );
        }

        const { data: s2, error: sErr } = await supabase.auth.getSession();
        if (sErr) throw sErr;
        let resolvedSession = s2?.session ?? null;
        if (!resolvedSession?.user?.id && flowMode === 'link_identity' && linkSessionSnapshot) {
          await dbg(
            'facebook_link_session_missing_after_callback',
            {
              flowId,
              expectedLinkUserId,
              snapshotUserId: linkSessionSnapshot.userId,
              elapsedMs: Date.now() - flowStartedAt,
            },
            'facebook'
          );
          resolvedSession = await restoreLinkSessionSnapshot(linkSessionSnapshot, flowId);
        }
        if (!resolvedSession?.user?.id) throw new Error('Session not persisted after callback');
        await dbg(
          'oauth_session_persisted',
          {
            flowId,
            mode: flowMode,
            hasSession: true,
            hasUserId: true,
            userId: resolvedSession.user.id,
            matchesExpectedLinkUser: expectedLinkUserId
              ? resolvedSession.user.id === expectedLinkUserId
              : null,
            elapsedMs: Date.now() - flowStartedAt,
          },
          flowMode ? 'facebook' : 'auth'
        );
        if (flowMode) {
          await dbg(
            'facebook_session_final_state',
            {
              flowId,
              mode: flowMode,
              phase: 'session_persisted',
              hasSession: true,
              hasUserId: true,
              matchesExpectedLinkUser: expectedLinkUserId
                ? resolvedSession.user.id === expectedLinkUserId
                : null,
              elapsedMs: Date.now() - flowStartedAt,
            },
            'facebook'
          );
        }

        if (expectedLinkUserId && resolvedSession.user.id !== expectedLinkUserId) {
          await dbg(
            'facebook_link_user_mismatch',
            {
              expectedUserId: expectedLinkUserId,
              actualUserId: resolvedSession.user.id,
              snapshotUserId: linkSessionSnapshot?.userId || null,
            },
            'facebook'
          );
          if (flowMode === 'link_identity' && linkSessionSnapshot) {
            resolvedSession = await restoreLinkSessionSnapshot(linkSessionSnapshot, flowId);
          }
          throw new Error('Facebook returned a different BuffaGo account. Original session was restored.');
        }

        // Apply onboarding payloads, and profile upsert
        await dbg(
          'oauth_user_refresh_started',
          { flowId, mode: flowMode, elapsedMs: Date.now() - flowStartedAt },
          flowMode ? 'facebook' : 'auth'
        );
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError) throw userError;
        let user = userData?.user || null;
        const providerState = user?.id
          ? await refreshLinkedProviders()
          : { facebook: false, providers: [], identities: [], error: null };
        if (user?.id) user = { ...user, identities: providerState.identities || [] };
        console.info('[auth/callback] current user resolved', { userId: user?.id || null });
        await dbg(
          'oauth_user_refresh_finished',
          {
            flowId,
            mode: flowMode,
            hasUserId: Boolean(user?.id),
            hasFacebookIdentity: providerState.facebook,
            userId: user?.id || null,
            providers: providerState.providers || [],
            providerRefreshError: providerState.error,
            elapsedMs: Date.now() - flowStartedAt,
          },
          flowMode ? 'facebook' : 'auth'
        );

        if (user?.id) {
          try {
            await upsertProfileFromAuth(user);
          } catch {
            // non blocking
          }

          if (providerState.facebook) {
            const providerList = providerState.providers || [];
            await dbg(
              'facebook_profile_social_link_update_started',
              { flowId, mode: flowMode, userId: user.id, elapsedMs: Date.now() - flowStartedAt },
              'facebook'
            );
            const savedFacebook = await persistFacebookConnection(user);

            await dbg(
              'facebook_final_ui_state',
              {
                persistedConnected: savedFacebook.connected,
                newlyConnected: savedFacebook.newlyConnected,
                flowId,
                mode: flowMode,
                elapsedMs: Date.now() - flowStartedAt,
              },
              'facebook'
            );

            await dbg(
              'facebook_oauth_success',
              {
                userId: user.id,
                expectedUserId: expectedLinkUserId,
                providerList,
                persistedConnected: savedFacebook.connected,
                newlyConnected: savedFacebook.newlyConnected,
                flowId,
                mode: flowMode,
                elapsedMs: Date.now() - flowStartedAt,
              },
              'facebook'
            );
            await trackEvent({
              eventName: 'facebook_oauth_success',
              screen: 'auth/callback',
              userId: user.id,
              metadata: {
                persisted_connected: savedFacebook.connected,
                newly_connected: savedFacebook.newlyConnected,
              },
            });
            await dbg(
              'facebook_link_success',
              {
                flowId,
                mode: flowMode,
                userId: user.id,
                expectedUserId: expectedLinkUserId,
                providerList,
                persistedConnected: savedFacebook.connected,
                newlyConnected: savedFacebook.newlyConnected,
                device_platform: Platform.OS,
                elapsedMs: Date.now() - flowStartedAt,
              },
              'facebook'
            );
            await trackEvent({
              eventName: 'facebook_link_success',
              screen: 'auth/callback',
              userId: user.id,
              metadata: {
                flow_id: flowId,
                mode: flowMode,
                persisted_connected: savedFacebook.connected,
                newly_connected: savedFacebook.newlyConnected,
                device_platform: Platform.OS,
              },
            });

            if (savedFacebook.newlyConnected) {
              await grantFacebookLinkRewardOnce(user.id);
            }
          } else if (flowMode === 'link_identity' || flowMode === 'sign_in') {
            await dbg(
              'facebook_identity_missing_after_callback',
              {
                flowId,
                mode: flowMode,
                hasUserId: Boolean(user?.id),
                elapsedMs: Date.now() - flowStartedAt,
              },
              'facebook'
            );
            throw new Error('Facebook identity was not present after the OAuth callback');
          }

          await applyOnboardingDestinationSuggestionIfAny(user.id);
          await applyOnboardingSeedRatingIfAny(user.id);
        }

        if (flowMode === 'link_identity') {
          const { data: verifyUserData, error: verifyUserError } = await supabase.auth.getUser();
          if (verifyUserError) throw verifyUserError;

          const verifiedUser = verifyUserData?.user || null;
          const verifiedUserId = verifiedUser?.id || null;
          const verifiedProviderState = verifiedUserId
            ? await refreshLinkedProviders({ syncCache: false })
            : { facebook: false, providers: [], error: null };
          const verifiedProviders = verifiedProviderState.providers || [];
          const hasFacebookIdentity = verifiedProviderState.facebook;

          await dbg(
            'facebook_link_post_verification',
            {
              flowId,
              expectedUserId: expectedLinkUserId,
              verifiedUserId,
              sameUserId: expectedLinkUserId ? verifiedUserId === expectedLinkUserId : null,
              hasFacebookIdentity,
              providers: verifiedProviders,
              providerRefreshError: verifiedProviderState.error,
              finalRoute: returnPath || '/user',
              elapsedMs: Date.now() - flowStartedAt,
            },
            'facebook'
          );

          if (expectedLinkUserId && verifiedUserId !== expectedLinkUserId) {
            throw new Error('Facebook link verification failed: Supabase user id changed.');
          }
          if (!hasFacebookIdentity) {
            throw new Error('Facebook link verification failed: Facebook identity missing after callback.');
          }
        }

        await new Promise((r) => setTimeout(r, 50));

        await AsyncStorage.multiRemove([
          OAUTH_RETURN_URL_KEY,
          OAUTH_RETURN_PATH_KEY,
          OAUTH_LINK_USER_ID_KEY,
          OAUTH_FLOW_ID_KEY,
          OAUTH_FLOW_MODE_KEY,
          OAUTH_FLOW_STARTED_AT_KEY,
        ]);
        await clearStoredLinkSessionSnapshot();

        await dbg(
          flowMode ? 'facebook_flow_finished' : 'oauth_flow_finished',
          {
            flowId,
            mode: flowMode,
            outcome: 'success',
            hasUserId: Boolean(user?.id),
            hasSession: true,
            hasFacebookIdentity: providerState.facebook,
            elapsedMs: Date.now() - flowStartedAt,
            callbackProcessingMs: Date.now() - callbackStartedAt,
          },
          flowMode ? 'facebook' : 'auth'
        );

        const finalRoute = returnPath || '/(tabs)/home';
        console.info('[auth/callback] final route decision', {
          finalRoute,
          userId: user?.id || null,
        });
        await dbg(
          'facebook_final_navigation_route',
          {
            flowId,
            mode: flowMode,
            finalRoute,
            finalUserId: user?.id || null,
            elapsedMs: Date.now() - flowStartedAt,
          },
          flowMode ? 'facebook' : 'auth'
        );

        if (!cancelled) router.replace(finalRoute);
      } catch (e) {
        const msg = String(e?.message || e);
        console.warn('OAuth callback failed', msg);
        if (flowMode) {
          await dbg(
            'facebook_link_failure',
            {
              flowId,
              mode: flowMode,
              provider: 'facebook',
              device_platform: Platform.OS,
              ...sanitizeAuthError(e),
              elapsedMs: Date.now() - flowStartedAt,
              callbackProcessingMs: Date.now() - callbackStartedAt,
            },
            'facebook'
          );
          await trackEvent({
            eventName: 'facebook_link_failure',
            screen: 'auth/callback',
            metadata: {
              flow_id: flowId,
              mode: flowMode,
              provider: 'facebook',
              device_platform: Platform.OS,
              ...sanitizeAuthError(e),
            },
          });
        }
        await dbg(
          flowMode ? 'facebook_flow_finished' : 'oauth_callback_failed',
          {
            flowId,
            mode: flowMode,
            outcome: 'failed',
            ...sanitizeAuthError(e),
            elapsedMs: Date.now() - flowStartedAt,
            callbackProcessingMs: Date.now() - callbackStartedAt,
          },
          flowMode ? 'facebook' : 'auth'
        );
        if (flowMode) {
          const flowStillActive = await isOAuthFlowInProgress({ mode: 'link_identity' });
          const snapshot = await getStoredLinkSessionSnapshot();
          if (flowStillActive && snapshot) {
            try {
              await restoreLinkSessionSnapshot(snapshot, flowId);
            } catch {}
          }
          await clearFacebookFlowState();
        }

        if (!cancelled) {
          setErrMsg(msg);
        }
      } finally {
        if (!cancelled) setProcessing(false);
      }
    };

    finish();

    return () => {
      cancelled = true;
    };
  }, [attempt, params?.code, params?.returnUrl, liveUrl, router]);

  const retry = () => {
    setAttempt((value) => value + 1);
  };

  const signOutAndRecover = async () => {
    try {
      await supabase.auth.signOut();
    } catch {}
    router.replace('/auth/login');
  };

  return (
    <View
      style={{
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 16,
        backgroundColor: colors.background,
      }}
    >
      {processing ? <ActivityIndicator size="large" /> : null}
      <Text style={{ marginTop: 12, opacity: 0.8, textAlign: 'center', color: colors.onBackground }}>
        {processing ? 'Finishing sign-in…' : 'OAuth callback needs attention'}
      </Text>
      {errMsg ? (
        <Text style={{ marginTop: 12, opacity: 0.7, textAlign: 'center', color: colors.onBackground }}>
          {errMsg}
        </Text>
      ) : null}
      {!processing && errMsg ? (
        <View style={{ width: '100%', marginTop: 18, gap: 10 }}>
          <Button mode="contained" onPress={retry}>
            Retry callback
          </Button>
          <Button mode="outlined" onPress={() => router.replace(fallbackRoute)}>
            Continue safely
          </Button>
          <Button mode="text" onPress={signOutAndRecover}>
            Log out
          </Button>
        </View>
      ) : null}
    </View>
  );
}
