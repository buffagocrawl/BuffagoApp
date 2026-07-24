# QA environment and fixtures

Supported environments are `local-mock`, `qa`, and `production-readonly`. Mutating journeys are permitted only in the first two with explicit opt-in. The fixture command names every namespace `cayenne:<run-id>`, validates the host, and returns `BLOCKED_EXTERNAL_QA_CREDENTIALS` when a QA project/credential set is not configured. The current production Supabase target must never be substituted.
