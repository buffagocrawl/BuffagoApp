# Cayenne

Cayenne is Buffago's runtime QA boundary. It owns preparation, execution evidence, classification, and cleanup;
Serrano owns product decisions. Contracts are versioned under `schemas/`, and fixture mutation is denied outside
non-production environments.

```powershell
./scripts/cayenne/check-prerequisites.ps1
./scripts/cayenne/run.ps1 -Suite smoke -DryRun
```

The current runtime produces an honest `inconclusive` result when no configured mobile/web adapter or QA session
exists. It never emits a passing result from a dry run or from missing evidence.

