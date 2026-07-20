export const ANALYTICS_EVENTS = Object.freeze({
  AUTH_STARTED: 'auth_started',
  AUTH_PROVIDER_SELECTED: 'auth_provider_selected',
  AUTH_CALLBACK_STARTED: 'auth_callback_started',
  AUTH_CALLBACK_COMPLETED: 'auth_callback_completed',
  AUTH_CALLBACK_FAILED: 'auth_callback_failed',
  AUTH_SESSION_RESTORED: 'auth_session_restored',
  AUTH_RECOVERY_SHOWN: 'auth_recovery_shown',
  AUTH_RECOVERY_SELECTED: 'auth_recovery_selected',
  ACTIVATION_STARTED: 'activation_started',
  ACTIVATION_RATING_COMPLETED: 'activation_rating_completed',
  ACTIVATION_COMPLETED: 'activation_completed',
  MISSION_VIEWED: 'mission_viewed',
  MISSION_STARTED: 'mission_started',
  MISSION_COMPLETED: 'mission_completed',
  CLAIM_STARTED: 'claim_started',
  CLAIM_SUBMITTED: 'claim_submitted',
  OWNER_DASHBOARD_VIEWED: 'owner_dashboard_viewed',
});

const BLOCKED_KEY = /(token|secret|password|authorization|cookie|email|phone|error_message|access_key|refresh)/i;
const ALLOWED_SCALAR = new Set(['string', 'number', 'boolean']);

export function sanitizeAnalyticsMetadata(input = {}) {
  const safe = {};
  for (const [key, value] of Object.entries(input || {})) {
    if (BLOCKED_KEY.test(key) || value == null || !ALLOWED_SCALAR.has(typeof value)) continue;
    if (typeof value === 'string') safe[key] = value.slice(0, 120);
    else if (typeof value === 'number' && Number.isFinite(value)) safe[key] = value;
    else if (typeof value === 'boolean') safe[key] = value;
  }
  return safe;
}
