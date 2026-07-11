const test = require('node:test');
const assert = require('node:assert/strict');

const {
  FULL_RATING_FLOW_VARIANT,
  QUICK_RATING_FLOW_VARIANT,
  QUICK_RATING_MEASUREMENT_NOTE,
  QUICK_RATING_STEPS,
  buildRatingPayload,
  getRatingFlowStepLabels,
} = require('./quickRating');

test('quick rating flow exposes four onboarding-first steps', () => {
  assert.equal(QUICK_RATING_FLOW_VARIANT, 'quick_onboarding');
  assert.equal(QUICK_RATING_STEPS.length, 4);
  assert.deepEqual(
    QUICK_RATING_STEPS.map((step) => step.key),
    ['overall', 'sauce', 'crispiness', 'meat']
  );
});

test('quick rating payload keeps only core score data', () => {
  const payload = buildRatingPayload({
    flowVariant: QUICK_RATING_FLOW_VARIANT,
    scores: { overall: 8, sauce: 7, crispiness: 9, meat: 6 },
    sauceStyle: 3,
    flavorVibe: [1, 3],
    spiceLevel: 5,
    wingsEaten: 10,
    selectedTagId: 42,
    wouldOrderAgain: true,
  });

  assert.deepEqual(payload, {
    flowVariant: QUICK_RATING_FLOW_VARIANT,
    isQuickRating: true,
    scores: { overall: 8, sauce: 7, crispiness: 9, meat: 6 },
  });
});

test('full review payload keeps the deeper optional fields', () => {
  const payload = buildRatingPayload({
    flowVariant: FULL_RATING_FLOW_VARIANT,
    scores: { overall: 8, sauce: 7, crispiness: 9, meat: 6 },
    sauceStyle: 3,
    flavorVibe: [1, 3],
    spiceLevel: 5,
    wingsEaten: 10,
    selectedTagId: 42,
    wouldOrderAgain: true,
  });

  assert.equal(payload.isQuickRating, false);
  assert.equal(payload.sauceStyle, 3);
  assert.deepEqual(payload.flavorVibe, [1, 3]);
  assert.equal(payload.selectedTagId, 42);
  assert.equal(payload.wouldOrderAgain, true);
});

test('step labels switch between quick onboarding and full review', () => {
  assert.deepEqual(getRatingFlowStepLabels(QUICK_RATING_FLOW_VARIANT, 2), [
    'Overall',
    'Sauce / Rub',
    'Crispiness',
    'Chicken',
  ]);
  assert.deepEqual(getRatingFlowStepLabels(FULL_RATING_FLOW_VARIANT, 1).slice(0, 5), [
    'Style',
    'Rub score',
    'Crispiness',
    'Chicken',
    'Overall',
  ]);
});

test('measurement note stays explicit while analytics access is limited', () => {
  assert.match(QUICK_RATING_MEASUREMENT_NOTE, /evidence-limited/i);
  assert.match(QUICK_RATING_MEASUREMENT_NOTE, /analytics access is restored/i);
});
