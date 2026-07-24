# Production referral deep-link implementation — 2026-07-24

Status: **IMPLEMENTATION COMPLETE — MANUAL STAGING ACCEPTANCE PENDING**

Implemented without touching production data or SQL:

- `https://buffago.com/r/<code>` landing surface in the dedicated `crawl/web`
  package, including code validation, app-open attempt, App Store/Google Play
  fallback, privacy-safe copy, and no attribution guarantee.
- Runtime-generated Apple association endpoints for both required paths.
- Runtime-generated Android `assetlinks.json` endpoint.
- Expo iOS associated domain `applinks:buffago.com`.
- Expo Android verified HTTPS intent filter for `/r`.
- Expo referral base/domain variables with referrals disabled.
- Native `/r/[code]` route preserving the code through the app's auth/onboarding
  entry surface.

Deferred manual staging acceptance items:

- No authenticated Vercel CLI/project or Vercel ownership evidence is present.
- Production Apple Team ID is not present.
- Production Android release-signing SHA-256 fingerprint is not present.
- Production App Store listing URL/ID is not present.
- DNS is controlled by NameBright and has not been changed; current baseline is
  recorded in `buffago-com-dns-baseline-20260724.md`.
- No physical iOS or Android test devices/session evidence is available.

Safety confirmation: referral rewards remain disabled,
`EXPO_PUBLIC_ENABLE_REFERRALS=false`, and no additional production referral SQL,
migration-ledger repair, or broad referral enablement was performed by this
implementation. See `referral-system-v1-handoff-20260724.md` for the accepted
release checklist and enablement sequence.
