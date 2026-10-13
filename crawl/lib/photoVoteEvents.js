// Account-scoped local invalidation. Never retain another account's selected vote.
const listeners = new Set();
export function subscribePhotoVotes(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export function publishPhotoVote(userId, photo) {
  for (const listener of listeners) listener({ userId, photo });
}
