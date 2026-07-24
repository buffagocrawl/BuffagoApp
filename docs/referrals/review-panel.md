# Referral-system-v1 independent review panel

Review date: 2026-07-23. Each perspective reviewed the implementation against the
commission independently; other scores were withheld until all eight scorecards were
written. Scores cover the local implementation. Every reviewer separately identifies
staging schema/RLS execution as a production blocker, not a missing local deliverable.

## Final scorecards

### CEO — 96/100

- Blocking issues: none for local handoff; production remains blocked on staging proof.
- Non-blocking: measure whether 500 total XP per qualified acquisition produces enough
  activation and retained raters to justify the cost.
- Evidence: centralized defaults and disabled launch state in
  `20260724033000_referral_system_v1.sql`; funnel/cost view
  `referral_funnel_summary`; Hub offer in `app/referrals.jsx`.

### Chief Marketing Officer — 96/100

- Blocking issues: none.
- Non-blocking: test two share-copy variants after a stable baseline and confirm whether
  customers understand “XP” better than “coins.”
- Evidence: native share copy and placement parameters in `lib/referrals.js`; mutual
  reward explanation and headline in `app/referrals.jsx`.

### VP of Growth — 97/100

- Blocking issues: none.
- Non-blocking: add controlled placement holdouts after launch; watch install-to-signup
  loss where true store deferred linking is unavailable.
- Evidence: click, claim, signup, qualification, cost, time-to-qualification, top
  placement, and seven-day return reporting in the migration; analytics catalog test
  `tests/referrals/referral-analytics.test.js`.

### Product Manager — 96/100

- Blocking issues: none.
- Non-blocking: validate eligibility/error copy with real newly created and ineligible
  accounts in staging.
- Evidence: non-blocking claim handling and manual entry in `app/referrals.jsx`; status
  state machine and eligibility rules in the migration; deferred claim bridge.

### Security and Abuse Reviewer — 95/100

- Blocking issues: no unresolved local critical issue. Production must not proceed
  before the seeded RLS/idempotency matrix passes.
- Non-blocking: tune velocity/rapid-qualification thresholds with real data; consider
  device attestation only if abuse proves material.
- Evidence: row locks, reward/ledger uniqueness, service-only internal functions,
  deletion/banned-account checks, review signals, compensating reversal, and dry-run
  reconciliation in the migration; database contract tests and staging script.

### 22-year-old college user — 95/100

- Blocking issues: none.
- Non-blocking: make the HTTPS landing page visually match the in-app Hub; consider a
  share-card image later without adding friction.
- Evidence: “Wings taste better with friends,” one-tap native share, visible code,
  mutual reward, and simple pending states in `app/referrals.jsx`.

### 35-year-old social golfer user — 95/100

- Blocking issues: none.
- Non-blocking: verify Dynamic Type on the three-column metrics at maximum system text
  size and test sharing while planning a multi-person crawl.
- Evidence: profile entry, Friends empty-state placement, copy button, native share,
  recent privacy-safe statuses, and responsive max-width layout.

### Senior Mobile Engineer — 95/100

- Blocking issues: no local blocker. Production app/universal links require association
  files and a native build verified on physical iOS and Android devices.
- Non-blocking: add an automated device-level OAuth interruption test when CI supports
  Expo E2E.
- Evidence: cold/warm link bridge, AsyncStorage pending intent, auth-transition claim,
  onboarding race recovery, custom-scheme route, conditional associated domains/intent
  filters, default-off feature flag, and canonical rating RPC integration.

## Result

- Average: **95.63**
- Minimum reviewer: **95**
- Critical local security, attribution, reward-integrity, or data-loss issues: **0**
- Production blockers: staging introspection/migration execution, seeded RLS matrix,
  physical-device deep links, and complete two-account acceptance evidence.

## Iteration history

1. Audit gate: found the apparent 100-yard versus 0.5-mile discrepancy and stopped.
   Product owner clarified the intentional public/operational distinction.
2. Implementation review: found and fixed onboarding/claim race handling, default-off
   rollout, concurrent code-generation retries, disabled/deleted-account eligibility,
   service-only reconciliation, badge reversal, push deep links, reporting coverage,
   and migration compatibility issues identified by local database lint.
3. Final independent review: all reviewers reached at least 95 with no unresolved local
   critical issue. No score was increased to conceal the staging deployment gate.
