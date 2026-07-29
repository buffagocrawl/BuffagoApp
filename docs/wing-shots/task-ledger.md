# Wing Shots orchestration ledger

Status values: `DONE`, `IN_PROGRESS`, `READY`, `BLOCKED`, `PLANNED`.
Review gates: G1 architecture/schema; G2 rating/onboarding UX; G3 storage/security; G4 moderation; G5 scheduling; G6 social publishing; G7 progression; G8 profile/history; G9 notifications; G10 integrated experience.

| ID | Owner | Dependencies | Expected files | Status | Commit | Tests | Review outcome | Unresolved risks |
|---|---|---|---|---|---|---|---|---|
| WS-01 | Product architect | — | `docs/wing-shots/*` | DONE | `efc37a5`, `0886c5c` | contract/threat audit | Serrano brief approved; integrated scoring pending | Contract drift remains a release audit item |
| WS-02 | Existing-code investigator | — | discovery artifact only | DONE | — | read-only evidence | Discovery complete | Duplicate route families |
| WS-03 | Database/schema architect | 01-02 | new `crawl/supabase/migrations/*wing_shots_core.sql` | DONE | `1501dd8` | isolated SQL apply + state contracts | G1 implementation slice accepted | Production schema preflight still required |
| WS-04 | Rating provenance architect | 03 | rating-verification migration/RPC | DONE | `1501dd8` | 9 source tests + authenticated runtime | Fail-closed eligibility verified | Mobile crawl/Home must adopt canonical RPC |
| WS-05 | Supabase RLS/security specialist | 03-04 | RLS/RPC migration | DONE | `1501dd8` | 9 contracts + real owner/other-user RLS runtime | Non-admin and cross-owner denial verified | Production policy validation pending |
| WS-06 | Storage architect | 03,05 | storage migration/policies | IN_PROGRESS | `1501dd8` | private bucket + exact-path runtime | Original upload boundary accepted | Signed-URL Edge adapter and cleanup worker remain |
| WS-07 | Feature-flag engineer | 03 | flags migration/config/docs | DONE | `1501dd8` | 3/3 source tests | Default-off independent controls accepted | Activation runbook pending |
| WS-08 | Rating-flow mobile engineer | 04,07 | crawl/Home submit seams | PLANNED | — | eligibility/runtime | G2 pending | Preserve rating success |
| WS-09 | Media-upload mobile engineer | 06-08 | `crawl/components/wingShots/upload/**`, library | PLANNED | — | permission/retry | G2 pending | Native dependency |
| WS-10 | Consent/legal UX engineer | 09 | consent/attribution components | PLANNED | — | consent/a11y | G2 pending | Legal approval |
| WS-11 | Onboarding UX engineer | 07 | `crawl/components/OnboardingFlow.tsx` | PLANNED | — | no-permission/layout | G2 pending | Small-screen reachability |
| WS-12 | Profile/history engineer | 03,09 | Wing Shot profile/history routes | PLANNED | — | owner/privacy | G8 pending | Other-user profile mode |
| WS-13 | Home/social-promotion engineer | 07 | compact Home social card | PLANNED | — | clipping/deep links | G2/G10 pending | Scroll growth |
| WS-14 | Creator leaderboard engineer | 15 | leaderboard RPC/UI | PLANNED | — | weekly/all/privacy | G7 pending | Query efficiency |
| WS-15 | Badge and XP engineer | 03-04 | creator rewards/badges migration | DONE | `1501dd8` | 8 contracts + live +35/+100/reversal proof | Generic XP forgery closed; G7 UI review pending | Social-community badges remain WS-16 |
| WS-16 | Social verification engineer | 15 | claims migration/social library | PLANNED | — | replay/wording | G6/G7 pending | No follower API |
| WS-17 | Notifications engineer | 03,15 | notifications migration/deep links | PLANNED | — | dedupe/preferences | G9 pending | Dispatcher concurrency |
| WS-18 | Admin moderation UI engineer | 05 | admin Wing Shot routes/components | PLANNED | — | admin/non-admin | G4 pending | Sensitive preview |
| WS-19 | Media-processing worker engineer | 03,06 | `Agents/Jalapeno/wing_media_processing/**` | IN_PROGRESS | pending | 14 pass, bounded retry/DLQ | Code review accepted | Durable job/storage adapter remains |
| WS-20 | FFmpeg/video engineer | 19 | video processor | IN_PROGRESS | pending | command contract passes; real ffmpeg test pending | Safe argv/audio-strip design accepted | Host binaries absent; container proof queued |
| WS-21 | Image-processing engineer | 19 | image processor | DONE | pending | content sniff/EXIF/crops/pHash pass | G3/G4 implementation slice accepted | Visual crop QA remains WS-26 |
| WS-22 | AI moderation integration engineer | 19-21 | moderation provider/schema | PLANNED | — | contract/thresholds | G4 pending | Provider credential |
| WS-23 | Wing verification engineer | 22 | verification scorer | PLANNED | — | confidence/override | G4 pending | False positives |
| WS-24 | Duplicate/spam engineer | 19-23 | fingerprints/abuse/rate migration | PLANNED | — | pHash/video/rate | G4 pending | Similar-content tuning |
| WS-25 | Jalapeño orchestration engineer | 03,15,19-24 | Wing Shot orchestration | PLANNED | — | skip/rank/claim | G5 pending | Fairness/starvation |
| WS-26 | Branded-content engineer | 20-21,25 | generation pipeline | PLANNED | — | output/alt-text | G5/G6 pending | Visual QA |
| WS-27 | Instagram publishing engineer | 25-26 | Instagram adapter | PLANNED | — | token/429/idempotency | G6 pending | Meta permissions |
| WS-28 | Facebook publishing engineer | 25-26 | Facebook adapter | PLANNED | — | partial recovery | G6 pending | New adapter |
| WS-29 | Scheduling/idempotency engineer | 25,27-28 | nightly SQL/workflow | PLANNED | — | concurrency/DST | G5 pending | Stale leases |
| WS-30 | Legacy workflow retirement engineer | 25,29 | old Jalapeño routing/workflow/config | PLANNED | — | unreachable/reuse proof | G5/G6 pending | Historical compatibility |
| WS-31 | Analytics engineer | 08-18 | analytics schema/calls | PLANNED | — | allowlist/privacy | G10 pending | Existing open event names |
| WS-32 | Accessibility reviewer | 09-13,18 | review evidence only | PLANNED | — | 200%/SR/motion | G2/G10 pending | iOS adapter absent |
| WS-33 | Privacy/security reviewer | 03-30 | threat model/evidence | PLANNED | — | threat controls | G3/G10 pending | Retention/legal |
| WS-34 | Account-deletion engineer | 03,06,15 | delete-account function/migration | IN_PROGRESS | `1501dd8` | live withdrawal/reversal/pseudonymization proof | Database phase accepted | Existing app deletion caller must become assets-first/Auth-last |
| WS-35 | Test-data/fixtures engineer | 03,19 | safe synthetic fixtures | PLANNED | — | fixture safety | All gates | No private media |
| WS-36 | Unit/integration test engineer | 03-31,35 | new Wing Shot tests | PLANNED | — | full automated matrix | All gates | Live Supabase access |
| WS-37 | Cayenne mobile runtime engineer | 08-18,36 | selectors/flows/fixtures | IN_PROGRESS | — | 38 journeys | G2-G10 pending | Android only today |
| WS-38 | Serrano UX reviewer | 08-18 | Serrano artifacts | IN_PROGRESS | — | checkpoint rubric | BLOCK 67/100 discovery | Critical UX contracts |
| WS-39 | Serrano architecture reviewer | 03-30 | Serrano artifacts | IN_PROGRESS | — | checkpoint rubric | Discovery running | Run approval gate |
| WS-40 | Serrano retention/growth reviewer | 13-16,25 | review artifacts | IN_PROGRESS | — | checkpoint rubric | Proposal strong | Truthful daily wording |
| WS-41 | Release-evidence auditor | all | evidence/final report | PLANNED | — | evidence completeness | G10 pending | Provider validation |
| WS-42 | Lead integrator | all | shared contracts/package/conflicts | IN_PROGRESS | — | full suite | Not release-ready | Critical/high backlog |

## Critical and high findings

| Finding | Severity | Owner | Status | Required closure evidence |
|---|---|---|---|---|
| Durable in-person provenance absent | Critical | WS-04 | CLOSED `1501dd8` | receipt predicate, 9 contracts, authenticated runtime |
| Authenticated generic XP forgery | Critical | WS-15 | CLOSED `1501dd8` | grants revoked; compatibility RPC allowlisted and runtime-tested |
| Reusable admin role model absent | Critical | WS-05 | CLOSED `1501dd8` | `app_user_roles`, service-only assignments, non-admin denial |
| Existing Jalapeño buckets public | High | WS-06/30 | OPEN | private bucket/RLS and no reuse |
| Auth-first deletion omits media | High | WS-34 | PARTIAL | DB manifest/pseudonymization/reversal verified; app caller repair pending |
| Legacy production scheduler still publishes fabricated/reused content | Critical | WS-29/30 | OPEN | workflow/routing proof |
| Legacy video may retain audio/fallback to original | Critical | WS-20/30 | OPEN | ffprobe proof and fail-closed tests |
| Notification/job claiming is not publication-safe | High | WS-17/29 | OPEN | atomic claim concurrency test |
| Guest ownership contract unresolved | High | WS-08/10 | CLOSED `1501dd8` | guest preview remains local; eligibility requires authenticated owner receipt |
| Follow verification wording could mislead | High | WS-16 | OPEN | visit/self-attested UX and replay test |
| Upload/consent flow not accessible at 200% text/small screens | High | WS-09/10/32 | OPEN | Cayenne/manual evidence |
| Analytics may accept private media data | High | WS-31 | OPEN | enforced allowlist tests |

## Commit policy

Each implementation wave receives a logical commit. The ledger is updated with commit SHA, exact tests, review result, and remaining risk immediately after integration. No merge to `main` is authorized.
