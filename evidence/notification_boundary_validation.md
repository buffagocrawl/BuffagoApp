# Notification boundary validation

Repository-controlled boundary validates outbox creation, deduplication,
24-hour frequency caps, default-off preferences, expiry suppression,
cancellation, retry/processing eligibility, triple kill switches, quiet hours,
bounded deep links, and service-role-only execution.

Corrective migration:
`20260724140000_buffaverse_phase2_notification_boundary.sql`

SHA-256:
`e684826d7bbe72f8ffc1b78bca4fba2dc3850ef71c8b5b438f28e12fe9296124`

Validation:

- four contract tests pass;
- executable PostgreSQL 18 disposable validation passes;
- disabled flags create no outbox row;
- duplicate enqueue returns the same outbox row;
- delivery eligibility fails when the notification child flag is disabled;
- cancellation moves queued/retry/processing rows to `cancelled`;
- anonymous RPC discovery/execution is denied;
- service-role read-only eligibility returns `outbox_unavailable` for a missing row;
- targeted deployment dry run selected only version `20260724140000`;
- remote ledger records version `20260724140000` exactly once;
- live `notification_outbox` count remains zero;
- all 14 live Buffaverse flags remain disabled.

The boundary never calls a provider and never inserts into an XP or coin
ledger. Real provider delivery remains a production-release condition.
