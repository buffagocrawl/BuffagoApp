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
  MISSION_ENTRY_VIEWED: 'mission_entry_viewed',
  MISSION_TAB_CHANGED: 'mission_tab_changed',
  MISSION_NEXT_ACTION_SELECTED: 'mission_next_action_selected',
  MISSION_REWARD_VIEWED: 'mission_reward_viewed',
  MISSION_STARTED: 'mission_started',
  MISSION_COMPLETED: 'mission_completed',
  CLAIM_STARTED: 'claim_started',
  CLAIM_SUBMITTED: 'claim_submitted',
  CHALLENGE_LEADERBOARD_VIEWED: 'challenge_leaderboard_viewed',
  CHALLENGE_LEADERBOARD_PERIOD_CHANGED: 'challenge_leaderboard_period_changed',
  PUBLIC_PROFILE_CHALLENGE_STATS_VIEWED: 'public_profile_challenge_stats_viewed',
  OWNER_DASHBOARD_VIEWED: 'owner_dashboard_viewed',
  LEGENDARY_EVENT_CREATED: 'legendary_event_created',
  LEGENDARY_SELECTION_ATTEMPTED: 'legendary_selection_attempted',
  LEGENDARY_SELECTION_SUCCEEDED: 'legendary_selection_succeeded',
  LEGENDARY_SELECTION_FAILED: 'legendary_selection_failed',
  LEGENDARY_IMPRESSION: 'legendary_impression',
  LEGENDARY_HERO_IMPRESSION: 'legendary_hero_impression',
  LEGENDARY_MARKER_IMPRESSION: 'legendary_marker_impression',
  LEGENDARY_MARKER_SELECTED: 'legendary_marker_selected',
  LEGENDARY_EVENT_OPENED: 'legendary_event_opened',
  LEGENDARY_RESTAURANT_OPENED: 'legendary_restaurant_opened',
  LEGENDARY_SAVE_SELECTED: 'legendary_save_selected',
  LEGENDARY_NAVIGATION_SELECTED: 'legendary_navigation_selected',
  LEGENDARY_PARTICIPATION_STARTED: 'legendary_participation_started',
  LEGENDARY_QUALIFYING_ACTION_COMPLETED: 'legendary_qualifying_action_completed',
  LEGENDARY_COMPLETION_RECORDED: 'legendary_completion_recorded',
  LEGENDARY_DUPLICATE_COMPLETION_REJECTED: 'legendary_duplicate_completion_rejected',
  LEGENDARY_REWARD_REFERENCE_CREATED: 'legendary_reward_reference_created',
  LEGENDARY_SHARE_INITIATED: 'legendary_share_initiated',
  LEGENDARY_SHARE_COMPLETED: 'legendary_share_completed',
  LEGENDARY_EVENT_EXPIRED: 'legendary_event_expired',
  LEGENDARY_EVENT_CANCELLED: 'legendary_event_cancelled',
  LEGENDARY_EMPTY_WORLD_FALLBACK: 'legendary_empty_world_fallback',
  LEGENDARY_KILL_SWITCH_APPLIED: 'legendary_kill_switch_applied',
  LEGENDARY_RETURN_SESSION: 'legendary_return_session',
  REFERRAL_HUB_VIEWED: 'referral_hub_viewed',
  REFERRAL_SHARE_STARTED: 'referral_share_started',
  REFERRAL_SHARE_COMPLETED: 'referral_share_completed',
  REFERRAL_CODE_COPIED: 'referral_code_copied',
  REFERRAL_CODE_ENTERED: 'referral_code_entered',
  REFERRAL_LINK_OPENED: 'referral_link_opened',
  REFERRAL_CLAIM_SUCCEEDED: 'referral_claim_succeeded',
  REFERRAL_CLAIM_FAILED: 'referral_claim_failed',
  REFERRED_USER_SIGNED_UP: 'referred_user_signed_up',
  REFERRAL_QUALIFICATION_COMPLETED: 'referral_qualification_completed',
  REFERRAL_REWARD_ISSUED: 'referral_reward_issued',
  REFERRAL_REWARD_FAILED: 'referral_reward_failed',
  REFERRAL_BADGE_UNLOCKED: 'referral_badge_unlocked',
  REFERRAL_PROMPT_CLICKED: 'referral_prompt_clicked',
  BUFFAVERSE_CARD_VIEWED: 'buffaverse_card_viewed',
  BUFFAVERSE_OPENED: 'buffaverse_opened',
  BUFFAVERSE_OBJECTIVE_VIEWED: 'buffaverse_objective_viewed',
  BUFFAVERSE_OBJECTIVE_SELECTED: 'buffaverse_objective_selected',
  BUFFAVERSE_MILESTONE_VIEWED: 'buffaverse_milestone_viewed',
  BUFFAVERSE_LEVEL_PROGRESS_VIEWED: 'buffaverse_level_progress_viewed',
  BUFFAVERSE_ACHIEVEMENT_SHARE_STARTED: 'buffaverse_achievement_share_started',
  BUFFAVERSE_ACHIEVEMENT_SHARE_COMPLETED: 'buffaverse_achievement_share_completed',
  BUFFAVERSE_CELEBRATION_SHOWN: 'buffaverse_celebration_shown',
  BUFFAVERSE_LOAD_FAILED: 'buffaverse_load_failed',
});

const BLOCKED_KEY = /(token|secret|password|authorization|cookie|email|phone|error_message|access_key|refresh|latitude|longitude|location|address|rating_content|rating_detail)/i;
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

export const SERRANO_EVENT_VERSION = 1;

export function buildSerranoEventMetadata(input = {}) {
  return sanitizeAnalyticsMetadata({
    event_version: SERRANO_EVENT_VERSION,
    occurred_at: new Date().toISOString(),
    environment: process.env.EXPO_PUBLIC_APP_ENV || 'unknown',
    feature_flag_key: null,
    experiment_id: null,
    variant: null,
    correlation_id: null,
    ...input,
  });
}
