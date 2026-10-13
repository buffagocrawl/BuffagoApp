/** @typedef {1 | -1 | null} PhotoVote */
/** @typedef {import('../types/wingdexPhotos').ApprovedPhoto} ApprovedPhoto */

/** Only updates local presentation; database triggers own the stored counters. */
export function optimisticVote(photo, choice) {
  const previous = photo.current_vote ?? null;
  const next = previous === choice ? null : choice;
  return { ...photo, current_vote: next,
    like_count: Math.max(0, photo.like_count + Number(next === 1) - Number(previous === 1)),
    dislike_count: Math.max(0, photo.dislike_count + Number(next === -1) - Number(previous === -1)) };
}

/** A synchronous lock prevents two taps before React has rendered disabled controls. */
export function createVoteController(client) {
  const pending = new Set();
  return async (photo, choice, publish, expectedUserId) => {
    if (pending.has(photo.submission_id)) return;
    pending.add(photo.submission_id);
    let optimistic = false;
    try {
      const { data, error } = await client.auth.getUser();
      if (error || !data?.user || data.user.is_anonymous) throw new Error('Sign in to vote on photos.');
      if (expectedUserId && data.user.id !== expectedUserId) throw new Error('Your account changed. Please retry.');
      const next = optimisticVote(photo, choice);
      publish(next, true); optimistic = true;
      const votes = client.from('wing_media_photo_votes');
      const result = next.current_vote === null
        ? await votes.delete().eq('submission_id', photo.submission_id).eq('user_id', data.user.id)
        : await votes.upsert({ submission_id: photo.submission_id, user_id: data.user.id, vote: next.current_vote },
          { onConflict: 'submission_id,user_id' });
      if (result.error) throw new Error('Could not save your vote. Check your connection and try again.');
      publish(next, false);
      return next;
    } catch (error) {
      if (optimistic) publish(photo, false);
      throw error;
    } finally { pending.delete(photo.submission_id); }
  };
}

export async function loadOwnPhotoVotes(photos, client) {
  const { data, error } = await client.auth.getUser();
  if (error && error.name !== 'AuthSessionMissingError') throw new Error('Could not load your votes. Sign in again or retry.');
  if (!data?.user || data.user.is_anonymous) return photos.map((p) => ({ ...p, current_vote: null }));
  if (!photos.length) return [];
  const votes = new Map();
  for (let start = 0; start < photos.length; start += 250) {
    const result = await client.from('wing_media_photo_votes').select('submission_id,vote')
      .eq('user_id', data.user.id).in('submission_id', photos.slice(start, start + 250).map((p) => p.submission_id));
    if (result.error) throw new Error('Could not load your votes. Please retry.');
    for (const row of result.data || []) votes.set(row.submission_id, row.vote);
  }
  return photos.map((p) => ({ ...p, current_vote: votes.get(p.submission_id) ?? null }));
}
