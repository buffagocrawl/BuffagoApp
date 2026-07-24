# Serrano and Cayenne artifact scan

Serrano evidence redacts secret-named fields. Cayenne result JSON is redacted before writing; logs and hierarchy use pattern redaction. The tracked/current artifact scan found no confirmed credential.

Risk: redaction is regex-based and log collection can include OAuth URLs, tokens, emails, locations, or provider payloads not matching existing patterns. Cayenne logs produced heuristic `password: false` hits only. Evidence must be scanned before commit/upload.
