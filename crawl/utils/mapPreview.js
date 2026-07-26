/**
 * The native map view must only receive finite numeric coordinates.  In
 * particular, Number(undefined), Number(''), and Number('not-a-number') must
 * never cross the JS/native boundary as a Marker, Polyline, or fit target.
 */
function toFiniteNumber(value) {
  if (typeof value === 'string' && value.trim() === '') return null;
  const number = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(number) ? number : null;
}

export function normalizeMapCoordinate(stop) {
  const latitude = toFiniteNumber(stop?.latitude ?? stop?.lat);
  const longitude = toFiniteNumber(stop?.longitude ?? stop?.lng);

  if (latitude === null || longitude === null) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;

  return { latitude, longitude };
}

export function prepareMapPreview(stops) {
  const stopList = Array.isArray(stops) ? stops : [];
  const coordinateStops = stopList
    .map((stop, stopIndex) => ({ stop, stopIndex, coordinate: normalizeMapCoordinate(stop) }))
    .filter((entry) => entry.coordinate !== null);

  const coordinates = coordinateStops.map((entry) => entry.coordinate);

  return {
    totalStops: stopList.length,
    coordinateStops,
    coordinates,
    canRenderPolyline: coordinates.length >= 2,
    canFitCoordinates: coordinates.length >= 2,
    failureCategory: coordinates.length === 0 ? 'no_valid_coordinates' : null,
  };
}

export function buildMapPreviewRegion(coordinates) {
  const safeCoordinates = Array.isArray(coordinates)
    ? coordinates.filter((coordinate) => normalizeMapCoordinate(coordinate))
    : [];
  if (!safeCoordinates.length) return null;

  const latitudes = safeCoordinates.map((coordinate) => coordinate.latitude);
  const longitudes = safeCoordinates.map((coordinate) => coordinate.longitude);
  const minLatitude = Math.min(...latitudes);
  const maxLatitude = Math.max(...latitudes);
  const minLongitude = Math.min(...longitudes);
  const maxLongitude = Math.max(...longitudes);

  return {
    latitude: (minLatitude + maxLatitude) / 2,
    longitude: (minLongitude + maxLongitude) / 2,
    latitudeDelta: Math.max((maxLatitude - minLatitude) * 1.5, 0.015),
    longitudeDelta: Math.max((maxLongitude - minLongitude) * 1.5, 0.015),
  };
}

export function createMapPreviewOpenGate() {
  let opening = false;
  return {
    tryAcquire() {
      if (opening) return false;
      opening = true;
      return true;
    },
    release() {
      opening = false;
    },
  };
}
