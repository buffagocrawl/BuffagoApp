const test = require('node:test');
const assert = require('node:assert/strict');

const {
  STEP_SIX_CONTROL,
  STEP_SIX_DESTINATION,
  STEP_SIX_EVENT_VERSION,
  STEP_SIX_TREATMENT,
  buildRatingStartedMetadataFromContext,
  buildStepSixMetadata,
  createPendingStepSixContext,
  getStepSixCopy,
  isInternalOrTestBuild,
  resolveStepSixVariant,
} = require('./onboardingStepSix');

test('production rollout defaults step 6 to the truthful account-gate treatment', () => {
  assert.equal(resolveStepSixVariant({ isInternalBuild: false, rolloutFlag: 'true' }), STEP_SIX_TREATMENT);
  assert.equal(resolveStepSixVariant({ isInternalBuild: false, rolloutFlag: 'false' }), STEP_SIX_CONTROL);
});

test('internal and test builds stay on control copy', () => {
  assert.equal(isInternalOrTestBuild({ isDev: true }), true);
  assert.equal(isInternalOrTestBuild({ appOwnership: 'expo' }), true);
  assert.equal(isInternalOrTestBuild({ executionEnvironment: 'storeClient' }), true);
  assert.equal(resolveStepSixVariant({ isInternalBuild: true, rolloutFlag: 'true' }), STEP_SIX_CONTROL);
});

test('treatment copy truthfully points to the account gate', () => {
  const copy = getStepSixCopy(STEP_SIX_TREATMENT);
  assert.equal(copy.ctaLabel, 'Choose account or guest');
  assert.match(copy.body, /create an account|guest/i);
  assert.match(copy.helper, /save screen|guest/i);
});

test('canonical step-6 metadata carries required release fields', () => {
  const metadata = buildStepSixMetadata({
    variant: STEP_SIX_TREATMENT,
    eventName: 'cta_clicked',
    ctaLabel: 'Choose account or guest',
    ctaDestination: STEP_SIX_DESTINATION,
    sessionId: 'sess_123',
    anonymousUserId: 'anon_123',
    clientPlatform: 'ios',
    appVersion: '1.0.0',
  });

  assert.equal(metadata.event_version, STEP_SIX_EVENT_VERSION);
  assert.equal(metadata.transition_event, 'cta_clicked');
  assert.equal(metadata.cta_destination, STEP_SIX_DESTINATION);
  assert.equal(metadata.session_id, 'sess_123');
  assert.equal(metadata.anonymous_user_id, 'anon_123');
});

test('pending step-6 context can be joined onto a later rating start', () => {
  const context = createPendingStepSixContext({
    variant: STEP_SIX_TREATMENT,
    ctaLabel: 'Choose account or guest',
    ctaDestination: STEP_SIX_DESTINATION,
    sessionId: 'sess_123',
    anonymousUserId: 'anon_123',
    clientPlatform: 'android',
    appVersion: '1.0.3',
  });

  const metadata = buildRatingStartedMetadataFromContext(context, { source_screen: 'home' });

  assert.equal(metadata.transition_event, 'rating_started');
  assert.equal(metadata.source_transition, 'step6_to_account_gate');
  assert.equal(metadata.source_screen, 'home');
  assert.equal(metadata.session_id, 'sess_123');
});
