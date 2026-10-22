# Redirect and persistence trace

2026-10-22. Native Android observations below are from fresh UI dumps/screenshots, action timestamps and private SQLite copies summarized without IDs. This is not a successful authenticated navigation trace. Auth-dependent milestones are explicitly absent.

| UTC | Native action / observed state | Persistence / navigation evidence |
|---|---|---|
| 12:23:52 | Fresh-data V2 Welcome | `android-E2E-01-welcome.png`; no auth/location prompt. |
| 12:23:54–12:24:02 | Explore -> guest Home | `android-E2E-02-guest-home.png`; actual Home/Search/Pick Area/nav. |
| 12:24:26 / 12:24:53 / 12:25:09 | Three force-stop/launch cycles | Three distinct PIDs and fresh Home XML; 11753/11653/11353ms. No Welcome/result or app ANR observed. |
| After 12:25:09 | Second fresh-data campaign | Original and Explore data privately backed up; no personal device reset. |
| 12:26 | Real catalog selection -> shared four steps -> local result | Result score 8, restaurant label preserved. Actual SQLite scores 8/7/1/9. No submitted server rating. |
| 12:26–12:27:02 | Guest photo CTA -> signup screen | `native-state-before-auth.json`: done_v3=1, legacy complete=true, hasSeenIntro=true; same destination comparison=true, intent pending/unbound, TTL=30min, preview status local_preview. No account ID/session. |
| 12:27 | Switch to signin -> hardware Back | `android-E2E-05-signin-screen.png`, `android-E2E-10-back-home.png`; recoverable Home underneath auth. |
| See actions.jsonl launch timestamp | Force-close and launch after Back | `android-E2E-10-cold-restart-after-auth-back.png`: guest Home, no onboarding replay. Not post-signin evidence. |
| 12:27–12:28 | Explicit login route reopened; Explore selected | Home; later SQLite snapshot of restored campaign data confirms preview retained, completion=1, pending intent absent (`native-state-after-explore.json`). |
| 12:28 | Deliberate adb deep-link to `/onboarding` | Restores local preview/result; this manually requested route is not an automatic onboarding reset. Normal cold start still Home. |
| 12:28–12:29 | Short viewport, font scale 1.3 | Display recreation caused debug linking warning; cold restart cleared it. Native result scroll/CTAs inspected; truncation found. |
| 12:30–12:31 | Separate process flags false/false | Legacy location prompt, then legacy Welcome after permission denial; no V2 invitation. |
| 12:31:57 | Separate V2=true/invite=false | Deliberate preview restore shows neutral signup benefit; no upload offer. Completion remains set, preview retained, no intent. |
| 12:32–12:33 | Client copy fix, V2=true/invite=true | Short viewport shows complete Create Account & Add Photo; explicit accessible Wing Shot label. Tap opens auth, Back recoverable. No successful auth. |
| 12:33:55 | Original QA archive restored; emulator force-stopped | `restoration.json`; original completed/preview state restored, no intent; emulator stopped afterward. |

## Implementation audit and isolated regression assertions

- `finishV2` writes arrival, awaits `markOnboardingSeen` (done_v3 plus both compatibility keys), then replaces Home and opens auth. V2 photo selection saves intent before this sequence. No V2 seed deletion or publication. The shared Home gate reads persisted keys on mount; root layout does not globally overlay onboarding.
- `OnboardingFlow.tsx` retains legacy completion/seed paths; `app/onboarding.jsx` selects V2 exclusively when flagged. Both login and callback reject top-level and wrapped V2/local-only seed import. No automatic V2 cloud rating, coin or XP claim.
- Intent helper serializes claims; fixed internal uploader route only, UUID destination, bounded label and 30-minute expiry. `getUser` must verify current nonanonymous account; binds before routing, keeps durable routed state until acknowledgment. Stale/account-switched/expired contexts cannot impersonate a bound handoff. Signout/account switch cleanup does not delete completion keys.
- Password handler/listener share `acceptSession` navigation guard; duplicate signed-in regression verifies one uploader route rather than later Home. OAuth listener defers to active social flow; callback allowlists returns and rechecks account before final navigation. Saved actions/link flows retain precedence. These event-order assertions use mocked sessions, not OS/browser timing.
- Signup user without session leaves intent pending. Delayed confirmed auth may claim within original expiry; expiry does not extend with route visit. Confirmation beyond 30min needs a fresh photo action. No mailbox verification was executed.
- Submit revalidates bound handoff/current account and authoritative server flags before Composer. Composer validates destination via existing RLS transport, then acknowledges successful resolution or deliberate missing-ID fallback. Network error retains unacknowledged intent; no automatic image picker opens. Change restaurant uses existing picker/Flow. Real lookup/upload and account-switch timing remain unproven.
- Startup `app/index.jsx` redirects Home; no startup `claimWingShotIntent` was found. A durable interrupted routed intent is claimable upon a subsequent login mount within expiry, not proven to automatically reopen from cold-start Home. After successful destination acknowledgment it cannot replay (helper test only).
- Hardware Android Back and explicit Explore were observed. iOS swipe-back and real provider-browser Back were not executed.

## Required milestones with no native evidence

| Milestone | Outcome |
|---|---|
| Real signup/password/OAuth verified session | BLOCKED |
| Intent claimed/bound to real isolated account | BLOCKED |
| Auth callback produces exactly one preselected native uploader | BLOCKED |
| Destination acknowledgment after real server flags/RLS | BLOCKED |
| Signed-in background/foreground/cold restart | BLOCKED |
| Signout -> guest -> different/same-account signin -> restart | BLOCKED |
| Real standalone submission and accepted-for-review receipt | BLOCKED |

There is therefore no credible affirmative answer yet to “does signing in reset onboarding?” for any real provider. Only the executed guest/back/restart path shows no reset; component/helper tests support the implementation without closing the release gate.
