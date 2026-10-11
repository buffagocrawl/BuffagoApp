import AsyncStorage from '@react-native-async-storage/async-storage';
import { accountUserId, createAccountScope, lookupAccount } from './accountBoundary.js';

let defaultClientPromise;
async function resolveClient(client) {
  if (client) return client;
  defaultClientPromise ||= import('./supabase.js').then((module) => module.supabase);
  return defaultClientPromise;
}

export const SAVED_DESTINATION_TABLES = Object.freeze({
  favorites: 'user_destination_favorites',
  wantToTry: 'user_want_to_try',
});

export const SAVED_DESTINATION_INTENT_KEY = 'buffago:saved-destination-intent';

export class SavedDestinationError extends Error {
  constructor(code, message, cause = null) {
    super(message);
    this.name = 'SavedDestinationError';
    this.code = code;
    this.cause = cause;
  }
}

async function currentUser(client, expectedUserId, isCurrent) {
  let user;
  try { user = await lookupAccount(client); }
  catch (error) { throw new SavedDestinationError('AUTH_LOOKUP_FAILED', 'We could not verify your account.', error); }
  requireCurrent(user, expectedUserId, isCurrent);
  return accountUserId(user) ? user : null;
}

function requireCurrent(user, expectedUserId, isCurrent) {
  if (isCurrent?.() === false || (expectedUserId !== undefined && accountUserId(user) !== expectedUserId)) {
    throw new SavedDestinationError('ACCOUNT_CHANGED', 'Your account changed. Try again from your current account.');
  }
}

function requireDestinationId(destinationId) {
  if (!destinationId || typeof destinationId !== 'string') {
    throw new SavedDestinationError('INVALID_DESTINATION', 'That restaurant could not be saved.');
  }
  return destinationId;
}

function tableFor(kind) {
  const table = SAVED_DESTINATION_TABLES[kind];
  if (!table) throw new SavedDestinationError('INVALID_SAVED_LIST', 'That saved list is unavailable.');
  return table;
}

function mapDatabaseError(error) {
  const message = String(error?.message || error || '');
  if (/relation .* does not exist|could not find the table|schema cache/i.test(message)) {
    return new SavedDestinationError(
      'SAVED_DESTINATIONS_UNAVAILABLE',
      'Saved restaurants are not available in this app release yet.',
      error
    );
  }
  if (/favorite_requires_existing_rating/i.test(message)) {
    return new SavedDestinationError('FAVORITE_REQUIRES_RATING', 'Rate this restaurant before adding it to Favorites.', error);
  }
  if (/want_to_try_requires_unrated_restaurant/i.test(message)) {
    return new SavedDestinationError('WANT_TO_TRY_REQUIRES_UNRATED', 'Want to Try is only available before your first rating.', error);
  }
  if (/authentication_required|row-level security|42501/i.test(message)) {
    return new SavedDestinationError('AUTHENTICATION_REQUIRED', 'Sign in to save restaurants.', error);
  }
  return new SavedDestinationError('SAVED_DESTINATION_REQUEST_FAILED', 'We could not update your saved restaurants. Try again.', error);
}

async function personalRatingIds(client, userId, destinationIds = null) {
  let query = client.from('destination_ratings').select('destination_id').eq('user_id', userId);
  if (Array.isArray(destinationIds) && destinationIds.length) query = query.in('destination_id', destinationIds);
  const { data, error } = await query;
  if (error) throw mapDatabaseError(error);
  return new Set((data || []).map((row) => row?.destination_id).filter(Boolean));
}

export async function getSavedDestinationState({ client, destinationIds = [], expectedUserId, isCurrent } = {}) {
  client = await resolveClient(client);
  const user = await currentUser(client, expectedUserId, isCurrent);
  if (!user?.id) {
    return { status: 'guest', userId: null, ratedIds: new Set(), favoriteIds: new Set(), wantToTryIds: new Set() };
  }

  const ids = Array.from(new Set(destinationIds.filter(Boolean)));
  const load = async (kind) => {
    let query = client.from(tableFor(kind)).select('destination_id, created_at').eq('user_id', user.id);
    if (ids.length) query = query.in('destination_id', ids);
    const { data, error } = await query;
    if (error) throw mapDatabaseError(error);
    return new Set((data || []).map((row) => row?.destination_id).filter(Boolean));
  };

  const [ratedIds, favoriteIds, wantToTryIds] = await Promise.all([
    personalRatingIds(client, user.id, ids.length ? ids : null),
    load('favorites'),
    load('wantToTry'),
  ]);
  requireCurrent(user, expectedUserId, isCurrent);
  return { status: 'signed_in', userId: user.id, ratedIds, favoriteIds, wantToTryIds };
}

export async function getSavedDestinations({ client, kind, expectedUserId, isCurrent } = {}) {
  client = await resolveClient(client);
  const user = await currentUser(client, expectedUserId, isCurrent);
  if (!user?.id) return { status: 'guest', userId: null, rows: [] };

  const { data: saved, error: savedError } = await client
    .from(tableFor(kind))
    .select('destination_id, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });
  requireCurrent(user, expectedUserId, isCurrent);
  if (savedError) throw mapDatabaseError(savedError);

  const savedRows = saved || [];
  const ids = savedRows.map((row) => row.destination_id).filter(Boolean);
  if (!ids.length) return { status: 'signed_in', userId: user.id, rows: [] };

  const [{ data: destinations, error: destinationError }, ratedIds] = await Promise.all([
    client.from('destinations').select('id, name, lat, lng, address').in('id', ids),
    personalRatingIds(client, user.id, ids),
  ]);
  requireCurrent(user, expectedUserId, isCurrent);
  if (destinationError) throw mapDatabaseError(destinationError);

  const byId = new Map((destinations || []).map((destination) => [destination.id, destination]));
  return {
    status: 'signed_in',
    userId: user.id,
    rows: savedRows
      .map((savedRow) => ({
        ...byId.get(savedRow.destination_id),
        destination_id: savedRow.destination_id,
        created_at: savedRow.created_at,
        ratedByMe: ratedIds.has(savedRow.destination_id),
        count: 0,
        avgWeight: null,
        avgCrisp: null,
        avgSauce: null,
        avgMeat: null,
        avgOverall: null,
        topTags: [],
        countsByTag: {},
        myAvgWeight: null,
        town: null,
        stateCode: null,
      }))
      .filter((row) => row?.name),
  };
}

export async function mutateSavedDestination({ client, kind, destinationId, saved, expectedUserId, isCurrent }) {
  client = await resolveClient(client);
  const id = requireDestinationId(destinationId);
  tableFor(kind);
  if (typeof saved !== 'boolean') throw new SavedDestinationError('INVALID_SAVED_VALUE', 'Choose whether to save this restaurant.');
  const user = await currentUser(client, expectedUserId, isCurrent);
  if (!user?.id) return { status: 'guest', requiresAuth: true, saved: false, destinationId: id };

  if (saved) {
    // This is a UX preflight only. The staged database trigger remains the
    // authority and can reject a race or a changed rating state.
    const ratedIds = await personalRatingIds(client, user.id, [id]);
    requireCurrent(user, expectedUserId, isCurrent);
    if (kind === 'favorites' && !ratedIds.has(id)) {
      throw new SavedDestinationError('FAVORITE_REQUIRES_RATING', 'Rate this restaurant before adding it to Favorites.');
    }
    if (kind === 'wantToTry' && ratedIds.has(id)) {
      throw new SavedDestinationError('WANT_TO_TRY_REQUIRES_UNRATED', 'Want to Try is only available before your first rating.');
    }
    const { error } = await client.from(tableFor(kind)).upsert(
      { user_id: user.id, destination_id: id },
      { onConflict: 'user_id,destination_id', ignoreDuplicates: true }
    );
    if (error) throw mapDatabaseError(error);
  } else {
    const { error } = await client.from(tableFor(kind)).delete().eq('user_id', user.id).eq('destination_id', id);
    if (error) throw mapDatabaseError(error);
  }
  requireCurrent(user, expectedUserId, isCurrent);
  return { status: 'signed_in', userId: user.id, saved, destinationId: id };
}

const intentClaims = new WeakMap();
export function saveSavedDestinationIntent(intent, storage = AsyncStorage, isCurrent) {
  const previous = intentClaims.get(storage) || Promise.resolve();
  const operation = previous.catch(() => {}).then(async () => {
  if (isCurrent?.() === false) return false;
  if (!intent?.destinationId || !['favorites', 'wantToTry'].includes(intent.kind)) return false;
  await storage.setItem(SAVED_DESTINATION_INTENT_KEY, JSON.stringify({
    destinationId: String(intent.destinationId),
    kind: intent.kind,
    saved: intent.saved !== false,
  }));
  if (isCurrent?.() === false) {
    await storage.removeItem(SAVED_DESTINATION_INTENT_KEY);
    return false;
  }
  return true;
  });
  intentClaims.set(storage, operation);
  return operation;
}

export async function consumeSavedDestinationIntent(storage = AsyncStorage) {
  const raw = await storage.getItem(SAVED_DESTINATION_INTENT_KEY);
  if (!raw) return null;
  await storage.removeItem(SAVED_DESTINATION_INTENT_KEY);
  try {
    const value = JSON.parse(raw);
    if (!value?.destinationId || !['favorites', 'wantToTry'].includes(value.kind)) return null;
    return { destinationId: String(value.destinationId), kind: value.kind, saved: value.saved !== false };
  } catch {
    return null;
  }
}

export function clearSavedDestinationState(state = {}) {
  return { ...state, userId: null, ratedIds: new Set(), favoriteIds: new Set(), wantToTryIds: new Set(), rows: [] };
}

export function claimSavedDestinationIntent({ client, userId, storage = AsyncStorage, isCurrent } = {}) {
  const previous = intentClaims.get(storage) || Promise.resolve();
  const claim = previous.catch(() => {}).then(async () => {
    try {
    if (!userId) return null;
    const resolvedClient = await resolveClient(client);
    const user = await currentUser(resolvedClient, userId, isCurrent);
    if (!user) return null;
    const raw = await storage.getItem(SAVED_DESTINATION_INTENT_KEY);
    if (!raw) return null;
    await currentUser(resolvedClient, userId, isCurrent);
    requireCurrent(user, userId, isCurrent);
    // Only the verified account claiming this handoff may replay it.
    await storage.removeItem(SAVED_DESTINATION_INTENT_KEY);
    requireCurrent(user, userId, isCurrent);
    try {
      const intent = JSON.parse(raw);
      if (typeof intent?.destinationId !== 'string' || !intent.destinationId.trim() || !['favorites', 'wantToTry'].includes(intent.kind)) return null;
      return { destinationId: intent.destinationId, kind: intent.kind, saved: intent.saved !== false, userId };
    } catch { return null; }
    } catch (error) {
      // A cancelled or changed auth handoff must not survive for another account.
      if (error?.code === 'ACCOUNT_CHANGED') await storage.removeItem(SAVED_DESTINATION_INTENT_KEY);
      throw error;
    }
  });
  intentClaims.set(storage, claim);
  return claim;
}

export async function claimSavedDestinationAuthHandoff({ client, userId, storage = AsyncStorage, isCurrent } = {}) {
  const scope = createAccountScope();
  scope.update({ id: userId });
  const epoch = scope.capture();
  const { data } = client.auth.onAuthStateChange((_event, session) => { scope.update(session?.user || null); });
  try {
    return await claimSavedDestinationIntent({ client, userId, storage, isCurrent: () => scope.current(epoch) && isCurrent?.() !== false });
  } finally {
    scope.dispose();
    data?.subscription?.unsubscribe?.();
  }
}
