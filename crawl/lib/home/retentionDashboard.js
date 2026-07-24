import { missionViewModel } from '../engagement/retentionDomain.js';

const LABELS = {
  rate_one: 'Rate one wing spot',
  battle_three: 'Vote in three wing battles',
  crawl_progress: 'Move your crawl forward',
  weekly_three_ratings: 'Rate three wing spots this week',
};

export function getDeviceTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function mapRetentionDashboard(payload, at = new Date()) {
  const assignments = Array.isArray(payload?.assignments) ? payload.assignments : [];
  const mapped = assignments.map((assignment) => {
    const view = missionViewModel(assignment, at);
    return {
      ...view,
      id: assignment.id,
      actionType: assignment.action_type,
      type: assignment.action_type === 'rating_created'
        ? 'rate_restaurant'
        : assignment.action_type === 'battle_vote'
          ? 'wing_battle'
          : assignment.action_type === 'crawl_stop_completed'
            ? 'continue_crawl'
            : assignment.action_type,
      title: LABELS[assignment.mission_key] || assignment.title || 'Wing mission',
      detail: assignment.period_kind === 'weekly'
        ? 'Stack progress all week. Your reward is safely saved.'
        : 'Complete it before the daily reset.',
      current: view.progress,
      reward: `${Number(assignment.reward_xp) || 0} XP`,
      ctaLabel: view.complete && !view.claimed ? 'Claim XP' : view.complete ? 'Claimed' : 'Go',
      timeRemaining: resetLabel(assignment.expires_at, at),
    };
  });
  return {
    daily: mapped.find((item) => item.period_kind === 'daily') || null,
    weekly: mapped.find((item) => item.period_kind === 'weekly') || null,
    streak: payload?.streak || { current_streak: 0, longest_streak: 0 },
    events: Array.isArray(payload?.events) ? payload.events : [],
  };
}

export function resetLabel(expiresAt, at = new Date()) {
  const ms = Date.parse(expiresAt) - at.getTime();
  if (!Number.isFinite(ms) || ms <= 0) return 'Resetting now';
  const hours = Math.ceil(ms / 3600000);
  if (hours < 24) return `${hours}h left`;
  const days = Math.ceil(hours / 24);
  return `${days}d left`;
}

export function shouldUseRetentionFallback(error) {
  const text = `${error?.message || ''} ${error?.cause?.message || ''}`.toLowerCase();
  return (
    text.includes('get_engagement_dashboard') ||
    text.includes('network') ||
    text.includes('fetch') ||
    text.includes('offline')
  );
}
