# Google API Key Investigation Baseline

Collected: 2026-07-24 (America/New_York)

## Repository safety

- Repository: `buffagocrawl/BuffagoApp`
- Required branch: `security/google-api-key-investigation`
- Branch point: `a00b3bbf6c5657b3d3318e14cbdcf0a7d1da1966`
- Branch point summary: `Merge pull request #5 from buffagocrawl/feat/cayenne-runtime-qa`
- Initial local `main`: clean at `d61468ee696f862ac02e633d35b7f5daedaa9646`
- Fetch result: local `main` was 0 ahead / 4 behind `origin/main`; merge base was the local tip.
- Safety action: fast-forwarded with `git merge --ff-only origin/main`, then created the required branch.
- Divergence/conflicts: none.
- Working-tree changes before this artifact: none.
- Force push, history rewrite, credential rotation, and cloud-console mutation: not performed.

## Secret-safe search plan

1. Locate candidate files by prefix and variable name without printing matching lines.
2. Extract candidate values only in process memory.
3. Emit only `first4...last4`, SHA-256, path, line, and Git metadata.
4. Correlate current files and historical blobs by hash.
5. Sanitize scanner and GitHub output before it reaches terminal logs or artifacts.
6. Never pass the full key as a command-line argument, commit message, report value, or test fixture.

The confirmed alert fingerprint is `AIza...j-Ck`; SHA-256 is
`71a615ca530f8b80e3251d10f99d970de66f1a97c35cf1b00f1e3bfa0d3d8b0f`.

## Generated output

Git tracks generated Expo exports under both:

- `output/buffaverse-web-correction/`
- `crawl/output/buffaverse-phase2-{android,ios,web}-a29b083/`

The reported web bundle is tracked at
`output/buffaverse-web-correction/_expo/static/js/web/entry-5fd3fb0b503b7b53f10d81384127ea83.js`.
The root `.gitignore` does not ignore `output/`; `crawl/.gitignore` ignores
`dist/`, `web-build/`, and `.expo/`, but not `output/`.

## Environment configuration

Tracked templates:

- `crawl/.env.example`
- `crawl/.env.cayenne.example`
- `Agents/Jalapeno/.env.example`

Ignored local files present:

- `crawl/.env.development`
- `crawl/.env.production`
- `Agents/Jalapeno/.env`

Both local Crawl environment files contain the alert value under
`EXPO_PUBLIC_GOOGLE_API_KEY`; this conclusion was verified by SHA-256 comparison.
The files themselves are ignored and untracked. Other locally set confidential
values were observed only as names, lengths, and hashes and were not printed.

## Expo and EAS

- Expo SDK: approximately SDK 54 (`expo ~54.0.36`)
- App config: `crawl/app.config.js`
- EAS config: `crawl/eas.json`
- EAS project ID: `f08e790e-af47-4fc1-ba5e-707a0a15f7be`
- Production EAS environment name: `production`
- Android package: `com.buffago.app`
- iOS bundle identifier: `com.buffago.app`
- Universal/App Link domain: `buffago.com`
- The same `EXPO_PUBLIC_GOOGLE_API_KEY` feeds Android Maps config, iOS Maps
  config, and client JavaScript in `crawl/utils/walkRoute.js`.
- `walkRoute.js` calls the Google Directions web-service endpoint directly from
  client code.

## Build and deployment

- Main scripts include Expo start, Android/iOS native runs, lint, TypeScript,
  auth/analytics/growth/RLS tests, database checks, and Cayenne checks.
- No explicit Expo export script is defined in `crawl/package.json`.
- A small Vercel Node deployment exists under `crawl/web/`.
- The tracked export directory names include commit-like suffixes and appear to
  have been created as repository evidence/release artifacts.
- GitHub Actions and deployment workflow inventory remains pending.

## Existing security controls

- `crawl/SECURITY.md` documents public Expo variables and server-only secrets.
- `.env` patterns are ignored and placeholder templates are permitted.
- Private key/certificate extensions are ignored in `crawl/.gitignore`.
- No established repository secret scanner was found in the first-pass search.
- GitHub CLI is not installed, so authenticated GitHub alert/artifact inspection
  through `gh` is blocked; connected-app and public metadata checks remain
  pending.

## Google and related integrations

- Google Maps native configuration through Expo for Android and iOS.
- Google Directions web-service calls from `crawl/utils/walkRoute.js`.
- Google Maps URLs for opening external directions.
- Google OAuth client IDs exist in ignored local environment files; only their
  names, lengths, and hashes were observed.
- Supabase authentication and anon-client configuration are present.
- A server-side `GOOGLE_PLACES_API_KEY` placeholder exists for Supabase Edge
  Functions; no tracked value was observed in the initial baseline.
- No repository evidence has yet verified Google Cloud application restrictions,
  API restrictions, quota, or billing alerts.

## Initial commit evidence

- Generated alert bundle introduced by
  `7f1efc7fe1642d9d3bf39fc2882fda820a71f5d4`
  (`phase 2 buffaverse`, 2026-07-24).
- `crawl/utils/walkRoute.js` originated in
  `eee3e2b3f677614f56c429c55a6b8f76aa9efc29`
  (`Initial Load`, 2026-04-30).
- The generated-bundle commit is reachable from local and remote `main` and
  several feature/workstream branches.

## Baseline unknowns

- Google Cloud Console restrictions, enabled APIs, quotas, and usage.
- GitHub repository visibility through an authenticated API.
- Alert PR/ref metadata beyond the locally confirmed blob and commit.
- Release assets, Actions artifacts, forks, and pull-request exposure.
- Whether other historical secrets exist outside the current working tree.
