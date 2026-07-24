# Validation results

Executed results:

- `python -m pytest Agents/Cayenne/tests Agents/Serrano/tests -q`: 21 passed.
- `npm exec -- tsc --noEmit`: passed.
- `npm run test:auth`: 14 passed; `test:analytics`: 3 passed; `test:growth`: 4 passed.
- `npm run migration:integrity`: passed.
- `npm run lint`: passed with 104 pre-existing warnings and zero errors.
- `scripts/cayenne/check-prerequisites.ps1`: passed; Android SDK tools detected, Maestro and QA environment absent.
- Dry-run and Serrano ingestion: executed; result was correctly `inconclusive` and decision `INSUFFICIENT_EVIDENCE`.

Native runtime checks are reported as inconclusive when the required adapter or QA session is absent; the system does not convert that state into a pass.
