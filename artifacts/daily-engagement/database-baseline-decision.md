# Database Baseline Decision

## Decision: BLOCKED — no authoritative reproducible baseline yet

The linked BuffaGo project was verified read-only as `vhfxnizaxdanmvmouuaf`.
The only available schema artifact is a post-engagement live snapshot, not a
pre-engagement baseline. It cannot be promoted to source of truth without
silently baking candidate objects into the baseline.

Disposable replay evidence was obtained locally with Supabase CLI 2.107.0,
Docker 29.4.2, and PostgreSQL 17.6. The commands were:

```powershell
supabase start --workdir crawl
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres --file <reviewed-schema-snapshot.sql>
psql <db-url> --set ON_ERROR_STOP=1 --file crawl/supabase/validation/buffago-baseline-preflight.sql
psql <db-url> --set ON_ERROR_STOP=1 --file crawl/supabase/migrations/20260723143000_engagement_retention.sql
psql <db-url> --set ON_ERROR_STOP=1 --file crawl/supabase/migrations/20260724012000_daily_engagement_notifications.sql
```

The replay snapshot checksum was
`BE31964E558689B153B3052A166DE7DE6B97B745DA948573230215AE7D11CE21`.
Preflight, both migrations, replay, and the existing SQL validation passed in
one disposable local database. This proves replay compatibility only; it does
not prove a clean baseline or two independent environments.

Production was not mutated. Production approval remains withheld.
