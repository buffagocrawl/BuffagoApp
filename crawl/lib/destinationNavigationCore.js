export const HOME_NEXT_SPOT_KEY = 'buffago:homeNextSpot';
export const HOME_NEXT_SPOT_EVENT = 'buffago:home_next_spot_selected';

export class DestinationNavigationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'DestinationNavigationError';
    this.code = code;
  }
}

export function normalizeDestination(destination) {
  const id = destination?.id ?? destination?.destination_id;
  if (!id || typeof id !== 'string') throw new DestinationNavigationError('INVALID_DESTINATION', 'That restaurant could not be selected.');
  const latitude = destination?.lat == null ? null : Number(destination.lat);
  const longitude = destination?.lng == null ? null : Number(destination.lng);
  const validCoordinates = Number.isFinite(latitude) && Number.isFinite(longitude) && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
  const address = [destination?.address, destination?.city, destination?.stateCode || destination?.state_code]
    .filter(Boolean).map((value) => String(value).trim()).filter(Boolean).join(', ');
  if (!validCoordinates && !address) throw new DestinationNavigationError('MISSING_DESTINATION_DETAILS', 'This restaurant has no usable address or map coordinates yet.');
  return { id, name: destination?.name || 'Wing Spot', address: address || null, lat: validCoordinates ? latitude : null, lng: validCoordinates ? longitude : null, source: destination?.source || 'wingdex_want_to_try' };
}

export function buildDirectionsUrl(destination, platform = 'android') {
  const normalized = normalizeDestination(destination);
  const target = normalized.lat != null && normalized.lng != null ? `${normalized.lat},${normalized.lng}` : normalized.address;
  if (platform === 'ios') return `http://maps.apple.com/?daddr=${encodeURIComponent(target)}&dirflg=d`;
  return normalized.lat != null && normalized.lng != null
    ? `google.navigation:q=${encodeURIComponent(target)}&mode=d`
    : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(target)}&travelmode=driving`;
}

export async function openDestinationDirections({ destination, platform = 'android', openURL, canOpenURL } = {}) {
  const normalized = normalizeDestination(destination);
  const preferred = buildDirectionsUrl(normalized, platform);
  const fallbackTarget = normalized.lat != null ? `${normalized.lat},${normalized.lng}` : normalized.address;
  const fallback = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(fallbackTarget)}&travelmode=driving`;
  try {
    if (await canOpenURL(preferred)) {
      await openURL(preferred);
      return { url: preferred, fallback: false, destination: normalized };
    }
    if (await canOpenURL(fallback)) {
      await openURL(fallback);
      return { url: fallback, fallback: true, destination: normalized };
    }
  } catch {
    try {
      if (fallback !== preferred && await canOpenURL(fallback)) {
        await openURL(fallback);
        return { url: fallback, fallback: true, destination: normalized };
      }
    } catch {}
    throw new DestinationNavigationError('MAP_LAUNCH_FAILED', 'We could not open directions on this device.');
  }
  throw new DestinationNavigationError('MAP_APP_UNAVAILABLE', 'No supported maps app is available on this device.');
}
