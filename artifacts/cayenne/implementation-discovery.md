# Cayenne runtime QA implementation discovery

Date: 2026-07-24
Branch: `feat/cayenne-runtime-qa`

## Existing components

- `Agents/Cayenne/cayenne/` contains the original Python runtime, contract helpers, fixture stub, and Serrano ingestion helper.
- `Agents/Cayenne/schemas/` contains the original request/result schemas.
- `Agents/Cayenne/journeys/` contains two early YAML journey files.
- `Agents/Serrano/serrano/` contains the existing product orchestration, state, validators, and Cayenne integration module.
- `scripts/cayenne/` contains prerequisite, run, report, and lock-cleanup helpers.
- `crawl/android/`, the Android package `com.buffago.app`, and the existing Expo app are present.
- Existing Android runtime selectors are sparse and mostly accessibility-label based.

## Missing components

- Canonical versioned runtime contracts with the requested status/failure vocabulary.
- Fail-closed environment and secret safety checks.
- A Windows-first runtime orchestrator that executes Maestro and collects evidence.
- Canonical selector registry and selector/flow validation.
- Reusable bootstrap and deterministic smoke flows.
- Structured redaction, artifact normalization, screenshot/hierarchy/log collection, and Serrano review packet validation.
- QA fixture lifecycle interface with explicit production blocking.
- Documentation and automated contract/safety/adapter tests.

## Files to modify

- `crawl/app/_layout.tsx` and `crawl/app/(tabs)/_layout.tsx` for test-only root/loading/error/navigation markers.
- `crawl/package.json` for non-breaking Cayenne commands.
- `scripts/cayenne/*` for the Windows orchestration entry points.
- `Agents/Serrano/serrano/cayenne_integration.py` only if the existing adapter needs compatibility changes.

## Files to create

- Canonical `cayenne/` contracts, config, flows, selectors, fixture interface, scripts, Serrano adapter, tests, and documentation.
- `docs/cayenne-*.md` architecture and operator documentation.
- `crawl/.env.cayenne.example` with names only and no credentials.

## Risks

- The current `crawl/.env.development` points at a production Supabase project; mutating runtime suites must be blocked.
- Maestro/system permission dialogs vary by Android image and may be absent after the first run.
- OAuth and remote notification delivery require external providers and are not deterministic on this emulator.
- Existing user changes in `crawl/package.json` and untracked prerequisite notes must not be discarded.

## Production-safety boundaries

- Supported environments are `local-mock`, `qa`, and `production-readonly`.
- Mutations are allowed only for `local-mock` or `qa` with explicit opt-in and validated non-production host.
- Production host detection, unknown environment, service-role exposure, and missing mutation opt-in fail closed.
- Evidence is redacted before Serrano consumption; secrets and raw environment values are never logged.

## Expected validation approach

- Unit-test contract, safety, redaction, selector, fixture, normalization, and Serrano disposition logic.
- Run existing `crawl` checks without modifying unrelated production behavior.
- Run a non-mutating Android smoke flow against `com.buffago.app` when adb/Maestro are available.
- If the current production Supabase target prevents a required action, emit a structured blocker rather than substituting production data.
