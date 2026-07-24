const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));

export function getMissionTimeRemaining(now = new Date()) {
  const current = new Date(now);
  const reset = new Date(current);
  reset.setHours(24, 0, 0, 0);
  const minutes = Math.max(0, Math.ceil((reset.getTime() - current.getTime()) / 60000));
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return hours > 0 ? `${hours}h ${mins}m left` : `${mins}m left`;
}

export function buildDailyMission({
  activeCrawl = null,
  battleTotal = 0,
  battleAnswered = 0,
  restaurant = null,
  restaurantRated = false,
  now = new Date(),
} = {}) {
  if (activeCrawl?.crawlId && activeCrawl.totalStops > activeCrawl.visitedCount) {
    return {
      id: `continue-crawl:${activeCrawl.crawlId}`,
      type: 'continue_crawl',
      title: 'Move the crawl forward',
      detail: 'Visit your next stop and log a rating.',
      current: clamp(activeCrawl.visitedCount, 0, activeCrawl.totalStops),
      target: Math.max(1, Number(activeCrawl.totalStops) || 1),
      reward: 'Crawl XP',
      ctaLabel: 'Resume crawl',
      timeRemaining: getMissionTimeRemaining(now),
    };
  }
  if (battleTotal > 0 && battleAnswered < battleTotal) {
    return {
      id: `wing-battle:${new Date(now).toISOString().slice(0, 10)}`,
      type: 'wing_battle',
      title: 'Settle today’s sauce duels',
      detail: 'Make quick picks. No essay required.',
      current: clamp(battleAnswered, 0, battleTotal),
      target: battleTotal,
      reward: '3 Buffacoins',
      ctaLabel: 'Vote now',
      timeRemaining: getMissionTimeRemaining(now),
    };
  }

  return {
    id: `rate-spot:${new Date(now).toISOString().slice(0, 10)}`,
    type: 'rate_restaurant',
    title: restaurantRated ? 'Find tonight’s next contender' : 'Rate one wing spot',
    detail: restaurant
      ? restaurantRated
        ? `${restaurant.name} is logged. Pick another spot to keep rolling.`
        : `Put ${restaurant.name} on your Wingdex.`
      : 'Find nearby wings and put one spot on your Wingdex.',
    current: restaurantRated ? 1 : 0,
    target: 1,
    reward: 'Rating XP',
    ctaLabel: restaurantRated ? 'Swap spot' : restaurant ? 'Rate this spot' : 'Find wings',
    timeRemaining: getMissionTimeRemaining(now),
  };
}

export function selectNextBestAction({
  onboardingIncomplete = false,
  activeCrawl = null,
  mission = null,
  restaurant = null,
  restaurantRated = false,
  locationStatus = 'granted',
  loading = false,
} = {}) {
  if (onboardingIncomplete) {
    return { type: 'finish_onboarding', title: 'Build your wing profile', ctaLabel: 'Finish setup', priority: 100 };
  }
  if (activeCrawl?.crawlId && activeCrawl.totalStops > activeCrawl.visitedCount) {
    return {
      type: 'resume_crawl',
      title: 'One tap back to the crawl',
      subtitle: `${activeCrawl.visitedCount}/${activeCrawl.totalStops} stops complete`,
      ctaLabel: 'Resume crawl',
      priority: 90,
    };
  }
  if (mission?.complete && !mission?.claimed) {
    return {
      type: 'claim_reward',
      title: `${mission.reward} earned`,
      subtitle: 'Mission complete. Lock in your reward.',
      ctaLabel: 'Claim XP',
      priority: 85,
    };
  }
  if (locationStatus !== 'granted') {
    return {
      type: 'enable_location',
      title: 'Let’s find wings near you',
      subtitle: 'Enable location, or pick an area manually.',
      ctaLabel: 'Enable location',
      priority: 80,
    };
  }
  if (loading) {
    return { type: 'loading', title: 'Finding your next move…', ctaLabel: null, priority: 70 };
  }
  if (mission && mission.current < mission.target) {
    return {
      type: mission.type,
      title: mission.title,
      subtitle: mission.detail,
      ctaLabel: mission.ctaLabel,
      priority: 60,
    };
  }
  if (restaurant && !restaurantRated) {
    return {
      type: 'rate_restaurant',
      title: `Rate ${restaurant.name}`,
      subtitle: 'Fresh wings, fresh opinion.',
      ctaLabel: 'Rate this spot',
      priority: 50,
    };
  }
  return {
    type: 'find_wings',
    title: 'Find your next wing spot',
    subtitle: 'Pick an area and BuffaGo will make the call.',
    ctaLabel: 'Find wings',
    priority: 40,
  };
}
