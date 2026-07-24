# Owner-assisted release validation dashboard

Session: `owner-assisted-release-validation-20260724` · Owner: Branden · Created 2026-07-24

This is a resumable checklist. `BLOCKED` means the required owner/device/live environment was unavailable; it is not a pass or a confirmed defect. Progress is persisted in `validation-state.json`.

Run from `crawl/`: `npm run owner-validation -- list`, `npm run owner-validation -- show AUTH-001`, or `npm run owner-validation -- record AUTH-001 PASS "sanitized evidence path"`.

For every row, record: device/environment, preconditions, exact owner actions, expected result, status (`PASS`, `FAIL`, or `BLOCKED`), notes, sanitized evidence path, related logs, database validation, and follow-up. Never record tokens, credentials, exact personal data, or raw provider errors.

| ID | Device/environment | Preconditions and owner actions | Expected result | Evidence / logs / DB validation | Follow-up |
|---|---|---|---|---|---|
| AUTH-001–005 | Android/iOS release device | Signed out; run Google success, cancel, background/resume, expiry; test Facebook only if enabled | Usable return route, correct account/state, retry path, no false auth; provider display matches flag | `authentication-results.md`; sanitized client log and route/state | Re-test any failed route after repair |
| NOTIF-001–008 | Physical Android; iOS if release target | Grant/deny/restore; foreground/background/terminated delivery; sign out/delete; test stale reminder suppression | Correct permission state, delivery/deep-link, no nagging/duplicate reward/stale protected data | `notification-results.md`; notification type/app state/delivery/deep-link | Keep iOS explicitly blocked if no iOS device |
| ONBOARD-001 | Physical release device | Clean install; authenticate; complete state, restaurant, rating, reward, home, crawl, streak, Buffaverse | Completes without trap; record taps/time/errors/confusion | `mobile-onboarding-results.md` | Repair only completion-blocking friction |
| STREAK-001 | Two sessions, same designated test user | Prepare same qualifying action; submit nearly together; refresh; inspect persisted state | One increment, one reward/ledger result, converged clients, no contradictory analytics | `streak-concurrency-results.md`; sanitized DB/RPC evidence | Classify client/RPC/constraint/RLS; smallest repair; repeat |
| REF-001 | Two dedicated test accounts | Referral route signed out → OAuth → onboarding → server-defined qualification → restart; test invalid/self/disabled/retry | Attribution and rewards are durable/idempotent; disabled flag remains safe | `referral-lifecycle-results.md`; sanitized records/events | Do not enable production feature for testing |
| RLS-001 | Safe live Supabase test project | A/B isolation and protected mutation probes; unauthenticated probes; duplicate reward probe | Unauthorized reads/writes rejected; privacy model and uniqueness hold | `rls-results.md`; approved safe request output | No policy weakening or production migration |
| DELETE-001 | Disposable live test account | Record sanitized IDs; delete through app; verify auth/data/push/referral/re-sign-in/partial failure | Policy-consistent deletion and signed-out state; no stale protected delivery | `account-deletion-results.md` | Escalate any misleading success or leftover protected data |
| BUFF-001 | Three participant sessions | Enter without explanation; ask seven comprehension questions; score 0–100 | Purpose, next action, reward, relation, navigation, return motivation are understood | `buffaverse-comprehension-results.md` | Treat repeated confusion across ≥2 participants as evidence |

Automated contract evidence is recorded in `regression-results.md`, but it cannot substitute for the owner/device/live tests above.
