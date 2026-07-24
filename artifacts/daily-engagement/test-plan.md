# Test Plan

Automated domain/contract coverage includes deterministic daily assignment, same-day repetition, missed-day restart, longest streak, server timestamp contract, timezone pinning contract, ledger/outbox uniqueness, protected RLS state, preference defaults, privacy/friendship/quiet-hour rechecks, offline RPC failure, deep-link types and fallback, low accuracy, 161 m proximity, hysteresis, and one-region selection.

Repository regression suites cover auth, analytics, privacy, engagement, social feed/reactions, XP-related contracts, Wing Passport, reduced motion, home decisions, sharing, and mascot behavior.

Release validation commands:

- all `tests/**/*.test.js` with Node test runner
- `npm run lint`
- `npm run typecheck`
- Expo export/build after typecheck
- Supabase migration application and RLS identity matrix in a disposable project
- Edge Function secret/auth/retry/permanent-error tests
- physical iOS/Android permission, token, cold/background/foreground open, app-killed, restart, geofence, approximate-location, and provider delivery test

Provider/device-only scenarios cannot be truthfully simulated as successful delivery in repository tests.
