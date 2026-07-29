import * as Crypto from 'expo-crypto';
import { supabase } from './supabase';

const HISTORY_PAGE_SIZE = 25;
const WITHDRAWABLE_STATUSES = new Set([
  'uploaded',
  'processing',
  'in_review',
  'approved',
  'generation_pending',
  'ready_to_post',
  'scheduled',
  'posting',
  'failed',
]);

function firstRow(data) {
  return Array.isArray(data) ? data[0] ?? null : data ?? null;
}

function rpcError(error, fallback) {
  if (!error) return null;
  const message = String(error.message || '');
  if (message.includes('authentication_required')) return new Error('Please sign in to continue.');
  if (message.includes('wing_submission_not_found')) return new Error('This Wing Shot is not available.');
  if (message.includes('wing_submission_not_withdrawable')) {
    return new Error('This Wing Shot can no longer be withdrawn.');
  }
  return new Error(fallback);
}

export function newWingCreatorOperationId(prefix = 'creator') {
  return `${prefix}:${Crypto.randomUUID()}`;
}

export function canWithdrawWingShot(status) {
  return WITHDRAWABLE_STATUSES.has(String(status || ''));
}

export async function loadWingCreatorFeatureFlags(client = supabase) {
  const { data, error } = await client.rpc('get_wing_shots_feature_flags');
  if (error) throw new Error('Creator features are temporarily unavailable.');
  return Object.fromEntries(
    (data || []).map((row) => [row.flag_key, Boolean(row.enabled_for_user)])
  );
}

export async function loadMyWingCreatorSummary(client = supabase) {
  const [{ data: statsData, error: statsError }, { data: badges, error: badgesError }] =
    await Promise.all([
      client.rpc('get_wing_creator_stats'),
      client.rpc('get_my_wing_creator_badges'),
    ]);

  if (statsError) throw rpcError(statsError, 'Could not load Creator stats.');
  if (badgesError) throw rpcError(badgesError, 'Could not load Creator badges.');

  // creator_xp is the internal authoritative ledger total displayed as Creator Reputation.
  return {
    stats: firstRow(statsData) || {
      approved_submissions: 0,
      featured_submissions: 0,
      creator_xp: 0,
      weekly_approved_submissions: 0,
      weekly_featured_submissions: 0,
      weekly_creator_xp: 0,
    },
    badges: badges || [],
  };
}

export async function loadMyWingShotHistory({
  before = null,
  limit = HISTORY_PAGE_SIZE,
  client = supabase,
} = {}) {
  const { data, error } = await client.rpc('get_my_wing_submission_history', {
    p_limit: Math.max(1, Math.min(Number(limit) || HISTORY_PAGE_SIZE, 100)),
    p_before: before,
  });
  if (error) throw rpcError(error, 'Could not load Wing Shot history.');
  return data || [];
}

export async function loadMyWingShotDetail(submissionId, client = supabase) {
  if (!submissionId) throw new Error('Wing Shot ID is required.');
  const { data, error } = await client.rpc('get_my_wing_submission_detail', {
    p_submission_id: submissionId,
  });
  if (error) throw rpcError(error, 'Could not load this Wing Shot.');
  const detail = firstRow(data);
  if (!detail) throw new Error('This Wing Shot is not available.');
  return detail;
}

export async function withdrawMyWingShot(
  { submissionId, expectedStatus },
  client = supabase
) {
  if (!submissionId || !expectedStatus) throw new Error('Wing Shot state is required.');
  const correlationId = Crypto.randomUUID();
  const { data, error } = await client.rpc('withdraw_wing_submission', {
    p_submission_id: submissionId,
    p_expected_status: expectedStatus,
    p_idempotency_key: newWingCreatorOperationId('withdraw'),
    p_correlation_id: correlationId,
  });
  if (error) throw rpcError(error, 'Could not withdraw this Wing Shot.');
  return data;
}

export async function loadCreatorLeaderboard(period = 'week', client = supabase) {
  const safePeriod = period === 'all_time' ? 'all_time' : 'week';
  const { data, error } = await client.rpc('get_wing_creator_leaderboard_surface', {
    p_period: safePeriod,
    p_limit: 25,
  });
  if (error) throw rpcError(error, 'Could not load the Creator leaderboard.');
  return data || [];
}

export async function requestWingShotPreview(submissionId, client = supabase) {
  const { data: access, error: accessError } = await client.rpc(
    'request_wing_media_access',
    {
      p_submission_id: submissionId,
      p_variant: 'thumbnail',
      p_purpose: 'owner_preview',
      p_correlation_id: Crypto.randomUUID(),
    },
  );
  if (accessError || !access?.request_id) {
    throw new Error('Preview is temporarily unavailable.');
  }

  const { data, error } = await client.functions.invoke('wing-media-preview', {
    body: { request_id: access.request_id },
  });
  if (error || data?.ok !== true || !data?.signed_url) {
    throw new Error('Preview is temporarily unavailable.');
  }

  return {
    uri: data.signed_url,
    expiresAt: new Date(
      Date.now() + Number(data.expires_in_seconds || 60) * 1000
    ).toISOString(),
  };
}

export async function requestPublishedWingShotReview(
  { submissionId, reasonCategory = 'withdrawal_after_publication', details = null },
  client = supabase
) {
  if (!submissionId) throw new Error('Wing Shot ID is required.');
  const { data, error } = await client.rpc('request_wing_published_content_review', {
    p_submission_id: submissionId,
    p_reason_category: reasonCategory,
    p_details: details,
    p_idempotency_key: newWingCreatorOperationId('published-review'),
    p_correlation_id: Crypto.randomUUID(),
  });
  if (error) throw rpcError(error, 'Could not send your review request.');
  return data;
}
