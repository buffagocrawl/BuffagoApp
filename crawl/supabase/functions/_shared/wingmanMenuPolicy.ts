import { type WingmanMenuEvidence, wingMenuText } from './wingmanMenuEvidence.ts';

// Eligibility score, not a calibrated probability. Never manufacture a source
// from a model prior, caller detail, failed fetch, or absence on a partial menu.
export function assessWingmanMenu(evidence: WingmanMenuEvidence[], model: {
  wings_probability: number | null; wing_evidence_status: string; wing_evidence: string | null;
}, now = Date.now()) {
  const positives = evidence.filter(item => item.confirmsWings === true);
  const negatives = evidence.filter(item => {
    const updated = Date.parse(item.updatedAt || '');
    return item.source === 'official' && item.locationMatched === true
      && Number.isFinite(updated) && updated <= now && now - updated <= 90 * 86400000
      && item.explicitUnavailable && wingMenuText(item.text).durableNegative;
  });
  const conflict = positives.length > 0 && negatives.length > 0;
  const rejected = negatives.length > 0 && !positives.length;
  const positive = positives.length > 0 && !conflict;
  const status = rejected ? 'unavailable' : positive ? 'supports' : 'unknown';
  const score = rejected ? .1 : positive ? (positives.some(item => item.source === 'official') ? .95 : .8) : .5;
  return {
    wings_probability: score,
    wing_evidence_status: status,
    // Preserve the actual conflict and raw model assessment without sending a
    // blocking legacy status for an unresolved/inconclusive menu condition.
    wing_evidence: JSON.stringify({
      policy: 'neutral-menu-eligibility-v1',
      condition: conflict ? 'conflicting' : rejected ? 'explicit_negative' : positive ? 'confirmed_positive' : 'inconclusive',
      positive_sources: positives.map(item => item.url), negative_sources: negatives.map(item => item.url),
      model_status: model.wing_evidence_status, model_score: model.wings_probability,
      model_evidence: model.wing_evidence?.slice(0, 1000) ?? null,
    }),
  };
}
