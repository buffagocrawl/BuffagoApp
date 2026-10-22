# Onboarding V2 final release QA — 2026-10-22

**NO-GO.** Android guest onboarding is demonstrated. Successful native email signup, password signin, Google, Facebook, authenticated cold restart/signout/signin and a real standalone Wing Shot upload are **BLOCKED**, not passed by mocked tests. There is no after-auth uploader screenshot or verified authenticated redirect trace.

## Baseline and environment

- Required/current branch: `feature/onboarding-v2-simplified-first-value`.
- Start: `a42d58d1dda76d7a4b73660aa100147027b80375`, clean. Reported baseline `4f4d482fd1854c74c2fc01586e4ac7d2dd7f7c02` is its parent. End: the local commit containing this report (`git log -1`); final response supplies its SHA. No push/merge/deployment.
- Windows 10.0.26200 host; Node 22.20.0, npm 10.9.3, Java 25, adb 1.0.41 / platform-tools 36.0.0. Installed project: Expo 54.0.37, React Native 0.81.5, React 19.1.0, TypeScript 5.9.3.
- Existing Medium Phone emulator, Android 16/API 36.1 x86_64, host GPU/four CPUs; existing debuggable APK 1.0.5/code 6/runtime 1.0.4, branch JS. This is not a new release binary or production performance certification.
- Large viewport 1170x2532/density 480; short viewport 720x1280/density 320 (360x640dp), requested system font scale 1.3. Dark theme. No iOS device, macOS/Xcode/xcrun, or physical Android device available.
- Process-only local flags: port 8081 V2=true/invite=true; 8082 false/false; 8083 true/false. Actual names: `EXPO_PUBLIC_ONBOARDING_V2`, `EXPO_PUBLIC_ONBOARDING_WING_SHOT_INVITE`. Both committed defaults remain **false**. No env/EAS/production configuration edited.
- `EXPO_NO_DOTENV=1`; app endpoint only `http://10.0.2.2:55321`, synthetic unusable key. Existing strict local catalog bridge forwards only anonymous public destination/state GETs using existing public configuration privately. All auth, function, analytics, storage and mutation calls are rejected locally. Real catalog data, not fixture restaurants; no customer credentials, GPS or photos used. This is a read-only bridge, **not staging Supabase**.
- Docker daemon was unavailable on this run. Previous local Kong `kong.yml` permission failure is historical evidence in readiness/Android reports, not a freshly reproduced gateway diagnosis. The bridge occupies 55321 only for catalog QA and cannot establish backend health. No backend repair, migration, RLS/function/bucket/flag change or real upload attempted.
- Original emulator app data privately archived before clearing disposable emulator data and restored at end; `restoration.json`. Temporary processes stopped. Raw emulator logs/private SQLite/archives stay outside committed evidence.

## Native startup gate

Initial readiness probe was premature and timed out on the Android manifest. After Metro initialization completed, real manifest AND 16,875,590-byte JS bundle returned HTTP 200 in 2132ms at 12:22:27Z. Existing generated `.expo` exclusions and offline/two-worker Metro mode from the starting commit were retained. No new runtime/startup patch was needed.

Three consecutive process-cold launches reached freshly dumped guest Home: **11753ms, 11653ms, 11353ms** (12:24:26Z, 12:24:53Z, 12:25:09Z). PIDs differ in `actions.jsonl`. [Launch 1](screenshots/android-E2E-02-cold-launch-1.png), [2](screenshots/android-E2E-02-cold-launch-2.png), [3](screenshots/android-E2E-02-cold-launch-3.png). `lastanr.txt` reports no ANR since boot. The previous ANR was not reproduced; debug startup remains slow. This passes the Android guest startup gate only.

## Twenty-scenario release matrix

PASS applies only to the explicit observed scope. BLOCKED may include useful partial native evidence. All real auth-dependent gates remain blocked.

| ID | Outcome | Actual execution / evidence / limit |
|---|---|---|
| E2E-01 | PASS | Fresh emulator app data: [V2 Welcome](screenshots/android-E2E-01-welcome.png), two choices, no forced auth/location. Fresh-data equivalent, not APK reinstall. |
| E2E-02 | PASS | [Guest Home](screenshots/android-E2E-02-guest-home.png), three cold launches above; no automatic onboarding replay. Home has usable Search/Pick Area/navigation. |
| E2E-03 | PASS | Real public catalog [search](screenshots/android-E2E-03-restaurant-search.png), venue selection, four shared steps, tap/drag/back/next, [8/10 result](screenshots/android-E2E-03-score-celebration.png). SQLite actual scores **8/7/1/9**, `local_preview`, not a server rating. Crispiness attempted drag did not change 1; not claimed as 6. Multiple same-name and wrong-result correction not exhaustively tested. |
| E2E-04 | BLOCKED | [No results](screenshots/android-E2E-04-no-results.png), [Wingman form/state choices](screenshots/android-E2E-04-wingman-form.png), Close/Explore [Home](screenshots/android-E2E-04-fallback-home.png). Search tap did not produce a verified failure/result in this run; screenshot originally named failure was renamed form. Successful/queued/timeout discovery not exercised. No paid/production Wingman execution. |
| E2E-05 | PASS | [Guest invitation](screenshots/android-E2E-03-score-celebration.png) -> [signup](screenshots/android-E2E-05-auth-screen.png)/[signin](screenshots/android-E2E-05-signin-screen.png). Native SQLite proves same destination, pending/unbound intent, 30-minute TTL and all three completion keys before auth. |
| E2E-06 | BLOCKED | No safe real email signup/session. Component session and confirmation-required branches pass separately. No post-signup native screenshot. |
| E2E-07 | BLOCKED | No safe real password account/session. Native signin screen is not successful signin. Component handoff passes separately. |
| E2E-08 | BLOCKED | No nonproduction Google provider/test identity. Mocked login/callback/event-order coverage only. |
| E2E-09 | BLOCKED | No nonproduction Facebook provider/test identity. Mocked login/callback coverage only. |
| E2E-10 | BLOCKED | Native hardware Back -> [Home](screenshots/android-E2E-10-back-home.png), [cold restart](screenshots/android-E2E-10-cold-restart-after-auth-back.png); explicit Explore -> [Home](screenshots/android-E2E-10-explore-home.png). Preview retained; explicit Explore clears intent. Real provider browser cancellation/error/retry not exercised. |
| E2E-11 | BLOCKED | No real authenticated uploader/change-venue. Composer mocked RLS preselection/missing/invalid/network fallback coverage passes. Closed-but-visible rows lack an authoritative availability field. |
| E2E-12 | BLOCKED | No real permissions/media selection/consent/null-rating upload/review result. No photo/consent/upload-result screenshot invented. Existing Flow/contract tests are not backend acceptance. |
| E2E-13 | BLOCKED | Uploader never entered with real session; auth Back/Home is not uploader cancellation proof. |
| E2E-14 | BLOCKED | Guest and auth-back cold restart pass; authenticated acknowledgment/relaunch not executed. |
| E2E-15 | BLOCKED | No real signin/signout/account switch/restart. Actual completion helper/gate remount and account-bound intent tests pass in isolation. |
| E2E-16 | BLOCKED | No test mailbox/verification session. Mocked delayed/no-session signup/restart tests pass; user-only signup is not treated as verified auth. |
| E2E-17 | BLOCKED | Native persisted [preview recovery](screenshots/android-E2E-17-restored-preview.png); interruption/back and many cold starts. Existing duplicate auth/signup/claims and upload idempotency mocks pass. Full slow/offline/rapid-submit/upload stress not executed. |
| E2E-18 | PASS | Native V2-off [legacy location prompt](screenshots/android-E2E-18-legacy-location-prompt.png), denied, then [legacy Welcome](screenshots/android-E2E-18-legacy-welcome.png). V2-on/invite-off [neutral CTA](screenshots/android-E2E-18-invitation-off.png). Flag smoke passes; full legacy multi-step/auth regression remains NOT RUN natively. |
| E2E-19 | BLOCKED | Large and short Android inspected. CTA truncation **FAIL then fixed**, [before](screenshots/android-E2E-19-small-result-clean-scrolled.png), [after](screenshots/android-E2E-19-fixed-small-cta.png), [tap reaches auth](screenshots/android-E2E-19-fixed-small-auth.png). Debug display-recreation linking warning retained. iOS/landscape/all themes/keyboard extremes not approved. |
| E2E-20 | BLOCKED | Native XML exposes adjustable slider score and button labels; fixed CTA has explicit Wing Shot accessibility label. No TalkBack focus/announcement/touch-target audit or VoiceOver run. |

## No-reset answer by auth method

**Email signup: unproven/BLOCKED. Password signin: unproven/BLOCKED. Google: unproven/BLOCKED. Facebook: unproven/BLOCKED. Authenticated cold restart and signout/signin: unproven/BLOCKED.** No blanket claim from tests. Guest Explore and auth Back/cold restart do not reset onboarding in the executed Android runs. [Redirect trace](redirect-trace.md) distinguishes actual native observations from implementation/mock assertions.

## Defect fixed

Small-screen primary invite was visibly ellipsized at 360x640dp/font scale 1.3. Root cause: Paper Button renders its label with `numberOfLines=1`, and the long copy exceeded available width. Minimal client fix in `crawl/components/OnboardingV2.jsx`: visible text **Create Account & Add Photo** and explicit accessible **Create account and add a Wing Shot photo**. No routing/storage/auth/backend change. Existing component tests were updated for the visible text; native after-fix image and successful tap validate fit/function. Larger arbitrary font scales are not approved.

Added two meaningful regression cases in `onboarding-auth-journey.test.mjs`: execute real completion helper plus real gate across fresh mounts (including cancellation/signout/account-transition labels without claiming real sessions); verify completion keys exist before auth navigation; duplicate SIGNED_IN before/after handoff yields one uploader destination, never a competing Home replace. These use mocked mobile/session transport.

## Automated baseline and final validation

From `crawl/`, exact PowerShell selection and commands:

```powershell
$files = Get-ChildItem tests/onboarding*.test.*,tests/wingman*.test.mjs,tests/wingShot*.test.mjs,tests/wing-shot*.test.mjs,tests/auth/*.test.js,tests/image-workflow-mobile-runtime.test.mjs | Select-Object -ExpandProperty FullName
node --test --experimental-default-type=module $files
npm run test:quick-rating
npm run lint
npm run typecheck
node node_modules/typescript/bin/tsc --noEmit --allowImportingTsExtensions
```

- Baseline: **408 tests, 404 PASS, 4 SKIP, 0 FAIL**, `regression.log`.
- Final: **410 tests, 406 PASS, 4 SKIP, 0 FAIL**, `regression-updated.log`. Existing skips: retired legacy assertions and external PostgreSQL/limiter runtimes. No real provider/backend execution implied.
- Focused auth journey with new regressions: **15 PASS**, `new-regressions.log`.
- Quick rating PASS, `quick-rating.log`.
- Lint **0 errors, 100 warnings**, unchanged baseline, `lint.log`.
- Standard typecheck **FAIL**: exactly three unchanged TS5097 errors in `wingmanMenuEvidence.ts`, `wingmanMenuPolicy.ts`, `wingman-intake/index.ts`, `typecheck.log`.
- Documented `--allowImportingTsExtensions` workaround **PASS**, empty success log. No tsconfig workaround committed.
- Staged secret and whitespace checks recorded in `checks.log` / `secrets.log`. No unrelated client/backend files changed; full list `files-changed.txt`.

## Evidence, reproduction, and owners

**32 genuine Android PNGs, 0 iOS**: [all thumbnails, timestamps and precise limits](screenshots/index.md). All captured from running native UI with adb screencap; no generated/fixture screenshots. Catalog business addresses are public. No typed identity, token or user photo appears. Original renamed screenshot action names remain in append-only `actions.jsonl`; index uses current corrected filenames and explicitly states the corrections. Screenshots are small and prior branch conventions already track native PNGs, so sanitized images are included in this local commit.

Safe startup reproduction (from crawl): process-local flags/endpoint above, `node node_modules/expo/bin/cli start --dev-client --offline --max-workers 2 --port 8081`; `node scripts/qa/probe-android-metro.mjs http://127.0.0.1:8081`; `adb reverse tcp:8081 tcp:8081`; open `buffago://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081`. Readiness must include manifest and bundle, not `/status` alone. `onboarding-final-android-ui.mjs` records fresh native UI/screencap actions and process launches. See prior `onboarding-v2-android-qa/commands.log` for emulator startup/catalog-bridge and backup details. Failed initial Continue/Close attempts during legacy location prompt were tooling timing errors; permission denial and actual legacy Welcome were subsequently captured, not counted from an overlay.

Smallest next steps to clear release:

1. Backend/test-environment owner: start and identify an approved isolated Supabase stack; repair historical Kong config permissions if still present, independently of this client patch. Verify auth/REST/storage/Edge Functions and deployed standalone null-rating contract. Do not run old scripts that create buckets/change flags without separate authorization. Use synthetic consented media/account and actual uploader to establish one accepted-for-review record, correct account/venue/null rating/private original and no duplicate/orphan after retry. No production substitute.
2. Mobile/auth owner: using that target plus dedicated mailbox/Google/Facebook QA identities, execute E2E-06–09/14–16 with before-auth, preselected uploader, and acknowledged cold-restart captures. Include delayed confirmation, duplicate events, wrong account, expiry, invalid destination, cancellation/retry. Record one final route and no `/onboarding` reset; verify preview never imported/published. Durable routed intent currently resumes on a later login claim, not an automatic startup claim; app index opens Home. Validate this interruption boundary explicitly.
3. Mobile QA owner: run iOS on Mac/device, actual media permission/cancel/upload, native account-boundary checks, full legacy rollback, TalkBack/VoiceOver, keyboard/landscape and large-text matrix. Investigate debug linking warning under configuration recreation before interpreting it as a release-app defect. Previous API-outage spinner observation remains unresolved; bounded timeout behavior is not newly proven.

Do not enable either release flag or call the release ready until these gates have real evidence.
