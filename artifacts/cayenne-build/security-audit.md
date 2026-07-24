# Security audit

- Production is rejected as a Cayenne environment.
- Fixture names and QA identities are allowlisted.
- Arbitrary SQL is not an interface.
- JSON output redacts token, secret, password, service-role, API-key, and authorization fields.
- Run locks are removed in `finally` cleanup and a PowerShell cleanup command is provided.
- Existing user worktree modifications were preserved.

