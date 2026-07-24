# Issue register

| ID | Severity | Issue | Evidence | Fix / validation | Status |
|---|---|---|---|---|---|
| BUG-001 | P1 | Referral deep-link route wrote raw code text while deferred claim expects JSON attribution | `app/r/[code].jsx` called `AsyncStorage.setItem(PENDING_REFERRAL_KEY, code)`; `getPendingReferral()` JSON parses the value | Route calls `recognizeReferral()` with source/placement; `tests/referrals/referral-route.test.js`; 116 tests and web export pass | Fixed |
| BUG-002 | P2 | Migration integrity gate failed because manifest omitted 9 root migrations and had 5 stale hashes | `npm run migration:integrity` initially reported checksum mismatches and unmanifested migrations | Manifest updated from SHA-256 of all 18 canonical files; migration integrity and migration contract tests pass | Fixed |
| BUG-003 | P3 | Referral route displayed mojibake and promised saved referral state while referrals were disabled | Source inspection of `/r/[code]`; feature flag was unused in route | Copy is flag-aware and regression-tested | Fixed |
| RISK-001 | P2 | Location-sensitive callbacks have missing React hook dependencies | `npm run lint` reports missing `coords` and other dependencies in home, routes, ratings, crawl | No change made in this cycle because broad hook edits need device regression coverage | Deferred |
| RISK-002 | P1 | Required real-device notification and OAuth flows have no current evidence | No Android/iOS device session or real provider credentials available | Owner test list and notification matrix explicitly mark these pending | Open release blocker |
| RISK-003 | P1 | Live Supabase schema/RLS/concurrency/account-deletion behavior not exercised | Repository contracts pass; no safe live database session was used | No migration or destructive DB action performed | Open release blocker |
| RISK-004 | P1 | Serrano current discovery timed out after 120 seconds | `run_serrano.py discover` exited 124 without a run result | Recorded as process limitation; no approval/build/release was attempted | Open release blocker |
