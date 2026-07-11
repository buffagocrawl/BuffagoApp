const assert = require('node:assert/strict');
const {
  FULL_RATING_FLOW_VARIANT,
  QUICK_RATING_FLOW_VARIANT,
  QUICK_RATING_MEASUREMENT_NOTE,
  QUICK_RATING_STEPS,
  buildRatingPayload,
  getRatingFlowStepLabels,
} = require('../lib/quickRating');

function testQuickRatingStepLabels() {
  const labels = getRatingFlowStepLabels(QUICK_RATING_FLOW_VARIANT, 2);
  assert.equal(labels.length, 4);
  assert.deepEqual(labels, QUICK_RATING_STEPS.map((step) => step.label));
  assert.equal(labels[0], 'Overall');
}

function testFullRatingStepLabels() {
  const labels = getRatingFlowStepLabels(FULL_RATING_FLOW_VARIANT, 1);
  assert.equal(labels.length, 10);
  assert.equal(labels[0], 'Style');
  assert.equal(labels[1], 'Rub score');
}

function testQuickRatingPayload() {
  const payload = buildRatingPayload({
    flowVariant: QUICK_RATING_FLOW_VARIANT,
    scores: { overall: 8, sauce: 7, crispiness: 9, meat: 6 },
    sauceStyle: 3,
    flavorVibe: [1, 2],
    spiceLevel: 4,
    wingsEaten: 10,
    selectedTagId: 2,
    wouldOrderAgain: true,
  });

  assert.equal(payload.flowVariant, QUICK_RATING_FLOW_VARIANT);
  assert.equal(payload.isQuickRating, true);
  assert.deepEqual(payload.scores, { overall: 8, sauce: 7, crispiness: 9, meat: 6 });
  assert.equal(Object.prototype.hasOwnProperty.call(payload, 'sauceStyle'), false);
  assert.ok(QUICK_RATING_MEASUREMENT_NOTE.includes('evidence-limited'));
}

function testFullRatingPayload() {
  const payload = buildRatingPayload({
    flowVariant: FULL_RATING_FLOW_VARIANT,
    scores: { overall: 8, sauce: 7, crispiness: 9, meat: 6 },
    sauceStyle: 3,
    flavorVibe: [1, 2],
    spiceLevel: 4,
    wingsEaten: 10,
    selectedTagId: 2,
    wouldOrderAgain: true,
  });

  assert.equal(payload.flowVariant, FULL_RATING_FLOW_VARIANT);
  assert.equal(payload.isQuickRating, false);
  assert.equal(payload.sauceStyle, 3);
  assert.deepEqual(payload.flavorVibe, [1, 2]);
  assert.equal(payload.wouldOrderAgain, true);
}

function run() {
  testQuickRatingStepLabels();
  testFullRatingStepLabels();
  testQuickRatingPayload();
  testFullRatingPayload();
  console.log('quick-rating tests passed');
}

run();
