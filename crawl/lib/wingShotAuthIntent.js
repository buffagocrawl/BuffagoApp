const KEY = 'buffago:wing-shot:onboarding-return:v1';
const TTL = 30 * 60 * 1000;
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
let queue = Promise.resolve();
let sequence = 0;
const routed = new Set();
function exclusive(work) {
  const result = queue.then(work);
  queue = result.catch(() => {});
  return result;
}
async function read(storage, now) {
  const raw = await storage.getItem(KEY);
  if (!raw) return null;
  let intent;
  try { intent = JSON.parse(raw); } catch { /* invalid local data */ }
  if (!intent || intent.version !== 2 || intent.source !== 'onboarding' ||
    typeof intent.id !== 'string' || !['pending', 'routed'].includes(intent.handoff) ||
    !Number.isFinite(intent.createdAt) || intent.createdAt > now || intent.expiresAt !== intent.createdAt + TTL || now >= intent.expiresAt ||
    (intent.destinationId !== null && !uuid(intent.destinationId)) ||
    (intent.userId !== null && typeof intent.userId !== 'string')) {
    await storage.removeItem(KEY); return null;
  }
  return intent;
}
export function saveWingShotIntent(storage, { destinationId, restaurantName, userId = null }, now = Date.now()) {
  return exclusive(async () => {
    routed.clear();
    const intent = { version: 2, id: `${now}-${++sequence}`, source: 'onboarding',
      destinationId: uuid(destinationId) ? destinationId : null,
      restaurantName: typeof restaurantName === 'string' ? restaurantName.trim().slice(0, 120) : '',
      createdAt: now, expiresAt: now + TTL, userId, handoff: 'pending' };
    await storage.setItem(KEY, JSON.stringify(intent));
    return intent;
  });
}
export function clearWingShotIntent(storage) { return exclusive(async () => { routed.clear(); await storage.removeItem(KEY); }); }
// Call outside the Supabase auth listener's lock. Initial guest->account is allowed;
// sign-out or a subsequent account boundary invalidates the private pending action.
export function clearWingShotIntentForAccount(storage, { signedOut = false, userId = null, previousUserId = null }, now = Date.now()) {
  return exclusive(async () => {
    const intent = await read(storage, now);
    if (intent && (signedOut || (previousUserId && previousUserId !== userId) || (intent.userId && intent.userId !== userId))) await storage.removeItem(KEY);
  });
}
export function claimWingShotIntent({ storage, client, userId, isCurrent = () => true, now = Date.now() }) {
  return exclusive(async () => {
    if (!userId || !isCurrent()) return null;
    const intent = await read(storage, now);
    if (!intent || routed.has(intent.id)) return null;
    if (intent.userId && intent.userId !== userId) { await storage.removeItem(KEY); return null; }
    const { data, error } = await client.auth.getUser();
    if (error || data?.user?.id !== userId || data.user.is_anonymous || !isCurrent()) return null;
    // Bind before navigation; acknowledge only after the uploader resolves the
    // destination or deliberately presents the picker. A cold restart may retry.
    await storage.setItem(KEY, JSON.stringify({ ...intent, userId, handoff: 'routed' }));
    if (!isCurrent()) return null;
    routed.add(intent.id);
    return { pathname: '/profile/wing-shots/submit', params: { source: 'onboarding', handoffId: intent.id,
      destinationId: intent.destinationId || '', restaurantName: intent.restaurantName || '' } };
  });
}
export function getWingShotHandoff({ storage, client, handoffId, now = Date.now() }) {
  return exclusive(async () => {
    const intent = await read(storage, now);
    if (!intent || intent.id !== handoffId || intent.handoff !== 'routed') return null;
    const { data, error } = await client.auth.getUser();
    if (error) throw error;
    if (!data?.user?.id || data.user.is_anonymous || data.user.id !== intent.userId) return null;
    return intent;
  });
}
export function completeWingShotHandoff(storage, handoffId) {
  return exclusive(async () => {
    const intent = await read(storage, Date.now());
    if (intent?.id === handoffId) await storage.removeItem(KEY);
  });
}
export { uuid as isWingShotDestinationId };
