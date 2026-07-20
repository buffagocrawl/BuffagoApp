// config/features.ts

// Toggle features for different environments.

function parseBooleanFlag(value: string | undefined, defaultValue: boolean) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return defaultValue;
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return defaultValue;
}

export const ENABLE_GOOGLE_AUTH = parseBooleanFlag(
  process.env.EXPO_PUBLIC_ENABLE_GOOGLE_AUTH,
  true
);

export const ENABLE_GROWTH_MISSIONS = parseBooleanFlag(
  process.env.EXPO_PUBLIC_ENABLE_GROWTH_MISSIONS,
  true
);

export const ENABLE_SHARE_INVITE_LOOP = parseBooleanFlag(
  process.env.EXPO_PUBLIC_ENABLE_SHARE_INVITE_LOOP,
  true
);

export const ENABLE_RESTAURANT_OWNER_LOOP = parseBooleanFlag(
  process.env.EXPO_PUBLIC_ENABLE_RESTAURANT_OWNER_LOOP,
  true
);
