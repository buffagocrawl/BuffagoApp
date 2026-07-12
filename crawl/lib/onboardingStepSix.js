const STEP_SIX_EVENT_VERSION = '2026-07-11.step6.v1';
const STEP_SIX_RUN_ID = '2026-07-11T165853';
const STEP_SIX_FLOW_SURFACE = 'onboarding';
const STEP_SIX_STEP_NAME = 'ready_for_app';
const STEP_SIX_STEP_NUMBER = 6;
const STEP_SIX_DESTINATION = 'account_gate';
const STEP_SIX_CONTEXT_KEY = 'buffago:onboarding:step6_context_v1';
const STEP_SIX_CONTROL = 'control';
const STEP_SIX_TREATMENT = 'treatment_truthful_account_gate_copy';

const STEP_SIX_COPY = {
  [STEP_SIX_CONTROL]: {
    title: 'Are you ready?',
    body: "Let's get your wing journey officialy started!",
    helper:
      'Next up is your save screen, where you can create an account or continue as a guest before you enter the app.',
    ctaLabel: 'Choose account or guest',
  },
  [STEP_SIX_TREATMENT]: {
    title: 'Ready for the app?',
    body: 'One more step: choose whether to create an account or continue as a guest.',
    helper:
      'You will see the save screen next so you can keep your progress or enter the app as a guest.',
    ctaLabel: 'Choose account or guest',
  },
};

function isInternalOrTestBuild({
  isDev = false,
  appOwnership = null,
  executionEnvironment = null,
} = {}) {
  return Boolean(isDev || appOwnership === 'expo' || executionEnvironment === 'storeClient');
}

function isStepSixTreatmentEnabled({
  isInternalBuild = false,
  rolloutFlag = 'true',
} = {}) {
  if (isInternalBuild) return false;
  return String(rolloutFlag || 'true').toLowerCase() !== 'false';
}

function resolveStepSixVariant({
  isInternalBuild = false,
  rolloutFlag = 'true',
} = {}) {
  return isStepSixTreatmentEnabled({ isInternalBuild, rolloutFlag })
    ? STEP_SIX_TREATMENT
    : STEP_SIX_CONTROL;
}

function getStepSixCopy(variant = STEP_SIX_CONTROL) {
  return STEP_SIX_COPY[variant] || STEP_SIX_COPY[STEP_SIX_CONTROL];
}

function buildStepSixMetadata({
  variant = STEP_SIX_CONTROL,
  eventName,
  ctaLabel,
  ctaDestination = STEP_SIX_DESTINATION,
  sessionId = null,
  anonymousUserId = null,
  clientPlatform = null,
  appVersion = null,
  extra = {},
} = {}) {
  return {
    run_id: STEP_SIX_RUN_ID,
    event_version: STEP_SIX_EVENT_VERSION,
    flow_surface: STEP_SIX_FLOW_SURFACE,
    step_name: STEP_SIX_STEP_NAME,
    step_number: STEP_SIX_STEP_NUMBER,
    transition_event: eventName || null,
    treatment_variant: variant,
    cta_label: ctaLabel || null,
    cta_destination: ctaDestination,
    client_platform: clientPlatform || null,
    app_version: appVersion || null,
    session_id: sessionId || null,
    anonymous_user_id: anonymousUserId || null,
    ...extra,
  };
}

function createPendingStepSixContext({
  variant = STEP_SIX_CONTROL,
  ctaLabel = null,
  ctaDestination = STEP_SIX_DESTINATION,
  sessionId = null,
  anonymousUserId = null,
  clientPlatform = null,
  appVersion = null,
} = {}) {
  return {
    variant,
    ctaLabel,
    ctaDestination,
    sessionId,
    anonymousUserId,
    clientPlatform,
    appVersion,
    clickedAt: new Date().toISOString(),
  };
}

function buildRatingStartedMetadataFromContext(context = {}, extra = {}) {
  return buildStepSixMetadata({
    variant: context.variant || STEP_SIX_CONTROL,
    eventName: 'rating_started',
    ctaLabel: context.ctaLabel || null,
    ctaDestination: context.ctaDestination || STEP_SIX_DESTINATION,
    sessionId: context.sessionId || null,
    anonymousUserId: context.anonymousUserId || null,
    clientPlatform: context.clientPlatform || null,
    appVersion: context.appVersion || null,
    extra: {
      source_transition: 'step6_to_account_gate',
      step6_clicked_at: context.clickedAt || null,
      ...extra,
    },
  });
}

module.exports = {
  STEP_SIX_CONTEXT_KEY,
  STEP_SIX_CONTROL,
  STEP_SIX_DESTINATION,
  STEP_SIX_EVENT_VERSION,
  STEP_SIX_FLOW_SURFACE,
  STEP_SIX_RUN_ID,
  STEP_SIX_STEP_NAME,
  STEP_SIX_STEP_NUMBER,
  STEP_SIX_TREATMENT,
  buildRatingStartedMetadataFromContext,
  buildStepSixMetadata,
  createPendingStepSixContext,
  getStepSixCopy,
  isInternalOrTestBuild,
  isStepSixTreatmentEnabled,
  resolveStepSixVariant,
};
