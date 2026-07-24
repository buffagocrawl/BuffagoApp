# Daily streak review

Repository contracts define server-authoritative engagement rather than app-open qualification. Rating and other canonical engagement events feed the server boundary; the UI must not independently mint a streak or reward.

Date-key, timezone, idempotency, canonical-action, retry, duplicate-defense, and notification-boundary tests passed. Midnight/DST, offline recovery, two-client/two-device concurrency, account reset/deletion, and live ledger convergence were not executed.

Result: contract PASS; live one-increment/one-reward acceptance remains `RISK-003`.
