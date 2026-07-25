# Security verification

- Credential provenance: `ignored_local_file`.
- `.secrets/cayenne.local.env` is ignored and untracked.
- Credentials are passed only to Maestro's child environment.
- Credentialed Maestro screenshots remain temporary and are not persisted.
- Password and token values are redacted from written artifacts.
- Focused credential/runtime test suite passed: 56 tests.
- Selector validation passed: 54 registered selectors, no duplicates or unknown references.
- No secret values are present in this directory.
