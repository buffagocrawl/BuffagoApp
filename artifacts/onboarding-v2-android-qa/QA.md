# Android onboarding V2 QA — 2026-10-21

Overall: **BLOCKED FOR RELEASE**. Actual Android guest-path checks passed; real auth/upload/provider and iOS gates remain unverified. No product mockups or simulated callbacks are offered as device evidence.

## Device, build, and startup gate

- Branch/start: feature/onboarding-v2-simplified-first-value, 4f4d482fd1854c74c2fc01586e4ac7d2dd7f7c02; initial tree clean. Ending commit is the local commit carrying this report (see git log); no main checkout/reset.
- Windows host; no physical device connected. Successful target: Medium_Phone_API_36.1 / emulator-5554, Android 36.1 x86_64, 4 CPUs, 2048MB, host GPU. Existing debug APK version 1.0.5/code 6, runtime 1.0.4; current Expo config 1.0.7. APK hash and complete version inventory: android-startup.log. No new APK or production build generated.
- Process-local QA flags: EXPO_PUBLIC_ONBOARDING_V2=true and EXPO_PUBLIC_ONBOARDING_WING_SHOT_INVITE=true; EXPO_NO_DOTENV=1. App points only to host-local QA bridge; no real account token in app configuration. Flags remain false in committed default configuration.
- Root cause evidence identifies tooling before JS execution: Metro status responded but manifest timed out; inspector sampled Windows FallbackWatcher directory registration; .expo held 341604 generated files. Generated cache pruning alone did not establish immediate readiness. Offline/2-worker local Metro plus manifest-and-bundle preflight enabled reproducible launches. Separate emulator System UI/memory-pressure failures occurred before app execution; a fresh AVD also suffered Android package service failures. No native/application startup timeout raised or error handling disabled. Metro/root-layout baseline hashes match origin/main; no runtime main comparison performed.
- Three consecutive process-cold force-stop/relaunches after complete Metro readiness: **PASS**, 24967ms, 25186ms, 23402ms to freshly inspected Home. See launches.jsonl and screenshots/launch-*-home.png. Prior XML was removed before each final poll; stale snapshots were not accepted. LastANR reported none for the recovered boot; dropped-frame/debug warnings remain. These are slow debug/emulator numbers, not release performance certification or three emulator cold boots.
- Warm foreground/deep-link return reached V2. Normal 390x844dp and short 360x640dp exercised; font_scale=1.3 requested on short display. Configuration recreation returned Home; explicit onboarding deep link recovered the native preview. Debug linking warning after configuration changes is retained in screenshots. Normal size/density/font scale restored.

## Numbered native matrix

Times are in actions.jsonl/launches.jsonl (UTC); Android logcat uses device local America/New_York. The native campaigns ran roughly 01:09–01:24 UTC on Oct 22 (Oct 21 local). PASS means the precise observed scope below.

| # | Scenario / method | Native result | Evidence / limitation |
|---|---|---|---|
| 1 | First-run V2 welcome after privately backed-up QA-install reset | PASS | screenshots/01-welcome.png; actual current JS, no Crawl/profile questionnaire |
| 2 | Welcome → Explore → guest Home; no account/rating/location prompt | PASS | 02-guest-explore-home.png, XML; Home has ordinary Crawls and Sign In navigation |
| 3 | Three force-stop/relaunches after Explore; onboarding not repeated | PASS | launches.jsonl; launch-1-home.png through launch-3-home.png; no app ANR observed |
| 4 | Existing restaurant search and selection | PASS — real public read | 03-search.png, 04-real-restaurant-results.png; Wingnutz Bar and Grill via anonymous RLS GET, no fixture location |
| 5 | Four shared rating screens; tap/drag all sliders | PASS — touch smoke | 05–09 screenshots; observed Overall 8, Sauce 7, Crispiness 6, Chicken 9; visible thumb/labels |
| 6 | Back/Next retains score and Sauce/Rub uses Forgettable | PASS | native Overall 8 retained on return; 07-sauce-seven.png/XML; tests cover deeper revisits |
| 7 | Save once → correct restaurant/8 result/device-only status | PASS | 10-result-wing-shot-offer.png; local-preview-before-auth.json; no remote rating request forwarded |
| 8 | Guest Wing Shot invitation without authenticated RPC | PASS | actual result CTA/copy plus network-safety.json; guest flag RPC not forwarded or required |
| 9 | Short viewport, scrolling, fixed CTAs/review note | PASS — limited visual smoke | 11-small-result.png, 12-small-large-text-result.png; scroll exposes review note. Debug linking banner present; not full accessibility approval |
| 10 | Large-text behavior, TalkBack, contrast, landscape, light theme | NOT RUN / PARTIAL | system font scale requested; no independent font rendering measurement/TalkBack/contrast certification. Only app's dark UI captured; no light/landscape claim |
| 11 | Rapid guest CTA taps → signup screen and one intent | PASS — navigation/persistence only | 13-signup-small.png; intent-after-rapid-taps-restart.json: one pending v2/source onboarding intent, same destination, TTL 1800000ms |
| 12 | Restart before auth; preview and pending intent retained | PASS | native app force-stopped/relaunched; same SQLite evidence. No automatic auth replay/loop observed |
| 13 | Signup screen, switch to existing-account Sign In UI | PASS — screens only | 14-signup-normal.png, 15-signin-normal.png. No credentials entered or authentication performed |
| 14 | Explicit Cancel → Home, preview retained, intent cleared | PASS | 16-auth-cancel-home.png; local-preview-after-auth-cancel.json: 8/7/6/9 still local, intent absent |
| 15 | Search zero results → Wingman, input retained | PASS | separate first-run campaign; 17-search-no-results.png, 20-wingman-ready.png |
| 16 | Wingman state data unavailable → clear error/Close → Search | PASS — induced bridge restriction | 18-wingman-state-unavailable.png, 19-wingman-close-preserves-search.png. Harness initially rejected state_name/whitespace; corrected public-column allowlist and reopened successfully |
| 17 | Wingman service failure → Retry search/Close | PASS — local denial path | 21-wingman-service-failure.png; function POST denied locally; no provider invocation or new destination. Existing error text exposes implementation details (P1) |
| 18 | Wingman successful verified new/existing result; ambiguity/queue/timeout | BLOCKED / NOT RUN natively | External provider/backend unavailable under read-only guard. Deterministic suites cover convergence and rejection paths; not native success proof |
| 19 | API outage during search | FAIL — bounded error UX | Stopped bridge, changed search; 22-api-offline-current.png shows ongoing spinner. UIAutomator could not reach idle while spinner active; no deadline/error completion demonstrated |
| 20 | Hardware Back during API outage → welcome → Explore/Home | PASS | 23-offline-hardware-back.png, 24-offline-explore-home.png. Back aborts old search; escape remained usable |
| 21 | Authenticated same-restaurant preselection/change/cancel/account switch | BLOCKED — real account/backend | Existing local Kong fails; proxy deliberately rejects auth. Covered by mocked production-component/helper tests only |
| 22 | Standalone null-rating-ID real photo upload/consent/review/private storage/idempotency | BLOCKED — P0 | No usable authorized nonproduction backend; no photo picked/uploaded and no rating ID manufactured |
| 23 | Google/Facebook OAuth, password signup/signin, wrong password, email confirmation/deep-link delivery | BLOCKED — P0 live auth | Provider buttons and mode switching observed; no real round trips, tokens, account creation or email interaction. Tests only for success/error/retry state transitions |
| 24 | Real authenticated photo flag disabled/midjourney disable | BLOCKED natively | Definitive backend checks not bypassed. Deterministic route tests cover disabled/failed/slow flags |
| 25 | Public invitation disabled and V2/default flags off | NOT RUN natively | Source defaults unchanged false and automated regressions pass. No native flag-off build/bundle was exercised; safe next command below |
| 26 | Guest preview never auto-imports; no coins/XP/rating writes | PASS — native guest scope + tests | Native preview metadata survives auth cancellation; bridge forwards GET only and rejects all mutations. No actual login/ledger integration claim |
| 27 | App background/cold restart, keyboard Back, regular app Crawls | PASS — smoke scope | Process-cold runs/Home; search input keyboard dismissed with Android Back; Home's Crawls tab visible. Opening a Crawl or background OAuth not tested |
| 28 | iOS/small iPhone/device provider handoff | BLOCKED — P0 | Windows host, no xcrun/iOS target; no fabricated iOS evidence |

## Safety, state, and evidence integrity

Public catalog data were read through anonymous RLS, not a privileged client. The bridge injects only the existing public anonymous configuration for GET /rest/v1/destinations and /rest/v1/states with explicitly allowed columns. It never forwards caller auth, POST/PATCH/DELETE, RPC, account, storage or function requests. network-safety.json records 3 forwarded catalog GETs, 0 mutations, 187 local denials; an earlier standalone catalog GET probe was also read-only. This is **not** an isolated-backend integration pass: the public catalog source may be production; all requests capable of changes were stopped locally. The app used a synthetic local client key. No database rows, flags, functions, grants, buckets, policies or backend definitions changed. No raw photos/test credentials/real tokens were used.

Before first emulator pm clear, existing debug QA data were archived privately under ignored crawl/.expo. The first native-created rated QA state was separately archived before the second Wingman campaign, then restored and read-only SQLite verified: restored-state.json. Original and QA backup archives/database copies remain private and are not committed. No physical device install or production/user-owned data deleted. Both test campaigns and intentional QA resets are explicit; resets are not presented as app persistence failures/successes. The native preview persistence checks happened before the second reset.

All PNGs came from adb screencap; no generated images. XML files describe independently captured UI around the screenshot operation; UI can transition between dump and screencap. In particular 13-signup-small.png was captured after the CTA transition while its immediately preceding dump still described the result; 14/15 provide settled auth-screen evidence. startup-system-ui-stall.png is a transient blank/restart capture, not current-code success. The short screenshots intentionally retain the debug linking warning; no cosmetic removal. No screenshots of authenticated uploader or successful submission exist. User credentials, precise user location, private archives and raw photos are excluded.

## Automated checks

- Broad suite in commands.log: **408 total, 404 passed, 0 failed, 4 skipped**; test-results.log. Added one deterministic Metro regression to the prior 407 tests. Four skips are existing retired assertions/external DB/limiter prerequisites.
- Quick-rating: PASS, quick-rating.log.
- Lint: PASS, 0 errors / 100 warnings, matching starting commit; lint.log.
- Standard TypeScript: FAIL only on the three known unchanged TS5097 imports in wingmanMenuEvidence.ts, wingmanMenuPolicy.ts and wingman-intake/index.ts; typecheck.log.
- Documented tsc --noEmit --allowImportingTsExtensions: PASS, zero diagnostics; typecheck-workaround.log. No tsconfig edits or claim that baseline errors were fixed.
- Secret scan and whitespace/scope checks: checks.log/secrets.log. Default flags remain false; no auth/uploader/server authorization code changed.

## Root-cause limits and remaining work

Startup is recovered for a ready Metro server, with genuine three-launch evidence. It is not accurate to attribute every prior ANR solely to .expo: isolated cold-server performance of each local change was not benchmarked. The observed blocking chain was Windows watcher/server preparation plus slow first bundle; emulator system-service/memory pressure was independently visible. Cache pruning reduces an avoidable input and the probe makes readiness explicit without altering client timeouts. CLI online/offline behavior and worker-count effects were not individually isolated. No application startup/auth/splash code was modified. A production-like native startup baseline remains NOT RUN.

P1 reproducible limitations: (a) stop catalog bridge during V2 search, change input: spinner continues until cancel/Back; add a separately reviewed bounded search request and verify native offline/slow cases. (b) change wm size/density/font_scale while app is running, then reopen onboarding: debug linking warning may overlay controls; force-stop clears it. Recheck a current rebuilt debug APK before deciding whether native configuration handling needs a source fix. (c) Wingman function failure copy exposes 'Edge Function/non-2xx'; friendly copy follow-up needed. (d) debug process-cold starts took ~25 seconds on this host. (e) closed-but-visible destination detection still lacks a supported availability field. These were recorded, not hidden or fixed by unrelated product changes.

## Minimal safe next actions

1. Android guest rerun: start local Metro with temporary flags, then **node crawl/scripts/qa/probe-android-metro.mjs http://127.0.0.1:8081** from repo root. Only launch the client after ready:true. Reuse existing APK; rebuilding is not needed for this demonstrated guest path. Use a dedicated test install; do not clear a personal phone.
2. Default-off native gate: restart Metro with EXPO_PUBLIC_ONBOARDING_V2 and EXPO_PUBLIC_ONBOARDING_WING_SHOT_INVITE unset, use the same probe, then open a separately backed-up fresh QA install. Automated coverage is not a substitute for this native run.
3. Backend/auth/upload gate: owner/backend maintainer must repair the existing local gateway permission issue separately. First safe diagnostic: **docker logs --tail 4 supabase_kong_buffago-polish-acceptance** (backend-status.log). Do not run migration/fixture scripts that edit schema/flags. After an authorized nonproduction account and supported backend are actually reachable, test real auth → same destination → existing uploader, explicit benign photo/consent/attribution → submitted for review with null rating ID; verify account/destination/private storage/single submission and no preview import/ledger effects. No production upload as substitute.
4. Real Google/Facebook/email and iOS gates: use approved nonproduction providers/redirects/mail and a Mac/iOS target. No credentials requested during this task because infrastructure is not usable; those remain owner-assisted release gates. Repeat lifecycle, account switch, actual permissions/retry/moderation and native accessibility checks before release.
