# Cayenne QA fixtures

Fixture execution is intentionally allowlisted in `cayenne.fixtures`. The runtime rejects production,
arbitrary SQL, and identities outside `cayenne-*@qa.buffago.test`. Supabase RPC implementation belongs
in a QA-only migration/function layer and must be applied by an operator with the QA project identity verified.

