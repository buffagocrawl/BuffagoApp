# Chipotle

Chipotle is Buffago's read-only daily analytics agent. It derives the most recently completed `America/New_York` calendar day, queries Supabase through the REST API, summarizes privacy-safe aggregates, evaluates Jalapeno health, writes Markdown and JSON, and can commit only the primary generated reports.

## Setup

Copy `.env.example` to `C:\Users\Brand\repo\BuffagoApp\Agents\Chipotle.env.local` and populate it locally. That path is Git-ignored. Use a dedicated read-only analytics credential where possible. A service-role key may be needed only to count `auth.users` through the Supabase admin endpoint; it is never sent to an app client, printed, or committed.

## Commands

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Agents\Chipotle\scripts\run-chipotle.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\Agents\Chipotle\scripts\run-chipotle.ps1 -DryRun
powershell -NoProfile -ExecutionPolicy Bypass -File .\Agents\Chipotle\scripts\run-chipotle.ps1 -SmokeTest
powershell -NoProfile -ExecutionPolicy Bypass -File .\Agents\Chipotle\scripts\install-scheduled-task.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\Agents\Chipotle\scripts\remove-scheduled-task.ps1
```

Use `-ReportDate YYYY-MM-DD` for a historical completed day. `-DryRun` writes and validates output but never commits or pushes. The optional smoke test performs only a minimal GET request. Unit tests never use live credentials.

## Buffago metrics contract

Chipotle is the authoritative collector of facts, calculations, freshness, and missing-data evidence. It does **not** calculate the Buffago maturity score, make investment-readiness decisions, or select Apache actions. Its versioned contract is written to the shared brain at `Agents/Buffago/metrics/latest.{json,md}` and `Agents/Buffago/metrics/daily/YYYY-MM-DD.{json,md}`. Daily snapshots are append-only: an input change on the same date creates a fingerprinted `regenerated-*` snapshot and records why it was regenerated.

The primary Apache audience metric is meaningful MAU only when an identity-safe aggregate exists. Meaningful activity is a completed core action, currently allowlisted as ratings, crawl starts/completions, Wing Duel votes, and daily XP claims. Login, refresh, and app-open events are explicitly excluded. The source currently provides only an any-activity daily aggregate, so meaningful DAU/WAU/MAU remain unavailable rather than estimated.

Every metric record has a nullable `value`, status (`verified`, `calculated`, `manually_verified`, `estimated`, `unavailable`, `query_failed`, `not_instrumented`, `cohort_not_mature`, or `stale`), source, calculation, timestamp, and confidence where applicable. A null value never means zero. Retention requires identity-safe cohort aggregates and always includes a cohort size; a cohort that has not aged far enough is `cohort_not_mature`.

Business facts are read only from `Agents/Buffago/metrics/manual-business-facts.json`. Use `{"facts":{"revenue":{"value":123,"verified_at":"...","confidence":"high","notes":"..."}}}` for verified aggregate facts. Chipotle never writes or infers these facts.

See [metric-source-map.md](docs/metric-source-map.md) for definitions, sources, activation and retention methodology, confidence, and instrumentation additions. The committed JSON Schema is [buffago-metrics-v2.schema.json](schemas/buffago-metrics-v2.schema.json).

## Outputs and Git

Canonical files are `Results/YYYY-MM-DD-buffago-daily-metrics.{md,json}` and `Results/latest.md`. The identical Markdown is synchronized to `C:\Users\Brand\repo\Agents\Buffago\Daily Output/YYYY-MM-DD-chipotle-buffago-daily-metrics.md` and `chipotle-latest.md`. A separately detected shared-brain repository is never committed or pushed unless `CHIPOTLE_ENABLE_SHARED_BRAIN_GIT_PUSH=true` is explicitly set (the initial implementation writes only).

Before an automated commit Chipotle validates output, scans only Chipotle report artifacts for secrets, verifies repository/branch/merge state and remote ancestry, then stages exactly the date Markdown, date JSON, and `latest.md` under `Agents/Chipotle/Results`. It never uses `git add .`, pull/rebase, force push, or modifies unrelated work. Set `CHIPOTLE_ENABLE_GIT_PUSH=false` to retain local commit validation without push.

## Architecture and limitations

`src/chipotle.py` contains configuration validation, Eastern completed-day windows (DST-safe), bounded REST GETs with retries, aggregate collection, Jalapeno artifact parsing, report rendering, atomic writes, secret scanning, and Git safeguards. `config/thresholds.json` holds reviewable status rules. `docs/metric-source-map.md` is the source-of-truth metric inventory.

Some requested metrics need authoritative event/session/auth/error telemetry not currently established in tracked schema. Chipotle labels those as unavailable rather than presenting a zero. To add a metric, first update the source map with the table/view/RPC, timestamp, privacy filter, and calculation; then add a bounded aggregate collector and tests. Future Codex/ChatGPT automation can invoke the same PowerShell wrapper in a trusted Windows environment; Task Scheduler is the concrete implementation because it can use local credentials and Git authentication.

## Credential rotation and troubleshooting

Rotate the local credential in `Chipotle.env.local`, run `-SmokeTest`, then run `-DryRun`. If a query is denied or a table is absent, the run is partial and names only the safe error category. Missing credentials, report-integrity failure, secret-scan failure, and unsafe Git state block commit/push. Logs and `artifacts/last-run-result.json` are sanitized and local-only.
