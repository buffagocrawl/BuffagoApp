export const WINGDEX_RADIUS_OPTIONS = Object.freeze([5, 10, 25, 50, 100, 250]);

export function nextWingdexRadius(currentRadius) {
  return WINGDEX_RADIUS_OPTIONS.find((radius) => radius > Number(currentRadius)) ?? null;
}

export function wingdexRadiusMessage(currentRadius) {
  const current = `Currently searching within ${currentRadius} miles.`;
  return nextWingdexRadius(currentRadius) === null
    ? `${current} Maximum search radius reached. Try adjusting your filters or add the missing restaurant.`
    : `${current} Expand your radius or add the missing restaurant.`;
}
