const QUICK_RATING_FLOW_VARIANT = 'quick_onboarding';
const FULL_RATING_FLOW_VARIANT = 'full_review';

const QUICK_RATING_MEASUREMENT_NOTE =
  'Measurement remains evidence-limited until verified analytics access is restored.';

const QUICK_RATING_STEPS = [
  {
    key: 'overall',
    label: 'Overall',
    title: 'Overall Experience',
    description: 'Your first gut-check. How good were these wings, overall?',
    badLabel: 'Skip Next Time',
    goodLabel: 'Run It Back',
  },
  {
    key: 'sauce',
    label: 'Sauce / Rub',
    title: 'Sauce or Rub',
    description: 'How strong was the flavor, balance, and cling?',
    badLabel: 'Flat',
    goodLabel: 'Craveable',
  },
  {
    key: 'crispiness',
    label: 'Crispiness',
    title: 'Crispiness',
    description: 'Did the texture hold up, or go soft fast?',
    badLabel: 'Soggy',
    goodLabel: 'Crunchy',
  },
  {
    key: 'meat',
    label: 'Chicken',
    title: 'Chicken Quality',
    description: 'How juicy and solid was the chicken itself?',
    badLabel: 'Dry',
    goodLabel: 'Juicy',
  },
];

function getRatingFlowStepLabels(flowVariant, sauceStyle) {
  if (flowVariant === QUICK_RATING_FLOW_VARIANT) {
    return QUICK_RATING_STEPS.map((step) => step.label);
  }

  return [
    'Style',
    sauceStyle === 1 ? 'Rub score' : 'Sauce score',
    'Crispiness',
    'Chicken',
    'Overall',
    'Flavor',
    'Heat',
    'Count',
    'Tag',
    'Comeback',
  ];
}

function buildRatingPayload({
  flowVariant = FULL_RATING_FLOW_VARIANT,
  scores,
  sauceStyle,
  flavorVibe,
  spiceLevel,
  wingsEaten,
  selectedTagId,
  wouldOrderAgain,
}) {
  const base = {
    flowVariant,
    isQuickRating: flowVariant === QUICK_RATING_FLOW_VARIANT,
    scores,
  };

  if (flowVariant === QUICK_RATING_FLOW_VARIANT) {
    return base;
  }

  return {
    ...base,
    sauceStyle,
    flavorVibe: Array.isArray(flavorVibe) ? flavorVibe : [],
    spiceLevel,
    wingsEaten,
    selectedTagId,
    wouldOrderAgain,
  };
}

module.exports = {
  FULL_RATING_FLOW_VARIANT,
  QUICK_RATING_FLOW_VARIANT,
  QUICK_RATING_MEASUREMENT_NOTE,
  QUICK_RATING_STEPS,
  buildRatingPayload,
  getRatingFlowStepLabels,
};
