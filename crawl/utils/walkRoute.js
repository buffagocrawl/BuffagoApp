// utils/walkRoute.js
const API_KEY = process.env.EXPO_PUBLIC_GOOGLE_API_KEY;

/** Decode Google encoded polyline -> [{latitude, longitude}, ...] */
export function decodePolyline(encoded) {
  let index = 0, lat = 0, lng = 0;
  const points = [];
  while (index < encoded.length) {
    let b, shift = 0, result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    const dlat = (result & 1) ? ~(result >> 1) : (result >> 1);
    lat += dlat;
    shift = 0; result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    const dlng = (result & 1) ? ~(result >> 1) : (result >> 1);
    lng += dlng;
    points.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return points;
}

/**
 * Build a walking path over roads for each consecutive stop.
 * Returns a stitched array of coordinates following the road.
 */
export async function getWalkingPath(coords) {
  if (!API_KEY) throw new Error('Missing EXPO_PUBLIC_GOOGLE_API_KEY');
  if (!coords || coords.length < 2) return [];

  const all = [];

  for (let i = 0; i < coords.length - 1; i++) {
    const origin = `${coords[i].latitude},${coords[i].longitude}`;
    const destination = `${coords[i + 1].latitude},${coords[i + 1].longitude}`;

    const url =
      `https://maps.googleapis.com/maps/api/directions/json` +
      `?origin=${encodeURIComponent(origin)}` +
      `&destination=${encodeURIComponent(destination)}` +
      `&mode=walking&key=${API_KEY}`;

    let json;
    try {
      const res = await fetch(url);
      json = await res.json();
    } catch (err) {
      console.warn('[Directions] network error', err);
      continue;
    }

    if (json.status !== 'OK' || !json.routes?.length) {
      console.warn('[Directions] bad status', json.status, json.error_message);
      continue;
    }

    // Prefer overview polyline; if missing, stitch legs/steps
    let segment = [];
    const route0 = json.routes[0];

    if (route0.overview_polyline?.points) {
      segment = decodePolyline(route0.overview_polyline.points);
    } else if (route0.legs?.length) {
      for (const leg of route0.legs) {
        for (const step of leg.steps || []) {
          if (step.polyline?.points) {
            const pts = decodePolyline(step.polyline.points);
            if (segment.length && pts.length) pts.shift(); // avoid duplicate joint
            segment.push(...pts);
          }
        }
      }
    }

    if (!segment.length) {
      console.warn('[Directions] no polyline for segment', i, origin, destination);
      continue;
    }

    // Stitch without duplicating the joint
    if (i > 0 && segment.length) segment.shift();
    all.push(...segment);
  }

  console.log('[Directions] built road path points:', all.length);
  return all;
}
