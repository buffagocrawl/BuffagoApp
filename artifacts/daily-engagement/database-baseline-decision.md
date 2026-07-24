# Database Baseline Decision

Decision: **Strategy B, declared prerequisite baseline**.

The repository does not contain a complete root migration history. The release SQL is a delta pack under `crawl/supabase/migrations/deployed`; an empty PostgreSQL/Supabase database fails at the first profile alteration because `public.users` is absent. The baseline is provisioned outside this pack and must exist before the delta pack is applied.

`public.users` is the BuffaGo-owned profile/progression table. It is not a view and is not an identity replacement. Its `user_id` is the application profile key; authoritative identity and ownership checks remain against `auth.users` and `auth.uid()`. Engagement privacy fields and XP live on the profile table, so changing these references to `auth.users` would cross the intended data boundary.

The read-only preflight checks `pgcrypto`, `auth.users`, profile/core relations, required columns, XP/social functions, and the rating uniqueness constraint. It reports every missing item in one run and raises `buffago_baseline_preflight_failed` before applying any engagement migration.

Run from `crawl`:

```powershell
./scripts/apply-engagement-migrations.ps1 -DatabaseUrl $env:BUFFAGO_BASELINE_DATABASE_URL
```

The preflight SQL can be run independently with `psql $db --set ON_ERROR_STOP=1 --file supabase/validation/buffago-baseline-preflight.sql`. Provisioning is owned by the BuffaGo database/platform owner using the approved baseline snapshot or existing BuffaGo foundation migrations; this release does not invent or recreate that baseline.

| State | Result | Evidence |
| --- | --- | --- |
| Empty database | Safe fail before changes | Baseline objects, including `public.users`, are absent |
| Correctly provisioned baseline | Passed in prior disposable local run | Baseline restore and migration recovery logs |
| Previously partial state | Passed in prior disposable local run | Engagement migrations reran idempotently |
| Second clean environment | Not available in this workspace | Required before approval |

The repository cannot create BuffaGo from empty. Production must not run the delta files directly or use blind `supabase db push`; deployment must invoke the preflight wrapper against a correctly provisioned baseline.
