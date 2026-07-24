# Remaining backlog

## Release blockers

- Run Serrano discovery successfully, then complete its approval/status/history validation.
- Test push notifications on supported Android and iOS devices, including denied permissions, token refresh, duplicate suppression, and deep links.
- Run live Supabase staging tests for RLS, referral qualification, streak concurrency, reward idempotency, account deletion, and schema/ledger alignment.
- Complete clean-state and returning-user journeys on both mobile platforms.

## Near-term follow-ups

- Resolve the 104 lint warnings, prioritizing missing location and navigation hook dependencies.
- Exercise notification preference synchronization and time-zone/DST boundary behavior.
- Add route-level component tests for Buffaverse entry, Passport, profile, and account deletion confirmation.

## Future enhancements

- Improve Buffaverse first-entry explanation and connect it to a primary user journey after evidence shows the core rating loop is stable.
- Add a native smoke command for the supported build profiles.

## Intentionally rejected scope

- No new currency, broad redesign, production feature-flag enablement, invasive referral fingerprinting, or destructive database repair was added.
