/** Stable selectors consumed by Maestro/Playwright. Keep names additive and backwards compatible. */
export const cayenneSelectors = {
  authGoogleButton: 'auth-google-button', authFacebookButton: 'auth-facebook-button',
  homeWingdexButton: 'home-wingdex-button', wingdexRadiusFilter: 'wingdex-radius-filter',
  wingdexRestaurantCard: 'wingdex-restaurant-card', restaurantRateButton: 'restaurant-rate-button',
  ratingCrispinessSlider: 'rating-crispiness-slider', ratingSubmitButton: 'rating-submit-button',
  crawlResumeButton: 'crawl-resume-button', streakClaimButton: 'streak-claim-button',
  referralCodeInput: 'referral-code-input', referralAcceptButton: 'referral-accept-button',
  buffaverseEnterButton: 'buffaverse-enter-button', buffaverseLockedState: 'buffaverse-locked-state',
  profileSettingsButton: 'profile-settings-button', settingsDeleteAccountButton: 'settings-delete-account-button',
} as const;

