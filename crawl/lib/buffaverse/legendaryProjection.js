const ACTIVE_STATUSES = new Set(['active', 'scheduled']);

export function projectLegendaryEvent(row) {
  if (!row || row.event_type_id !== 'legendary_restaurant' || !ACTIVE_STATUSES.has(row.lifecycle_status)) {
    return null;
  }

  const metadata = row.display_metadata || {};
  const restaurantId = metadata.restaurant_id || null;
  if (!row.id || !restaurantId || !metadata.restaurant_name) return null;

  const endsAtMs = Date.parse(row.ends_at);
  const minutesRemaining = Number.isFinite(endsAtMs)
    ? Math.max(0, Math.ceil((endsAtMs - Date.now()) / 60000))
    : 0;

  return {
    key: row.id,
    eventInstanceId: row.id,
    restaurantId,
    restaurantName: metadata.restaurant_name,
    city: metadata.city || metadata.locality || 'Nearby',
    reason: metadata.reason_label || row.summary || 'A local wing stop worth discovering.',
    reasonCode: metadata.reason_code || null,
    sponsorshipDisclaimer:
      metadata.sponsorship_disclaimer ||
      'Buffago-curated event. Not sponsored unless explicitly stated by Buffago.',
    markerKey: metadata.marker_key || 'legendary-star-flame',
    status: row.lifecycle_status,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    minutesRemaining,
    progress: 0,
    scope: row.geographic_scope || 'local',
  };
}

export function projectLegendaryFeed(rows, limit = 25) {
  return (rows || [])
    .map(projectLegendaryEvent)
    .filter(Boolean)
    .sort((a, b) => a.minutesRemaining - b.minutesRemaining || a.restaurantName.localeCompare(b.restaurantName))
    .slice(0, Math.max(0, limit));
}

export function legendaryByRestaurant(events) {
  return new Map((events || []).map((event) => [event.restaurantId, event]));
}
