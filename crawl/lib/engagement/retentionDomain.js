const DAILY_CATALOG = Object.freeze([
  { key: 'rate_one', action: 'rating_created', target: 1, rewardXp: 35, label: 'Rate one wing spot' },
  { key: 'battle_three', action: 'battle_vote', target: 3, rewardXp: 30, label: 'Vote in three wing battles' },
  { key: 'crawl_progress', action: 'crawl_stop_completed', target: 1, rewardXp: 30, label: 'Move your crawl forward' },
]);

export const RETENTION_TIMEZONE_FALLBACK = 'UTC';

export function isValidTimeZone(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    Intl.DateTimeFormat('en-US', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export function normalizeTimeZone(value) {
  return isValidTimeZone(value) ? value : RETENTION_TIMEZONE_FALLBACK;
}

export function localDateKey(at = new Date(), timeZone = RETENTION_TIMEZONE_FALLBACK) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: normalizeTimeZone(timeZone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(at);
  const pick = (type) => parts.find((part) => part.type === type)?.value;
  return `${pick('year')}-${pick('month')}-${pick('day')}`;
}

export function stableHash(input) {
  let hash = 2166136261;
  for (const character of String(input)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function selectDailyMission({ userId, assignmentDate, eligibleActions = [] }) {
  const eligible = DAILY_CATALOG.filter(
    (mission) => eligibleActions.length === 0 || eligibleActions.includes(mission.action)
  );
  if (!eligible.length) return null;
  return { ...eligible[stableHash(`${userId}:${assignmentDate}`) % eligible.length] };
}

export function getStreakTransition({
  currentStreak = 0,
  longestStreak = 0,
  lastQualifiedDate = null,
  qualifiedDate,
}) {
  if (!qualifiedDate) throw new Error('qualifiedDate is required');
  if (lastQualifiedDate === qualifiedDate) {
    return { currentStreak, longestStreak, changed: false, status: 'already_counted' };
  }
  const day = 86400000;
  const previous = lastQualifiedDate
    ? Math.round((Date.parse(`${qualifiedDate}T00:00:00Z`) - Date.parse(`${lastQualifiedDate}T00:00:00Z`)) / day)
    : null;
  const next = previous === 1 ? currentStreak + 1 : 1;
  return {
    currentStreak: next,
    longestStreak: Math.max(longestStreak, next),
    changed: true,
    status: previous != null && previous > 1 ? 'restarted' : 'extended',
  };
}

export function eventStatus(event, at = new Date()) {
  if (!event?.enabled) return 'disabled';
  const now = at.getTime();
  if (now < Date.parse(event.startsAt)) return 'upcoming';
  if (now >= Date.parse(event.endsAt)) return 'ended';
  return 'active';
}

export function missionViewModel(assignment, at = new Date()) {
  if (!assignment) return null;
  const progress = Math.min(Number(assignment.progress) || 0, Number(assignment.target) || 1);
  return {
    ...assignment,
    progress,
    ratio: progress / assignment.target,
    complete: Boolean(assignment.completed_at) || progress >= assignment.target,
    claimed: Boolean(assignment.claimed_at),
    expired: Date.parse(assignment.expires_at) <= at.getTime(),
  };
}
