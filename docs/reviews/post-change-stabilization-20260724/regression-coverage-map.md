# Regression coverage map

| Feature | Primary files | Risk | Existing/additional tests | Manual gap | Release |
|---|---|---|---|---|---|
| Auth/OAuth | `app/auth/*`, `lib/*OAuth*` | High | auth/social tests | provider/device return | Partial |
| Onboarding/rating | `components/OnboardingFlow.tsx`, ratings | High | source/typecheck; rating contracts | clean device, proximity | Partial |
| Streak/mission | `lib/engagement/*`, home card | High | timezone/idempotency/retention tests | live concurrency/offline | Partial |
| Notifications | `lib/notifications/*`, SQL | High | deep-link/proximity/SQL contracts | APNs/FCM/device | Blocked |
| Referrals | `/r/[code]`, `lib/referrals.js`, SQL | High | referral contracts + new route test | live lifecycle/abuse | Partial |
| Buffaverse | `lib/buffaverse/*`, components, SQL | High | 18+ fixture/projection/contracts | production entry/persona/device | Partial |
| Social/friends | friends, leaderboards | Medium | limited source/contracts | privacy/device flow | Partial |
| Account lifecycle | profile/auth/reset | High | contract evidence | real delete/reset | Blocked |
| Migrations | `supabase/migrations`, manifest | High | integrity + checksum tests | remote ledger | Blocked for deploy |
