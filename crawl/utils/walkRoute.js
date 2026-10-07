import { mapCoordinate, mapCoordinates } from '../lib/mapSafety.js';

const API_KEY = process.env.EXPO_PUBLIC_GOOGLE_API_KEY;

/** Reject truncated and overflowing encoded paths before native Maps. */
export function decodePolyline(encoded) {
  if (typeof encoded !== 'string' || encoded.length > 1000000) return [];
  let index = 0, lat = 0, lng = 0;
  const points = [];
  const component = () => {
    let result = 0, shift = 0;
    while (index < encoded.length && shift <= 30) {
      const byte = encoded.charCodeAt(index++) - 63;
      if (byte < 0 || byte > 63) return null;
      result += (byte & 31) * 2 ** shift;
      if (byte < 32) return result % 2 ? -(Math.floor(result / 2) + 1) : result / 2;
      shift += 5;
    }
    return null;
  };
  while (index < encoded.length) {
    const dlat = component(), dlng = component();
    if (dlat === null || dlng === null) return [];
    lat += dlat; lng += dlng;
    const point = mapCoordinate({ latitude: lat / 1e5, longitude: lng / 1e5 });
    if (!point) return [];
    points.push(point);
  }
  return points;
}

export async function getWalkingPath(values, { signal, isCurrent = () => true, fetchImpl = fetch, apiKey = API_KEY } = {}) {
  const coords = mapCoordinates(values);
  if (!apiKey || coords.length < 2 || signal?.aborted || !isCurrent()) return [];
  const all = [];
  for (let i = 0; i < coords.length - 1; i++) {
    if (signal?.aborted || !isCurrent()) return [];
    const origin = `${coords[i].latitude},${coords[i].longitude}`;
    const destination = `${coords[i + 1].latitude},${coords[i + 1].longitude}`;
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    let timer;
    try {
      const response = await Promise.race([
        fetchImpl(`https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&mode=walking&key=${apiKey}`, { signal: controller.signal }).then((res) => res.json()),
        new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('route_timeout')); }, 8000); }),
      ]);
      if (signal?.aborted || !isCurrent()) return [];
      if (response?.status !== 'OK' || !Array.isArray(response.routes) || !response.routes.length) {
        console.warn('[Directions] route unavailable');
        return [];
      }
      const route = response.routes[0];
      let segment = decodePolyline(route?.overview_polyline?.points);
      if (!segment.length && Array.isArray(route?.legs)) {
        for (const leg of route.legs) for (const step of Array.isArray(leg?.steps) ? leg.steps : []) {
          const points = decodePolyline(step?.polyline?.points);
          if (!points.length) return [];
          segment.push(...points);
        }
      }
      if (!segment.length) return [];
      all.push(...segment);
    } catch {
      console.warn('[Directions] request unavailable');
      return [];
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
  }
  return isCurrent() && !signal?.aborted ? all : [];
}
