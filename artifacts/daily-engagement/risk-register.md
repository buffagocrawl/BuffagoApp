# Risk Register

| Severity | Risk | Control | Residual state |
| --- | --- | --- | --- |
| Critical | Duplicate XP under retries/devices | Assignment lock, receipt uniqueness, ledger idempotency | Contract tested; live concurrency test still required |
| High | Timezone/device-clock farming | Server `now()`, 24-hour stable timezone promotion, unique local date | Travel change may lag up to 24 hours by design |
| High | Unauthorized social push | Commit trigger, mutual friendship, blocks, visibility, preference, delivery recheck | Must validate against deployed schema |
| High | Stale crawl/location notification | Crawl-state recheck, one next stop, expiration, cooldowns, default-off flags | Physical-device OS behavior untested |
| High | Push delivery path misconfiguration | Secret-authenticated Edge Function, service role isolated, token invalidation | Provider credentials/deployment not exercised |
| High | Existing TypeScript failures hide regressions | JS suites and lint run; release blocked | Repository typecheck remains failing |
| Medium | Approximate geofence false positive | Unknown/approximate accuracy suppressed; foreground precise confirmation | Background-only reminder is intentionally conservative |
| Medium | Notification fatigue | New categories default off, quiet hours, per-type dedupe/rate limits | Preference/copy usability needs device beta |
| Medium | Two streak concepts confuse users | Copy calls this “daily wing streak”; weekly crawl streak retained | UX consolidation remains recommended |
| Medium | Build-time and remote flags diverge | Both default off; server gates delivery | Flag administration/ownership runbook required |
| Low | Reinstall creates another installation | Multi-device supported; token uniqueness; last seen/invalidation | Stale row cleanup job required |
| Critical | Historical baseline provenance is unresolved | Hosted ledger and live catalog were checked read-only; exact SQL and pre-deployment snapshot are required before correction | `20260620000000` is `UNKNOWN/BLOCKING`; no rerun, ledger repair, or rollback permitted |
| High | Unattributed users/coin trigger state may differ from the missing baseline | Treat live `public.users`, grants, RLS, policies, trigger, and reward objects as evidence only; require an exact forward diff | Current hosted state is observed, but baseline attribution remains unproven |
