// Development/test-only fixtures. This module never reads or writes Supabase.
export const LEGENDARY_SHOWCASE_FIXTURES = Object.freeze({
  activeNearby: { key: 'activeNearby', status: 'active', scope: 'nearby', restaurantName: 'Firebird Wings', city: 'Buffalo', reason: 'Their garlic-parm wings are having a moment.', minutesRemaining: 47, progress: 0 },
  activeStatewide: { key: 'activeStatewide', status: 'active', scope: 'statewide', restaurantName: 'Lake Effect Wing Co.', city: 'Rochester', reason: 'A New York wing stop worth the drive.', minutesRemaining: 132, progress: 0 },
  oneHour: { key: 'oneHour', status: 'active', scope: 'nearby', restaurantName: 'The Blue Door', city: 'Amherst', reason: 'Crisp, saucy, and Legendary for one more hour.', minutesRemaining: 60, progress: 0 },
  participationStarted: { key: 'participationStarted', status: 'started', scope: 'nearby', restaurantName: 'Firebird Wings', city: 'Buffalo', reason: 'You started this stop. Finish with one eligible rating.', minutesRemaining: 31, progress: 0.5 },
  completion: { key: 'completion', status: 'completed', scope: 'nearby', restaurantName: 'Firebird Wings', city: 'Buffalo', reason: 'You found the moment and rated it.', minutesRemaining: 0, progress: 1 },
  pendingReward: { key: 'pendingReward', status: 'pending_reward', scope: 'nearby', restaurantName: 'Firebird Wings', city: 'Buffalo', reason: 'Recognition is recorded; reward review is pending.', minutesRemaining: 0, progress: 1 },
  paused: { key: 'paused', status: 'paused', scope: 'nearby', restaurantName: 'The Blue Door', city: 'Amherst', reason: 'This stop is paused while Buffago checks the event.', minutesRemaining: 60, progress: 0 },
  cancelled: { key: 'cancelled', status: 'cancelled', scope: 'nearby', restaurantName: 'The Blue Door', city: 'Amherst', reason: 'This stop ended before you arrived.', minutesRemaining: 0, progress: 0 },
  expired: { key: 'expired', status: 'expired', scope: 'nearby', restaurantName: 'The Blue Door', city: 'Amherst', reason: 'The Legendary window has closed.', minutesRemaining: 0, progress: 0 },
  offline: { key: 'offline', status: 'offline', scope: 'nearby', restaurantName: 'Firebird Wings', city: 'Buffalo', reason: 'You are offline. We will keep your last known mission visible.', minutesRemaining: 47, progress: 0 },
  stale: { key: 'stale', status: 'stale', scope: 'nearby', restaurantName: 'Firebird Wings', city: 'Buffalo', reason: 'This mission needs a quick refresh before it can be trusted.', minutesRemaining: 47, progress: 0 },
  locationDenied: { key: 'locationDenied', status: 'location_denied', scope: 'statewide', restaurantName: 'Lake Effect Wing Co.', city: 'Rochester', reason: 'Location is off, so here is a statewide discovery instead.', minutesRemaining: 132, progress: 0 },
  emptyLocal: { key: 'emptyLocal', status: 'empty', scope: 'nearby', restaurantName: null, city: null, reason: 'No nearby Legendary stop right now. Explore the Wingdex or check the statewide board.', minutesRemaining: 0, progress: 0 },
  multiple: { key: 'multiple', status: 'multiple', scope: 'nearby', restaurantName: 'Firebird Wings', city: 'Buffalo', reason: 'Three local stops are glowing today.', minutesRemaining: 47, progress: 0 },
  clustered: { key: 'clustered', status: 'clustered', scope: 'nearby', restaurantName: '3 Legendary stops', city: 'Buffalo', reason: 'Tap to choose a stop before the window moves on.', minutesRemaining: 47, progress: 0 },
  longName: { key: 'longName', status: 'active', scope: 'nearby', restaurantName: 'The Extremely Long Named Neighborhood Wing & Sauce House', city: 'Buffalo', reason: 'A local classic with a very long sign.', minutesRemaining: 47, progress: 0 },
  noImage: { key: 'noImage', status: 'active', scope: 'nearby', restaurantName: 'No Image Wings', city: 'Buffalo', reason: 'The wings are real even when the photo is missing.', minutesRemaining: 47, progress: 0 },
  disabled: { key: 'disabled', status: 'disabled', scope: 'nearby', restaurantName: null, city: null, reason: 'Legendary stops are taking a breather. Your regular Wingdex still works.', minutesRemaining: 0, progress: 0 },
});

export const getLegendaryShowcaseFixture = (key = 'activeNearby') =>
  LEGENDARY_SHOWCASE_FIXTURES[key] || LEGENDARY_SHOWCASE_FIXTURES.activeNearby;

export const legendaryBenchmarkFixtures = (count) =>
  Array.from({ length: count }, (_, index) => ({
    id: `restaurant-${index}`,
    name: `Wing stop ${index}`,
    lat: 42.88 + (index % 25) * 0.002,
    lng: -78.87 + (index % 20) * 0.002,
    legendary: index % 7 === 0,
  }));

export const mergeLegendaryMarkers = (restaurants, events) => {
  const byRestaurant = new Map((events || []).map((event) => [event.restaurantId, event]));
  return (restaurants || []).map((restaurant) => ({ ...restaurant, legendary: byRestaurant.get(restaurant.id) || null }));
};

export const prepareLegendaryClusters = (markers, cellSize = 0.01) => {
  const clusters = new Map();
  for (const marker of markers || []) {
    const key = `${Math.floor(marker.lat / cellSize)}:${Math.floor(marker.lng / cellSize)}`;
    const current = clusters.get(key) || { key, count: 0, markers: [] };
    current.count += 1;
    current.markers.push(marker);
    clusters.set(key, current);
  }
  return Array.from(clusters.values());
};
