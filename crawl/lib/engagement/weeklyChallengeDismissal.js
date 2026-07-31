import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_PREFIX = 'buffago:weekly-challenge-dismissed:';

export function weeklyChallengeDismissalKey(userId) {
  return `${STORAGE_PREFIX}${userId || 'anonymous'}`;
}

export function isDismissalActive(record, challenge, now = Date.now()) {
  if (!record || !challenge || !challenge.id) return false;
  const expiresAt = Date.parse(challenge.expires_at || challenge.expiresAt || '');
  return (
    record.assignmentId === challenge.id &&
    Number.isFinite(expiresAt) &&
    expiresAt > now &&
    record.expiresAt === (challenge.expires_at || challenge.expiresAt)
  );
}

export async function loadWeeklyChallengeDismissal(userId, challenge) {
  if (!userId || !challenge?.id) return false;
  try {
    const raw = await AsyncStorage.getItem(weeklyChallengeDismissalKey(userId));
    if (!raw) return false;
    const record = JSON.parse(raw);
    if (isDismissalActive(record, challenge)) return true;
    await AsyncStorage.removeItem(weeklyChallengeDismissalKey(userId));
  } catch {
    // A storage failure should never prevent the mission from rendering.
  }
  return false;
}

export async function dismissWeeklyChallenge(userId, challenge) {
  if (!userId || !challenge?.id) return;
  const expiresAt = challenge.expires_at || challenge.expiresAt || null;
  if (!expiresAt || !Number.isFinite(Date.parse(expiresAt))) return;
  await AsyncStorage.setItem(
    weeklyChallengeDismissalKey(userId),
    JSON.stringify({ assignmentId: challenge.id, expiresAt })
  );
}
