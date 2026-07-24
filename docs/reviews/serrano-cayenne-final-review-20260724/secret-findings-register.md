# Secret findings register

| ID | Severity | Type | Scope | Status |
|---|---|---|---|---|
| SEC-001 | P1 | Historical Google API key exposure | Public Expo bundle, PR #3, reachable history | Current tree removed; revocation/restrictions/redeployment unverified |
| SEC-002 | P2 | Client/web-service key trust-boundary design | `EXPO_PUBLIC_GOOGLE_API_KEY` architecture and direct Directions call | Repository guidance improved; durable platform split/proxy unverified |
| SEC-003 | P2 | Artifact/log redaction is pattern-based | Cayenne/Serrano/log collection | No leak confirmed; hardening/continuous scan required |
| SEC-004 | P3 | Full-history established scanner unavailable | Local environment | Targeted scan completed; Gitleaks/TruffleHog recommended |

Public Supabase anon JWT: intentional public client configuration, not a secret finding; safety depends on effective RLS, which lacks live evidence.
