# User-flow map

| Journey | Route / systems | Repository evidence | Status |
|---|---|---|---|
| Signed-out startup/auth | `app/index.jsx`, `app/auth/*`, root layout | Expo export; auth unit tests | Partial; real OAuth/manual return pending |
| Onboarding | `app/onboarding.jsx`, `components/OnboardingFlow.tsx` | typecheck; onboarding-related source inspection | Partial; full clean-device journey pending |
| Home/returning user | `(tabs)/home`, retention dashboard | engagement/home tests | Partial; live data and visual hierarchy pending |
| Wingdex/discovery | `(tabs)/ratings`, routes, location provider | proximity and platform-boundary tests | Partial; permission/device matrix pending |
| Rating/rewards | ratings, crawl, Supabase RPCs | contract and engagement tests | Partial; live duplicate-reward test pending |
| Crawls | `app/crawl/[id].jsx`, routes | crawl progress unit coverage | Partial; resume on device pending |
| Missions/streaks | engagement services and home card | 20+ unit/contract tests | Partial; boundary/concurrency/live RPC pending |
| Passport/profile/social | profile, leaderboards, friends | source/test inventory | Not fully exercised; manual matrix pending |
| Referrals | `/r/[code]`, attribution bridge, referral RPCs | new route test; referral contracts | Code path fixed; live lifecycle pending |
| Notifications | push registration, deep links, SQL boundary | deep-link and notification contracts | No real-device evidence |
| Buffaverse | showcase/boss-battle components and migrations | 18+ Buffaverse tests; Expo bundle | Partial; production entry/comprehension/device flow pending |
| Serrano board | `Agents/Serrano`, run artifacts | discovery attempted; timeout | Blocked by orchestration timeout |
