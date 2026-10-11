import { accountUserId, lookupAccount } from './accountBoundary.js';

export const WING_JURY_FUNCTIONS = Object.freeze({
  feed: 'wing-jury-feed',
  vote: 'wing-jury-vote',
  reveal: 'wing-jury-reveal',
});

export class WingJuryError extends Error {
  constructor(code, message, cause = null) {
    super(message);
    this.name = 'WingJuryError';
    this.code = code;
    this.cause = cause;
  }
}

const VALID_VOTES = new Set([-1, 0, 1]);
const DEFAULT_ENABLED = ['1', 'true', 'yes', 'on'].includes(String(process.env.EXPO_PUBLIC_ENABLE_WING_JURY || '').trim().toLowerCase());

function requireEnabled(enabled = DEFAULT_ENABLED) {
  if (!enabled) throw new WingJuryError('FEATURE_DISABLED', 'Wing Jury is not available in this app release yet.');
}

function normalizePhoto(photo) {
  if (!photo?.submission_id || typeof photo.signed_url !== 'string' || !photo.signed_url) return null;
  return {
    submission_id: String(photo.submission_id),
    signed_url: photo.signed_url,
    media_type: photo.media_type === 'photo' ? 'photo' : null,
    expires_at: photo.expires_at || null,
  };
}

export function normalizeWingJuryFeedResponse(payload) {
  const photos = Array.isArray(payload?.photos) ? payload.photos.map(normalizePhoto).filter(Boolean) : [];
  return {
    photos,
    nextCursor: typeof payload?.next_cursor === 'string' && payload.next_cursor ? payload.next_cursor : null,
    hasMore: payload?.has_more === true,
    status: payload?.status || 'ready',
  };
}

export function createGuestJurySession() {
  const judged = new Set();
  const verdicts = new Map();
  return {
    hasJudged: (submissionId) => judged.has(String(submissionId)),
    register: (submissionId, vote) => {
      const id = String(submissionId);
      if (!VALID_VOTES.has(vote)) throw new WingJuryError('INVALID_VOTE', 'Choose dislike, average, or like.');
      if (judged.has(id)) return { duplicate: true, vote: verdicts.get(id), submission_id: id };
      judged.add(id);
      verdicts.set(id, vote);
      return { duplicate: false, vote, submission_id: id };
    },
    judgedIds: () => Array.from(judged),
    clear: () => { judged.clear(); verdicts.clear(); },
  };
}

export function validateWingJuryVote(vote) {
  if (typeof vote !== 'number' || !VALID_VOTES.has(vote)) throw new WingJuryError('INVALID_VOTE', 'Wing Jury votes must be -1, 0, or 1.');
  return vote;
}

function requireCurrent(user, expectedUserId, isCurrent) {
  if (isCurrent?.() === false || (expectedUserId !== undefined && accountUserId(user) !== expectedUserId)) {
    throw new WingJuryError('ACCOUNT_CHANGED', 'Your account changed. Start a new Wing Jury session.');
  }
}

async function getUser(client, expectedUserId, isCurrent) {
  let user;
  try { user = await lookupAccount(client); }
  catch (error) { throw new WingJuryError('AUTH_LOOKUP_FAILED', 'We could not verify your account.', error); }
  requireCurrent(user, expectedUserId, isCurrent);
  return user;
}

async function requestHeaders(client, user, expectedUserId, isCurrent) {
  // Pin the caller token so an invoke queued by A cannot silently use B's token.
  if (!client.auth.getSession) return undefined;
  const { data, error } = await client.auth.getSession();
  if (error) throw new WingJuryError('AUTH_LOOKUP_FAILED', 'We could not verify your account.', error);
  const session = data?.session;
  if ((session?.user?.id || null) !== (user?.id || null)) throw new WingJuryError('ACCOUNT_CHANGED', 'Your account changed. Start a new Wing Jury session.');
  requireCurrent(user, expectedUserId, isCurrent);
  if (session && !session.access_token) throw new WingJuryError('AUTH_LOOKUP_FAILED', 'We could not verify your account.');
  return { Authorization: session ? `Bearer ${session.access_token}` : '' };
}

export async function getWingJuryPhotoBatch({ client, location = null, cursor = null, limit = 12, guestSession, enabled = DEFAULT_ENABLED, expectedUserId, isCurrent } = {}) {
  requireEnabled(enabled);
  const user = await getUser(client, expectedUserId, isCurrent);
  const hasLocation = typeof location?.latitude === 'number' && Number.isFinite(location.latitude) && Math.abs(location.latitude) <= 90
    && typeof location?.longitude === 'number' && Number.isFinite(location.longitude) && Math.abs(location.longitude) <= 180;
  const body = {
    latitude: hasLocation ? location.latitude : null,
    longitude: hasLocation ? location.longitude : null,
    cursor: cursor || null,
    limit: Math.max(1, Math.min(24, Number(limit) || 12)),
    judged_submission_ids: accountUserId(user) ? [] : (guestSession?.judgedIds?.() || []).slice(-500),
  };
  const headers = await requestHeaders(client, user, expectedUserId, isCurrent);
  requireCurrent(user, expectedUserId, isCurrent);
  // The request carries a bounded hint; the full guest session is authoritative
  // locally. Empty server work-budget pages must not look like exhaustion.
  let nextCursor = body.cursor;
  for (let page = 0; page < 4; page += 1) {
    requireCurrent(user, expectedUserId, isCurrent);
    const { data, error } = await client.functions.invoke(WING_JURY_FUNCTIONS.feed, { body: { ...body, cursor: nextCursor }, ...(headers ? { headers } : {}) });
    requireCurrent(user, expectedUserId, isCurrent);
    if (error || data?.ok === false) throw new WingJuryError('FEED_UNAVAILABLE', 'Wing Jury photos are temporarily unavailable. Try again.', error || data?.error);
    const result = normalizeWingJuryFeedResponse(data);
    if (!accountUserId(user)) result.photos = result.photos.filter((photo) => !guestSession?.hasJudged?.(photo.submission_id));
    if (result.hasMore && (!result.nextCursor || result.nextCursor === nextCursor)) {
      throw new WingJuryError('FEED_UNAVAILABLE', 'Wing Jury could not continue this feed. Try again.');
    }
    if (result.photos.length || !result.hasMore || page === 3) return result;
    nextCursor = result.nextCursor;
  }
}

export async function recordWingJuryVerdict({ client, photo, vote, guestSession, enabled = DEFAULT_ENABLED, expectedUserId, isCurrent } = {}) {
  requireEnabled(enabled);
  const submissionId = String(photo?.submission_id || '');
  if (!submissionId) throw new WingJuryError('INVALID_PHOTO', 'That photo is no longer available.');
  const normalizedVote = validateWingJuryVote(vote);
  const user = await getUser(client, expectedUserId, isCurrent);
  if (!user?.id || user.is_anonymous) {
    if (!guestSession) throw new WingJuryError('GUEST_SESSION_REQUIRED', 'Start a Wing Jury session before voting.');
    return { status: 'guest', ...guestSession.register(submissionId, normalizedVote), revealReady: true };
  }
  const headers = await requestHeaders(client, user, expectedUserId, isCurrent);
  requireCurrent(user, expectedUserId, isCurrent);
  const { data, error } = await client.functions.invoke(WING_JURY_FUNCTIONS.vote, {
    body: { submission_id: submissionId, vote: normalizedVote },
    ...(headers ? { headers } : {}),
  });
  requireCurrent(user, expectedUserId, isCurrent);
  if (error || data?.ok === false) {
    const code = data?.error === 'existing_vote' ? 'EXISTING_VOTE' : 'VOTE_FAILED';
    throw new WingJuryError(code, data?.message || 'Your Wing Jury verdict was not saved. Try again.', error || data?.error);
  }
  return { status: 'authenticated', ...data, revealReady: true };
}

export async function getWingJuryReveal({ client, submissionId, guestVerdictRegistered = false, enabled = DEFAULT_ENABLED, expectedUserId, isCurrent } = {}) {
  requireEnabled(enabled);
  if (!submissionId) throw new WingJuryError('INVALID_PHOTO', 'That photo is no longer available.');
  const user = await getUser(client, expectedUserId, isCurrent);
  const headers = await requestHeaders(client, user, expectedUserId, isCurrent);
  requireCurrent(user, expectedUserId, isCurrent);
  const { data, error } = await client.functions.invoke(WING_JURY_FUNCTIONS.reveal, {
    body: { submission_id: String(submissionId), guest_verdict_registered: Boolean(guestVerdictRegistered) },
    ...(headers ? { headers } : {}),
  });
  requireCurrent(user, expectedUserId, isCurrent);
  if (error || data?.ok === false) throw new WingJuryError('REVEAL_UNAVAILABLE', 'The restaurant reveal is temporarily unavailable. You can continue to the next photo.', error || data?.error);
  return data;
}

export function clearWingJurySession(session) {
  session?.clear?.();
}
