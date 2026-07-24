export const DEFAULT_PRIVACY_PREFERENCES = Object.freeze({
  shareUsername: true,
  shareLocation: true,
  hideVisitDate: false,
  socialFeedVisible: true,
  publicProfile: true,
});

export function privacyPreferencesFromUser(user = {}) {
  return {
    shareUsername: user.share_username ?? true,
    shareLocation: user.share_location ?? true,
    hideVisitDate: user.hide_visit_date ?? false,
    socialFeedVisible: !(user.social_opt_out ?? false),
    publicProfile: user.public_profile ?? true,
  };
}

export async function savePrivacyPreferences(supabase, preferences) {
  const next = { ...DEFAULT_PRIVACY_PREFERENCES, ...preferences };
  const { data, error } = await supabase.rpc('update_engagement_privacy', {
    p_share_username: next.shareUsername,
    p_share_location: next.shareLocation,
    p_hide_visit_date: next.hideVisitDate,
    p_social_feed_visible: next.socialFeedVisible,
    p_public_profile: next.publicProfile,
  });
  if (error) throw error;
  return privacyPreferencesFromUser(data);
}
