# Referral System v1 Production Rollout

## Feature status — 2026-07-24

Result: **IMPLEMENTATION COMPLETE — MANUAL STAGING ACCEPTANCE PENDING**.

The product owner accepts referral-system-v1 as implementation complete. Deep-
link deployment and physical-device verification are deferred to manual staging
acceptance. This does not authorize reward enablement, broad Referral Hub
rollout, a rewarded production referral, additional SQL, ledger repair, auth
changes, or data deletion.

The run stopped at domain selection because no exact product-owner-approved
referral hostname or referral hosting route was available in the workspace.
`buffago.com` and `refer.buffago.com` resolve in DNS, but both returned HTTPS
404 responses and neither served `/r/<referral-code>`.

The implementation includes referral HTTP routing, Universal Links and Android
App Links configuration paths, browser fallback, referral environment
variables, and native `/r/[code]` routing. Existing BuffaGo identifiers are:

- iOS bundle identifier: `com.buffago.app`
- Android package: `com.buffago.app`
- Expo scheme: `buffago`

## Production safety state

- Referral rewards remain disabled.
- Application referral feature remains disabled.
- No production referral was qualified.
- No production database mutation occurred during this run.
- No referral acceptance RPC, rating, XP issuance, badge unlock,
  notification, push event, or analytics event was created.

## Migration-ledger warning

Production contains manually applied referral SQL that is not represented in
the Supabase migration ledger. Do not run future Supabase migration deployment
until the exact migration versions are safely marked applied through a
separately approved ledger-repair procedure. No ledger repair was performed in
this run.

## Remaining manual acceptance

Product ownership must supply the staging hostname, hosting/DNS owner, Apple
Team ID, iOS bundle identifier, Android package name, production signing
fingerprint, and store URLs. Then complete the checklist in
`docs/referrals/referral-system-v1-handoff-20260724.md`. A new explicit approval
is required before production rewards or broad enablement.
