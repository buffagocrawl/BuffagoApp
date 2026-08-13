import test from 'node:test';
import assert from 'node:assert/strict';
import experiment from '../lib/onboardingExperiment.js';
const {
  CANONICAL_EVENTS, CONTROL, TREATMENT, assignVariant, buildExperimentMetadata,
  recoveryState, sanitizedErrorCode, stableBucket,
} = experiment;

test('assignment is deterministic, mutually exclusive, and rolls back to control', () => {
  assert.equal(assignVariant({ experimentUserId: 'user-1', enabled: false }), CONTROL);
  assert.equal(assignVariant({ experimentUserId: 'user-1', enabled: true }), assignVariant({ experimentUserId: 'user-1', enabled: true }));
  assert.ok([CONTROL, TREATMENT].includes(assignVariant({ experimentUserId: 'user-1', enabled: true })));
  assert.ok(stableBucket('user-1') >= 0 && stableBucket('user-1') < 100);
});

test('canonical metadata includes required fields and no raw error text', () => {
  const metadata = buildExperimentMetadata({ experimentUserId: 'anon-1', assignment: TREATMENT, stepName: 'restaurant_selection', elapsedMs: 42, submissionId: 'sub-1' });
  for (const key of ['experiment_id', 'experiment_version', 'experiment_user_id', 'assignment', 'onboarding_version', 'step_name', 'elapsed_ms', 'submission_id', 'event_timestamp']) assert.ok(key in metadata);
  assert.equal(sanitizedErrorCode({ message: 'Provider said: secret email@example.com!' }), 'provider_said:_secret_email_example_com_');
  assert.equal(recoveryState({ code: 'network_timeout' }), 'retry_available');
  assert.equal(recoveryState({ code: 'permission_denied' }), 'sign_in_required');
  assert.ok(CANONICAL_EVENTS.includes('rating_operation_confirmed'));
});
