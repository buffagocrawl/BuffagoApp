# Independent Security Scoring Panel

Panel average: **71.4/100**. Lowest: **68/100**, Google Maps platform
specialist. Disposition consensus: **MITIGATED — OWNER ACTION REQUIRED**.

Unknown Google Cloud restrictions, incomplete external exposure evidence, the
unverified replacement deployment, and the direct client Directions call
materially lower every score.

| Reviewer | Overall | Blocking concerns | Required remediation | Confidence |
|---|---:|---|---|---|
| Security engineer | 73 | revocation/restrictions/deployment unverified; historical exposure | verify disablement; split keys; proxy Directions; rebuild and scan | HIGH |
| Staff software engineer | 72 | unsafe Directions boundary; live validation blocked | platform/environment separation and authenticated proxy | HIGH |
| Expo/React Native specialist | 70 | one public variable spans incompatible restriction types | platform-scoped EAS vars; proxy web-service calls; device tests | HIGH |
| Cloud infrastructure engineer | 71 | no Console evidence, SHA fingerprints, quota/budget evidence | record restrictions, quotas, budgets, usage; separate keys | MEDIUM-HIGH |
| Google Maps platform specialist | 68 | native SDK and Directions Legacy share a public key | native keys plus server Directions key; API allowlists; rejection tests | MEDIUM-HIGH |
| DevOps engineer | 72 | Actions artifacts and deployed replacement unverified | required CI scan; artifact retention; rebuild/deploy evidence | MEDIUM-HIGH |
| Privacy/compliance reviewer | 72 | public history and abuse/billing review open | incident record, usage review, RLS/runtime verification | HIGH-repository/LOW-cloud |
| Product engineering lead | 72 | cannot resolve without owner/cloud/runtime evidence | prioritize service continuity, proxy migration, platform regression | HIGH |
| Buffago CTO perspective | 74 | architecture and operational closeout remain | split secrets, clear-cache builds, required CI, coordinated cleanup | HIGH-code/MEDIUM-LOW-production |
| Buffago founder/CEO perspective | 70 | financial/reputation exposure not closed | verify disablement, billing review, restricted deployment, journey tests | MEDIUM-HIGH |

## Category scores

The complete per-reviewer category matrix is in `panel-scores.json`. Categories:
secret containment, classification accuracy, client/server boundary, Google
restriction posture, build safety, Git hygiene, environment management, CI
controls, incident readiness, evidence, practicality, regression risk, and
documentation.

## Shared blocking concerns

- Old-key disablement has not been independently verified.
- The new key's application/API restrictions are unknown.
- Production has not been rebuilt/redeployed and runtime-tested.
- Directions API (Legacy) is still called directly from public client code.
- Abuse, quota, billing, and Actions artifact reviews remain owner tasks.

## Shared non-blocking concerns

- Historical cleanup remains useful but secondary to revocation.
- The repository scanner is high-confidence but narrower than Gitleaks or
  TruffleHog full-history analysis.
- Existing lint warnings are unrelated to this incident.

## Evidence referenced

All reviewers cited the baseline, occurrence inventory, configuration trace,
restriction assessment, exposure scope, secret audit, generated-artifact
decision, validation, owner checklist, history plan, scanner, workflow, and
current repository diff.
