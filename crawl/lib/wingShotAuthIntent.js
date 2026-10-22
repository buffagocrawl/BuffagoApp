const KEY = 'buffago:wing-shot:onboarding-return:v1';
const TTL = 30 * 60 * 1000;
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
let claiming = false;
export async function saveWingShotIntent(storage, { destinationId, restaurantName, userId = null }, now = Date.now()) {
  const intent = { version: 1, source: 'onboarding', destinationId: uuid(destinationId) ? destinationId : null,
    restaurantName: typeof restaurantName === 'string' ? restaurantName.trim().slice(0, 120) : '',
    createdAt: now, expiresAt: now + TTL, userId, handoff: 'pending' };
  await storage.setItem(KEY, JSON.stringify(intent));
  return intent;
}
export async function clearWingShotIntent(storage) { await storage.removeItem(KEY); }
export async function claimWingShotIntent({ storage, client, userId, isCurrent = () => true, now = Date.now() }) {
  if (claiming || !userId) return null;
  claiming = true;
  try {
    const raw = await storage.getItem(KEY);
    if (!raw) return null;
    let intent;
    try { intent = JSON.parse(raw); } catch { await storage.removeItem(KEY); return null; }
    if (intent.version !== 1 || intent.source !== 'onboarding' || intent.handoff !== 'pending' ||
      !Number.isFinite(intent.createdAt) || intent.createdAt > now || intent.expiresAt !== intent.createdAt + TTL || now >= intent.expiresAt ||
      (intent.destinationId !== null && !uuid(intent.destinationId)) || (intent.userId && intent.userId !== userId)) {
      await storage.removeItem(KEY); return null;
    }
    const { data, error } = await client.auth.getUser();
    if (error || data?.user?.id !== userId || data.user.is_anonymous || !isCurrent()) return null;
    await storage.removeItem(KEY);
    if (!isCurrent()) return null;
    return { pathname: '/profile/wing-shots/submit', params: { source: 'onboarding',
      destinationId: intent.destinationId || '', restaurantName: typeof intent.restaurantName === 'string' ? intent.restaurantName.slice(0, 120) : '' } };
  } finally { claiming = false; }
}
export { uuid as isWingShotDestinationId };
