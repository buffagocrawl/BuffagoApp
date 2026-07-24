# Cayenne runtime QA

Cayenne executes local Android runtime checks and owns evidence collection. Serrano consumes validated evidence and owns the release disposition.

From the repository root:

```powershell
.\scripts\cayenne\run.ps1 -Suite smoke -Environment production-readonly -SerranoReview
```

The default smoke suite is non-mutating. If the configured Supabase host is production, any mutating suite is blocked. Copy `crawl\.env.cayenne.example` to a local ignored file only when a real QA project and disposable credentials are available; never copy secrets into the repository or YAML.

Artifacts are written under `artifacts/cayenne/runs/<run-id>/`. `result.json`, `safety-check.json`, redacted logs, hierarchy, screenshots, and `serrano/response.json` are the handoff boundary.

Use `scripts/cayenne/validate-contracts.ps1` to validate selector references. Functional suites are enabled incrementally as feature selectors and QA fixtures become available; unsupported external-provider journeys are reported as blockers.
