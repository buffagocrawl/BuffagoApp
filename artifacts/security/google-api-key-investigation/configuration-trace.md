# Configuration Trace

## Verified flow

```text
crawl/.env.production:12 / crawl/.env.development:12
or EAS production environment (PUBLIC)
    ↓ Expo dotenv/EAS environment loading
process.env.EXPO_PUBLIC_GOOGLE_API_KEY
    ├─→ crawl/app.config.js:29-31 → iOS Maps SDK config
    ├─→ crawl/app.config.js:56-60 → Android Maps SDK config
    └─→ crawl/utils/walkRoute.js:2
             ↓ compile-time Expo public-variable substitution
         crawl/utils/walkRoute.js:36-40
             ↓ key query parameter in client request
         Google Directions API (Legacy)
             ↓ Metro/Expo web export
         output/buffaverse-web-correction/.../entry-5fd3....js:1267
             ↓ commit 7f1efc7 ("phase 2 buffaverse")
         PR #3 → public origin/main → GitHub secret scanning alert #1
```

## Evidence

- **VERIFIED:** local environment files and EAS production contain the same
  SHA-256 value as the alert bundle.
- **VERIFIED:** Expo replaces statically referenced `EXPO_PUBLIC_*` variables in
  client code at build time.
- **VERIFIED:** bundle context is the compiled `getWalkingPath` implementation.
- **VERIFIED:** the request target is
  `maps.googleapis.com/maps/api/directions/json`.
- **VERIFIED:** the generated file was introduced in `7f1efc7` and merged via PR
  #3.
- **INFERRED:** the exact export command was a local `expo export`; no export
  script or CI workflow records the command.

The native configuration path is legitimate for Maps SDK client keys, but the
same value is also used as a web-service key in JavaScript. That cross-platform
reuse prevents one correct application-restriction model.
