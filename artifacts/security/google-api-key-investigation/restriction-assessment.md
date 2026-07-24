# Restriction Assessment

## Classification

**Expected client-visible but restrictions cannot be verified**, with a
**clearly unsafe architecture for Directions web-service use**.

- **VERIFIED:** the key is intentionally public to Expo (`EXPO_PUBLIC_*`) and EAS
  visibility is PUBLIC.
- **VERIFIED:** native Maps SDK configuration and client-side Directions API
  (Legacy) share one key.
- **VERIFIED:** Google permits client-visible Maps SDK keys only when they have
  appropriate application and API restrictions.
- **VERIFIED:** Google describes web-service keys as not expected to be publicly
  exposed and recommends a secure proxy; direct mobile calls require platform
  headers plus verified enforcement.
- **VERIFIED:** `walkRoute.js` sends no `X-Android-Package`,
  `X-Android-Cert`, or `X-Ios-Bundle-Identifier` headers.
- **UNKNOWN:** current application restrictions, API allowlist, quotas, budget
  alerts, usage, and billing abuse.

## Repository identifiers

| Restriction target | Evidence | Value |
|---|---|---|
| Android package | VERIFIED, `crawl/app.config.js:43-45` | `com.buffago.app` |
| Android signing SHA-1 | UNKNOWN | not found |
| Android release SHA-256 | UNKNOWN | placeholder only |
| iOS bundle ID | VERIFIED, `crawl/app.config.js:23-26` | `com.buffago.app` |
| Production web/referral domain | VERIFIED | `buffago.com` |
| Expo project | VERIFIED | `f08e790e-af47-4fc1-ba5e-707a0a15f7be` |
| localhost web allowances | UNKNOWN | not found |
| separate dev/staging/prod keys | VERIFIED absent for current local/EAS evidence | same key is reused |

## Likely APIs

- **VERIFIED:** Directions API (Legacy), from the actual request URL.
- **INFERRED:** Maps SDK for Android and Maps SDK for iOS, from Expo config and
  `react-native-maps`.
- **UNKNOWN:** Maps JavaScript API, Places, Geocoding, Static Maps, Firebase, or
  other API targets on this key. Places has a separate server-only variable
  placeholder.
- Google OAuth client IDs are identifiers, not this API key.

## Cloud inspection

**BLOCKED:** `gcloud` is not installed, and no authenticated Google Cloud
read-only channel is available.

Owner verification:

1. Google Cloud Console → APIs & Services → Credentials.
2. Locate the key by fingerprint/hash without pasting it into tickets.
3. Record Application restrictions and API restrictions.
4. Confirm whether Directions API (Legacy), Maps SDK for Android, and Maps SDK
   for iOS are enabled/allowed.
5. APIs & Services → Enabled APIs & services → inspect usage by credential.
6. APIs & Services → Quotas & System Limits → record per-day/per-minute caps.
7. Billing → Budgets & alerts → verify alert thresholds.
8. Reject any conclusion of safety until separate platform keys and enforcement
   are verified.

References:

- https://developers.google.com/maps/api-security-best-practices
- https://developers.google.com/maps/documentation/directions/get-api-key
- https://cloud.google.com/api-keys/docs/add-restrictions-api-keys
- https://docs.expo.dev/guides/environment-variables/
