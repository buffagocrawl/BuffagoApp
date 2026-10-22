# Android startup recovery and onboarding QA

**BLOCKED FOR RELEASE. Android guest path demonstrated on a real emulator UI.**

Starting branch/commit: feature/onboarding-v2-simplified-first-value / 4f4d482fd1854c74c2fc01586e4ac7d2dd7f7c02, clean. Ending commit: the local commit containing this report; use git log -1. No branch reset, push, merge, deployment, production mutation or migration.

Startup failure occurred before application JS: Metro's Windows watcher/setup blocked manifest readiness while /status could respond; 341604 generated .expo files were in its scope. Emulator System UI/memory-pressure problems were independent. Original Metro and root layout match origin/main; no evidence identifies V2 startup JS as cause. Changes: exclude generated .expo directories, retain Expo defaults, add an Android manifest/full-bundle readiness probe and safe QA helpers. Cache exclusion alone was not proven sufficient; no client timeout raised, error suppressed, SDK patch or startup retry added.

Recovered with a prepared local Metro server (--offline --max-workers 2), adb reverse and localhost dev-client URL; existing debug APK version 1.0.5/code 6/runtime 1.0.4, current JS from this branch. No rebuild required. Target emulator-5554, Android 36.1 x86_64, four CPUs/2GB, host GPU. A separate fresh AVD failed in Android package/storage services and was abandoned, not counted as app success.

**Three consecutive process-cold launches PASS:** 24.967s, 25.186s, 23.402s to fresh Home XML; no onboarding replay, no new app ANR. Warm foreground/deep-link return observed. These are slow debug/host numbers, not release performance claims. launches.jsonl and screenshots/launch-*-home.png contain proof; android-startup.log/logcat.txt contain diagnosis and limits.

Native verified: Welcome → Explore/Home; real restaurant GET → four shared sliders with tap/drag/back → 8/7/6/9 local preview; truthful 8/10 result and Wing Shot invitation; rapid CTA taps → one same-restaurant 30-minute intent; restart retains it; signup/signin screens; Cancel → Home with preview intact and intent absent. Separate fresh Wingman no-result/failure/Close paths exercised. Three public catalog GETs forwarded through strict anonymous read-only bridge; zero mutations. No location invented, auth session created, photo selected/uploaded or coins/XP awarded.

Remaining gates: real authenticated same-restaurant uploader/photo submission, Google/Facebook/email confirmation, iOS; native flag-off and full accessibility/landscape/light-theme coverage. P1 observations: API-loss search spinner lacks demonstrated bounded failure, debug linking warning after display/font configuration change, technical Wingman error copy, slow debug cold starts, unsupported closed-business detection. Hardware Back/Explore still escaped the API outage. Do not call full end-to-end release QA passed.

Automated: **408 tests, 404 passed, 4 existing skipped, zero failed**; quick-rating PASS; lint 0 errors/100 baseline warnings; standard tsc only the three known TS5097 failures; documented --allowImportingTsExtensions PASS. Final secret/diff checks in checks.log/secrets.log. Detailed numbered scenario matrix, screenshots, commands and safest next actions: QA.md.

Emulator data were privately backed up before QA resets. Rated native QA data restored afterward; backups and SQLite copies are ignored/private, not committed. Temporary flags were process-local; both defaults stay off. No auth/uploader backend checks were bypassed. No production build, push, merge, deployment, migration or backend data/configuration change occurred.
