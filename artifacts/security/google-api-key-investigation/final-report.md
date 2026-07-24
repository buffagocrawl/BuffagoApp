# Google API Key Investigation — Final Report

## 1. Executive summary

GitHub alert #1 is a true positive. A Google API key from ignored local
environment files and the EAS production environment was compiled into a public
Expo web bundle and committed to this public repository. The same key supported
native Maps configuration and a direct client-side Directions API (Legacy)
request. Generated exports are now removed from tracking and guarded by local/CI
scanning, but the production key architecture and Google Cloud restrictions
still require owner work.

## 2. Final disposition

**MITIGATED — OWNER ACTION REQUIRED**

The owner reports recycling the key and having a replacement, but disablement,
replacement restrictions, safe placement, rebuild, and redeployment are not yet
independently verified. Therefore this incident is not resolved.

## 3. What GitHub detected

- Secret type: Google API Key
- Alert: #1
- Path:
  `output/buffaverse-web-correction/_expo/static/js/web/entry-5fd3fb0b503b7b53f10d81384127ea83.js`
- Line: 1267
- First secret-bearing commit:
  `7f1efc7fe1642d9d3bf39fc2882fda820a71f5d4`
- Repository: public

## 4. Redacted key fingerprint

- `AIza...j-Ck`
- SHA-256:
  `71a615ca530f8b80e3251d10f99d970de66f1a97c35cf1b00f1e3bfa0d3d8b0f`

## 5. Source of the key

The same hash was present under `EXPO_PUBLIC_GOOGLE_API_KEY` in ignored
`crawl/.env.development`, ignored `crawl/.env.production`, and EAS production
project `f08e790e-af47-4fc1-ba5e-707a0a15f7be` with PUBLIC visibility.

## 6. Complete configuration path

Environment/EAS → Expo environment loader → static
`process.env.EXPO_PUBLIC_GOOGLE_API_KEY` references → `app.config.js` native Maps
configuration and `utils/walkRoute.js` Directions request → Metro/Expo export →
generated bundle → commit `7f1efc7` → PR #3 → public `main` → alert #1.

See `configuration-trace.md` for the diagram and exact line ranges.

## 7. Whether exposure was expected

Client visibility was intentional because of the `EXPO_PUBLIC_` name and use in
native client configuration. Exposure of a Directions web-service credential in
public JavaScript is not an adequately protected design.

## 8. Whether it is safe

Not proven safe. The repository cannot verify application/API restrictions, and
one key cannot simultaneously use Android, iOS, browser, and server-IP
application restrictions. Direct Directions calls do not supply documented
mobile restriction headers.

Classification: **Expected client-visible but restrictions cannot be verified**,
with a clearly unsafe Directions boundary.

## 9. Google API usage

- VERIFIED: Directions API (Legacy)
- INFERRED: Maps SDK for Android
- INFERRED: Maps SDK for iOS
- UNKNOWN on this key: Maps JavaScript, Places, Geocoding, Static Maps, Firebase,
  and other services

Google Places is designed separately as a server-only Edge Function variable.
Google OAuth client IDs are separate public identifiers.

## 10. Restriction evidence

- Android package: `com.buffago.app`
- iOS bundle ID: `com.buffago.app`
- production domain: `buffago.com`
- Android signing fingerprints: unknown
- Cloud application/API restrictions: blocked/unknown
- quotas, budgets, usage, and abuse: blocked/unknown
- separate platform/environment keys: not implemented

## 11. GitHub exposure scope

The value was current on `main`/`origin/main`, occurs in 15 locally reachable
commits, and entered through PR #3. No local tags contain it. Public GitHub
reported zero forks and no releases. Actions artifacts, clones, caches, private
forks, and authenticated alert metadata remain unknown.

## 12. Other secret findings

The tracked bundle also contained the expected Supabase anon JWT. It is
client-visible by design but depends on correct RLS. No tracked Supabase
service-role, OpenAI, Meta, Expo/EAS, GitHub, Apple, Firebase private-key, OAuth
client-secret, SMTP, webhook, or private-certificate credential was found. A
localhost Supabase database URL was a false positive.

## 13. Root cause

Three controls failed together:

1. A single public Expo variable was reused across incompatible native and
   web-service contexts.
2. Expo correctly inlined the public variable into JavaScript.
3. Custom Expo `output/` directories were not ignored and a generated export was
   committed as evidence/release material.

Metro cache reuse also preserved a prior transformed value until a clean-cache
export, demonstrating a secondary recurrence risk.

## 14. Repository changes made

- Removed 149 Expo export files from Git tracking while retaining ignored local
  copies.
- Added precise ignore rules for `crawl/output/` and
  `output/buffaverse-web-correction/`.
- Added a redacting scanner for high-confidence tokens, server-only public-config
  names, and tracked Expo exports.
- Added PR/`main` GitHub Actions scanning and npm scripts.
- Improved `.env.example` and `SECURITY.md` guidance.
- Added complete investigation, owner, validation, history, and panel artifacts.
- Did not rotate cloud credentials, modify Google Cloud, rewrite history,
  force-push, or change runtime Maps/auth behavior.

## 15. Tests and validation

- PASS: TypeScript
- PASS: ESLint (0 errors, 104 unrelated warnings)
- PASS: 62 auth, analytics, growth, and RLS tests
- PASS: Expo Doctor 18/18
- PASS: public Expo config with placeholders
- PASS: clean-cache web export; zero Google-key patterns and zero server-only
  variable names
- PASS: current-tree and staged scanners
- BLOCKED: live Maps/Directions/auth checks, restriction inspection, old-key
  denial

The first placeholder export found one cached key-shaped value; a cache-cleared
rebuild with client inlining disabled passed. That failed attempt is retained in
`validation.md`.

## 16. Remaining owner actions

Verify the old key is disabled, review usage/billing, split replacement keys by
platform/environment, proxy Directions, configure restrictions/quotas/budgets,
update EAS/server environments, rebuild/redeploy, validate customer journeys,
verify the old key fails, decide history cleanup, and only then close alert #1.

## 17. Rotation instructions

Do not paste any replacement key into chat or Git. For a temporary compatibility
placement, the existing variable is EAS production
`EXPO_PUBLIC_GOOGLE_API_KEY` plus ignored local `.env` files, but this is not the
durable architecture. Use:

- Android client key → Android-only app config/EAS variable, restricted to
  `com.buffago.app` plus signing SHA-1.
- iOS client key → iOS-only app config/EAS variable, restricted to
  `com.buffago.app`.
- Browser key, only if needed → exact `buffago.com` referrers and only required
  browser APIs.
- Directions server key → Supabase Edge Function/server secret, never
  `EXPO_PUBLIC_*`.

## 18. History cleanup recommendation

**History cleanup recommended** after verified revocation and coordination. It
reduces reuse/scanner noise but cannot restore trust. See
`history-cleanup-plan.md`; no rewrite was performed.

## 19. Panel scores

- Average: **71.4/100**
- Lowest: **68/100**, Google Maps platform specialist
- Highest: **74/100**, Buffago CTO perspective
- Consensus: **MITIGATED — OWNER ACTION REQUIRED**

## 20. Risk before remediation

**HIGH:** public active key, uncertain restrictions, shared platform/web-service
use, current public blob, no generated-output guard.

## 21. Risk after repository remediation

**MEDIUM-HIGH until owner completion:** current-tree recurrence controls are
stronger, but deployed replacement architecture, Console restrictions,
revocation, billing review, runtime behavior, and history remain open.

## 22. Exact files and commits changed

- `192f9cc` — `docs(security): investigate exposed Google API key`
  - 13 files under `artifacts/security/google-api-key-investigation/`
- `ca3dd12` — `chore(security): prevent generated secret exposure`
  - `.gitignore`, `crawl/.env.example`, `crawl/SECURITY.md`,
    `crawl/package.json`, and 149 removed generated export files
- `73e6dc5` — `ci(security): add secret scanning safeguards`
  - `.github/workflows/secret-scan.yml`
  - `scripts/security/scan-secrets.mjs`

This final report is added by the final documentation commit.

## 23. Recommended next step

Before placing the replacement, identify whether it was created as an Android,
iOS, browser, or server key and verify its restrictions. Do not reuse one
replacement across all four contexts. Then implement the platform split and
Directions proxy, update EAS/server environments, and rebuild with a cleared
Metro cache.
