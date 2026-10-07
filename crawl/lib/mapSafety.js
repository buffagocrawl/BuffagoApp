const numeric = (value) => {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

export function mapCoordinate(value) {
  if (!value) return null;
  const latitude = numeric(value.latitude ?? value.lat);
  const longitude = numeric(value.longitude ?? value.lng);
  if (latitude === null || longitude === null || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}

export function mapCoordinates(values) {
  return Array.isArray(values) ? values.map(mapCoordinate).filter(Boolean) : [];
}

export function mapRegion(value) {
  const coordinate = mapCoordinate(value);
  if (!coordinate) return null;
  const latitudeDelta = numeric(value.latitudeDelta);
  const longitudeDelta = numeric(value.longitudeDelta);
  return { ...coordinate, latitudeDelta: latitudeDelta > 0 && latitudeDelta <= 180 ? latitudeDelta : 0.4,
    longitudeDelta: longitudeDelta > 0 && longitudeDelta <= 360 ? longitudeDelta : 0.4 };
}

// Native commands are only safe after onMapReady. A one-point fit uses a region.
export function fitMap(map, ready, values, options = {}) {
  const points = mapCoordinates(values);
  if (!map || !ready || !points.length) return false;
  try {
    if (points.length === 1) map.animateToRegion?.({ ...points[0], latitudeDelta: 0.04, longitudeDelta: 0.04 }, 0);
    else map.fitToCoordinates?.(points, options);
    return true;
  } catch {
    console.warn('[Maps] viewport unavailable');
    return false;
  }
}

export function createMapRequestGuard() {
  let generation = 0;
  return { begin: () => ++generation, current: (request) => request === generation, cancel: () => { generation += 1; } };
}
