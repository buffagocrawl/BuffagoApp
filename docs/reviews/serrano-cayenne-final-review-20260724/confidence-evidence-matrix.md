# Confidence evidence matrix and migration report

## Migration rules

The historical panel scorecards remain unchanged. Every prior score is retained as `Legacy blended panel score` source material and is assigned only to the appropriate new domain: `Release readiness`, `Trust/privacy/credential safety`, and verified technical findings → Release; comprehension, navigation, interaction, accessibility, visual, brand, error, and feature-flow findings → App Experience; activation, retention/social potential, streaks, referrals, and return-value findings → User Retention. `Core functionality/reliability` is split: reproduced/runtime safety evidence goes to Release; task feedback goes to App Experience. No persona score is used for RLS, migration, or credential safety.

| Previous finding or score | New domain(s) | New treatment | Source |
|---|---|---|---|
| 66.7 final panel average / 53.2% coverage | Audit only | **Legacy blended score — not used for release decisions** | `panel-consolidated-scorecard.md` |
| Seven judge scorecards (all listed category and feature scores) | App Experience and/or Retention, per mapping above | Recalculated only where a named new category has a traceable source; otherwise Not Scorable | `judge-*.md` |
| CEO release readiness 40 | Release | Only traceable legacy release-domain numeric input; it does not represent all release categories | `judge-ceo.md` |
| RISK-002, RISK-003 | Release | Missing release evidence; gate blocker, not confirmed product defect | `issue-register.md`, auth/notification/streak reviews |
| SEC-001 | Release | Confirmed unresolved P1 / historical containment blocker | `issue-register.md`, `remaining-blockers.md` |
| TOOL-001, TOOL-002, RISK-001, UI-001 | Release or App Experience as applicable | Concerns/follow-up; no invented numeric deduction | `issue-register.md` |
| Buffaverse 52–62 | App Experience and Retention | Comprehension/progression concern; no release-safety conclusion | `panel-consolidated-scorecard.md` |

## Feature contribution matrix

| Feature | Release Confidence | App Experience Confidence | User Retention Confidence |
|---|---|---|---|
| Authentication | OAuth/platform validation, account switching | sign-in clarity and recovery | activation completion |
| Onboarding | build/journey completion | comprehension, hierarchy, first action | activation |
| Home | runtime/data safety | hierarchy, next action | daily return |
| Wingdex | data integrity | discovery | collection appeal |
| Rating | trusted reward/idempotency | rating simplicity | first payoff |
| Crawls | concurrency/data safety | crawl comprehension | repeatability |
| Wing Battle | reward/data safety | rules clarity | motivation |
| Missions | reward/idempotency | mission comprehension | motivation |
| Streaks | concurrency, duplicate suppression | streak comprehension | habit motivation |
| Notifications | delivery, deep links, privacy, token cleanup | permission copy, settings, recovery | re-engagement, fatigue, opens |
| Referrals | authorization/idempotency | referral comprehension | referral motivation |
| Passport | data persistence | collection comprehension | collection appeal |
| Buffaverse | persistence/integrity | understanding and navigation | progression appeal |
| Social | authorization/privacy | social comprehension | social motivation |
| Friends | authorization/privacy | friend-flow clarity | social return value |
| Profile | data integrity | settings clarity | progress visibility |
| Account deletion | deletion correctness | deletion clarity/recovery | trust to continue using app |
| Mascot system | asset/build health | usefulness and consistency | emotional return value |

Each cell identifies the applicable contribution; it is not proof that the category was exercised in this review. The source documents above remain the evidence links.

