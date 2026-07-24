import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { Share } from 'react-native';
import { supabase } from './supabase';
import { getAnonymousId, trackEvent } from './analytics';
import {
  isReferralCodeValue,
  normalizeReferralCodeValue,
  referralBadgeProgress,
} from './referralModel';
import { hasCompletedOnboarding } from '../hooks/useOnboardingGate';

export const PENDING_REFERRAL_KEY = 'buffago:referral:pending:v1';

function referralLog(event, metadata = {}) {
  console.info('[referral]', { event, ...metadata });
}
export function normalizeReferralCode(value) {
  return normalizeReferralCodeValue(value);
}

export function isReferralCodeShape(value) {
  return isReferralCodeValue(value);
}

export function parseReferralUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  try {
    const parsed = Linking.parse(raw);
    const segments = String(parsed.path || '').split('/').filter(Boolean);
    const rIndex = segments.findIndex((part) => part.toLowerCase() === 'r');
    const host = String(parsed.hostname || '').toLowerCase();
    const candidate = rIndex >= 0
      ? segments[rIndex + 1]
      : host === 'r'
        ? segments[0]
        : null;
    const code = normalizeReferralCode(candidate);
    if (!isReferralCodeShape(code)) return null;
    return {
      code,
      source: String(parsed.queryParams?.source || 'shared_link').slice(0, 64),
      campaign: parsed.queryParams?.campaign
        ? String(parsed.queryParams.campaign).slice(0, 80)
        : null,
      placement: parsed.queryParams?.placement
        ? String(parsed.queryParams.placement).slice(0, 80)
        : 'shared_link',
    };
  } catch {
    return null;
  }
}

export async function getPendingReferral() {
  const raw = await AsyncStorage.getItem(PENDING_REFERRAL_KEY);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    return isReferralCodeShape(value?.code) ? value : null;
  } catch {
    return null;
  }
}

export async function clearPendingReferral() {
  await AsyncStorage.removeItem(PENDING_REFERRAL_KEY);
}

export async function recognizeReferral(input, overrides = {}) {
  const parsed = typeof input === 'string' && input.includes('://')
    ? parseReferralUrl(input)
    : {
        code: normalizeReferralCode(input),
        source: overrides.source || 'manual',
        campaign: overrides.campaign || null,
        placement: overrides.placement || 'manual_entry',
      };
  if (!parsed || !isReferralCodeShape(parsed.code)) {
    await trackEvent({
      eventName: 'referral_claim_failed',
      screen: overrides.screen || 'referral_link',
      metadata: { failure_reason: 'invalid_code_shape', placement: parsed?.placement || 'unknown' },
    });
    return { recognized: false, reason: 'invalid_code' };
  }

  if (parsed.source === 'manual') {
    await trackEvent({
      eventName: 'referral_code_entered',
      screen: overrides.screen || 'referral_hub',
      metadata: { placement: parsed.placement },
    });
  }

  const anonymousId = await getAnonymousId();
  const { data, error } = await supabase.rpc('record_referral_click', {
    p_code: parsed.code,
    p_anonymous_install_id: anonymousId,
    p_source: parsed.source,
    p_campaign: parsed.campaign,
    p_placement: parsed.placement,
  });
  if (error || !data?.recognized) {
    referralLog('click_rejected', {
      reason: data?.reason || error?.code || 'validation_failed',
      placement: parsed.placement,
    });
    await trackEvent({
      eventName: 'referral_claim_failed',
      screen: overrides.screen || 'referral_link',
      metadata: {
        failure_reason: data?.reason || error?.code || 'validation_failed',
        placement: parsed.placement,
      },
    });
    return { recognized: false, reason: data?.reason || 'invalid_or_disabled' };
  }

  const pending = {
    ...parsed,
    attributionId: data.attribution_id || null,
    recognizedAt: new Date().toISOString(),
  };
  await AsyncStorage.setItem(PENDING_REFERRAL_KEY, JSON.stringify(pending));
  referralLog('intent_stored', {
    attributionId: pending.attributionId,
    placement: parsed.placement,
  });
  await trackEvent({
    eventName: 'referral_link_opened',
    screen: overrides.screen || 'referral_link',
    metadata: { source: parsed.source, campaign: parsed.campaign, placement: parsed.placement },
  });
  return { recognized: true, pending };
}

export async function claimPendingReferral(overrides = {}) {
  const pending = await getPendingReferral();
  if (!pending) return { claimed: false, reason: 'no_pending_referral' };
  const anonymousId = await getAnonymousId();
  const { data, error } = await supabase.rpc('claim_referral', {
    p_code: pending.code,
    p_anonymous_install_id: anonymousId,
    p_source: overrides.source || pending.source || 'shared_link',
    p_campaign: overrides.campaign || pending.campaign || null,
    p_placement: overrides.placement || pending.placement || 'deferred_claim',
  });
  const claimed = !error && Boolean(data?.claimed);
  referralLog(claimed ? 'claim_succeeded' : 'claim_failed', {
    attributionId: data?.attribution_id || null,
    reason: claimed ? null : data?.reason || error?.code || 'claim_failed',
  });
  await trackEvent({
    eventName: claimed ? 'referral_claim_succeeded' : 'referral_claim_failed',
    screen: overrides.screen || 'referral_claim',
    metadata: {
      placement: overrides.placement || pending.placement || 'deferred_claim',
      failure_reason: claimed ? null : data?.reason || error?.code || 'claim_failed',
      attribution_status: data?.status || null,
    },
  });
  if (claimed || ['existing_account', 'existing_activity', 'self_referral'].includes(data?.reason)) {
    await clearPendingReferral();
  }
  if (claimed && await hasCompletedOnboarding().catch(() => false)) {
    await markReferralOnboardingComplete();
  }
  return error ? { claimed: false, reason: error.code || 'claim_failed' } : data;
}

export async function markReferralOnboardingComplete() {
  const { data, error } = await supabase.rpc('mark_referral_onboarding_complete');
  if (error) return { recorded: false, reason: error.code || 'rpc_failed' };
  return data || { recorded: false };
}

export async function loadReferralHub() {
  const { data, error } = await supabase.rpc('get_referral_hub');
  if (error) throw new Error('Could not load referral details.', { cause: error });
  return data;
}

export function referralUrl(code, placement = 'referral_hub') {
  const clean = normalizeReferralCode(code);
  const base = String(process.env.EXPO_PUBLIC_REFERRAL_BASE_URL || '').replace(/\/+$/, '');
  if (base) {
    return `${base}/r/${clean}?source=member_share&placement=${encodeURIComponent(placement)}`;
  }
  return Linking.createURL(`/r/${clean}`, {
    queryParams: { source: 'member_share', placement },
  });
}

export async function copyReferralCode(code, placement = 'referral_hub') {
  await Clipboard.setStringAsync(normalizeReferralCode(code));
  await trackEvent({
    eventName: 'referral_code_copied',
    screen: 'referral_hub',
    metadata: { placement },
  });
}

export async function shareReferral({ code, rewardAmount, placement = 'referral_hub' }) {
  const url = referralUrl(code, placement);
  await trackEvent({
    eventName: 'referral_share_started',
    screen: 'referral_hub',
    metadata: { placement, reward_amount: Number(rewardAmount || 0) },
  });
  const message =
    `I’m ranking the best wings on Buffago. Join with my link, rate your first wing ` +
    `spot, and we’ll both earn ${Number(rewardAmount || 0)} XP: ${url}`;
  try {
    const result = await Share.share({ title: 'Wings taste better with friends', message, url });
    const completed = result.action === Share.sharedAction;
    await trackEvent({
      eventName: completed ? 'referral_share_completed' : 'share_cancelled',
      screen: 'referral_hub',
      metadata: { placement, reward_amount: Number(rewardAmount || 0) },
    });
    return { completed, result };
  } catch (error) {
    await trackEvent({
      eventName: 'share_failed',
      screen: 'referral_hub',
      metadata: { placement, failure_reason: error?.name || 'share_failed' },
    });
    throw error;
  }
}

export function nextReferralProgress(summary = {}) {
  return referralBadgeProgress(summary);
}
