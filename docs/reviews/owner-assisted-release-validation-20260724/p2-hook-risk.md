# RISK-001 deferred P2 hook-dependency risk

Status: **Preserved as deferred; no repair made.**

| Field | Finding |
|---|---|
| Files/lines | `crawl/app/(tabs)/home/index.jsx:1098,1601`; `crawl/app/(tabs)/routes/index.jsx:411,547`; `crawl/app/home/index.jsx:570,977`; `crawl/app/(tabs)/ratings/index.jsx:498`; `crawl/app/crawl/[id].jsx:566`; `crawl/components/OnboardingFlow.tsx:1091` |
| Hook | `useEffect`/`useCallback` location-, navigation-, rating-, crawl-, and onboarding-sensitive callbacks |
| Current arrays | Examples: `[]` at home line 1098 and onboarding line 1091; callback arrays omit `coords` at home 1601, routes 411/547, and root home 977; ratings callback omits `currentState`, `locationMode`, `stateCodeFilter`, `user?.id` |
| Referenced variables | `coords`, `loadPreviewRoute`, `currentState`, `locationMode`, `stateCodeFilter`, `user?.id`, and related callback inputs |
| Runtime consequence | Potential stale location/state closures, missed updates, or repeated/incorrect requests; exact impact depends on callback path. |
| Reproduction path | Change location/state/filter or resume a screen after the dependency changes, then invoke the affected callback and compare request parameters/visible results. No owner/device reproduction was available. |
| Lint | Detected: `npm run lint` reports 104 warnings, including the listed exhaustive-deps warnings; zero errors. |
| Regression classification | Could cause stale closures, missed updates, or repeated requests. A blanket autofix could introduce request loops, so it was not applied. |

Technical justification: the finding is real as a static dependency omission, but no runtime reproduction establishes a confirmed defect and the affected flows require device coverage. Preserve deferral, add these paths to the owner regression checklist, and repair one callback at a time only after device evidence identifies stale behavior; rerun focused tests, lint, and the full suite after each repair.
