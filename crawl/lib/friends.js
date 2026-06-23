import { supabase } from './supabase';
import { trackEvent } from './analytics';

const SCREEN = 'friends';

function normalizeError(error, fallback) {
  const value = error || new Error(fallback);
  value.userMessage =
    value.code === '42501'
      ? 'This action is unavailable because of privacy settings or permissions.'
      : value.message || fallback;
  return value;
}

async function currentUserId() {
  const { data } = await supabase.auth.getSession();
  return data?.session?.user?.id ?? null;
}

async function rpc(name, args, fallback) {
  const started = Date.now();
  const { data, error } = await supabase.rpc(name, args);
  if (error) {
    error.durationMs = Date.now() - started;
    throw normalizeError(error, fallback);
  }
  return { data, durationMs: Date.now() - started };
}

async function log(eventName, metadata = {}) {
  return trackEvent({
    eventName,
    screen: SCREEN,
    metadata,
  });
}

export async function searchUsersForFriends(query, { limit = 20, sourceSurface = 'search' } = {}) {
  const clean = String(query || '').trim();
  if (clean.length < 2) return [];

  await log('friend_search_started', {
    source_surface: sourceSurface,
    query_length: clean.length,
    query_kind: clean.includes('@') ? 'exact_email' : 'name',
  });

  try {
    const { data, durationMs } = await rpc(
      'search_users_for_friends',
      { p_query: clean, p_limit: limit },
      'Could not search for friends.'
    );
    const rows = Array.isArray(data) ? data : [];
    await log('friend_search_results_viewed', {
      source_surface: sourceSurface,
      result_count: rows.length,
      duration_ms: durationMs,
      query_kind: clean.includes('@') ? 'exact_email' : 'name',
    });
    return rows;
  } catch (error) {
    await log('friend_search_failed', {
      source_surface: sourceSurface,
      error_code: error?.code ?? null,
      error_message: error?.message ?? 'unknown',
      duration_ms: error?.durationMs ?? null,
    });
    throw error;
  }
}

export async function getFriendStatus(targetUserId) {
  const { data } = await rpc(
    'friend_relationship_status',
    { p_target_user_id: targetUserId },
    'Could not load friend status.'
  );
  return data || 'none';
}

export async function sendFriendRequest(targetUserId, sourceSurface = 'profile') {
  const userId = await currentUserId();
  await log('friend_request_send_attempt', {
    current_user_id: userId,
    target_user_id: targetUserId,
    source_surface: sourceSurface,
  });
  try {
    const { data, durationMs } = await rpc(
      'send_friend_request',
      { p_target_user_id: targetUserId },
      'Could not send friend request.'
    );
    await log('friend_request_sent', {
      current_user_id: userId,
      target_user_id: targetUserId,
      source_surface: sourceSurface,
      request_status: data,
      duration_ms: durationMs,
    });
    return data;
  } catch (error) {
    await log('friend_request_send_failed', {
      current_user_id: userId,
      target_user_id: targetUserId,
      source_surface: sourceSurface,
      error_code: error?.code ?? null,
      error_message: error?.message ?? 'unknown',
      duration_ms: error?.durationMs ?? null,
    });
    throw error;
  }
}

async function relationshipAction(rpcName, eventName, argumentName, targetUserId, status) {
  const userId = await currentUserId();
  const { data, durationMs } = await rpc(
    rpcName,
    { [argumentName]: targetUserId },
    'Could not update this friendship.'
  );
  await log(eventName, {
    current_user_id: userId,
    target_user_id: targetUserId,
    request_status: status,
    duration_ms: durationMs,
  });
  return data;
}

export const acceptFriendRequest = (userId) =>
  relationshipAction('accept_friend_request', 'friend_request_accepted', 'p_requester_user_id', userId, 'friends');
export const declineFriendRequest = (userId) =>
  relationshipAction('decline_friend_request', 'friend_request_declined', 'p_requester_user_id', userId, 'declined');
export const cancelFriendRequest = (userId) =>
  relationshipAction('cancel_friend_request', 'friend_request_cancelled', 'p_addressee_user_id', userId, 'cancelled');
export const removeFriend = (userId) =>
  relationshipAction('remove_friend', 'friend_removed', 'p_friend_user_id', userId, 'none');
export const blockUser = (userId) =>
  relationshipAction('block_user', 'user_blocked', 'p_target_user_id', userId, 'blocked');
export const unblockUser = (userId) =>
  relationshipAction('unblock_user', 'user_unblocked', 'p_target_user_id', userId, 'none');

export async function getFriends() {
  const { data } = await rpc('get_friends', {}, 'Could not load friends.');
  return Array.isArray(data) ? data : [];
}

export async function getPendingInvites() {
  const { data } = await rpc('get_pending_friend_invites', {}, 'Could not load friend invites.');
  return Array.isArray(data) ? data : [];
}

export async function getBlockedUsers() {
  const { data } = await rpc('get_blocked_users', {}, 'Could not load blocked users.');
  return Array.isArray(data) ? data : [];
}

export async function getFriendsFeed({ stateId = null, limit = 25, offset = 0 } = {}) {
  const { data, durationMs } = await rpc(
    'get_friends_feed',
    { p_state_id: stateId, p_limit: limit, p_offset: offset },
    'Could not load the friends feed.'
  );
  const rows = Array.isArray(data) ? data : [];
  await log(rows.length ? 'friends_feed_loaded' : 'friends_feed_empty', {
    result_count: rows.length,
    state_filter: stateId,
    duration_ms: durationMs,
  });
  return rows;
}

export async function getFriendsLeaderboard({ stateId = null } = {}) {
  const { data, durationMs } = await rpc(
    'get_friends_leaderboard',
    { p_state_id: stateId },
    'Could not load the friends leaderboard.'
  );
  const rows = Array.isArray(data) ? data : [];
  await log('friends_leaderboard_loaded', {
    result_count: rows.length,
    state_filter: stateId,
    duration_ms: durationMs,
  });
  return rows;
}

export async function getSocialBadgeCounts() {
  const { data } = await rpc('get_social_badge_counts', {}, 'Could not load social notifications.');
  const row = Array.isArray(data) ? data[0] : data;
  const counts = {
    pendingInvites: Number(row?.pending_invites || 0),
    unseenFriendActivity: Number(row?.unseen_friend_activity || 0),
    total: Number(row?.total || 0),
  };
  if (counts.total > 0) {
    log('social_badge_viewed', {
      pending_invites: counts.pendingInvites,
      unseen_friend_activity: counts.unseenFriendActivity,
      total: counts.total,
    });
  }
  return counts;
}

export async function markFriendActivitySeen(kind = 'activity') {
  const { data } = await rpc(
    'mark_friend_activity_seen',
    { p_kind: kind },
    'Could not clear social notifications.'
  );
  await log('social_badge_cleared', { badge_kind: kind });
  return data;
}

export async function getFriendInviteCode({ rotate = false } = {}) {
  const { data } = await rpc(
    'get_friend_invite_code',
    { p_rotate: rotate },
    'Could not create a friend code.'
  );
  return data;
}

export function friendInviteUrl(code) {
  return `buffago://friends/add?code=${encodeURIComponent(String(code || ''))}`;
}

export async function resolveFriendInviteCode(code) {
  try {
    const { data } = await rpc(
      'resolve_friend_invite_code',
      { p_code: code },
      'That friend code is invalid or unavailable.'
    );
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) throw normalizeError(null, 'That friend code is invalid or unavailable.');
    await log('friend_qr_scanned', {
      target_user_id: row.user_id,
      source_surface: 'qr',
    });
    return row;
  } catch (error) {
    await log('friend_qr_scan_failed', {
      source_surface: 'qr',
      error_code: error?.code ?? null,
      error_message: error?.message ?? 'unknown',
    });
    throw error;
  }
}
