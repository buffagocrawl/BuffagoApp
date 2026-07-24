# Iteration history

## Cycle 1 — discover, repair, validate

- Baseline: clean `main`, `b0d52b2`; 68 tests passing; migration integrity failing.
- Discovery: mapped 30 route files, 34 test files, 18 root migrations, and the high-risk referral/notification/engagement/Buffaverse modules.
- Repairs: referral route attribution; disabled-state copy; migration manifest; migration checksum expectation; two regression tests.
- Validation: 116 tests pass; typecheck pass; migration integrity pass; Expo web export pass; Doctor 18/18 pass; lint 0 errors/104 warnings.
- Decision: stop after one code repair cycle because real-device, live-Supabase, and current Serrano evidence are unavailable. Do not inflate score or claim release readiness.
