# Test report

## Commands

- `npm run typecheck` — PASS.
- `npm run lint` — PASS with 104 warnings, 0 errors.
- `node --test --experimental-default-type=module <all tests/*.test.js>` — PASS, 116/116.
- `npm run migration:integrity` — PASS, 18 root migrations, 0 legacy archives.
- `npx expo export --platform web` — PASS; 1,609 modules bundled. Expo reported an Android status-bar/splash color warning.
- `npx expo-doctor` — PASS, 18/18.

## Coverage observed

Automated coverage includes auth state/cancellation, notification deep links, proximity, daily engagement and timezone logic, reward idempotency contracts, referral lifecycle SQL contracts, Buffaverse projections, platform map boundaries, analytics privacy, and the new referral route contract.

## Manual matrix

| Area | Local source/build review | Device/live validation |
|---|---|---|
| Startup, web routing, disabled referral route | Pass via export and source contract | Android/iOS pending |
| Auth/OAuth | Contract tests pass | Real Google/Facebook/cancel/expiry pending |
| Onboarding/rating/crawl | Source and pure logic reviewed | Clean/returning user device flow pending |
| Streaks/missions/rewards | Unit/SQL contracts pass | Midnight, offline, concurrent live RPC pending |
| Notifications | Registration/deep-link/contracts reviewed | APNs/FCM/token/delivery/deep-link device tests pending |
| Buffaverse | Fixture/state tests and bundle pass | Production entry, two-device sync, comprehension study pending |
| Account deletion/reset | Contract evidence only | Real authenticated account test pending |

No production database changes or destructive actions were performed.
