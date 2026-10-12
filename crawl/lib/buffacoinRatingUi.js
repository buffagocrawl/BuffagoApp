// Reconstruct the wizard input from the immutable persisted transaction.
export function buffacoinWizardPayload(request) {
  const rating = request.rating;
  return {
    scores: { sauce: rating.sauce, crispiness: rating.crispiness, meat: rating.meat, overall: rating.overall },
    wouldOrderAgain: rating.would_order_again,
    selectedTagId: rating.tag_id,
    wingsEaten: rating.wings_eaten,
    sauceStyle: rating.sauce_style,
    flavorVibe: rating.flavor_vibe,
    spiceLevel: rating.spice_level,
  };
}

export function buffacoinFailureMessage(result) {
  if (result.status !== 'definitive_failure') return "We're checking your rating. Your BuffaCoins won't be charged twice.";
  return String(result.error?.message || '').includes('insufficient_balance')
    ? "You don't have enough BuffaCoins for this rating. No BuffaCoins were deducted."
    : "Your rating wasn't submitted. No BuffaCoins were deducted.";
}
