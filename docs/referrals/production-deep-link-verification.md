# Production Referral Deep-Link Verification

Status: **IMPLEMENTATION COMPLETE — MANUAL STAGING ACCEPTANCE PENDING**

Verification date: 2026-07-24

## Approved scope

The referral profile-eligibility patch was verified with SHA-256
`41E408E42A273464F2A1D6297C4209E86DC2791FC43DB7B25C5D88CD210C1123`.
Production remains contained: rewards are disabled, the application referral
feature is disabled, and no production referral acceptance or rewarded flow was
run.

## Deferred staging decision

No production hostname is being enabled in this handoff. Staging must use a
controlled hostname before the verified configuration is repeated on
`buffago.com`.

DNS currently resolves both candidate names:

- `buffago.com`
- `refer.buffago.com`

Both candidates returned HTTPS `404 Not Found` at `/` during this verification;
neither currently serves `/r/<referral-code>`. DNS resolution alone is not
evidence of product ownership or referral-hosting readiness.

Required route: `https://<approved-referral-domain>/r/<referral-code>`.

## Repository readiness findings

- `app.config.js` contains the production identifiers `com.buffago.app` for
  both iOS and Android.
- Existing deep links are limited to the `buffago://auth/callback`,
  `buffago://auth/reset`, and notification routes.
- Referral HTTP routing, referral URL environment variables, association-file
  generation, `/r/*` native routing, and browser fallback are implemented.
- Physical-device referral testing and production deep-link deployment remain
  pending manual staging acceptance.

## Evidence not produced because of the blocker

Physical-device results, staging-host configuration, supplied signing
credentials, authentication preservation under real builds, deferred
attribution, dormant-code device behavior, and production-host deployment
remain unverified.

## Next approval gate

After the required credentials and owners are supplied, configure and verify
the route and platform association files in a controlled internal build. Keep
`EXPO_PUBLIC_ENABLE_REFERRALS=false` and
`referral_reward_config.default.is_enabled=false` until all acceptance checks
pass.
