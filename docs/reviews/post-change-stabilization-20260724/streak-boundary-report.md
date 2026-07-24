# Daily streak boundary report

- Qualification rule in code: canonical meaningful actions include rating creation, battle vote, and crawl-stop completion; the server RPC owns the check.
- Canonical date policy: server-side/user timezone input, with UTC fallback; device timestamps are excluded by contract.
- Midnight/DST: pure `Intl` date-key and timezone tests pass; real server boundary tests are pending.
- Retry/concurrency: unique constraints and idempotent reward contracts are present; live concurrent RPC test is pending.
- Offline synchronization: no live offline queue/device test was available.
- Duplicate rewards: SQL contract asserts server-authoritative receipts and uniqueness; no live two-device proof.
- Remaining risk: client hook warnings and lack of live time-boundary evidence.
