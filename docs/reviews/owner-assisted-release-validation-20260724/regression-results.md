# Regression results

Run date: 2026-07-24. No code repair was made during this validation pass, so no repair-triggered regression run was required.

| Check | Result |
|---|---|
| `npm run lint` | PASS with 0 errors and 104 warnings; hook warnings remain documented in `p2-hook-risk.md` |
| `npm run typecheck` | PASS |
| `npm run migration:integrity` | PASS; 18 root migrations |
| `npm run test:auth` | PASS; 14 tests |
| `npm run test:rls` | PASS; 45 tests; contract-level only |
| `npm run test:analytics` | PASS; 3 tests |
| `npm run test:growth` | PASS; 4 tests |
| Complete Node test suite | PASS; 120 tests |
| `npx expo-doctor` | PASS; 18/18 checks |
| Supported export/build | NOT RUN in this pass |
| Physical authentication/notification/referral/streak/Buffaverse/deletion suites | BLOCKED; owner/live evidence required |

These results do not close RISK-002 or RISK-003.
