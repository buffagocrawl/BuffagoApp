# Master product inventory

Coverage labels: `A` automated contract/unit, `C` Cayenne runtime, `M` manual/live remaining.

| Area/routes | Entry/exit and primary action | Data/flags/auth | States and analytics | Coverage |
|---|---|---|---|---|
| Signed-out/auth (`/auth/*`) | Launch/deep link; provider or email sign-in; return/onboarding | Supabase auth, provider flags | loading/error/cancel/expired; auth events | A; M OAuth |
| Onboarding (`OnboardingFlow`) | first launch; next/back/skip/complete | local state, auth, location, restaurants | loading/permission/error/retry/reward | A+C clean start; M completion |
| Home (`/(tabs)/home`, `/home`) | tab/onboarding exit; select next action | profile, XP, missions, streak | loading/empty/error/stale | A; M authenticated |
| Wingdex/Map (`ratings`, routes) | tabs/home; discover restaurant | location, restaurant data, auth | permission/empty/offline/partial | A; M |
| Restaurant/rating | search/map/crawl; submit rating | proximity, cooldown, RPC, tags | locked/error/success/celebration | A; M live |
| Crawls/Wing Battle | home/tab; start/resume/complete | route/stop state, auth | locked/offline/interrupted/success | A; M |
| Missions/streaks | home/profile; qualifying action | server engagement/reward ledger | completed/broken/at-risk/loading | A; M concurrency |
| Passport | nav/profile; inspect progress | ratings/state progress | locked/empty/progress | A partial; M |
| Buffaverse | home/showcase; enter/progress | feature state, XP/events | locked/empty/error/partial | A; M comprehension |
| Social/leaderboards/friends | tabs/profile/QR | visibility/RLS/auth | opt-out/empty/error/stale | A contract; M/live RLS |
| Profile/settings | tab; edit preferences/provider/sign out | profile/auth/preferences | save failure/loading/success | A partial; M |
| Notifications | settings/system/deep link | Expo token, preferences, dispatcher | denied/granted/stale/duplicate | A contract; M physical |
| Referrals (`/r/[code]`) | URL/share/settings; recognize/qualify | default-off flag, referral RPC | invalid/disabled/pending/reward | A; M safe QA |
| Account reset/deletion | settings/profile; confirm destructive action | auth, cleanup/reconciliation | confirm/error/partial/signed-out | A contract; M disposable account |
| Serrano governance | CLI/run artifact | run state/approval hash | discovery/approval/build/security/release | inspected; approval pending |

The source contains routes and tests beyond what the active Cayenne selector registry covers. Analytics are implemented in multiple services but were not observed live, so route-level analytics coverage remains unverified.
