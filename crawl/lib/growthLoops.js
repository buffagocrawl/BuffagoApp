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
      current: Math.min(clampInteger(ratingsThisWeek), 2),
      target: 2,
    },
    {
      key: 'share',
      label: 'Share 1 BuffaGo moment',
      current: Math.min(clampInteger(sharesThisWeek), 1),
      target: 1,
    },
    {
      key: 'invite',
      label: 'Invite 1 wing friend',
      current: Math.min(clampInteger(invitesThisWeek), 1),
      target: 1,
    },
    {
      key: 'crawl',
      label: 'Visit 3 crawl stops',
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
  };
}

export function buildShareArtifact({
  restaurantName,
  score = null,
  city = null,
  stateCode = null,
  crawlTitle = null,
} = {}) {
  const safeRestaurant = String(restaurantName || 'this wing spot').trim();
  const safeScore = Number(score);
  const location = [city, stateCode].filter(Boolean).join(', ');
  const scoreText = Number.isFinite(safeScore) ? `${safeScore.toFixed(0)}/100` : null;

  const headline = scoreText
    ? `I just rated ${safeRestaurant} ${scoreText} on BuffaGo.`
    : `I just found ${safeRestaurant} on BuffaGo.`;

  const detail = location ? `Location: ${location}.` : null;
  const crawl = crawlTitle ? `Crawl: ${crawlTitle}.` : null;

  return {
    title: `BuffaGo: ${safeRestaurant}`,
    message: [headline, detail, crawl, 'Track your wing crawl on BuffaGo.']
      .filter(Boolean)
      .join('\n'),
  };
}

export function buildRestaurantOwnerSnapshot({
  restaurantName,
  ratingCount = 0,
  averageScore = null,
} = {}) {
  const safeRestaurant = String(restaurantName || 'This restaurant').trim() || 'This restaurant';
  const safeCount = clampInteger(ratingCount);
  const safeAverage =
    averageScore == null || averageScore === ''
      ? null
      : Number(averageScore);

  return {
    title: `Own ${safeRestaurant}?`,
    subtitle:
      safeCount > 0
        ? 'Claim your BuffaGo profile to understand how guests talk about your wings.'
        : 'Claim your BuffaGo profile early so guests can find verified details.',
    metrics: [
      {
        key: 'ratings',
        label: 'Ratings logged',
        value: String(safeCount),
      },
      {
        key: 'score',
        label: 'Average BuffaGo score',
        value: Number.isFinite(safeAverage) ? `${safeAverage.toFixed(1)}/100` : 'No score yet',
      },
    ],
    ctaLabel: 'Claim or enroll',
  };
}
