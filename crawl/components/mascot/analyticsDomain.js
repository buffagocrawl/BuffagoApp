export const MASCOT_ANALYTICS_EVENTS = Object.freeze([
  'mascot_moment_viewed',
  'mascot_primary_action_pressed',
  'mascot_secondary_action_pressed',
  'mascot_celebration_completed',
  'mascot_error_retry_pressed',
  'mascot_share_started',
  'mascot_share_completed',
]);

const EVENT_NAMES = new Set(MASCOT_ANALYTICS_EVENTS);
const SAFE_IDENTIFIER = /^[a-z0-9_:/-]{1,64}$/i;
const USER_STATE_CATEGORIES = new Set(['guest', 'new', 'active', 'returning', 'lapsed']);

const safeIdentifier = (value, fallback = 'unknown') => {
  const identifier = String(value || '');
  return SAFE_IDENTIFIER.test(identifier) ? identifier : fallback;
};

export function buildMascotEventOptions(eventName, context = {}) {
  if (!EVENT_NAMES.has(eventName)) return null;

  return {
    eventName,
    screen: safeIdentifier(context.sourceScreen),
    metadata: {
      surface: safeIdentifier(context.surface),
      moment_type: safeIdentifier(context.momentType),
      pose: safeIdentifier(context.pose),
      mood: safeIdentifier(context.mood),
      animation_enabled: context.animationEnabled === true,
      reduced_motion: context.reducedMotion === true,
      ...(context.actionId ? { action_id: safeIdentifier(context.actionId) } : {}),
      ...(USER_STATE_CATEGORIES.has(context.userStateCategory)
        ? { user_state_category: context.userStateCategory }
        : {}),
    },
  };
}

