# Original P1 Reconciliation

The source review was sufficiently precise. Its three remaining P1 entries are below; they are not confirmed software defects.

## RISK-002 — Required real-device notification and OAuth flows have no current evidence

- Affected journey: authentication return, onboarding, notifications, deep links, sign-out/account switching.
- Reproduction/evidence: inspect the prior manual matrix; no Android/iOS device session or real provider credentials existed. Contract tests pass, but no provider acceptance or device receipt was recorded.
- Root cause: environmental evidence unavailable, not a demonstrated app failure.
- Code status: OAuth and notification contracts are present; notification dispatcher and deep-link code are covered locally.
- Classification: **Missing validation evidence** / environmental limitation.
- Required resolution: run supported Android and iOS builds with dedicated test accounts and real Google credentials; exercise permission, lifecycle, provider, delivery, and deep-link cases.
- Acceptance: successful/failed/cancelled OAuth routes safely; required notification types are accepted, received, deep-link correctly, deduplicated, preference-gated, and suppressed after completion.
- Owner: Branden/release validation owner; platform/provider owners for credentials.
- Release impact: **P1 release blocker** until evidence exists.

## RISK-003 — Live Supabase schema/RLS/concurrency/account-deletion behavior not exercised

- Affected journey: streak/rewards, referrals, protected data, account deletion, notifications.
- Reproduction/evidence: repository contracts assert the intended policies and idempotency; no safe live database session or remote schema query was used.
- Root cause: no authorized staging/development Supabase credentials/environment.
- Code status: SQL/RLS/duplicate-defense contracts pass; remote deployment status is unknown.
- Classification: **Missing validation evidence** / environmental limitation.
- Required resolution: use a safe non-production project with dedicated users and read/write evidence queries; do not apply migrations automatically.
- Acceptance: cross-user reads/writes and direct reward grants fail; concurrent qualification yields one increment/ledger entry; deletion removes auth/push access and follows documented anonymization/reconciliation policy.
- Owner: Branden/backend release owner.
- Release impact: **P1 release blocker**.

## RISK-004 — Serrano current discovery timed out after 120 seconds

- Affected journey: release governance and final disposition.
- Reproduction/evidence: prior command `.agents/skills/serrano/scripts/run_serrano.py discover` was externally terminated with exit 124 after 120 seconds and had no current run result.
- Root cause: caller timeout was shorter than the bounded multi-wave workflow; the run itself was not proven deadlocked. A fresh run also exposed Windows default-code-page decoding noise in subprocess reader threads.
- Code status: per-worker timeout/retry, failure state, resumability, and partial artifacts already existed; subprocess capture now explicitly uses UTF-8 with replacement.
- Classification: **Serrano-process failure**, repaired and revalidated.
- Required resolution: retain bounded execution, explicit statuses, retry/resume, and a caller timeout that exceeds expected workflow duration.
- Acceptance: fresh run reaches `awaiting_approval`, all reviewers have completed/failed status, no false completion, and approval remains separate from implementation/validation.
- Owner: Serrano maintainer.
- Release impact: original P1 closed as a process defect; the release remains blocked by RISK-002/RISK-003.
