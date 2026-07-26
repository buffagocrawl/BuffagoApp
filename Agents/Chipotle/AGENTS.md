# Chipotle contributor rules

- Supabase access is read-only: only GET/HEAD requests are permitted.
- Never expose, log, fixture, report, or commit secrets. Never commit `Chipotle.env.local` or `.env.local`.
- Never modify production data, schema, RLS, or Buffago product code without explicit approval.
- Reports must be aggregate and privacy-safe. Do not include identifiers, emails, tokens, or activity trails.
- Map every implemented metric to an authoritative source; mark unsupported metrics unavailable.
- Stage only the allowlisted generated report files. Never stage unrelated files or force-push.
- Preserve unattended 6:00 AM America/New_York execution, locking, atomic writes, and safe failure behavior.
