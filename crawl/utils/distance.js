const R = 6371; // km
function toRad(v) { return (v * Math.PI) / 180; }

export function haversineKm(a, b) {
  if (!a || !b) return 0;
  const dLat = toRad((b.lat ?? 0) - (a.lat ?? 0));
  const dLon = toRad((b.lng ?? 0) - (a.lng ?? 0));
  const lat1 = toRad(a.lat ?? 0);
  const lat2 = toRad(b.lat ?? 0);
  const x = Math.sin(dLat/2)**2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon/2)**2;
  const d = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1-x));
  return R * d;
}

export function routeDistanceKm(stops) {
  // stops: [{destination:{lat,lng}}] ordered
  let km = 0;
  for (let i = 1; i < stops.length; i++) {
    const prev = stops[i-1]?.destination;
    const cur  = stops[i]?.destination;
    if (prev?.lat && prev?.lng && cur?.lat && cur?.lng) {
      km += haversineKm({lat: prev.lat, lng: prev.lng}, {lat: cur.lat, lng: cur.lng});
    }
  }
  return km;
}
