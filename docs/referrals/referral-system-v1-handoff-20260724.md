# Referral System v1 Handoff — 2026-07-24

## Status

**IMPLEMENTATION COMPLETE — MANUAL STAGING ACCEPTANCE PENDING**

Referral System v1 is accepted as implementation-complete. Production deep-link
deployment and physical iOS/Android verification remain manual staging gates.
Broad production enablement is not approved.

## Completed implementation

- Referral application code and referral database implementation.
- Production profile-eligibility protection, verified read-only after deployment.
- Web referral package with `/r/<referral-code>` handling and browser fallback.
- Native `/r/[code]` routing that preserves attribution through auth/onboarding.
- Apple association and Android asset-links generation/configuration paths.
- Automated and disposable verification wherever infrastructure was available.

Keep disabled:

- `EXPO_PUBLIC_ENABLE_REFERRALS=false` or unset.
- `referral_reward_config.default.is_enabled=false`.

## Manual staging acceptance checklist

1. Deploy crawl/web to a controlled staging hostname.
2. Supply the Apple Team ID and iOS bundle identifier.
3. Supply the Android production-signing SHA-256 fingerprint and package name.
4. Configure staging Apple and Android association files.
5. Create internal iOS and Android builds.
6. Test referral links on physical devices.
7. Confirm attribution survives authentication and onboarding.
8. Run one controlled end-to-end referral.
9. Verify exactly-once 250 XP rewards, badges, notifications, and analytics.
10. Repeat the verified configuration on `buffago.com`.
11. Enable production rewards and the application feature only after manual acceptance passes.

## Required credentials and ownership

- Hosting/Vercel project access and staging-hostname ownership: web/platform owner.
- Apple Team ID and final iOS bundle identifier: Apple Developer/account owner.
- Android package name and production-release SHA-256: Android release owner.
- App Store URL/ID and Play Store URL: mobile release/marketing owner.
- DNS and `buffago.com` association-file ownership: domain/DNS owner.
- Staging acceptance evidence and sign-off: mobile QA plus product owner.

Known repository identifiers are `com.buffago.app` for iOS and Android, and
`buffago` for the Expo scheme; confirm them against release credentials before
staging configuration.

## Exact enablement sequence

1. Complete all eleven manual acceptance checks and record evidence/sign-off.
2. Deploy the accepted staging configuration to `buffago.com` and repeat the
   link, attribution, and association checks.
3. Confirm rollback ownership, monitoring, and the exactly-once reward check.
4. Enable `referral_reward_config.default.is_enabled` in the approved production
   change window.
5. Set `EXPO_PUBLIC_ENABLE_REFERRALS=true` in the approved application release.
6. Start with the explicitly approved controlled cohort; expand only after the
   reward, badge, notification, and analytics checks remain clean.

## Rapid disable

Set `EXPO_PUBLIC_ENABLE_REFERRALS=false` (or remove it), disable
`referral_reward_config.default.is_enabled`, redeploy/restart the affected web
and application surfaces, and verify that referral entry and reward issuance
are unavailable. Preserve audit data; do not delete referral rows or edit the
migration ledger.

## Known migration-ledger technical debt

Production contains manually applied referral SQL that is not represented in the
Supabase migration ledger. This is recorded debt. Do not deploy additional
referral SQL or repair the ledger as part of this handoff; any future
reconciliation requires a separately approved, exact ledger-repair procedure.
