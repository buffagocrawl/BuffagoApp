# Cayenne final report

## Built

Cayenne now has a versioned request/result boundary, strict validation, redacted artifacts, safe fixture policy, local prerequisite checks,
PowerShell operator commands, guarded test-mode helpers, selector/journey contracts, and Serrano invocation/ingestion decision logic.

## Commands

```powershell
./scripts/cayenne/check-prerequisites.ps1
./scripts/cayenne/run.ps1 -Suite smoke -DryRun
python -m pytest Agents/Cayenne/tests Agents/Serrano/tests
```

## Honest validation status

Contract and lifecycle tests are executable locally. Native Android/web execution, QA database mutation/assertions, visual diffs, accessibility
scans, Review Evidence UI E2E, physical notifications, and iOS remain setup-gated and are classified as inconclusive rather than passed.

## Integration

Serrano commands are `run-runtime-validation` and `ingest-runtime-result`; results carry the tested commit and explicit decision/rerun scope.

## Commits/branch

No commit was created and no branch was changed; the user worktree was already dirty and was preserved.

## Human setup required

See [`human-setup-required.md`](human-setup-required.md). The short version is: install/configure Maestro, create an Android emulator and
development build, provide a QA-only Supabase project/credentials and deterministic QA identities, then optionally configure Playwright browsers,
OAuth test apps, physical push testing, iOS hosting, CI secrets, and artifact storage.
