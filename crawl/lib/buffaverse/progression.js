const n = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export function calculateLevelProgress({ level, xp, currentThreshold, nextThreshold } = {}) {
  const current = n(currentThreshold);
  const next = n(nextThreshold);
  const points = n(xp);
  const span = next - current;
  const bounded = span > 0 ? Math.max(0, Math.min(1, (points - current) / span)) : 1;
  return {
    level: Math.max(1, Math.floor(n(level, 1))),
    xp: Math.max(0, Math.floor(points)),
    currentThreshold: current,
    nextThreshold: next > current ? next : current,
    percent: bounded,
  };
}

export function normalizeProgressSummary(input = {}) {
  const level = calculateLevelProgress(input.levelProgress || input);
  const metrics = input.metrics || {};
  return {
    level,
    title: String(input.title || `Wing Scout`).slice(0, 80),
    mascot: input.mascot || 'hero',
    territory: input.territory ? String(input.territory).slice(0, 80) : null,
    metrics: {
      restaurants: Math.max(0, Math.floor(n(metrics.restaurants))),
      crawls: Math.max(0, Math.floor(n(metrics.crawls))),
      states: Math.max(0, Math.floor(n(metrics.states))),
      badges: Math.max(0, Math.floor(n(metrics.badges))),
    },
    milestones: Array.isArray(input.milestones) ? input.milestones.slice(0, 8) : [],
  };
}

export function chooseNextObjective({ summary, referralEnabled = false } = {}) {
  const safe = normalizeProgressSummary(summary);
  const m = safe.metrics;
  const candidates = [
    { id: 'first-rating', label: 'Rate your first restaurant', description: 'Start your Buffaverse with a wing verdict.', route: '/(tabs)/ratings', available: m.restaurants === 0 },
    { id: 'next-rating', label: 'Rate your next restaurant', description: 'Add another stop to your wing map.', route: '/(tabs)/ratings', available: m.restaurants > 0 },
    { id: 'first-crawl', label: 'Complete your first crawl', description: 'Turn a few stops into a Buffago adventure.', route: '/(tabs)/routes', available: m.crawls === 0 },
    { id: 'next-badge', label: 'Earn your next badge', description: 'Keep playing to unlock another mark of progress.', route: '/profile/history/BadgesScreen', available: true },
    { id: 'invite-friend', label: 'Invite a wing friend', description: 'Share the journey when referrals are enabled.', route: '/referrals', available: referralEnabled },
  ];
  return candidates.find((candidate) => candidate.available) || candidates[3];
}

export function buildMilestones(summary = {}) {
  const safe = normalizeProgressSummary(summary);
  const m = safe.metrics;
  return [
    { id: 'restaurants-10', label: '10 restaurants rated', progress: Math.min(m.restaurants, 10), target: 10, complete: m.restaurants >= 10 },
    { id: 'crawl-1', label: 'First crawl completed', progress: Math.min(m.crawls, 1), target: 1, complete: m.crawls >= 1 },
    { id: 'badge-1', label: 'First badge earned', progress: Math.min(m.badges, 1), target: 1, complete: m.badges >= 1 },
  ];
}

export function celebrationKey(milestoneId, value) {
  return `buffaverse:${String(milestoneId)}:${String(value)}`;
}
