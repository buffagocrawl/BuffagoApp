import { mapCoordinate } from './mapSafety.js';

// These straight segments show stop order, never driving directions or road geometry.
export function routePreviewPoints(stops) {
  const valid = (stops || []).map((stop, index) => ({ coordinate: mapCoordinate(stop), number: index + 1 })).filter((point) => point.coordinate);
  if (!valid.length) return [];
  const latitudes = valid.map(({ coordinate }) => coordinate.latitude);
  const longitudes = valid.map(({ coordinate }) => coordinate.longitude);
  const minLat = Math.min(...latitudes), maxLat = Math.max(...latitudes);
  const minLng = Math.min(...longitudes), maxLng = Math.max(...longitudes);
  return valid.map(({ coordinate, number }) => ({ number,
    x: maxLng === minLng ? 160 : 35 + (coordinate.longitude - minLng) / (maxLng - minLng) * 250,
    y: maxLat === minLat ? 78 : 125 - (coordinate.latitude - minLat) / (maxLat - minLat) * 92,
  }));
}

export function featuredRecommendation(routes, active, completed) {
  return routes.find((route) => route.stops?.length > 0 && route.distanceMi != null && Number.isFinite(Number(route.distanceMi)) && !active[route.id] && !completed(route.id)) || null;
}
