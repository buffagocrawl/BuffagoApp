import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { Linking } from 'react-native';
import { supabase } from './supabase';

const PENDING_VISIT_KEY = 'buffago:social-community:pending-visit';

export const SOCIAL_COMMUNITY_CONFIG = Object.freeze({
  instagram: {
    label: 'Instagram',
    webUrl: process.env.EXPO_PUBLIC_BUFFAGO_INSTAGRAM_URL || '',
    deepLink: process.env.EXPO_PUBLIC_BUFFAGO_INSTAGRAM_DEEP_LINK || '',
  },
  facebook: {
    label: 'Facebook',
    webUrl: process.env.EXPO_PUBLIC_BUFFAGO_FACEBOOK_URL || '',
    deepLink: process.env.EXPO_PUBLIC_BUFFAGO_FACEBOOK_DEEP_LINK || '',
  },
});

function randomUuid() {
  try {
    return Crypto.randomUUID();
  } catch {
    throw new Error('secure_random_unavailable');
  }
}

export function getSocialCommunityConfig(platform) {
  const config = SOCIAL_COMMUNITY_CONFIG[platform];
  if (!config) throw new Error('unsupported_social_platform');
  return config;
}

export async function openConfiguredSocialDestination(platform) {
  const config = getSocialCommunityConfig(platform);
  const candidates = [config.deepLink, config.webUrl].filter(Boolean);
  if (!candidates.length) throw new Error('social_destination_not_configured');

  for (const url of candidates) {
    try {
      if (url !== config.webUrl && !(await Linking.canOpenURL(url))) continue;
      await Linking.openURL(url);
      return url === config.deepLink ? 'deep_link' : 'web';
    } catch {
      // Try the configured browser fallback.
    }
  }
  throw new Error('social_destination_unavailable');
}

export async function startSocialCommunityVisit(platform) {
  getSocialCommunityConfig(platform);
  const { data, error } = await supabase.rpc('start_social_community_visit', {
    p_platform: platform,
    p_correlation_id: randomUuid(),
  });
  if (error) throw error;

  const pending = {
    platform,
    visitIntentId: data?.visit_intent_id,
    startedAt: Date.now(),
    externalOpenConfirmed: false,
  };
  if (!pending.visitIntentId) throw new Error('social_visit_intent_missing');
  await AsyncStorage.setItem(PENDING_VISIT_KEY, JSON.stringify(pending));
  return pending;
}

export async function confirmSocialCommunityDestinationOpened(pending) {
  if (!pending?.visitIntentId || !pending?.platform) {
    throw new Error('social_visit_intent_missing');
  }
  await AsyncStorage.setItem(PENDING_VISIT_KEY, JSON.stringify({
    ...pending,
    externalOpenConfirmed: true,
  }));
}

export async function completePendingSocialCommunityVisit() {
  const raw = await AsyncStorage.getItem(PENDING_VISIT_KEY);
  if (!raw) return null;

  let pending;
  try {
    pending = JSON.parse(raw);
  } catch {
    await AsyncStorage.removeItem(PENDING_VISIT_KEY);
    return null;
  }

  if (!pending?.visitIntentId || !pending?.platform || pending.externalOpenConfirmed !== true) {
    await AsyncStorage.removeItem(PENDING_VISIT_KEY);
    return null;
  }

  const { data, error } = await supabase.rpc('complete_social_community_visit', {
    p_visit_intent_id: pending.visitIntentId,
  });
  if (error) {
    // Keep a still-valid intent so a genuine external return can be retried.
    if (Date.now() - Number(pending.startedAt || 0) > 24 * 60 * 60 * 1000) {
      await AsyncStorage.removeItem(PENDING_VISIT_KEY);
    }
    throw error;
  }
  await AsyncStorage.removeItem(PENDING_VISIT_KEY);
  return data;
}

export async function clearPendingSocialCommunityVisit() {
  await AsyncStorage.removeItem(PENDING_VISIT_KEY);
}
