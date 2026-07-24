# Cayenne E2E coverage

| Flow | Result | Meaning |
|---|---|---|
| Startup / clean onboarding smoke | PASS | Android emulator, Maestro, screenshot/hierarchy/log evidence |
| Signed-out screen | Not exercised | Startup state was onboarding |
| Authenticated navigation | BLOCKED | No safe QA credentials/preprovisioned session |
| Home/Wingdex/details/rating/streak/passport/Buffaverse/profile/settings | Not supported in this session | No authenticated state/feature flows |
| Referral-disabled state | Contract only | No Cayenne flow |
| Deletion confirmation | Contract only | No disposable live account |
| E2E-001 through E2E-006 | BLOCKED | QA accounts/live Supabase/provider/device support absent |

Existing YAML is meaningful only for startup-state assertions and primary navigation. It does not implement the requested state-changing E2E journeys.
