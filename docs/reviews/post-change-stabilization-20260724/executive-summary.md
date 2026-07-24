# Buffago Post-Change Stabilization Review

## Executive summary

Initial condition: `main` at `b0d52b2` was clean and the Expo web bundle, typecheck, doctor, lint, and the existing 68 tests were available. The review found that the migration deployment manifest had drifted from the 18 canonical root migrations, and the referral `/r/:code` route stored an incompatible raw value that could not be consumed by the deferred attribution service.

Completed fixes:

- Referral deep links now use the centralized, server-validated recognizer and preserve attribution metadata through authentication.
- Disabled referrals no longer claim that an invitation was saved.
- Referral-route mojibake was removed.
- The migration manifest and checksum regression test now describe the canonical current files.
- Added a regression test for referral deep-link attribution and disabled-state copy.

Evidence: 116/116 JS tests pass, TypeScript passes, migration integrity passes, Expo web export passes, lint exits 0 with 104 existing warnings, and Expo Doctor reports 18/18 checks passed.

Release decision: **Blocked for release**. No confirmed P0 remains in the inspected code, but the required real-device push-notification tests, OAuth tests with real credentials, live Supabase/RLS/concurrency tests, account deletion verification, and complete manual first-time/returning-user journeys were not executable in this environment. The panel therefore cannot honestly meet the requested 95 average or issue a release recommendation.

## Major remaining risks

- Push/APNs/FCM delivery and deep-link behavior are code-tested but not real-device validated.
- Serrano discovery timed out at 120 seconds and did not produce a current run; the current board sequence therefore remains incomplete.
- Existing lint warnings include missing React hook dependencies in location- and navigation-sensitive screens. They are not release blockers by test evidence, but they are a follow-up risk.
- Remote migration ledger and live schema were not queried or changed.
