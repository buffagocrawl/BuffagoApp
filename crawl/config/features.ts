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

// The Social Feed launchpad is opt-in so it can be rolled back independently
// of the feed itself.
export const ENABLE_EMPTY_FEED_LAUNCHPAD = parseBooleanFlag(
  process.env.EXPO_PUBLIC_ENABLE_EMPTY_FEED_LAUNCHPAD,
  false
);

export const ENABLE_RESTAURANT_OWNER_LOOP = parseBooleanFlag(
  process.env.EXPO_PUBLIC_ENABLE_RESTAURANT_OWNER_LOOP,
  true
);

// Buffaverse production surfaces stay opt-in. The database flags remain the
// authoritative second gate; these client flags prevent even a feed request
// unless a release explicitly enables the corresponding surface.
export const ENABLE_BUFFAVERSE = parseBooleanFlag(
  process.env.EXPO_PUBLIC_ENABLE_BUFFAVERSE,
  false
);

export const ENABLE_LEGENDARY_RESTAURANTS = parseBooleanFlag(
  process.env.EXPO_PUBLIC_ENABLE_LEGENDARY_RESTAURANTS,
  false
);

export const ENABLE_RESTAURANT_BOSS_BATTLES = parseBooleanFlag(
  process.env.EXPO_PUBLIC_ENABLE_RESTAURANT_BOSS_BATTLES,
  false
);

export const ENABLE_BUFFAVERSE_PERSONALIZATION = parseBooleanFlag(
  process.env.EXPO_PUBLIC_ENABLE_BUFFAVERSE_PERSONALIZATION,
  false
);

export const ENABLE_BUFFAVERSE_HOME = parseBooleanFlag(
  process.env.EXPO_PUBLIC_ENABLE_BUFFAVERSE_HOME,
  false
);

export const ENABLE_BUFFAVERSE_SHARING = parseBooleanFlag(
  process.env.EXPO_PUBLIC_ENABLE_BUFFAVERSE_SHARING,
  false
);

export const ENABLE_BUFFAVERSE_CELEBRATIONS = parseBooleanFlag(
  process.env.EXPO_PUBLIC_ENABLE_BUFFAVERSE_CELEBRATIONS,
  false
);
