export const PROXIMITY_TARGET_METERS = 161;
export const PROXIMITY_REGION_RADIUS_METERS = 200;
export const MAX_FOREGROUND_ACCURACY_METERS = 75;
export const EXIT_HYSTERESIS_METERS = 250;

export function haversineMeters(a, b) {
  const rad = (value) => (value * Math.PI) / 180;
  const earth = 6371000;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const lat1 = rad(a.latitude);
  const lat2 = rad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * earth * Math.asin(Math.sqrt(h));
}

export function evaluateForegroundProximity({ location, destination, wasInside = false }) {
  if (!location?.coords || !destination) return { eligible: false, reason: 'location_missing' };
  const accuracy = Number(location.coords.accuracy);
  if (!Number.isFinite(accuracy) || accuracy > MAX_FOREGROUND_ACCURACY_METERS) {
    return { eligible: false, reason: 'location_accuracy_insufficient' };
  }
  const distanceMeters = haversineMeters(location.coords, destination);
  const threshold = wasInside ? EXIT_HYSTERESIS_METERS : PROXIMITY_TARGET_METERS;
  return {
    eligible: distanceMeters <= threshold,
    reason: distanceMeters <= threshold ? 'inside' : 'outside',
    distanceBand: distanceMeters <= 100 ? '0_100' : distanceMeters <= 161 ? '101_161' : 'over_161',
  };
}

export function selectGeofenceRegions(stops) {
  const next = (stops || []).find((stop) => !stop.completed && !stop.cancelled);
  if (!next?.latitude || !next?.longitude) return [];
  return [{
    identifier: `buffago:crawl:${next.crawlId}:destination:${next.destinationId}`,
    latitude: next.latitude,
    longitude: next.longitude,
    radius: PROXIMITY_REGION_RADIUS_METERS,
    notifyOnEnter: true,
    notifyOnExit: false,
  }];
}
