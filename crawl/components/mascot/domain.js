export const MASCOT_SIZE_PIXELS = Object.freeze({
  icon: 32,
  small: 64,
  medium: 112,
  large: 176,
  hero: 240,
});

export function parseMascotBoolean(value, fallback) {
  if (typeof value === 'boolean') return value;
  const normalized = String(value || '').trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

export function parseMascotOption(value, allowed, fallback) {
  const normalized = String(value || '').trim().toLowerCase();
  return allowed.includes(normalized) ? normalized : fallback;
}

export function resolveMascotPoseName(pose, available = ['hero']) {
  const requestedPose = typeof pose === 'string' && pose ? pose : 'hero';
  const resolvedPose = available.includes(requestedPose) ? requestedPose : 'hero';
  return { requestedPose, resolvedPose, usedFallback: requestedPose !== resolvedPose };
}

export function isMascotSurfaceAllowed(surface, config) {
  if (!config?.enabled) return false;
  return config.surfaces?.[surface] === true;
}
