// One policy for mobile verification, the popup, and authoritative insertion.
export const WING_CONFIDENCE_APPROVAL_THRESHOLD = 0.50;
export const RESTAURANT_MATCH_APPROVAL_THRESHOLD = 0.80;
export type WingEvidenceStatus = 'supports' | 'unknown' | 'unavailable' | 'conflicting';
export type WingmanLocationStatus = 'verified' | 'needs_city' | 'needs_more_info' | 'conflicting' | 'unverified';

export function normalizeWingmanConfidence(value: unknown): number | null {
  // Accept an explicit numeric fraction, never percentages, booleans, empty
  // strings, non-finite values, or an out-of-range score clamped to approval.
  const score = typeof value === 'number' ? value : typeof value === 'string' && /^\s*(?:0(?:\.\d+)?|1(?:\.0+)?)\s*$/.test(value) ? Number(value) : null;
  return score !== null && Number.isFinite(score) && score >= 0 && score <= 1 ? score : null;
}

export function canApproveWingman(assessment: {
  matchConfidence: unknown; wingConfidence: unknown;
  verifiedRestaurant: boolean; locationStatus: string | null;
  needsCity?: boolean; needsMoreInfo?: boolean; wingEvidenceStatus?: string | null;
}) {
  const match = normalizeWingmanConfidence(assessment.matchConfidence);
  const wings = normalizeWingmanConfidence(assessment.wingConfidence);
  return match !== null && match >= RESTAURANT_MATCH_APPROVAL_THRESHOLD
    && wings !== null && wings >= WING_CONFIDENCE_APPROVAL_THRESHOLD
    && assessment.verifiedRestaurant === true && assessment.locationStatus === 'verified'
    && !assessment.needsCity && !assessment.needsMoreInfo
    && !['unavailable', 'conflicting'].includes(assessment.wingEvidenceStatus || 'unknown');
}

export function formatWingmanConfidence(value: unknown) {
  const score = normalizeWingmanConfidence(value);
  return score === null ? 'Unknown' : `${Math.floor((score + Number.EPSILON) * 10000) / 100}%`;
}

export function sameWingmanLocation(a: { city?: string | null; state?: string | null; address?: string | null }, b: { city?: string | null; state?: string | null; address?: string | null }) {
  const normalize = (value: string) => value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
  return (['city', 'state', 'address'] as const).every(key => !a[key] || !b[key] || normalize(a[key]!) === normalize(b[key]!));
}

export function wingmanPlaceNameMatches(requested: string, candidate: string) {
  const normalize = (value: string) => value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, '').trim();
  const left = normalize(requested), right = normalize(candidate);
  if (left.length < 3 || right.length < 3) return left === right;
  if (left === right || left.includes(right) || right.includes(left)) return true;
  const generic = new Set(['restaurant','restaurants','bar','grill','tavern','pub','inc','llc','the','and']);
  const words = left.split(/\s+/).filter(word => !generic.has(word));
  const candidates = right.split(/\s+/).filter(word => !generic.has(word));
  const similarity = (a: string, b: string) => {
    let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
    for (let i=1;i<=a.length;i++) {
      const current=[i];for(let j=1;j<=b.length;j++) current[j]=Math.min(current[j-1]+1,previous[j]+1,previous[j-1]+Number(a[i-1]!==b[j-1]));
      previous=current;
    }
    return 1 - previous[b.length] / Math.max(a.length,b.length);
  };
  return words.length > 0 && words.every(word => candidates.some(other => similarity(word,other) >= 0.75));
}
