# Occurrence Inventory

## Confirmed key

- Fingerprint: `AIza...j-Ck`
- SHA-256: `71a615ca530f8b80e3251d10f99d970de66f1a97c35cf1b00f1e3bfa0d3d8b0f`
- Unique matching Google API key values found: **1**

## Current locations

| Location | Git state | Authored/generated | Present on `main`/remote | Use |
|---|---|---|---|---|
| `output/buffaverse-web-correction/_expo/static/js/web/entry-5fd3fb0b503b7b53f10d81384127ea83.js:1267` | tracked before remediation | generated | yes/yes | Directions API (Legacy) request |
| `crawl/.env.development:12` | ignored/untracked | authored local config | no/no | local Expo input |
| `crawl/.env.production:12` | ignored/untracked | authored local config | no/no | production Expo input |
| EAS project `f08e790e-af47-4fc1-ba5e-707a0a15f7be`, production | external config | build config | not a Git blob | EAS production input, PUBLIC visibility |

All four were correlated by SHA-256. The complete value is intentionally absent.

## Source references without a stored value

- `crawl/utils/walkRoute.js:2` reads `process.env.EXPO_PUBLIC_GOOGLE_API_KEY`.
- `crawl/utils/walkRoute.js:36-40` places it in a Directions API (Legacy) URL.
- `crawl/app.config.js:29-31` uses it for iOS Maps SDK configuration.
- `crawl/app.config.js:56-60` uses it for Android Maps SDK configuration.
- `crawl/.env.example:3-5` contains an empty placeholder and warning.

## History

- First secret-bearing blob: `7f1efc7fe1642d9d3bf39fc2882fda820a71f5d4`
  (`phase 2 buffaverse`, 2026-07-24).
- First source reference in `walkRoute.js`: `eee3e2b3f677614f56c429c55a6b8f76aa9efc29`
  (`Initial Load`, 2026-04-30); the source stored only the variable name.
- The generated value-bearing file is reachable in 15 locally available commits,
  including current `main` and `origin/main`.
- It entered `main` through PR #3, then remained in PR #4 and PR #5 ancestry.
- No tags contain the introduction commit.
- Public GitHub showed zero forks and no releases at investigation time.

## Remediation state

The generated directories were removed from the Git index but retained locally
as ignored build output. Historical blobs remain until an owner-approved history
rewrite. Rotation/revocation remains mandatory.
