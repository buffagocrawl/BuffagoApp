# Release Confidence

**Release Confidence: 40.0/100**  
Evidence coverage: **6.3% (1/16 scorable categories)**  
Evidence maturity: **Contract only**  
Gate status: **BLOCKED**  
Review timestamp: **2026-07-24**  
Trend: **New independent baseline; no prior same-domain score**

This is a narrow migration calculation from the traceable CEO `Release readiness` score of 40 in `judge-ceo.md`. It is not a measurement of all sixteen release categories and it must not be read as an app-experience score.

## Gate

- Hard blockers: `SEC-001` confirmed unresolved P1 historical credential exposure with containment still externally unverified; `RISK-002` missing mandatory release evidence for OAuth and physical notification behavior; `RISK-003` missing mandatory live RLS, concurrency, referral, and deletion evidence.
- Missing release evidence is not a confirmed product defect. The reviews explicitly report no reproduced auth failure, duplicate reward, cross-user access, or deletion failure.
- Largest blocker: production-safe credential containment and the live release evidence matrix.
- Largest opportunity: run the disposable-account, intended-platform validation matrix after credential containment is evidenced.

## Category ledger

| Category | Result | Evidence |
|---|---:|---|
| Release readiness (legacy source mapped to release domain) | 40 | [CEO scorecard](judge-ceo.md) |
| All 16 required release categories | Not Scorable individually | Existing review did not assign category-level numeric results |

The category-level results below are explicitly Not Scorable, not zero: Authentication reliability; Authorization and RLS; Data integrity; Reward idempotency; Streak concurrency; Account deletion; Notification delivery; Notification deep links; Build and export health; Automated regression health; Device and platform validation; Security and secret handling; Database migration readiness; Monitoring and observability; Rollback readiness; Failure recovery.

Required next evidence: provider/device auth and notification matrix; live non-production RLS, reward/streak concurrency, deletion, migration, rollback, and recovery probes; verified historical credential containment; build/export result for each intended platform.
