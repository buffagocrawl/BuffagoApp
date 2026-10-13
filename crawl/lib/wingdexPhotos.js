import { publishPhotoVote } from './photoVoteEvents.js';
/** @typedef {1 | 0 | -1 | null} PhotoVote */
/** @typedef {import('../types/wingdexPhotos').ApprovedPhoto} ApprovedPhoto */

/** Only updates local presentation; database triggers own the stored counters. */
export function optimisticVote(photo, choice) {
  const previous = photo.current_vote ?? null;
  const next = previous === choice ? null : choice;
  return { ...photo, current_vote: next,
    like_count: Math.max(0, (photo.like_count ?? 0) + Number(next === 1) - Number(previous === 1)),
    neutral_count: Math.max(0, (photo.neutral_count ?? 0) + Number(next === 0) - Number(previous === 0)),
    dislike_count: Math.max(0, (photo.dislike_count ?? 0) + Number(next === -1) - Number(previous === -1)) };
}

/** A synchronous lock prevents two taps before React has rendered disabled controls. */
export function createVoteController(client) {
  const pending = pendingForClient(client);
  return async (photo, choice, publish, expectedUserId) => {
    if (pending.has(photo.submission_id)) return;
    pending.add(photo.submission_id);
    let optimistic = false;
    try {
      const { data, error } = await client.auth.getUser();
      if (error || !data?.user || data.user.is_anonymous) throw new Error('Sign in to vote on photos.');
      if (expectedUserId && data.user.id !== expectedUserId) throw new Error('Your account changed. Please retry.');
      const voterId = data.user.id;
      const next = optimisticVote(photo, choice);
      publish(next, true); optimistic = true;
      const result = await client.rpc('set_wing_jury_photo_vote', {
        p_submission_id: photo.submission_id, p_vote: next.current_vote,
      });
      if (result.error) throw new Error('Could not save your vote. Check your connection and try again.');
      const row = Array.isArray(result.data) ? result.data[0] : result.data;
      if (!row || row.submission_id !== photo.submission_id) throw new Error('Could not save your vote. Check your connection and try again.');
      const saved = { ...next, ...row, current_vote: row.vote ?? null };
      publish(saved, false);
      publishPhotoVote(voterId, saved);
      return saved;
    } catch (error) {
      if (optimistic) publish(photo, false);
      throw error;
    } finally { pending.delete(photo.submission_id); }
  };
}

const clientLocks = new WeakMap();
function pendingForClient(client) {
  if (!clientLocks.has(client)) clientLocks.set(client, new Set());
  return clientLocks.get(client);
}

export async function loadOwnPhotoVotes(photos, client) {
  const { data, error } = await client.auth.getUser();
  if (error && error.name !== 'AuthSessionMissingError') throw new Error('Could not load your votes. Sign in again or retry.');
  if (!data?.user || data.user.is_anonymous) return photos.map((p) => ({ ...p, current_vote: null }));
  if (!photos.length) return [];
  const votes = new Map();
  for (let start = 0; start < photos.length; start += 250) {
    const result = await client.from('wing_jury_votes').select('submission_id,vote')
      .eq('user_id', data.user.id).in('submission_id', photos.slice(start, start + 250).map((p) => p.submission_id));
    if (result.error) throw new Error('Could not load your votes. Please retry.');
    for (const row of result.data || []) votes.set(row.submission_id, row.vote);
  }
  return photos.map((p) => ({ ...p, current_vote: votes.get(p.submission_id) ?? null }));
}
