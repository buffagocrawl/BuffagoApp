// app/auth/callback.jsx
import { useEffect, useRef, useState } from 'react';
import { View, ActivityIndicator, Text } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Linking from 'expo-linking';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../lib/supabase';

const OAUTH_RETURN_URL_KEY = 'buffago:oauth:return_url';

// Onboarding keys (match OnboardingFlow)
const ONBOARDING_SEED_RATING_KEY = 'buffago:onboarding:seed_rating';
const ONBOARDING_DEST_SUGGESTION_KEY = 'buffago:onboarding:dest_suggestion';

const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,20}$/;

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
  const params = useLocalSearchParams();
  const liveUrl = Linking.useURL();

  const [errMsg, setErrMsg] = useState('');
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    let cancelled = false;

    const finish = async () => {
      try {
        let url =
          typeof params?.returnUrl === 'string' && params.returnUrl.length > 0
            ? params.returnUrl
            : null;

        if (!url && typeof liveUrl === 'string' && liveUrl.length > 0) url = liveUrl;

        if (!url) {
          const cached = await AsyncStorage.getItem(OAUTH_RETURN_URL_KEY);
          if (cached) url = cached;
        }

        if (!url) {
          const initialUrl = await Linking.getInitialURL();
          if (initialUrl) url = initialUrl;
        }

        if (!url) throw new Error('No OAuth callback URL found');

        await AsyncStorage.removeItem(OAUTH_RETURN_URL_KEY);

        const parsed = safeParseUrl(url);

        const codeFromParams = typeof params?.code === 'string' ? params.code : null;
        const codeFromUrl = typeof parsed.query?.code === 'string' ? parsed.query.code : null;
        const code = codeFromParams || codeFromUrl;

        const accessToken =
          typeof parsed.fragment?.access_token === 'string' ? parsed.fragment.access_token : null;
        const refreshToken =
          typeof parsed.fragment?.refresh_token === 'string' ? parsed.fragment.refresh_token : null;

        if (code) {
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;

          const userId = data?.session?.user?.id;
          if (!userId) throw new Error('No session user after code exchange');
        } else if (accessToken && refreshToken) {
          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) throw error;

          const userId = data?.session?.user?.id;
          if (!userId) throw new Error('No session user after setSession');
        } else {
          throw new Error(
            `OAuth callback missing code and missing fragment tokens. hasFragment=${String(parsed.hasFragment)}`
          );
        }

        const { data: s2, error: sErr } = await supabase.auth.getSession();
        if (sErr) throw sErr;
        if (!s2?.session?.user?.id) throw new Error('Session not persisted after callback');

        // Apply onboarding payloads, and profile upsert
        const { data: userData } = await supabase.auth.getUser();
        const user = userData?.user || null;

        if (user?.id) {
          try {
            await upsertProfileFromAuth(user);
          } catch {
            // non blocking
          }

          await applyOnboardingDestinationSuggestionIfAny(user.id);
          await applyOnboardingSeedRatingIfAny(user.id);
        }

        await new Promise((r) => setTimeout(r, 50));

        if (!cancelled) router.replace('/(tabs)/home');
      } catch (e) {
        const msg = String(e?.message || e);
        console.warn('OAuth callback failed', msg);

        if (!cancelled) {
          setErrMsg(msg);
          setTimeout(() => {
            if (!cancelled) router.replace('/auth/login');
          }, 600);
        }
      }
    };

    finish();

    return () => {
      cancelled = true;
    };
  }, [params?.code, params?.returnUrl, liveUrl, router]);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 16 }}>
      <ActivityIndicator size="large" />
      {errMsg ? (
        <Text style={{ marginTop: 12, opacity: 0.7, textAlign: 'center' }}>{errMsg}</Text>
      ) : null}
    </View>
  );
}
