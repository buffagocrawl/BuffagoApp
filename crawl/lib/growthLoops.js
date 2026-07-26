function clampInteger(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.round(numeric));
}

export function buildWeeklyMissionSummary({
  ratingsThisWeek = 0,
  sharesThisWeek = 0,
  invitesThisWeek = 0,
  crawlStopsVisited = 0,
} = {}) {
  const mission = [
    {
      key: 'ratings',
      label: 'Rate 2 wing spots',
      actionLabel: 'Rate a wing spot',
      current: Math.min(clampInteger(ratingsThisWeek), 2),
      target: 2,
    },
    {
      key: 'share',
      label: 'Share 1 BuffaGo moment',
      actionLabel: 'Share a BuffaGo moment',
      current: Math.min(clampInteger(sharesThisWeek), 1),
      target: 1,
    },
    {
      key: 'invite',
      label: 'Invite 1 wing friend',
      actionLabel: 'Invite a friend',
      current: Math.min(clampInteger(invitesThisWeek), 1),
      target: 1,
    },
    {
      key: 'crawl',
      label: 'Visit 3 crawl stops',
      actionLabel: 'Start a crawl',
      current: Math.min(clampInteger(crawlStopsVisited), 3),
      target: 3,
    },
  ].map((item) => ({
    ...item,
    complete: item.current >= item.target,
  }));

  const completedCount = mission.filter((item) => item.complete).length;
  const totalCount = mission.length;
  const nextMission = mission.find((item) => !item.complete) || null;

  return {
    items: mission,
    completedCount,
    totalCount,
    completionRatio: totalCount ? completedCount / totalCount : 0,
    nextMission,
    headline:
      completedCount === totalCount
        ? 'Weekly mission complete'
        : nextMission
        ? `Next up: ${nextMission.label}`
        : 'Keep your streak alive',
    // This Home loop is a progress guide only. It is intentionally separate from
    // the server-authoritative retention missions and their XP reward receipts.
    reward: {
      kind: 'none',
      title: 'No separate reward yet',
      detail: 'Completing these Home activities does not currently grant XP, coins, or a badge.',
    },
    resetCopy: 'Resets Monday at 12:00 AM in your device time zone. Partial progress does not carry over.',
  };
}

export function buildShareArtifact({
  restaurantName,
  address = null,
  city = null,
  stateCode = null,
  deepLink = null,
} = {}) {
  const safeRestaurant = String(restaurantName || 'this wing spot').trim();
  const safeAddress = String(address || '').trim();
  const location = [city, stateCode].filter(Boolean).join(', ');
  const safeDeepLink = String(deepLink || '').trim();
  const detail = safeAddress || location;

  return {
    title: `BuffaGo: ${safeRestaurant}`,
    message: [
      `Check out ${safeRestaurant} on BuffaGo!`,
      detail ? `Location: ${detail}` : null,
      safeDeepLink || null,
    ]
      .filter(Boolean)
      .join('\n'),
  };
}
