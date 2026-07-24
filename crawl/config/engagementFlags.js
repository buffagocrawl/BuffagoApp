const DEFAULT_FLAGS = Object.freeze({
  home_mission_dashboard: true,
  social_feed_v2: true,
  daily_missions: true,
  weekly_challenges: true,
  limited_time_events: false,
  branded_share_cards: true,
  enhanced_celebrations: true,
  social_reactions: true,
  new_daily_engagement: false,
  daily_reward_ui: false,
  streak_at_risk_push: false,
  comeback_push: false,
  friend_rating_push: false,
  crawl_proximity_push: false,
  background_geofencing: false,
  notification_settings: false,
});

function parseBoolean(value, fallback) {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return fallback;
  if (value.toLowerCase() === 'true') return true;
  if (value.toLowerCase() === 'false') return false;
  return fallback;
}

export function getEngagementFlags(env = process.env) {
  return Object.fromEntries(
    Object.entries(DEFAULT_FLAGS).map(([key, fallback]) => {
      const envKey = `EXPO_PUBLIC_${key.toUpperCase()}`;
      return [key, parseBoolean(env?.[envKey], fallback)];
    })
  );
}

export function isEngagementFeatureEnabled(flag, env = process.env) {
  if (!(flag in DEFAULT_FLAGS)) return false;
  return getEngagementFlags(env)[flag];
}

export { DEFAULT_FLAGS as ENGAGEMENT_FLAG_DEFAULTS };
