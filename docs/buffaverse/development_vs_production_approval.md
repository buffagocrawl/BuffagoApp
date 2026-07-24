# Development versus production approval

Development approval is based on static semantics, typechecking, tests, database design, migration integrity, RLS/grants, idempotency/concurrency, safety, and bounded performance. It does not claim visual testing passed.

Production acceptance additionally requires the user’s manual visual/device/accessibility review and explicit release authorization. Production flags remain disabled.
