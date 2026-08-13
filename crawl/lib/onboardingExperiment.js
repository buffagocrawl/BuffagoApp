const EXPERIMENT_ID = 'onboarding_first_value_v1';
const EXPERIMENT_VERSION = 1;
const FEATURE_FLAG_KEY = 'EXPO_PUBLIC_ONBOARDING_FIRST_VALUE_EXPERIMENT';
const CONTROL = 'control';
const TREATMENT = 'treatment';

const CANONICAL_EVENTS = Object.freeze([
  'experiment_exposure', 'experiment_assignment', 'onboarding_started',
  'onboarding_step_started', 'onboarding_step_completed', 'rating_operation_started',
  'rating_operation_failed', 'rating_recovery_state_shown', 'rating_retry_clicked',
  'rating_retry_succeeded', 'rating_retry_failed', 'rating_operation_confirmed',
  'reward_status_confirmed', 'comparison_status_confirmed', 'experiment_exit',
]);

function flagEnabled(value = process.env[FEATURE_FLAG_KEY]) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function stableBucket(value) {
  let hash = 2166136261;
  for (const char of String(value || '')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 100;
}

function assignVariant({ experimentUserId, enabled = flagEnabled() } = {}) {
  if (!enabled || !experimentUserId) return CONTROL;
  return stableBucket(experimentUserId) < 50 ? TREATMENT : CONTROL;
}

function buildExperimentMetadata({
  experimentUserId = null, assignment = CONTROL, onboardingVersion = 'control_v1',
  stepName = null, elapsedMs = null, restaurantIdHash = null, ratingMode = null,
  submissionId = null, confirmationState = null, errorCode = null, appVersion = null,
  eventTimestamp = new Date().toISOString(), correlationId = null,
} = {}) {
  return {
    experiment_id: EXPERIMENT_ID, experiment_version: EXPERIMENT_VERSION,
    experiment_user_id: experimentUserId, assignment, onboarding_version: onboardingVersion,
    step_name: stepName, elapsed_ms: Number.isFinite(elapsedMs) ? elapsedMs : null,
    restaurant_id_hash: restaurantIdHash, rating_mode: ratingMode, submission_id: submissionId,
    confirmation_state: confirmationState, error_code: errorCode, app_version: appVersion,
    event_timestamp: eventTimestamp, correlation_id: correlationId,
  };
}

function sanitizedErrorCode(error) {
  const code = error?.code || error?.message || 'unknown_error';
  return String(code).toLowerCase().replace(/[^a-z0-9_:-]/g, '_').slice(0, 64);
}

function recoveryState(error) {
  const code = sanitizedErrorCode(error);
  if (/timeout|network|fetch|offline/.test(code)) return 'retry_available';
  if (/auth|permission/.test(code)) return 'sign_in_required';
  return 'unable_to_confirm';
}

export {
  CANONICAL_EVENTS, CONTROL, EXPERIMENT_ID, EXPERIMENT_VERSION, FEATURE_FLAG_KEY,
  TREATMENT, assignVariant, buildExperimentMetadata, flagEnabled, recoveryState,
  sanitizedErrorCode, stableBucket,
};

export default {
  CANONICAL_EVENTS, CONTROL, EXPERIMENT_ID, EXPERIMENT_VERSION, FEATURE_FLAG_KEY,
  TREATMENT, assignVariant, buildExperimentMetadata, flagEnabled, recoveryState,
  sanitizedErrorCode, stableBucket,
};
