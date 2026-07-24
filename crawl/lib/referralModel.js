export const REFERRAL_CODE_PATTERN = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/;
export const REFERRAL_OPERATIONAL_TOLERANCE_M = 804.67;

export function normalizeReferralCodeValue(value) {
  return String(value || '').trim().toUpperCase().replace(/[\s-]+/g, '');
}

export function isReferralCodeValue(value) {
  return REFERRAL_CODE_PATTERN.test(normalizeReferralCodeValue(value));
}

export function isWithinReferralRatingTolerance(distanceMeters) {
  const distance = Number(distanceMeters);
  return Number.isFinite(distance) && distance >= 0 && distance <= REFERRAL_OPERATIONAL_TOLERANCE_M;
}

export function referralBadgeProgress(summary = {}) {
  const qualified = Number(summary.qualified_count || 0);
  const threshold = Number(summary.next_badge_threshold || 0);
  return {
    qualified,
    threshold: threshold || null,
    remaining: threshold ? Math.max(0, threshold - qualified) : 0,
    progress: threshold ? Math.min(1, qualified / threshold) : 1,
  };
}
