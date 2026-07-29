export const MARKETING_AUTONOMOUS_PUBLICATION_ENABLED = false;
export const MARKETING_FALLBACK_ELIGIBILITY_ENABLED = false;

const REQUIRED_GATES = [
  'freshness',
  'provenance',
  'localization',
  'persistence',
  'media_validation',
  'mock_content',
  'contradiction',
];

export function evaluateMarketingPublication({ gates = {}, approval = null } = {}) {
  const failedGates = REQUIRED_GATES.filter((gate) => gates[gate] !== true);
  const humanApproved =
    approval?.decision === 'approved' &&
    typeof approval?.reviewer_id === 'string' &&
    approval.reviewer_id.length > 0 &&
    typeof approval?.approved_at === 'string' &&
    approval.approved_at.length > 0;

  return {
    eligible: false,
    publication_allowed: failedGates.length === 0 && humanApproved,
    autonomous_publication_enabled: MARKETING_AUTONOMOUS_PUBLICATION_ENABLED,
    fallback_eligibility_enabled: MARKETING_FALLBACK_ELIGIBILITY_ENABLED,
    failed_gates: failedGates,
    reviewer_decision: approval?.decision || 'missing',
    reason_code:
      failedGates.length > 0 ? 'required_gate_failed' :
      !humanApproved ? 'human_approval_missing' : 'human_approved_assisted_artifact',
  };
}

export function assertMarketingPublicationAllowed(input) {
  const result = evaluateMarketingPublication(input);
  if (!result.publication_allowed) throw new Error(result.reason_code);
  return result;
}
