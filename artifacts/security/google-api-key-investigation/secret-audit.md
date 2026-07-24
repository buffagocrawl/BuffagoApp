# Repository-wide Secret Audit

## Confirmed findings

| Finding | Classification | Action |
|---|---|---|
| Google key `AIza...j-Ck` | compromised; public generated bundle | rotate/disable, replace with separate restricted keys, remove direct web-service use |
| Supabase anon JWT `JWT#1949ec6573c4` | expected client-visible identifier | retain only with verified RLS; current static RLS tests must continue |

## Expected public identifiers

- Supabase project URL and anon key used by the client.
- Google OAuth Android/iOS client IDs in ignored local environment files.
- Expo project ID, package name, bundle ID, and `buffago.com`.

## Local-only confidential values

Ignored `Agents/Jalapeno/.env` contains set service-role, Meta app-secret, and
long-lived-token variables. They were observed only by variable name,
length/hash, and Git status. They are untracked and were not found in tracked
content. Keep them outside Git and rotate independently if they have ever been
shared elsewhere.

## Likely false positive

`artifacts/daily-engagement/database-baseline-decision.md:15` contains the
documented local Supabase development connection URL for `127.0.0.1:54322`.
It is not a production database credential.

## Not found in the tracked working tree

- Supabase service-role key
- Supabase production database password
- OpenAI API key
- Meta/Facebook access token
- Expo/EAS access token
- GitHub token
- Apple private credentials
- Firebase/service-account private key
- JWT signing secret
- SMTP credential
- private certificate
- OAuth client secret
- webhook secret

## Method and limitations

A redacting local scanner checked 1,134 tracked files for major token formats,
private-key headers, JWTs, and credentialed database URLs. Scanner output
contained only fingerprints/hashes. Gitleaks and TruffleHog were unavailable;
the permanent repository scanner now covers high-confidence formats and
client/server-boundary names. Historical broad scanning beyond Google-key
patterns remains less exhaustive than a full authenticated TruffleHog scan.
